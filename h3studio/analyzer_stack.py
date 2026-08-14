"""Modern analyzer/prompt-director backends for H3 Studio.

This module deliberately leaves MiniMax H3's 32B conditioning encoder alone.
It only modernizes the optional reference-image analyzer and prompt writer.
"""

from __future__ import annotations

import atexit
import base64
import io
import logging
import os
import shutil
import socket
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

LOGGER = logging.getLogger(__name__)

AUTO_QWEN35_4B = "Auto · Qwen3.5 4B"
FAST_QWEN35_2B = "Fast · Qwen3.5 2B"
FASTEST_MINICPM_V46 = "Fastest Vision · MiniCPM-V 4.6"
AUTO_WRITER_QWEN35_4B = "Auto · Qwen3.5 4B writer"
AUTO_WRITER_QWEN35_2B = "Auto · Qwen3.5 2B writer"
LEGACY_QWEN3VL_4B = "Legacy · Qwen3-VL 4B"
LEGACY_QWEN3VL_8B = "Legacy · Qwen3-VL 8B"

OLD_AUTO_ANALYZER = "Auto · Qwen3-VL 4B"
OLD_AUTO_WRITER_4B = "Auto · Qwen3-VL 4B writer"
OLD_AUTO_WRITER_8B = "Auto · Qwen3-VL 8B writer"

QWEN35_4B_FILE = "qwen3.5_4b_bf16.safetensors"
QWEN35_2B_FILE = "qwen3.5_2b_bf16.safetensors"
MINICPM_V46_FILE = "MiniCPM-V-4_6-Q4_K_M.gguf"
MINICPM_V46_MMPROJ = "mmproj-model-f16.gguf"
VLM_FOLDER = "h3studio_vlm"

QWEN35_4B_DOWNLOAD = "https://huggingface.co/Comfy-Org/Qwen3.5/resolve/main/text_encoders/qwen3.5_4b_bf16.safetensors?download=true"
QWEN35_2B_DOWNLOAD = "https://huggingface.co/Comfy-Org/Qwen3.5/resolve/main/text_encoders/qwen3.5_2b_bf16.safetensors?download=true"
MINICPM_V46_DOWNLOAD = "https://huggingface.co/openbmb/MiniCPM-V-4.6-gguf/resolve/main/MiniCPM-V-4_6-Q4_K_M.gguf?download=true"
MINICPM_V46_MMPROJ_DOWNLOAD = "https://huggingface.co/openbmb/MiniCPM-V-4.6-gguf/resolve/main/mmproj-model-f16.gguf?download=true"


@dataclass(frozen=True, slots=True)
class AnalyzerSpec:
    value: str
    family: str
    backend: str
    model_file: str = ""
    mmproj_file: str = ""
    can_write: bool = True


def _normalize(value: Any) -> str:
    return str(value or "").replace("\\", "/").strip()


def _compact(value: Any) -> str:
    return "".join(ch for ch in _normalize(value).lower() if ch.isalnum())


def _text_encoder_files() -> list[str]:
    try:
        import folder_paths

        values: set[str] = set()
        for category in ("text_encoders", "clip"):
            try:
                values.update(_normalize(item) for item in folder_paths.get_filename_list(category))
            except Exception:
                continue
        return sorted((item for item in values if item), key=str.casefold)
    except Exception:
        return []


def _vlm_root(create: bool = True) -> Path:
    import folder_paths

    path = Path(folder_paths.models_dir) / VLM_FOLDER
    if create:
        path.mkdir(parents=True, exist_ok=True)
    return path


def register_vlm_model_path() -> None:
    """Register the deliberate models/h3studio_vlm location with ComfyUI."""

    try:
        import folder_paths

        path = _vlm_root(True)
        folder_paths.add_model_folder_path(VLM_FOLDER, str(path), is_default=True)
    except Exception as exc:  # pragma: no cover - only relevant outside ComfyUI
        LOGGER.debug("[H3 Studio] Could not register %s model folder: %s", VLM_FOLDER, exc)


