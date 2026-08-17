"""Optional MiniMax H3 tiny-decoder live previews.

The implementation uses ComfyUI's public sampler-wrapper and websocket APIs.
It targets Kijai's Apache-2.0 ``taeh3.safetensors`` decoder checkpoint while
remaining independent of KJNodes.
"""

from __future__ import annotations

import base64
import io
import logging
import math
import queue
import threading
import time
import weakref
from collections import OrderedDict
from contextlib import suppress
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

LOGGER = logging.getLogger(__name__)
WRAPPER_KEY = "h3studio_taeh3_preview"
DEFAULT_TAEH3 = "taeh3.safetensors"
_PATCHER_CACHE_LIMIT = 8
_PATCHER_CACHE_LOCK = threading.RLock()
_PATCHER_CACHE = OrderedDict()
_PREVIEW_DRAIN_TIMEOUT_SECONDS = 8.0


def _conv(torch, channels_in: int, channels_out: int, *, bias: bool = True):
    return torch.nn.Conv2d(channels_in, channels_out, 3, padding=1, bias=bias)


def _block(torch, channels_in: int, channels_out: int, *, use_midblock_gn: bool = False):
    class Block(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.conv = torch.nn.Sequential(
                _conv(torch, channels_in, channels_out),
                torch.nn.ReLU(inplace=True),
                _conv(torch, channels_out, channels_out),
                torch.nn.ReLU(inplace=True),
                _conv(torch, channels_out, channels_out),
            )
            self.skip = (
                torch.nn.Conv2d(channels_in, channels_out, 1, bias=False)
                if channels_in != channels_out
                else torch.nn.Identity()
            )
            expanded = channels_in * 4
            self.pool = (
                torch.nn.Sequential(
                    torch.nn.Conv2d(channels_in, expanded, 1, bias=False),
                    torch.nn.GroupNorm(4, expanded),
                    torch.nn.ReLU(inplace=True),
                    torch.nn.Conv2d(expanded, channels_in, 1, bias=False),
                )
                if use_midblock_gn
                else None
            )

        def forward(self, value):
            if self.pool is not None:
                value = value + self.pool(value)
            return torch.nn.functional.relu(self.conv(value) + self.skip(value))

    return Block()


def _decoder(torch, state):
    class Clamp(torch.nn.Module):
        def forward(self, value):
            return torch.tanh(value / 3) * 3

    def block(index: int, channels_in: int, channels_out: int):
        use_midblock_gn = any(str(key).startswith(f"{index}.pool.") for key in state)
        return _block(torch, channels_in, channels_out, use_midblock_gn=use_midblock_gn)

    return torch.nn.Sequential(
        Clamp(),
        _conv(torch, 24, 96),
        torch.nn.ReLU(inplace=True),
        block(3, 96, 96),
        block(4, 96, 96),
        block(5, 96, 96),
        torch.nn.Upsample(scale_factor=2),
        _conv(torch, 96, 96, bias=False),
        block(8, 96, 96),
        block(9, 96, 96),
        block(10, 96, 96),
        torch.nn.Upsample(scale_factor=2),
        _conv(torch, 96, 96, bias=False),
        block(13, 96, 64),
        block(14, 64, 64),
        block(15, 64, 64),
        torch.nn.Upsample(scale_factor=2),
        _conv(torch, 64, 64, bias=False),
        block(18, 64, 64),
        block(19, 64, 64),
        torch.nn.Upsample(scale_factor=2),
        _conv(torch, 64, 64, bias=False),
        block(22, 64, 64),
        _conv(torch, 64, 3),
    )


def _vae_approx_roots(folder_paths) -> list[Path]:
    """Return the model roots ComfyUI currently considers valid for ``vae_approx``."""

    roots: list[Path] = []
    try:
        roots.extend(Path(path) for path in folder_paths.get_folder_paths("vae_approx"))
    except Exception:
        try:
            paths, _extensions = folder_paths.folder_names_and_paths.get("vae_approx", ([], set()))
            roots.extend(Path(path) for path in paths)
        except Exception:
            pass

    models_dir = getattr(folder_paths, "models_dir", None)
    if models_dir:
        roots.append(Path(models_dir) / "vae_approx")

    unique: list[Path] = []
    seen: set[str] = set()
    for root in roots:
        key = str(root.expanduser().absolute()).casefold()
        if key in seen:
            continue
        seen.add(key)
        unique.append(root)
    return unique


def _resolve_tiny_vae(folder_paths, tiny_vae: str) -> str | None:
    """Resolve a tiny VAE even when ComfyUI's filename cache/path lookup is stale.

    The normal ComfyUI resolver remains authoritative. If that lookup misses, scan only
    registered ``vae_approx`` roots (plus the active ``models_dir`` fallback) for the
    requested relative path or a case-insensitive filename match. This avoids searching
    arbitrary user directories while recovering from stale caches, alternate model roots,
    accidental subfolders, and Windows filename casing differences.
    """

    try:
        direct = folder_paths.get_full_path("vae_approx", tiny_vae)
    except Exception:
        direct = None
    if direct:
        return str(direct)

    requested = Path(str(tiny_vae))
    requested_name = requested.name.casefold()
    roots = _vae_approx_roots(folder_paths)

    for root in roots:
        candidate = root / requested
        try:
            if candidate.is_file():
                return str(candidate)
        except OSError:
            continue

    for root in roots:
        try:
            if not root.is_dir():
                continue
            for candidate in root.rglob("*"):
                if candidate.name.casefold() == requested_name and candidate.is_file():
                    return str(candidate)
        except OSError:
            continue
    return None


def _vae_choices() -> list[str]:
    import folder_paths

    try:
        choices = list(folder_paths.get_filename_list("vae_approx"))
    except Exception:
        choices = []
    if DEFAULT_TAEH3 not in choices:
        choices.insert(0, DEFAULT_TAEH3)
    return choices


def _resolve_packed_latent(torch, value, latent_shapes):
    """Restore the first H3 latent from either supported Comfy packed layout."""

    if getattr(value, "ndim", 0) != 3 or not latent_shapes:
        return value
    shape = tuple(int(part) for part in latent_shapes[0])

    # Older/channel-packed layouts keep the target channel axis and append
    # following packed data on the final dimension. Slice every channel first
    # so data from the next packed latent cannot leak into the H3 frame.
    if value.shape[1] == shape[1]:
        required_per_channel = math.prod(shape[2:])
        if value.shape[2] < required_per_channel:
            raise ValueError(f"Packed latent shape {tuple(value.shape)} cannot restore H3 shape {shape}.")
        return value[:, :, :required_per_channel].reshape((value.shape[0], *shape[1:]))

    # Current Comfy multi-latent sampling flattens nested latents into
    # [batch, 1, total_values]. H3 video is first, followed by audio.
    required = math.prod(shape[1:])
    flat = value.reshape((value.shape[0], -1))
    if flat.shape[1] < required:
        raise ValueError(f"Packed latent shape {tuple(value.shape)} cannot restore H3 shape {shape}.")
    return flat[:, :required].reshape((value.shape[0], *shape[1:]))


def _first_h3_latent(torch, value, latent_shapes):
    value = _resolve_packed_latent(torch, value, latent_shapes)
    if value.ndim == 5:
        return value[:, :, 0]
    if value.ndim == 4:
        return value
    raise ValueError(f"Expected a four- or five-dimensional H3 latent, got shape {tuple(value.shape)}.")


def _limit_latent(torch, value, max_resolution: int):
    output_height, output_width = value.shape[-2] * 16, value.shape[-1] * 16
    longest = max(output_height, output_width)
    if longest <= max_resolution:
        return value
    scale = max_resolution / longest
    latent_height = max(1, round(value.shape[-2] * scale))
    latent_width = max(1, round(value.shape[-1] * scale))
    return torch.nn.functional.interpolate(
        value, size=(latent_height, latent_width), mode="bilinear", align_corners=False
    )


def _jpeg_data_url(torch, image, quality: int) -> tuple[str, int, int]:
    from PIL import Image

    pixels = image[0].detach().float().clamp(0, 1).mul(255).byte().permute(1, 2, 0).cpu().numpy()
    pil_image = Image.fromarray(pixels, mode="RGB")
    buffer = io.BytesIO()
    pil_image.save(buffer, format="JPEG", quality=quality, subsampling=0, optimize=False)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}", pil_image.width, pil_image.height


