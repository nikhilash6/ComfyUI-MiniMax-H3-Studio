"""Fast Qwen3.5-4B GGUF prompt-preparation backend for H3 Studio.

This is an independent integration against llama.cpp's public multimodal CLI /
OpenAI-compatible server surface.  It deliberately keeps the helper outside
ComfyUI's H3 generation model graph: the helper runs only during prompt prep and
is stopped before H3 conditioning so its ~3-4 GiB GPU residency cannot steal
VRAM from the 32B conditioner/transformer stage.
"""

from __future__ import annotations

import atexit
import logging
import os
import shutil
import socket
import subprocess
import tempfile
import threading
import time
from contextlib import suppress
from pathlib import Path
from typing import Any

LOGGER = logging.getLogger(__name__)

FASTEST_QWEN35_4B_GGUF = "Fastest · Qwen3.5 4B GGUF Q4_K_XL"
FASTEST_QWEN35_4B_GGUF_WRITER = "Fastest · Qwen3.5 4B GGUF writer"
QWEN35_GGUF_REPO = "unsloth/Qwen3.5-4B-GGUF"
QWEN35_GGUF_REMOTE_MODEL = "Qwen3.5-4B-UD-Q4_K_XL.gguf"
QWEN35_GGUF_REMOTE_MMPROJ = "mmproj-BF16.gguf"
# Use unique local names because h3studio_vlm is a shared flat model folder and
# mmproj filenames are architecture-specific.
QWEN35_GGUF_MODEL_FILE = "qwen3.5_4b_ud_q4_k_xl.gguf"
QWEN35_GGUF_MMPROJ_FILE = "qwen3.5_4b_mmproj_bf16.gguf"
QWEN35_GGUF_MODEL_URL = (
    "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/"
    "Qwen3.5-4B-UD-Q4_K_XL.gguf?download=true"
)
QWEN35_GGUF_MMPROJ_URL = (
    "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/"
    "mmproj-BF16.gguf?download=true"
)


def _normalize(value: Any) -> str:
    return str(value or "").replace("\\", "/").strip()


def _compact(value: Any) -> str:
    return "".join(ch for ch in _normalize(value).lower() if ch.isalnum())


def _vlm_root(create: bool = True) -> Path:
    import folder_paths

    path = Path(folder_paths.models_dir) / "h3studio_vlm"
    if create:
        path.mkdir(parents=True, exist_ok=True)
    return path


def _candidate_file(preferred: str, *fallbacks: str) -> Path:
    root = _vlm_root(False)
    for name in (preferred, *fallbacks):
        path = root / name
        if path.is_file():
            return path
    # Be forgiving to users who manually kept the upstream filename/casing.
    wanted = {_compact(preferred), *(_compact(item) for item in fallbacks)}
    if root.is_dir():
        for path in root.iterdir():
            if path.is_file() and _compact(path.name) in wanted:
                return path
    return root / preferred


def model_path() -> Path:
    return _candidate_file(QWEN35_GGUF_MODEL_FILE, QWEN35_GGUF_REMOTE_MODEL)


def mmproj_path() -> Path:
    return _candidate_file(QWEN35_GGUF_MMPROJ_FILE, QWEN35_GGUF_REMOTE_MMPROJ)


def _search_roots() -> list[Path]:
    roots: list[Path] = []
    with suppress(Exception):
        import folder_paths

        base = Path(getattr(folder_paths, "base_path", "") or "").resolve()
        if str(base):
            roots.extend([base, base.parent])
    roots.extend([Path.cwd(), Path(__file__).resolve().parents[2]])
    output: list[Path] = []
    seen: set[str] = set()
    for root in roots:
        try:
            key = str(root.resolve())
        except Exception:
            key = str(root)
        if key not in seen:
            seen.add(key)
            output.append(root)
    return output


def _executable(value: str | Path) -> str | None:
    path = Path(value).expanduser()
    if path.is_file() and os.access(path, os.X_OK):
        return str(path)
    return None


def _server_command() -> list[str] | None:
    configured = _normalize(os.environ.get("H3STUDIO_LLAMA_SERVER"))
    if configured:
        resolved = _executable(configured)
        return [resolved] if resolved else None
    direct = shutil.which("llama-server") or shutil.which("llama-server.exe")
    if direct:
        return [direct]
    umbrella = shutil.which("llama") or shutil.which("llama.exe")
    if umbrella:
        return [umbrella, "serve"]
    for root in _search_roots():
        for candidate in (
            root / "llama.cpp" / "build" / "bin" / "llama-server",
            root / "llama.cpp" / "build" / "bin" / "Release" / "llama-server.exe",
        ):
            resolved = _executable(candidate)
            if resolved:
                return [resolved]
    return None