def _vlm_files() -> list[str]:
    try:
        root = _vlm_root(False)
        if not root.exists():
            return []
        return sorted((item.name for item in root.iterdir() if item.is_file() and item.suffix.lower() == ".gguf"), key=str.casefold)
    except Exception:
        return []


def model_family(value: str | None) -> str:
    compact = _compact(value)
    if value == FASTEST_MINICPM_V46 or "minicpmv46" in compact or "minicpmv4_6" in _normalize(value).lower():
        return "minicpm_v46"
    if "qwen35" in compact or "qwen354b" in compact or "qwen352b" in compact:
        return "qwen35"
    if "qwen3vl" in compact:
        return "qwen3vl"
    return "unknown"


def _is_h3_conditioner(name: str) -> bool:
    compact = _compact(name)
    return "qwen3vl" in compact and ("minimax" in compact or "h3" in compact)


def _qwen35_files() -> list[str]:
    return [item for item in _text_encoder_files() if model_family(item) == "qwen35" and not _is_h3_conditioner(item)]


def _legacy_qwen3vl_files() -> list[str]:
    return [item for item in _text_encoder_files() if model_family(item) == "qwen3vl" and not _is_h3_conditioner(item)]


def _preferred(files: list[str], family: str, size: str) -> str | None:
    exact_tokens = {
        ("qwen35", "4b"): ("qwen354bbf16", "qwen354b"),
        ("qwen35", "2b"): ("qwen352bbf16", "qwen352b"),
        ("qwen3vl", "4b"): ("qwen3vl4bfp8scaled", "qwen3vl4b"),
        ("qwen3vl", "8b"): ("qwen3vl8bfp8scaled", "qwen3vl8b"),
    }.get((family, size), ())
    for token in exact_tokens:
        match = next((item for item in files if token in _compact(item)), None)
        if match:
            return match
    return None


def preferred_qwen35(size: str = "4b") -> str | None:
    return _preferred(_qwen35_files(), "qwen35", size)


def preferred_legacy_qwen3vl(size: str = "4b") -> str | None:
    return _preferred(_legacy_qwen3vl_files(), "qwen3vl", size)


def analyzer_choices() -> list[str]:
    register_vlm_model_path()
    modern_explicit = _qwen35_files()
    legacy_explicit = _legacy_qwen3vl_files()
    minicpm_explicit = [item for item in _vlm_files() if model_family(item) == "minicpm_v46" and "mmproj" not in item.lower()]
    values = [
        AUTO_QWEN35_4B,
        FAST_QWEN35_2B,
        FASTEST_MINICPM_V46,
        "Disabled",
        *modern_explicit,
        LEGACY_QWEN3VL_4B,
        LEGACY_QWEN3VL_8B,
        *legacy_explicit,
        *minicpm_explicit,
    ]
    return list(dict.fromkeys(values))


def prompt_writer_choices() -> list[str]:
    values = [
        "Same as image analyzer",
        AUTO_WRITER_QWEN35_4B,
        AUTO_WRITER_QWEN35_2B,
        "Deterministic fallback only",
        *_qwen35_files(),
        LEGACY_QWEN3VL_4B,
        LEGACY_QWEN3VL_8B,
        *_legacy_qwen3vl_files(),
    ]
    return list(dict.fromkeys(values))