@dataclass(frozen=True)
class _PreviewJob:
    latent: Any
    step: int
    total_steps: int
    run_id: str
    elapsed_seconds: float
    average_step_seconds: float


@dataclass
class _PreviewWrapper:
    checkpoint_path: str
    node_id: str
    max_resolution: int
    jpeg_quality: int
    every: int
    decoder: Any = None
    run_serial: int = 0
    first_frame_reported: bool = False
    active_run_id: str = ""
    _jobs: Any = field(default=None, init=False, repr=False)
    _worker: Any = field(default=None, init=False, repr=False)
    _worker_lock: Any = field(default_factory=threading.RLock, init=False, repr=False)
    _idle: Any = field(default_factory=threading.Event, init=False, repr=False)

    def __post_init__(self):
        self._idle.set()

    def settings_key(self) -> tuple[Any, ...]:
        return self.checkpoint_path, self.max_resolution, self.jpeg_quality, self.every

    def _load(self, torch):
        if self.decoder is None:
            import comfy.utils

            state = comfy.utils.load_torch_file(self.checkpoint_path, safe_load=True)
            decoder = _decoder(torch, state)
            decoder.load_state_dict(state, strict=True)
            self.decoder = decoder.eval().to(device="cpu", dtype=torch.float32)
        return self.decoder

    def _send(self, job: _PreviewJob):
        if job.run_id != self.active_run_id:
            return
        import torch

        started = time.perf_counter()
        latent = _limit_latent(torch, job.latent, self.max_resolution)
        decoder = self._load(torch)
        with torch.inference_mode():
            image = decoder(latent).clamp(0, 1)
        if job.run_id != self.active_run_id:
            return
        data_url, width, height = _jpeg_data_url(torch, image, self.jpeg_quality)
        from server import PromptServer

        server = PromptServer.instance
        server.send_sync(
            "h3studio-preview",
            {
                "node_id": self.node_id,
                "image": data_url,
                "step": job.step + 1,
                "total": job.total_steps,
                "width": width,
                "height": height,
                "run_id": job.run_id,
                "elapsed_seconds": job.elapsed_seconds,
                "average_step_seconds": job.average_step_seconds,
                "eta_seconds": max(0.0, job.average_step_seconds * (job.total_steps - job.step - 1)),
            },
            server.client_id,
        )
        if not self.first_frame_reported:
            self.first_frame_reported = True
            LOGGER.info(
                "[H3 Studio] TAEH3 live preview active | first frame %dx%d | cpu %.3fs",
                width,
                height,
                time.perf_counter() - started,
            )

    def _worker_main(self):
        while True:
            job = self._jobs.get()
            try:
                if job is None:
                    return
                self._idle.clear()
                self._send(job)
            except Exception as error:
                LOGGER.warning("H3 Studio TAEH3 CPU preview skipped a frame: %s", error)
                if isinstance(job, _PreviewJob):
                    self._report_error(error, job.run_id)
            finally:
                self._idle.set()
                self._jobs.task_done()

    def _ensure_worker(self):
        with self._worker_lock:
            if self._worker is not None and self._worker.is_alive():
                return
            self._jobs = queue.Queue(maxsize=1)
            self._worker = threading.Thread(
                target=self._worker_main,
                name=f"H3StudioTAEH3-{self.node_id or 'preview'}",
                daemon=True,
            )
            self._worker.start()

    def _discard_pending(self):
        if self._jobs is None:
            return
        while True:
            try:
                self._jobs.get_nowait()
            except queue.Empty:
                return
            else:
                self._jobs.task_done()

    def _enqueue(self, job: _PreviewJob):
        self._ensure_worker()
        try:
            self._jobs.put_nowait(job)
        except queue.Full:
            self._discard_pending()
            try:
                self._jobs.put_nowait(job)
            except queue.Full:
                LOGGER.debug("H3 Studio TAEH3 dropped a stale preview frame")

    def stop(self):
        if self._jobs is None:
            return
        self._discard_pending()
        with suppress(queue.Full):
            self._jobs.put_nowait(None)

    def _finish_run(self, run_id: str) -> None:
        if self.active_run_id == run_id:
            self.active_run_id = ""
        self._discard_pending()
        if not self._idle.wait(timeout=_PREVIEW_DRAIN_TIMEOUT_SECONDS):
            LOGGER.warning(
                "H3 Studio TAEH3 preview did not stop within %.1fs; final decode will continue.",
                _PREVIEW_DRAIN_TIMEOUT_SECONDS,
            )

    def _report_error(self, message: str, run_id: str) -> None:
        try:
            from server import PromptServer

            server = PromptServer.instance
            server.send_sync(
                "h3studio-preview",
                {"node_id": self.node_id, "run_id": run_id, "error": str(message)[:500]},
                server.client_id,
            )
        except Exception:
            pass

    def _reset_frontend(self, total_steps: int, run_id: str):
        from server import PromptServer

        server = PromptServer.instance
        server.send_sync(
            "h3studio-preview",
            {"node_id": self.node_id, "run_id": run_id, "total": int(total_steps), "reset": True},
            server.client_id,
        )

    def __call__(
        self,
        executor,
        noise,
        latent_image,
        sampler,
        sigmas,
        denoise_mask,
        callback,
        disable_pbar,
        seed,
        latent_shapes,
    ):
        import torch

        from ..runtime_trace import emit as trace

        self.run_serial += 1
        self.first_frame_reported = False
        run_id = f"{self.node_id}:{self.run_serial}"
        self.active_run_id = run_id
        self._discard_pending()
        total_steps = max(0, len(sigmas) - 1) if sigmas is not None and hasattr(sigmas, "__len__") else 0
        sampling_started = time.perf_counter()
        trace_started = time.monotonic()
        LOGGER.info(
            "[H3 Studio] TAEH3 sampler wrapper entered | node=%s | steps=%d | latent_shapes=%s | decoder=cpu",
            self.node_id,
            total_steps,
            latent_shapes,
        )
        trace(
            "sampling.begin",
            state=True,
            seed=seed,
            steps=total_steps,
            preview="cpu",
            preview_node=self.node_id,
        )
        try:
            self._reset_frontend(total_steps, run_id)
        except Exception as error:
            LOGGER.debug("H3 Studio preview reset event skipped: %s", error)

        def preview_callback(step, x0, x, total_steps):
            # The final image is about to enter the full VAE, so a tiny preview
            # for the last denoising step only creates CPU/RAM overlap.
            if int(step) % self.every == 0 and int(step) + 1 < int(total_steps):
                try:
                    elapsed_seconds = time.perf_counter() - sampling_started
                    completed_steps = max(1, int(step) + 1)
                    latent = _first_h3_latent(torch, x0, latent_shapes)
                    snapshot = latent.detach().to(device="cpu", dtype=torch.float32, copy=True)
                    self._enqueue(
                        _PreviewJob(
                            latent=snapshot,
                            step=int(step),
                            total_steps=int(total_steps),
                            run_id=run_id,
                            elapsed_seconds=elapsed_seconds,
                            average_step_seconds=elapsed_seconds / completed_steps,
                        )
                    )
                except Exception as error:
                    LOGGER.warning("H3 Studio TAEH3 preview snapshot skipped: %s", error)
                    self._report_error(error, run_id)
            if callback is not None:
                callback(step, x0, x, total_steps)

        try:
            result = executor(
                noise,
                latent_image,
                sampler,
                sigmas,
                denoise_mask,
                preview_callback,
                disable_pbar,
                seed,
                latent_shapes=latent_shapes,
            )
        except Exception as error:
            trace(
                "sampling.error",
                state=True,
                seed=seed,
                steps=total_steps,
                elapsed_s=time.monotonic() - trace_started,
                error_type=type(error).__name__,
                error=str(error),
            )
            raise
        finally:
            self._finish_run(run_id)
        trace(
            "sampling.end",
            state=True,
            seed=seed,
            steps=total_steps,
            elapsed_s=time.monotonic() - trace_started,
        )
        return result