def _mtmd_cli() -> str | None:
    configured = _normalize(os.environ.get("H3STUDIO_LLAMA_MTMD_CLI"))
    if configured:
        return _executable(configured)
    direct = shutil.which("llama-mtmd-cli") or shutil.which("llama-mtmd-cli.exe")
    if direct:
        return direct
    for root in _search_roots():
        for candidate in (
            root / "llama.cpp" / "build" / "bin" / "llama-mtmd-cli",
            root / "llama.cpp" / "build" / "bin" / "Release" / "llama-mtmd-cli.exe",
        ):
            resolved = _executable(candidate)
            if resolved:
                return resolved
    return None


def status() -> dict[str, Any]:
    server = _server_command()
    cli = _mtmd_cli()
    model = model_path()
    mmproj = mmproj_path()
    return {
        "available": bool(server or cli),
        "ready": bool((server or cli) and model.is_file() and mmproj.is_file()),
        "server_available": bool(server),
        "server_command": " ".join(server or []),
        "mtmd_cli_available": bool(cli),
        "mtmd_cli": cli or "",
        "model_present": model.is_file(),
        "model_path": str(model),
        "mmproj_present": mmproj.is_file(),
        "mmproj_path": str(mmproj),
        "model_folder": "models/h3studio_vlm",
        "backend": "llama.cpp libmtmd",
    }


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _prepare_vram() -> None:
    # Import lazily to avoid a circular import during extension registration.
    with suppress(Exception):
        from .prompt_prep_hotfix_v2 import _prompt_helper_residency_barrier

        _prompt_helper_residency_barrier()