def resolve_analyzer(value: str | None) -> str | None:
    normalized = _normalize(value)
    if not normalized or normalized.lower() in {"disabled", "none", "off", "null"}:
        return None
    if normalized in {AUTO_QWEN35_4B, OLD_AUTO_ANALYZER}:
        selected = preferred_qwen35("4b")
        if not selected:
            raise ValueError(
                f"{AUTO_QWEN35_4B} is the H3 Studio default, but {QWEN35_4B_FILE} is not installed in models/text_encoders. "
                "Install the Recommended analyzer/writer from H3 Studio Model Setup."
            )
        if normalized == OLD_AUTO_ANALYZER:
            LOGGER.info("[H3 Studio] Migrated previous Auto Qwen3-VL analyzer default -> %s", AUTO_QWEN35_4B)
        return selected
    if normalized == FAST_QWEN35_2B:
        selected = preferred_qwen35("2b")
        if not selected:
            raise ValueError(f"{FAST_QWEN35_2B} needs {QWEN35_2B_FILE} in models/text_encoders.")
        return selected
    if normalized == FASTEST_MINICPM_V46:
        return FASTEST_MINICPM_V46
    if normalized == LEGACY_QWEN3VL_4B:
        selected = preferred_legacy_qwen3vl("4b")
        if not selected:
            raise ValueError("Legacy Qwen3-VL 4B was selected, but no compatible 4B checkpoint is installed.")
        return selected
    if normalized == LEGACY_QWEN3VL_8B:
        selected = preferred_legacy_qwen3vl("8b")
        if not selected:
            raise ValueError("Legacy Qwen3-VL 8B was selected, but no compatible 8B checkpoint is installed.")
        return selected
    return normalized


def resolve_writer(value: str | None, analyzer_name: str | None) -> str | None:
    normalized = _normalize(value)
    if not normalized or normalized in {"Deterministic fallback only", "Fast deterministic - no second model", "Disabled"}:
        return None
    if normalized == "Same as image analyzer":
        if not analyzer_name:
            return None
        if model_family(analyzer_name) == "minicpm_v46":
            selected = preferred_qwen35("4b")
            if not selected:
                raise ValueError(
                    "MiniCPM-V 4.6 is a vision-only H3 Studio analyzer path. 'Same as image analyzer' therefore resolves to the "
                    f"recommended Qwen3.5-4B writer, but {QWEN35_4B_FILE} is not installed. Install it or choose Deterministic fallback only."
                )
            LOGGER.info("[H3 Studio] MiniCPM analyzer cannot serve the writer contract; resolving Same as image analyzer -> %s", selected)
            return selected
        return analyzer_name
    if normalized in {AUTO_WRITER_QWEN35_4B, OLD_AUTO_WRITER_4B, OLD_AUTO_WRITER_8B}:
        selected = preferred_qwen35("4b")
        if not selected:
            raise ValueError(f"Recommended prompt writer needs {QWEN35_4B_FILE} in models/text_encoders.")
        if normalized in {OLD_AUTO_WRITER_4B, OLD_AUTO_WRITER_8B}:
            LOGGER.info("[H3 Studio] Migrated previous automatic Qwen3-VL writer -> %s", AUTO_WRITER_QWEN35_4B)
        return selected
    if normalized == AUTO_WRITER_QWEN35_2B:
        selected = preferred_qwen35("2b")
        if not selected:
            raise ValueError(f"Qwen3.5-2B writer needs {QWEN35_2B_FILE} in models/text_encoders.")
        return selected
    if normalized == LEGACY_QWEN3VL_4B:
        return resolve_analyzer(LEGACY_QWEN3VL_4B)
    if normalized == LEGACY_QWEN3VL_8B:
        return resolve_analyzer(LEGACY_QWEN3VL_8B)
    return normalized


def analyzer_spec(value: str | None) -> AnalyzerSpec | None:
    if not value:
        return None
    family = model_family(value)
    if family == "minicpm_v46":
        model_file = MINICPM_V46_FILE if value == FASTEST_MINICPM_V46 else Path(_normalize(value)).name
        return AnalyzerSpec(
            value=_normalize(value),
            family=family,
            backend="llama.cpp/mtmd",
            model_file=model_file,
            mmproj_file=MINICPM_V46_MMPROJ,
            can_write=False,
        )
    if family == "qwen35":
        return AnalyzerSpec(_normalize(value), family, "ComfyUI native Qwen3.5", model_file=_normalize(value), can_write=True)
    if family == "qwen3vl":
        return AnalyzerSpec(_normalize(value), family, "ComfyUI legacy Qwen3-VL", model_file=_normalize(value), can_write=True)
    return AnalyzerSpec(_normalize(value), family, "unknown", model_file=_normalize(value), can_write=False)


