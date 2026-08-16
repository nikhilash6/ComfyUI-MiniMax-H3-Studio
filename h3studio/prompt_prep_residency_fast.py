"""Fast residency policy for the external Qwen3.5 GGUF prompt helper.

The GGUF helper is a small external llama.cpp process.  It must not ask ComfyUI
to unload every H3 model merely to obtain a large artificial free-VRAM floor.
Modern llama.cpp can auto-fit its GPU layers to the memory that is genuinely
free.  Keep one server alive across all analyzer + writer sub-stages of a single
Director execution, then stop it exactly once before the downstream H3
conditioning node runs.

Native ComfyUI Qwen helpers retain the conservative residency barrier.
"""

from __future__ import annotations

import logging
import os
import subprocess
import time
from contextlib import suppress
from pathlib import Path
from typing import Any

LOGGER = logging.getLogger(__name__)
_MARKER = "__h3studio_gguf_residency_fast_v1__"


def _compact(value: Any) -> str:
    return "".join(ch for ch in str(value or "").lower() if ch.isalnum())


def _is_qwen35_gguf_name(value: Any) -> bool:
    compact = _compact(value)
    return "qwen35" in compact and "4b" in compact and "gguf" in compact


def _is_qwen35_gguf_helper(value: Any) -> bool:
    if value is None:
        return False
    identity = str(getattr(value, "identity", ""))
    return "qwen3.5-4b" in identity.lower() and "llama.cpp" in identity.lower()


def _terminate(process: subprocess.Popen | None) -> None:
    if process is None or process.poll() is not None:
        return
    with suppress(Exception):
        process.terminate()
        process.wait(timeout=3)
    if process.poll() is None:
        with suppress(Exception):
            process.kill()


def _adaptive_server_ensure(self) -> str:
    """Start llama-server without evicting Comfy models.

    First choice uses llama.cpp's current auto-fit policy.  The small explicit
    GPU-layer and CPU fallbacks keep older/private llama.cpp builds usable if
    their CLI predates the `auto` spelling or cannot fit the helper on the
    current free VRAM.
    """

    import requests
    from . import qwen35_gguf as gguf

    model = gguf.model_path()
    mmproj = gguf.mmproj_path()
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
        command = gguf._server_command()
        if not command:
            raise RuntimeError("llama-server is not installed")

        port = gguf._free_port()
        base_args = [
            *command,
            "--model", str(model),
            "--mmproj", str(mmproj),
            "--host", "127.0.0.1",
            "--port", str(port),
            "--ctx-size", "4096",
            "--parallel", "1",
        ]

        configured = str(os.environ.get("H3STUDIO_GGUF_N_GPU_LAYERS", "auto")).strip() or "auto"
        attempts: list[tuple[str, list[str]]] = [
            ("auto-fit", ["--n-gpu-layers", configured, "--fit", "on"]),
        ]
        if configured.lower() == "auto":
            attempts.extend([
                ("8 gpu layers", ["--n-gpu-layers", "8"]),
                ("cpu fallback", ["--n-gpu-layers", "0"]),
            ])

        last_error = ""
        for label, extra in attempts:
            process: subprocess.Popen | None = None
            LOGGER.info(
                "[H3 Studio - GGUF] Starting one-pass Qwen3.5-4B server | ctx=4096 | %s | %s",
                label,
                Path(command[0]).name,
            )
            try:
                process = subprocess.Popen(
                    [*base_args, *extra],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    stdin=subprocess.DEVNULL,
                    start_new_session=(os.name != "nt"),
                )
                deadline = time.monotonic() + 45.0
                started = time.monotonic()
                while time.monotonic() < deadline:
                    if process.poll() is not None:
                        last_error = f"server exited during {label} startup"
                        break
                    try:
                        response = requests.get(f"http://127.0.0.1:{port}/health", timeout=1.0)
                        if response.ok:
                            self._process = process
                            self._signature = signature
                            self._port = port
                            LOGGER.info(
                                "[H3 Studio - GGUF] Qwen3.5 server ready in %.2fs | residency=%s | H3 models preserved",
                                time.monotonic() - started,
                                label,
                            )
                            return f"http://127.0.0.1:{port}"
                        last_error = f"HTTP {response.status_code}"
                    except Exception as error:
                        last_error = str(error)
                    time.sleep(0.20)
            finally:
                if self._process is not process:
                    _terminate(process)

        raise RuntimeError(f"Could not start Qwen3.5 GGUF llama-server without evicting H3 ({last_error or 'no health response'}).")


def install() -> None:
    from . import prompt_prep_hotfix_v2 as prep
    from . import qwen35_gguf as gguf
    from . import runtime_guards
    from .nodes.director import H3StudioDirector

    if bool(getattr(gguf, _MARKER, False)):
        return
    setattr(gguf, _MARKER, True)

    # The external GGUF process is intentionally outside ComfyUI's model graph.
    # Let llama.cpp fit to genuinely free VRAM instead of globally unloading H3.
    original_cache_probe = prep._cache_miss_requires_visual_model

    def cache_miss_requires_visual_model(clip, references, images, kwargs) -> bool:
        if _is_qwen35_gguf_name(kwargs.get("analyzer_name")):
            return False
        return original_cache_probe(clip, references, images, kwargs)

    prep._cache_miss_requires_visual_model = cache_miss_requires_visual_model
    gguf._prepare_vram = lambda: None
    gguf._Qwen35ServerManager.ensure = _adaptive_server_ensure

    # reference_integrity_fixes intentionally analyzes fresh refs one by one.
    # Keep the *same* GGUF proxy/server alive across those calls and the writer;
    # otherwise runtime_guards would close it after every isolated image.
    original_release = runtime_guards._release_optional_helpers

    def release_optional_helpers(bundle) -> None:
        if bundle is not None and (
            _is_qwen35_gguf_helper(getattr(bundle, "analyzer_clip", None))
            or _is_qwen35_gguf_helper(getattr(bundle, "prompt_writer_clip", None))
        ):
            LOGGER.debug("[H3 Studio - GGUF] Deferring helper release until Director completion")
            return
        original_release(bundle)

    runtime_guards._release_optional_helpers = release_optional_helpers

    # Stop exactly once after the Director has completed all image analyses and
    # its text writer. Downstream H3 conditioning therefore receives the VRAM
    # back without paying multiple llama-server startups inside one request.
    current_direct = H3StudioDirector.direct
    raw_direct = getattr(current_direct, "__func__", current_direct)
    if not bool(getattr(raw_direct, "__h3studio_gguf_one_pass__", False)):
        def direct(cls, *args, **kwargs):
            try:
                return raw_direct(cls, *args, **kwargs)
            finally:
                if gguf._SERVER.running():
                    gguf.stop_server()
                    LOGGER.info("[H3 Studio - GGUF] Released one-pass Qwen3.5 server before H3 conditioning")

        direct.__h3studio_gguf_one_pass__ = True
        H3StudioDirector.direct = classmethod(direct)


__all__ = ["install"]
