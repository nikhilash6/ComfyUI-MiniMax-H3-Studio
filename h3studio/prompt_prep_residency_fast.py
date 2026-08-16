"""Fast residency policy for the external Qwen3.5 GGUF prompt helper.

The prompt helper is tiny compared with H3, but a completed H3 generation can
leave almost no free VRAM because the transformer, conditioning encoder and VAE
are all still resident.  The previous policy tried llama.cpp auto-fit against
that near-zero headroom and eventually accepted a CPU fallback, turning a warm
second Director run into a multi-minute stall.

This policy keeps the useful H3 transformer warm while making a small,
targeted handoff for Qwen.  It frees only enough Comfy VRAM for the GGUF helper,
starting with the decode VAE (not needed again until final decode), then the H3
text encoder only if necessary.  Qwen uses the known-fast full-GPU path and CPU
fallback is opt-in only.  One llama-server stays warm across every analyzer +
writer sub-stage of one Director execution and is stopped exactly once before
H3 conditioning.
"""

from __future__ import annotations

import gc
import logging
import os
import subprocess
import threading
import time
from contextlib import suppress
from pathlib import Path
from typing import Any

LOGGER = logging.getLogger(__name__)
GIB = 1024**3
_MARKER = "__h3studio_gguf_residency_fast_v2__"
_ACTIVE = threading.local()


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


def _model_patcher(value: Any) -> Any | None:
    if value is None:
        return None
    patcher = getattr(value, "patcher", None)
    if patcher is not None:
        return patcher
    if hasattr(value, "model") and hasattr(value, "load_device"):
        return value
    return None


def _gguf_target_free_bytes(model: Path, mmproj: Path) -> int:
    """VRAM headroom for full-GPU Q4_K_XL + projector + runtime buffers."""

    try:
        override = float(os.environ.get("H3STUDIO_GGUF_TARGET_FREE_GIB", "0") or 0)
    except (TypeError, ValueError):
        override = 0.0
    if override > 0:
        return max(int(override * GIB), int(3.5 * GIB))

    # Current Q4_K_XL is ~3 GiB.  Use the actual local files because the mmproj
    # size differs between llama.cpp releases/model packs.  1 GiB of runtime
    # room covers KV/scratch at the small 4096 context used by H3 Studio.
    with suppress(OSError):
        files = int(model.stat().st_size) + int(mmproj.stat().st_size)
        return max(int(4.25 * GIB), files + int(1.0 * GIB))
    return int(4.5 * GIB)


def _free_vram(manager: Any, device: Any) -> int:
    with suppress(Exception):
        return max(0, int(manager.get_free_memory(device)))
    return 0


def _release_only(manager: Any, device: Any, patcher: Any, target: int, label: str) -> bool:
    """Ask Comfy to free memory from one selected patcher and keep all others."""

    if patcher is None:
        return False
    loaded_fn = getattr(manager, "loaded_models", None)
    free_fn = getattr(manager, "free_memory", None)
    if not callable(loaded_fn) or not callable(free_fn):
        return False
    try:
        loaded = list(loaded_fn())
    except Exception:
        return False
    selected = next((item for item in loaded if item is patcher), None)
    if selected is None:
        return False

    before = _free_vram(manager, device)
    keep = [item for item in loaded if item is not selected]
    try:
        free_fn(target, device, keep_loaded=keep, for_dynamic=False)
    except TypeError:
        free_fn(target, device, keep_loaded=keep)
    except Exception as error:
        LOGGER.debug("[H3 Studio - GGUF] Targeted %s release unavailable: %s", label, error)
        return False

    gc.collect()
    with suppress(Exception):
        manager.soft_empty_cache()
    after = _free_vram(manager, device)
    LOGGER.info(
        "[H3 Studio - GGUF] Targeted VRAM handoff | %s | free %.2f→%.2f GiB | target %.2f GiB",
        label,
        before / GIB,
        after / GIB,
        target / GIB,
    )
    return after > before