def _load_native_qwen35(name: str):
    """Use current ComfyUI's native TE auto-detection; never route Qwen3.5 through krea2."""

    import folder_paths
    import comfy.sd

    path = folder_paths.get_full_path_or_raise("text_encoders", name)
    try:
        return comfy.sd.load_clip(
            ckpt_paths=[path],
            embedding_directory=folder_paths.get_folder_paths("embeddings"),
            clip_type=comfy.sd.CLIPType.STABLE_DIFFUSION,
        )
    except Exception as exc:
        raise RuntimeError(
            f"Could not load {name} through ComfyUI's native Qwen3.5 text/vision implementation. "
            "Update ComfyUI to a current master build with Qwen3.5 multimodal support. "
            f"Original error: {type(exc).__name__}: {exc}"
        ) from exc


class _AnalyzerBudgetProxy:
    """Clamp factual analyzer generation without changing writer generation."""

    def __init__(self, raw: Any, identity: str):
        self.raw_clip = raw
        self.identity = identity
        self._image_count = 1

    def tokenize(self, text, *args, **kwargs):
        images = kwargs.get("images") or []
        self._image_count = max(1, len(images))
        return self.raw_clip.tokenize(text, *args, **kwargs)

    def generate(self, tokens, *args, **kwargs):
        # 35-70 dense words/image plus compact JSON structure. The caller still
        # gets its one repair retry, but cannot accidentally request 2K tokens.
        ceiling = min(1152, 96 + self._image_count * 105)
        requested = int(kwargs.get("max_length") or ceiling)
        kwargs["max_length"] = min(requested, ceiling)
        kwargs["do_sample"] = False
        return self.raw_clip.generate(tokens, *args, **kwargs)

    def decode(self, *args, **kwargs):
        return self.raw_clip.decode(*args, **kwargs)

    def __getattr__(self, name: str):
        return getattr(self.raw_clip, name)