def _tensor_to_jpeg_bytes(image: Any) -> bytes:
    import io
    import numpy as np
    from PIL import Image

    tensor = image.detach().cpu() if hasattr(image, "detach") else image
    array = tensor.numpy() if hasattr(tensor, "numpy") else np.asarray(tensor)
    while array.ndim > 3:
        array = array[0]
    if array.ndim != 3:
        raise ValueError(f"Qwen3.5 GGUF image must resolve to HxWxC, got shape {getattr(array, 'shape', None)}")
    if array.shape[-1] > 3:
        array = array[..., :3]
    if array.dtype != np.uint8:
        array = (np.clip(array, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)
    pil = Image.fromarray(array, mode="RGB")
    buffer = io.BytesIO()
    pil.save(buffer, format="JPEG", quality=90, optimize=True)
    return buffer.getvalue()


def _tensor_to_data_uri(image: Any) -> str:
    import base64

    return "data:image/jpeg;base64," + base64.b64encode(_tensor_to_jpeg_bytes(image)).decode("ascii")


class _Qwen35ServerManager:
    """Stage-scoped server: warm across analyzer+writer, dead before H3."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._process: subprocess.Popen | None = None
        self._port = 0
        self._signature: tuple[str, str] | None = None

    def running(self) -> bool:
        return bool(self._process and self._process.poll() is None)

    def stop(self) -> None:
        with self._lock:
            process = self._process
            self._process = None
            self._signature = None
            self._port = 0
            if process and process.poll() is None:
                with suppress(Exception):
                    process.terminate()
                    process.wait(timeout=4)
                if process.poll() is None:
                    with suppress(Exception):
                        process.kill()

    def ensure(self) -> str:
        import requests

        model = model_path()
        mmproj = mmproj_path()
        if not model.is_file() or not mmproj.is_file():
            raise FileNotFoundError(
                "Qwen3.5 4B GGUF needs both the Q4_K_XL language model and matching BF16 mmproj in "
                "ComfyUI/models/h3studio_vlm. Install the Fast prompt-prep pair from H3 Studio Model Setup."
            )
        signature = (str(model.resolve()), str(mmproj.resolve()))
        with self._lock:
            if self.running() and self._signature == signature:
                return f"http://127.0.0.1:{self._port}"
            self.stop()
            command = _server_command()
            if not command:
                raise RuntimeError("llama-server is not installed")
            _prepare_vram()
            port = _free_port()
            args = [
                *command,
                "--model", str(model),
                "--mmproj", str(mmproj),
                "--host", "127.0.0.1",
                "--port", str(port),
                "--ctx-size", "4096",
                "--n-gpu-layers", "99",
                "--parallel", "1",
            ]
            LOGGER.info(
                "[H3 Studio - GGUF] Starting stage-scoped Qwen3.5-4B Q4_K_XL server | ctx=4096 | ngl=99 | %s",
                Path(command[0]).name,
            )
            process = subprocess.Popen(
                args,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                start_new_session=(os.name != "nt"),
            )
            base = f"http://127.0.0.1:{port}"
            deadline = time.monotonic() + 45.0
            last_error = ""
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError("llama-server exited while loading Qwen3.5-4B GGUF")
                try:
                    response = requests.get(f"{base}/health", timeout=1.0)
                    if response.ok:
                        self._process = process
                        self._signature = signature
                        self._port = port
                        LOGGER.info("[H3 Studio - GGUF] Qwen3.5 server ready in %.2fs", 45.0 - max(0.0, deadline - time.monotonic()))
                        return base
                    last_error = f"HTTP {response.status_code}"
                except Exception as error:
                    last_error = str(error)
                time.sleep(0.20)
            with suppress(Exception):
                process.terminate()
            raise RuntimeError(f"Timed out starting Qwen3.5 GGUF llama-server ({last_error or 'no health response'})")

    def complete(self, text: str, images: list[Any], max_tokens: int) -> str:
        import requests

        base = self.ensure()
        content = [
            {"type": "image_url", "image_url": {"url": _tensor_to_data_uri(image)}}
            for image in images
        ]
        content.append({"type": "text", "text": "/no_think\n" + str(text)})
        payload = {
            "model": "h3studio-qwen35-4b-gguf",
            "messages": [{"role": "user", "content": content}],
            "temperature": 0,
            "top_p": 1,
            "max_tokens": max(32, min(768, int(max_tokens))),
            "stream": False,
            "response_format": {"type": "json_object"},
            "chat_template_kwargs": {"enable_thinking": False},
        }
        response = requests.post(f"{base}/v1/chat/completions", json=payload, timeout=180)
        if not response.ok:
            raise RuntimeError(f"llama-server request failed ({response.status_code}): {response.text[:400]}")
        data = response.json()
        try:
            return str(data["choices"][0]["message"]["content"])
        except Exception as error:
            raise RuntimeError(f"Unexpected llama-server response: {data!r}") from error


_SERVER = _Qwen35ServerManager()
atexit.register(_SERVER.stop)


def stop_server() -> None:
    _SERVER.stop()


def _complete_cli(text: str, images: list[Any], max_tokens: int) -> str:
    cli = _mtmd_cli()
    if not cli:
        raise RuntimeError(
            "Qwen3.5 GGUF needs llama.cpp. Install a current build exposing llama-server or llama-mtmd-cli, "
            "or set H3STUDIO_LLAMA_SERVER / H3STUDIO_LLAMA_MTMD_CLI."
        )
    model = model_path()
    mmproj = mmproj_path()
    if not model.is_file() or not mmproj.is_file():
        raise FileNotFoundError(
            "Qwen3.5 4B GGUF model/mmproj missing. Install the Fast prompt-prep pair from H3 Studio Model Setup."
        )
    _prepare_vram()
    temp_paths: list[str] = []
    try:
        for image in images:
            fd, path = tempfile.mkstemp(suffix=".jpg")
            os.close(fd)
            Path(path).write_bytes(_tensor_to_jpeg_bytes(image))
            temp_paths.append(path)
        command = [
            cli,
            "-m", str(model),
            "--mmproj", str(mmproj),
            "-n", str(max(32, min(768, int(max_tokens)))),
            "--temp", "0",
            "--top-p", "1",
            "--top-k", "1",
            "--repeat-penalty", "1.0",
            "-ngl", "99",
            "-c", "4096",
            "--seed", "1",
        ]
        for path in temp_paths:
            command.extend(["--image", path])
        command.extend(["-p", "/no_think\n" + str(text)])
        LOGGER.info(
            "[H3 Studio - GGUF] One-shot llama-mtmd-cli fallback | images=%d | max_tokens=%d | ctx=4096 | ngl=99",
            len(images),
            max_tokens,
        )
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=240,
        )
        if result.returncode != 0:
            message = (result.stderr or result.stdout or "unknown error").strip()
            raise RuntimeError(f"llama-mtmd-cli failed ({result.returncode}): {message[-800:]}")
        return str(result.stdout).strip()
    finally:
        for path in temp_paths:
            with suppress(OSError):
                os.unlink(path)


class Qwen35GGUFClipProxy:
    """Compatibility surface used by H3 Studio's analyzer/writer contracts."""

    def __init__(self) -> None:
        self.identity = "qwen3.5-4b/UD-Q4_K_XL/mmproj-BF16/llama.cpp"
        self._used_server = False

    def tokenize(self, text: str, *args, **kwargs):
        if kwargs.get("thinking") not in (None, False):
            raise ValueError("H3 Studio Qwen3.5 GGUF prompt prep always uses thinking=False.")
        return {"text": str(text), "images": list(kwargs.get("images") or [])}

    def generate(self, tokens, *args, **kwargs):
        text = str(tokens.get("text") or "")
        images = list(tokens.get("images") or [])
        requested = int(kwargs.get("max_length") or (64 + max(1, len(images)) * 80))
        max_tokens = max(32, min(768, requested))
        started = time.perf_counter()
        server_error = ""
        if _server_command():
            try:
                output = _SERVER.complete(text, images, max_tokens)
                self._used_server = True
                LOGGER.info(
                    "[H3 Studio - GGUF] Complete via llama-server | images=%d | %.2fs",
                    len(images),
                    time.perf_counter() - started,
                )
                return output
            except Exception as error:
                server_error = f"{type(error).__name__}: {error}"
                LOGGER.warning("[H3 Studio - GGUF] llama-server path failed; trying mtmd CLI | %s", server_error)
                _SERVER.stop()
        if _mtmd_cli():
            output = _complete_cli(text, images, max_tokens)
            LOGGER.info(
                "[H3 Studio - GGUF] Complete via llama-mtmd-cli | images=%d | %.2fs%s",
                len(images),
                time.perf_counter() - started,
                f" | server fallback={server_error}" if server_error else "",
            )
            return output
        raise RuntimeError(
            "No usable llama.cpp Qwen3.5 backend is installed. "
            + (f"llama-server failed: {server_error}. " if server_error else "")
            + "Install llama.cpp with llama-server or llama-mtmd-cli."
        )

    @staticmethod
    def decode(generated, *_args, **_kwargs) -> str:
        return str(generated)

    def close(self) -> None:
        if self._used_server or _SERVER.running():
            _SERVER.stop()
            self._used_server = False
            LOGGER.info("[H3 Studio - GGUF] Released stage-scoped Qwen3.5 llama.cpp server before H3 conditioning")


def _is_gguf_choice(value: str | None) -> bool:
    compact = _compact(value)
    return value in {FASTEST_QWEN35_4B_GGUF, FASTEST_QWEN35_4B_GGUF_WRITER} or (
        "qwen35" in compact and "4b" in compact and "gguf" in compact
    )


def install() -> None:
    """Extend the existing analyzer stack without replacing H3 generation paths."""

    from . import analyzer_stack
    from .nodes import loader

    if bool(getattr(analyzer_stack, "__h3studio_qwen35_gguf_installed__", False)):
        return
    analyzer_stack.__h3studio_qwen35_gguf_installed__ = True

    original_model_family = analyzer_stack.model_family
    original_analyzer_choices = analyzer_stack.analyzer_choices
    original_writer_choices = analyzer_stack.prompt_writer_choices
    original_resolve_analyzer = loader._resolve_analyzer
    original_resolve_writer = loader._resolve_prompt_writer
    original_analyzer_spec = analyzer_stack.analyzer_spec
    original_load_analysis = analyzer_stack.load_analysis_backend
    original_load_writer = analyzer_stack.load_writer_backend

    def model_family(value: str | None) -> str:
        if _is_gguf_choice(value):
            # Keep the same family so the existing Loader reuses one helper for
            # analyzer + writer when both resolve to this exact checkpoint.
            return "qwen35"
        return original_model_family(value)

    def analyzer_choices() -> list[str]:
        values = list(original_analyzer_choices())
        if FASTEST_QWEN35_4B_GGUF not in values:
            insert_at = 1 if values else 0
            values.insert(insert_at, FASTEST_QWEN35_4B_GGUF)
        return values

    def prompt_writer_choices() -> list[str]:
        values = list(original_writer_choices())
        if FASTEST_QWEN35_4B_GGUF_WRITER not in values:
            insert_at = 1 if values else 0
            values.insert(insert_at, FASTEST_QWEN35_4B_GGUF_WRITER)
        return values

    def resolve_analyzer(value: str | None) -> str | None:
        normalized = _normalize(value)
        auto_values = {
            getattr(analyzer_stack, "AUTO_QWEN35_4B", "Auto · Qwen3.5 4B"),
            getattr(analyzer_stack, "OLD_AUTO_ANALYZER", "Auto · Qwen3-VL 4B"),
        }
        if normalized == FASTEST_QWEN35_4B_GGUF:
            if status()["ready"]:
                return FASTEST_QWEN35_4B_GGUF
            fallback = analyzer_stack.preferred_qwen35("4b")
            if fallback:
                LOGGER.warning("[H3 Studio - GGUF] Explicit GGUF backend is not ready; falling back to native %s", fallback)
                return fallback
            raise ValueError(
                "Qwen3.5 4B GGUF selected but llama.cpp and/or the model+mmproj pair is missing. "
                "Install the Fast prompt-prep pair in H3 Studio Model Setup."
            )
        if normalized in auto_values and status()["ready"]:
            LOGGER.info("[H3 Studio - GGUF] Auto prompt prep selected Qwen3.5-4B Q4_K_XL llama.cpp backend")
            return FASTEST_QWEN35_4B_GGUF
        return original_resolve_analyzer(value)

    def resolve_writer(value: str | None, analyzer_name: str | None) -> str | None:
        normalized = _normalize(value)
        if normalized == FASTEST_QWEN35_4B_GGUF_WRITER:
            if status()["ready"]:
                return FASTEST_QWEN35_4B_GGUF
            fallback = analyzer_stack.preferred_qwen35("4b")
            if fallback:
                LOGGER.warning("[H3 Studio - GGUF] GGUF writer unavailable; falling back to native %s", fallback)
                return fallback
            raise ValueError("Qwen3.5 4B GGUF writer selected but its llama.cpp runtime/model pair is unavailable.")
        auto_writer = getattr(analyzer_stack, "AUTO_WRITER_QWEN35_4B", "Auto · Qwen3.5 4B writer")
        old_writers = {
            getattr(analyzer_stack, "OLD_AUTO_WRITER_4B", "Auto · Qwen3-VL 4B writer"),
            getattr(analyzer_stack, "OLD_AUTO_WRITER_8B", "Auto · Qwen3-VL 8B writer"),
        }
        if normalized in {auto_writer, *old_writers} and status()["ready"]:
            LOGGER.info("[H3 Studio - GGUF] Auto prompt writer selected Qwen3.5-4B Q4_K_XL llama.cpp backend")
            return FASTEST_QWEN35_4B_GGUF
        return original_resolve_writer(value, analyzer_name)

    def analyzer_spec(value: str | None):
        if _is_gguf_choice(value):
            return analyzer_stack.AnalyzerSpec(
                value=FASTEST_QWEN35_4B_GGUF,
                family="qwen35",
                backend="llama.cpp Qwen3.5 GGUF/libmtmd",
                model_file=model_path().name,
                mmproj_file=mmproj_path().name,
                can_write=True,
            )
        return original_analyzer_spec(value)

    def load_analysis_backend(name: str):
        if _is_gguf_choice(name):
            return Qwen35GGUFClipProxy()
        return original_load_analysis(name)

    def load_writer_backend(name: str):
        if _is_gguf_choice(name):
            return Qwen35GGUFClipProxy()
        return original_load_writer(name)

    analyzer_stack.FASTEST_QWEN35_4B_GGUF = FASTEST_QWEN35_4B_GGUF
    analyzer_stack.FASTEST_QWEN35_4B_GGUF_WRITER = FASTEST_QWEN35_4B_GGUF_WRITER
    analyzer_stack.model_family = model_family
    analyzer_stack.analyzer_choices = analyzer_choices
    analyzer_stack.prompt_writer_choices = prompt_writer_choices
    analyzer_stack.analyzer_spec = analyzer_spec
    analyzer_stack.load_analysis_backend = load_analysis_backend
    analyzer_stack.load_writer_backend = load_writer_backend
    analyzer_stack.qwen35_gguf_status = status
    analyzer_stack.stop_qwen35_gguf_server = stop_server

    # Loader functions were copied from analyzer_stack during modernization;
    # repoint them to the final wrappers.
    loader.analyzer_choices = analyzer_choices
    loader.prompt_writer_choices = prompt_writer_choices
    loader._resolve_analyzer = resolve_analyzer
    loader._resolve_prompt_writer = resolve_writer

    loader.H3StudioLoader.DESCRIPTION = (
        "H3 generation still uses its normal 32B MiniMax conditioning encoder. Prompt prep Auto prefers the installed "
        "Qwen3.5-4B Q4_K_XL llama.cpp backend when its model+mmproj/runtime are ready, then falls back to native Qwen3.5. "
        "The GGUF helper is stage-scoped and released before H3 conditioning."
    )


__all__ = [
    "FASTEST_QWEN35_4B_GGUF",
    "FASTEST_QWEN35_4B_GGUF_WRITER",
    "QWEN35_GGUF_MODEL_FILE",
    "QWEN35_GGUF_MMPROJ_FILE",
    "QWEN35_GGUF_MODEL_URL",
    "QWEN35_GGUF_MMPROJ_URL",
    "Qwen35GGUFClipProxy",
    "install",
    "model_path",
    "mmproj_path",
    "status",
    "stop_server",
]