class H3StudioTAEH3Preview:
    """Attach fast approximate H3 live previews to a model clone."""

    CATEGORY = "H3 Studio/Preview"
    FUNCTION = "attach"
    RETURN_TYPES = ("MODEL",)
    RETURN_NAMES = ("model",)
    DESCRIPTION = (
        "CPU-only approximate previews on a stable sampler clone. Final output still uses the full H3 VAE. "
        "If the optional TAEH3 checkpoint cannot be found, preview is skipped and generation continues."
    )
    EXPERIMENTAL = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "enabled": ("BOOLEAN", {"default": False}),
                "tiny_vae": (_vae_choices(), {"default": DEFAULT_TAEH3}),
                "max_resolution": ("INT", {"default": 768, "min": 256, "max": 1024, "step": 64}),
                "jpeg_quality": ("INT", {"default": 90, "min": 40, "max": 95, "step": 1}),
                "preview_every_n_steps": ("INT", {"default": 1, "min": 1, "max": 20, "step": 1}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    @staticmethod
    def attach(model, enabled, tiny_vae, max_resolution, jpeg_quality, preview_every_n_steps, unique_id=None):
        if not enabled:
            return (model,)

        import folder_paths

        checkpoint_path = _resolve_tiny_vae(folder_paths, tiny_vae)
        if not checkpoint_path:
            roots = [str(path) for path in _vae_approx_roots(folder_paths)]
            LOGGER.warning(
                "[H3 Studio] TAEH3 preview disabled: '%s' was not found in vae_approx roots %s. "
                "Generation will continue without live previews.",
                tiny_vae,
                roots or ["<none registered>"],
            )
            try:
                from ..runtime_trace import emit as trace

                trace(
                    "preview.skip",
                    node=str(unique_id or ""),
                    reason="checkpoint_missing",
                    checkpoint=tiny_vae,
                    roots=roots,
                )
            except Exception:
                pass
            return (model,)

        import comfy.patcher_extension

        node_id = str(unique_id or "")
        cache_key = (id(model), node_id)
        settings = (checkpoint_path, int(max_resolution), int(jpeg_quality), max(1, int(preview_every_n_steps)))
        with _PATCHER_CACHE_LOCK:
            entry = _PATCHER_CACHE.get(cache_key)
            if entry is not None and entry[0]() is model:
                patched, wrapper = entry[1], entry[2]
                identity = "reused"
                _PATCHER_CACHE.move_to_end(cache_key)
            else:
                patched = model.clone()
                wrapper = _PreviewWrapper(
                    checkpoint_path=checkpoint_path,
                    node_id=node_id,
                    max_resolution=settings[1],
                    jpeg_quality=settings[2],
                    every=settings[3],
                )
                try:
                    upstream_ref = weakref.ref(model)
                except TypeError:
                    def upstream_ref():
                        return model
                _PATCHER_CACHE[cache_key] = (upstream_ref, patched, wrapper)
                identity = "new"
                while len(_PATCHER_CACHE) > _PATCHER_CACHE_LIMIT:
                    _old_key, old_entry = _PATCHER_CACHE.popitem(last=False)
                    old_entry[2].stop()

            if wrapper.settings_key() != settings:
                wrapper.stop()
                wrapper = _PreviewWrapper(
                    checkpoint_path=checkpoint_path,
                    node_id=node_id,
                    max_resolution=settings[1],
                    jpeg_quality=settings[2],
                    every=settings[3],
                )
                _PATCHER_CACHE[cache_key] = (_PATCHER_CACHE[cache_key][0], patched, wrapper)

        patched.remove_wrappers_with_key(comfy.patcher_extension.WrappersMP.OUTER_SAMPLE, WRAPPER_KEY)
        patched.add_wrapper_with_key(
            comfy.patcher_extension.WrappersMP.OUTER_SAMPLE,
            WRAPPER_KEY,
            wrapper,
        )
        LOGGER.info(
            "[H3 Studio] TAEH3 wrapper attached | node=%s | patcher=%s | decoder=%s@cpu | path=%s | max=%d | every=%d",
            node_id,
            identity,
            tiny_vae,
            checkpoint_path,
            int(max_resolution),
            max(1, int(preview_every_n_steps)),
        )
        from ..runtime_trace import emit as trace

        trace(
            "preview.attach",
            patcher=patched,
            node=node_id,
            identity=identity,
            upstream_patcher_id=id(model),
            preview_patcher_id=id(patched),
            decoder="cpu",
            checkpoint_path=checkpoint_path,
        )
        return (patched,)