class _MiniCPMServerManager:
    def __init__(self):
        self._lock = threading.RLock()
        self._process: subprocess.Popen | None = None
        self._port = 0
        self._signature: tuple[str, str] | None = None
        self._command: list[str] | None = None

    @staticmethod
    def _binary() -> list[str] | None:
        configured = _normalize(os.environ.get("H3STUDIO_LLAMA_SERVER"))
        if configured:
            return [configured]
        direct = shutil.which("llama-server") or shutil.which("llama-server.exe")
        if direct:
            return [direct]
        umbrella = shutil.which("llama") or shutil.which("llama.exe")
        if umbrella:
            return [umbrella, "serve"]
        return None

    @staticmethod
    def _free_port() -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", 0))
            return int(sock.getsockname()[1])

    def status(self) -> dict[str, Any]:
        command = self._binary()
        return {
            "available": bool(command),
            "command": Path(command[0]).name if command else "",
            "running": bool(self._process and self._process.poll() is None),
            "model_folder": f"models/{VLM_FOLDER}",
            "model_present": (_vlm_root(False) / MINICPM_V46_FILE).is_file(),
            "mmproj_present": (_vlm_root(False) / MINICPM_V46_MMPROJ).is_file(),
        }

    def stop(self) -> None:
        with self._lock:
            process = self._process
            self._process = None
            self._signature = None
            self._port = 0
            if process and process.poll() is None:
                try:
                    process.terminate()
                    process.wait(timeout=4)
                except Exception:
                    try:
                        process.kill()
                    except Exception:
                        pass

    def ensure(self, model_path: Path, mmproj_path: Path) -> str:
        import requests

        signature = (str(model_path.resolve()), str(mmproj_path.resolve()))
        with self._lock:
            if self._process and self._process.poll() is None and self._signature == signature:
                return f"http://127.0.0.1:{self._port}"
            self.stop()
            command = self._binary()
            if not command:
                raise RuntimeError(
                    "Fastest Vision · MiniCPM-V 4.6 needs a current llama.cpp installation. "
                    "Install llama.cpp so `llama-server` (or `llama serve`) is available, or set H3STUDIO_LLAMA_SERVER to the executable. "
                    "H3 Studio still starts normally without it."
                )
            if not model_path.is_file():
                raise FileNotFoundError(f"Missing MiniCPM model: models/{VLM_FOLDER}/{model_path.name}")
            if not mmproj_path.is_file():
                raise FileNotFoundError(
                    f"Missing MiniCPM multimodal projector: models/{VLM_FOLDER}/{mmproj_path.name}. "
                    "MiniCPM-V 4.6 requires both the language GGUF and mmproj file."
                )
            port = self._free_port()
            args = [
                *command,
                "--model", str(model_path),
                "--mmproj", str(mmproj_path),
                "--host", "127.0.0.1",
                "--port", str(port),
                "--ctx-size", "4096",
                "--n-gpu-layers", "999",
            ]
            LOGGER.info("[H3 Studio] Starting private MiniCPM-V 4.6 llama.cpp backend on localhost:%d", port)
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
                    raise RuntimeError(
                        "llama.cpp exited while loading MiniCPM-V 4.6. Update llama.cpp to a build with MiniCPM-V 4.6/libmtmd support."
                    )
                try:
                    response = requests.get(f"{base}/health", timeout=1.5)
                    if response.ok:
                        self._process = process
                        self._signature = signature
                        self._port = port
                        self._command = command
                        return base
                    last_error = f"HTTP {response.status_code}"
                except Exception as exc:
                    last_error = str(exc)
                time.sleep(0.25)
            try:
                process.terminate()
            except Exception:
                pass
            raise RuntimeError(f"Timed out waiting for llama.cpp MiniCPM backend ({last_error or 'no health response'}).")


_MINICPM_SERVER = _MiniCPMServerManager()
atexit.register(_MINICPM_SERVER.stop)


def minicpm_status() -> dict[str, Any]:
    register_vlm_model_path()
    return _MINICPM_SERVER.status()


def stop_minicpm_server() -> None:
    _MINICPM_SERVER.stop()