def _prepare_gpu_room(target: int, *, aggressive: bool = False) -> int:
    """Make room for Qwen while preserving the H3 transformer whenever possible."""

    try:
        import comfy.model_management as manager

        device = manager.get_torch_device()
        before = _free_vram(manager, device)
        if before >= target:
            return before

        bundle = getattr(_ACTIVE, "bundle", None)
        if bundle is not None:
            # Decode VAE is the cheapest thing to shed after a completed run.
            _release_only(manager, device, _model_patcher(getattr(bundle, "video_vae", None)), target, "video VAE")
            current = _free_vram(manager, device)
            if current < target:
                # The conditioning encoder is needed next, but releasing its
                # residual GPU pages is still much cheaper than throwing away
                # the 11.7 GiB H3 transformer and paying model init again.
                _release_only(manager, device, _model_patcher(getattr(bundle, "clip", None)), target, "H3 text encoder")
            current = _free_vram(manager, device)
        else:
            current = before

        # Clear stale host pins/page pressure too. This does not request active
        # H3 eviction and prevents the external mmap from worsening swap churn.
        with suppress(Exception):
            from .host_memory import relieve_host_memory_pressure

            relieve_host_memory_pressure("prompt-prep.before-gguf", logger=LOGGER)

        current = _free_vram(manager, device)
        if aggressive and current < target:
            # Rare compatibility fallback: ask Comfy for the remaining target,
            # but keep the current H3 transformer itself if we can identify it.
            keep: list[Any] = []
            model = getattr(bundle, "_model", None) if bundle is not None else None
            transformer = _model_patcher(model)
            if transformer is not None:
                keep = [transformer]
            try:
                manager.free_memory(target, device, keep_loaded=keep, for_dynamic=False)
            except TypeError:
                manager.free_memory(target, device, keep_loaded=keep)
            gc.collect()
            with suppress(Exception):
                manager.soft_empty_cache()
            current = _free_vram(manager, device)
            LOGGER.warning(
                "[H3 Studio - GGUF] Extra targeted handoff | free %.2f GiB | target %.2f GiB | transformer_kept=%s",
                current / GIB,
                target / GIB,
                bool(keep),
            )

        if before < target:
            LOGGER.info(
                "[H3 Studio - GGUF] Prompt helper VRAM prepared | free %.2f→%.2f GiB | target %.2f GiB",
                before / GIB,
                current / GIB,
                target / GIB,
            )
        return current
    except Exception as error:
        LOGGER.warning("[H3 Studio - GGUF] Targeted VRAM preparation unavailable: %s: %s", type(error).__name__, error)
        return 0


def _start_full_gpu_server(self, *, extra_room: bool = False) -> str:
    import requests

    from . import qwen35_gguf as gguf

    model = gguf.model_path()
    mmproj = gguf.mmproj_path()
    if not model.is_file() or not mmproj.is_file():
        raise FileNotFoundError(
            "Qwen3.5 4B GGUF needs both the Q4_K_XL language model and matching BF16 mmproj in "
            "ComfyUI/models/h3studio_vlm. Install the Fast prompt-prep pair from H3 Studio Model Setup."
        )

    target = _gguf_target_free_bytes(model, mmproj) + (int(0.75 * GIB) if extra_room else 0)
    free = _prepare_gpu_room(target, aggressive=extra_room)
    command = gguf._server_command()
    if not command:
        raise RuntimeError("llama-server is not installed")

    port = gguf._free_port()
    args = [
        *command,
        "--model", str(model),
        "--mmproj", str(mmproj),
        "--host", "127.0.0.1",
        "--port", str(port),
        "--ctx-size", "4096",
        "--n-gpu-layers", "99",
        "--fit", "off",
        "--parallel", "1",
    ]
    LOGGER.info(
        "[H3 Studio - GGUF] Starting full-GPU Qwen3.5-4B server | ctx=4096 | ngl=99 | fit=off | free=%.2f GiB | %s",
        free / GIB,
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
    deadline = time.monotonic() + 35.0
    started = time.monotonic()
    last_error = ""
    while time.monotonic() < deadline:
        if process.poll() is not None:
            _terminate(process)
            raise RuntimeError("llama-server exited while loading full-GPU Qwen3.5-4B GGUF")
        try:
            response = requests.get(f"{base}/health", timeout=1.0)
            if response.ok:
                self._process = process
                self._signature = (str(model.resolve()), str(mmproj.resolve()))
                self._port = port
                LOGGER.info(
                    "[H3 Studio - GGUF] Qwen3.5 server ready in %.2fs | full GPU | H3 transformer preserved",
                    time.monotonic() - started,
                )
                return base
            last_error = f"HTTP {response.status_code}"
        except Exception as error:
            last_error = str(error)
        time.sleep(0.20)
    _terminate(process)
    raise RuntimeError(f"Timed out starting full-GPU Qwen3.5 GGUF ({last_error or 'no health response'})")


def _adaptive_server_ensure(self) -> str:
    """Use one deterministic GPU server; never silently degrade to CPU."""

    from . import qwen35_gguf as gguf

    model = gguf.model_path()
    mmproj = gguf.mmproj_path()
    signature = (str(model.resolve()), str(mmproj.resolve())) if model.is_file() and mmproj.is_file() else None
    with self._lock:
        if signature and self.running() and self._signature == signature:
            return f"http://127.0.0.1:{self._port}"
        self.stop()
        try:
            return _start_full_gpu_server(self, extra_room=False)
        except Exception as first_error:
            LOGGER.warning("[H3 Studio - GGUF] Full-GPU startup needs more room; retrying targeted handoff | %s", first_error)
            self.stop()
            try:
                return _start_full_gpu_server(self, extra_room=True)
            except Exception as second_error:
                allow_cpu = str(os.environ.get("H3STUDIO_GGUF_ALLOW_CPU_FALLBACK", "")).strip().lower() in {
                    "1", "true", "yes", "on",
                }
                if not allow_cpu:
                    raise RuntimeError(
                        "Qwen3.5 GGUF could not start on GPU after targeted VAE/text-encoder handoff. "
                        "CPU fallback is disabled because it can make Director take minutes. "
                        "Set H3STUDIO_GGUF_ALLOW_CPU_FALLBACK=1 only if you explicitly want that behavior. "
                        f"Last error: {second_error}"
                    ) from second_error

                # Explicit escape hatch only; never the production default.
                import requests

                command = gguf._server_command()
                if not command:
                    raise RuntimeError("llama-server is not installed") from second_error
                port = gguf._free_port()
                args = [
                    *command,
                    "--model", str(model),
                    "--mmproj", str(mmproj),
                    "--host", "127.0.0.1",
                    "--port", str(port),
                    "--ctx-size", "4096",
                    "--n-gpu-layers", "0",
                    "--fit", "off",
                    "--parallel", "1",
                ]
                LOGGER.warning("[H3 Studio - GGUF] Explicit CPU fallback enabled by environment")
                process = subprocess.Popen(
                    args,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    stdin=subprocess.DEVNULL,
                    start_new_session=(os.name != "nt"),
                )
                base = f"http://127.0.0.1:{port}"
                deadline = time.monotonic() + 45.0
                while time.monotonic() < deadline:
                    if process.poll() is not None:
                        _terminate(process)
                        raise RuntimeError("CPU llama-server exited during startup") from first_error
                    with suppress(Exception):
                        response = requests.get(f"{base}/health", timeout=1.0)
                        if response.ok:
                            self._process = process
                            self._signature = signature
                            self._port = port
                            return base
                    time.sleep(0.20)
                _terminate(process)
                raise RuntimeError("Timed out starting explicit CPU Qwen fallback") from first_error


def install() -> None:
    from . import prompt_prep_hotfix_v2 as prep
    from . import qwen35_gguf as gguf
    from . import runtime_guards
    from .nodes.director import H3StudioDirector

    if bool(getattr(gguf, _MARKER, False)):
        return
    setattr(gguf, _MARKER, True)

    # The external GGUF helper gets a small targeted VRAM handoff of its own.
    # Never run the old 12 GiB global prompt-helper barrier for this backend.
    original_cache_probe = prep._cache_miss_requires_visual_model

    def cache_miss_requires_visual_model(clip, references, images, kwargs) -> bool:
        if _is_qwen35_gguf_name(kwargs.get("analyzer_name")):
            return False
        return original_cache_probe(clip, references, images, kwargs)

    prep._cache_miss_requires_visual_model = cache_miss_requires_visual_model
    gguf._prepare_vram = lambda: None
    gguf._Qwen35ServerManager.ensure = _adaptive_server_ensure

    # reference_integrity_fixes intentionally analyzes fresh refs one by one.
    # Keep one server alive across those isolated calls and the final writer.
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

    # Keep the current bundle visible only to this Director thread so the GGUF
    # startup can release the VAE/TE precisely. Stop Qwen once, right before H3.
    current_direct = H3StudioDirector.direct
    raw_direct = getattr(current_direct, "__func__", current_direct)
    if not bool(getattr(raw_direct, "__h3studio_gguf_one_pass_v2__", False)):
        def direct(cls, *args, **kwargs):
            previous_bundle = getattr(_ACTIVE, "bundle", None)
            _ACTIVE.bundle = kwargs.get("h3_bundle")
            try:
                return raw_direct(cls, *args, **kwargs)
            finally:
                if gguf._SERVER.running():
                    gguf.stop_server()
                    LOGGER.info("[H3 Studio - GGUF] Released one-pass Qwen3.5 server before H3 conditioning")
                _ACTIVE.bundle = previous_bundle

        direct.__h3studio_gguf_one_pass_v2__ = True
        H3StudioDirector.direct = classmethod(direct)


__all__ = [
    "_gguf_target_free_bytes",
    "_prepare_gpu_room",
    "install",
]