def _tensor_to_data_uri(image: Any) -> str:
    import numpy as np
    from PIL import Image

    tensor = image.detach().cpu() if hasattr(image, "detach") else image
    array = tensor.numpy() if hasattr(tensor, "numpy") else np.asarray(tensor)
    while array.ndim > 3:
        array = array[0]
    if array.ndim != 3:
        raise ValueError(f"MiniCPM image must resolve to HxWxC, got shape {getattr(array, 'shape', None)}")
    if array.shape[-1] > 3:
        array = array[..., :3]
    if array.dtype != np.uint8:
        array = (np.clip(array, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)
    pil = Image.fromarray(array, mode="RGB")
    buffer = io.BytesIO()
    pil.save(buffer, format="JPEG", quality=92, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


class MiniCPMV46ClipProxy:
    """Small compatibility surface matching the ComfyUI CLIP generate API."""

    def __init__(self, model_file: str = MINICPM_V46_FILE, mmproj_file: str = MINICPM_V46_MMPROJ):
        register_vlm_model_path()
        self.model_file = Path(model_file).name
        self.mmproj_file = Path(mmproj_file).name
        self.identity = f"minicpm-v4.6/{self.model_file}/{self.mmproj_file}/llama.cpp"

    def tokenize(self, text: str, *args, **kwargs):
        if kwargs.get("thinking") not in (None, False):
            raise ValueError("H3 Studio MiniCPM factual analysis always runs with thinking=False.")
        return {
            "text": str(text),
            "images": list(kwargs.get("images") or []),
        }

    def generate(self, tokens, *args, **kwargs):
        import requests

        images = list(tokens.get("images") or [])
        if not images:
            raise ValueError("MiniCPM-V 4.6 analyzer received no image tensors.")
        root = _vlm_root(False)
        base = _MINICPM_SERVER.ensure(root / self.model_file, root / self.mmproj_file)
        content = [{"type": "image_url", "image_url": {"url": _tensor_to_data_uri(image)}} for image in images]
        content.append({"type": "text", "text": str(tokens.get("text") or "")})
        requested = int(kwargs.get("max_length") or (96 + len(images) * 105))
        max_tokens = min(1152, requested, 96 + len(images) * 105)
        payload = {
            "model": "h3studio-minicpm-v4.6",
            "messages": [{"role": "user", "content": content}],
            "temperature": 0,
            "top_p": 1,
            "max_tokens": max_tokens,
            "stream": False,
            "response_format": {"type": "json_object"},
            "chat_template_kwargs": {"enable_thinking": False},
        }
        response = requests.post(f"{base}/v1/chat/completions", json=payload, timeout=180)
        if not response.ok:
            raise RuntimeError(f"MiniCPM llama.cpp request failed ({response.status_code}): {response.text[:500]}")
        data = response.json()
        try:
            return str(data["choices"][0]["message"]["content"])
        except Exception as exc:
            raise RuntimeError(f"MiniCPM llama.cpp returned an unexpected response: {data!r}") from exc

    @staticmethod
    def decode(generated):
        return str(generated)


def load_analysis_backend(name: str):
    spec = analyzer_spec(name)
    if spec is None:
        return None
    if spec.family == "minicpm_v46":
        return MiniCPMV46ClipProxy(spec.model_file, spec.mmproj_file)
    if spec.family == "qwen35":
        raw = _load_native_qwen35(spec.model_file)
        return _AnalyzerBudgetProxy(raw, spec.value)
    if spec.family == "qwen3vl":
        from .nodes import loader as legacy

        raw = legacy._load_analyzer_clip(spec.model_file)
        return _AnalyzerBudgetProxy(raw, spec.value)
    raise ValueError(f"Unsupported H3 Studio image-analyzer architecture for {name!r}.")


def load_writer_backend(name: str):
    spec = analyzer_spec(name)
    if spec is None:
        return None
    if not spec.can_write:
        raise ValueError(f"{name} is not wired for the H3 Studio writer contract.")
    if spec.family == "qwen35":
        return _load_native_qwen35(spec.model_file)
    if spec.family == "qwen3vl":
        from .nodes import loader as legacy

        return legacy._load_analyzer_clip(spec.model_file)
    raise ValueError(f"Unsupported H3 Studio prompt-writer architecture for {name!r}.")


def _raw_backend(value: Any) -> Any:
    return getattr(value, "raw_clip", value)


def install_loader_modernization() -> None:
    """Patch the existing Loader surface without touching H3 generation loading."""

    register_vlm_model_path()
    from .nodes import loader

    loader.AUTO_ANALYZER = AUTO_QWEN35_4B
    loader.AUTO_WRITER_4B = AUTO_WRITER_QWEN35_4B
    loader.AUTO_WRITER_8B = AUTO_WRITER_QWEN35_2B
    loader.analyzer_choices = analyzer_choices
    loader.prompt_writer_choices = prompt_writer_choices
    loader._resolve_analyzer = resolve_analyzer
    loader._resolve_prompt_writer = resolve_writer

    def analyzer_for_analysis(self):
        if not self.analyzer_name:
            return None
        with self._lock:
            if self.analyzer_clip is None:
                spec = analyzer_spec(self.analyzer_name)
                LOGGER.info(
                    "[H3 Studio] Loading visual analyzer=%s | family=%s | backend=%s",
                    self.analyzer_name,
                    spec.family if spec else "unknown",
                    spec.backend if spec else "unknown",
                )
                self.analyzer_clip = load_analysis_backend(self.analyzer_name)
            return self.analyzer_clip

    def writer_for_enhancement(self):
        if not self.prompt_writer_name:
            return None
        analyzer_family = model_family(self.analyzer_name)
        writer_family = model_family(self.prompt_writer_name)
        if (
            self.analyzer_name
            and analyzer_family in {"qwen35", "qwen3vl"}
            and writer_family == analyzer_family
            and _compact(self.prompt_writer_name) == _compact(self.analyzer_name)
        ):
            LOGGER.info("[H3 Studio] Reusing one %s checkpoint for analyzer + prompt writer=%s", analyzer_family, self.prompt_writer_name)
            return _raw_backend(self.analyzer_for_analysis())
        with self._lock:
            if self.prompt_writer_clip is None:
                LOGGER.info("[H3 Studio] Loading text-only prompt writer=%s | family=%s", self.prompt_writer_name, writer_family)
                self.prompt_writer_clip = load_writer_backend(self.prompt_writer_name)
            return self.prompt_writer_clip

    def release_prompt_models(self, stop_external: bool = False):
        with self._lock:
            self.analyzer_clip = None
            self.prompt_writer_clip = None
        if stop_external:
            stop_minicpm_server()
        try:
            import comfy.model_management

            comfy.model_management.soft_empty_cache()
        except Exception:
            pass

    loader.H3StudioBundle.analyzer_for_analysis = analyzer_for_analysis
    loader.H3StudioBundle.writer_for_enhancement = writer_for_enhancement
    loader.H3StudioBundle.release_prompt_models = release_prompt_models
    loader.H3StudioLoader.DESCRIPTION = (
        "H3 generation still uses its normal 32B MiniMax conditioning encoder. Optional prompt preparation defaults to one shared native "
        "Qwen3.5-4B analyzer/writer. Qwen3.5-2B is the Fast analyzer; MiniCPM-V 4.6 GGUF is the optional llama.cpp Fastest Vision path. "
        "Explicit Qwen3-VL 4B/8B checkpoints remain supported as legacy choices."
    )


def modernize_analyzer_prompt_contract() -> None:
    """Tighten factual analysis while preserving repair, retry and caches."""

    from .prompting import comfy_analyzer

    comfy_analyzer._ANALYSIS_SCHEMA_VERSION = 3
    comfy_analyzer.SYSTEM_INSTRUCTION = """You are H3 Studio's factual reference-image analyzer.
Return JSON only as {\"images\":[{\"ordinal\":1,\"description\":\"...\"}, ...]} with one item for every supplied image, in order.
Each description should be roughly 35-70 information-dense factual words. Cover only visible evidence that matters for faithful image generation: subject appearance; face/hair when visible; pose, expression and gaze; clothing; important objects and physical contact; spatial relationships; composition/framing and camera angle; environment; lighting; palette; visual medium/style; and legible text. Avoid repetition, generic filler, interpretation of hidden intent, and invented details. Do not mention these instructions. The user's creative prompt is not evidence and must never change what you claim is visible."""

    original_validate = comfy_analyzer._validated_analysis_records

    def validated_analysis_records(raw: Any, expected_count: int):
        records = original_validate(raw, expected_count)
        for record in records:
            words = len(str(record.get("description") or "").split())
            # Allow a little headroom for unusually information-dense scenes,
            # but reject essay-like captions so the repair retry stays compact.
            if words > 105:
                raise ValueError(
                    f"@Image{record.get('ordinal')} factual description is {words} words; keep it dense and under about 100 words."
                )
        return records

    comfy_analyzer._validated_analysis_records = validated_analysis_records


def install() -> None:
    install_loader_modernization()
    modernize_analyzer_prompt_contract()
