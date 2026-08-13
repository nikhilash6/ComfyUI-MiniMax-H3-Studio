"""Lazy H3 model bundle loader.

Only one transformer is retained by the bundle at a time. Switching between
FL2VA and REF2VA releases the previous model before loading the other path.
"""

from __future__ import annotations

import contextlib
import hashlib
import logging
import os
import re
import shutil
import tempfile
import threading
import time
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import folder_paths
import nodes

from ..runtime_trace import emit as trace
from ..runtime_trace import model_source_fields, span
from ..vae_io import detect_vae_io

try:
    import comfy.model_management
except Exception:  # pragma: no cover - ComfyUI always provides this at runtime
    comfy = None

NONE_MODEL = "None"
AUTO_ANALYZER = "Auto · Qwen3-VL 4B"
AUTO_WRITER_4B = "Auto · Qwen3-VL 4B writer"
AUTO_WRITER_8B = "Auto · Qwen3-VL 8B writer"
DISABLED_ANALYZER = "Disabled"
SAME_AS_ANALYZER = "Same as image analyzer"
FAST_WRITER = "Fast deterministic - no second model"
DETERMINISTIC_WRITER = "Deterministic fallback only"
DISABLED_IMAGE_VAE = "Disabled - original H3 video VAE only"
OFFICIAL_H3_TEXT_ENCODER = "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"
LEGACY_H3_INT8_TEXT_ENCODER = "qwen3vl_32b_minimax_h3_int8_convrot.safetensors"
_WEIGHT_SUFFIXES = (".safetensors", ".gguf", ".ckpt", ".pt", ".pth", ".bin")
_H3_TOKENS = ("minimax", "h3", "fl2va", "ref2va")
LOGGER = logging.getLogger(__name__)
GIB = 1024**3
_LOCAL_CACHE_LOCK = threading.RLock()


def _normalize(name: str) -> str:
    return str(name or "").replace("\\", "/").strip()


def _compact(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", _normalize(name).lower())


def _is_h3(name: str) -> bool:
    compact = _compact(name)
    return "minimaxh3" in compact or ("h3" in compact and any(token in compact for token in ("fl2va", "ref2va")))


def _is_ref(name: str) -> bool:
    return "ref2va" in _compact(name) or "reference" in _compact(name)


def _is_fl(name: str) -> bool:
    compact = _compact(name)
    return "fl2va" in compact or ("h3" in compact and "ref2va" not in compact)


def _is_none(value: str | None) -> bool:
    return not value or str(value).strip().lower() in {"none", "null", "disabled", "off"}


def _filenames(*categories: str) -> list[str]:
    values: list[str] = []
    for category in categories:
        try:
            values.extend(folder_paths.get_filename_list(category))
        except Exception:
            continue
    return sorted(set(_normalize(value) for value in values if _normalize(value)), key=str.lower)


def _filtered(values: Iterable[str], predicate, fallback: str) -> list[str]:
    values = list(values)
    selected = [value for value in values if predicate(value)]
    return selected or (values if values else [fallback])


def fl2va_choices() -> list[str]:
    values = _filenames("diffusion_models", "unet")
    return [NONE_MODEL] + _filtered(
        values, lambda value: _is_h3(value) and _is_fl(value), "minimax_h3_fl2va.safetensors"
    )


def ref2va_choices() -> list[str]:
    values = _filenames("diffusion_models", "unet")
    return [NONE_MODEL] + _filtered(
        values, lambda value: _is_h3(value) and _is_ref(value), "minimax_h3_ref2va.safetensors"
    )


def _clip_preference(name: str) -> tuple[int, str]:
    compact = _compact(name)
    if "nvfp4awq" in compact:
        rank = 0
    elif "nvfp4" in compact:
        rank = 1
    elif "int8convrot" in compact:
        rank = 2
    else:
        rank = 3
    return rank, _normalize(name).lower()


def clip_choices() -> list[str]:
    values = _filenames("text_encoders", "clip")
    selected = _filtered(
        values,
        lambda value: "qwen3vl" in _compact(value) and ("minimax" in _compact(value) or "h3" in _compact(value)),
        OFFICIAL_H3_TEXT_ENCODER,
    )
    return sorted(selected, key=_clip_preference)


def _preferred_nvfp4_encoder() -> str | None:
    return next((value for value in clip_choices() if "nvfp4awq" in _compact(value)), None)


def _resolve_text_encoder(name: str) -> str:
    """Migrate only the exact historical Studio default when NVFP4 exists."""

    normalized = _normalize(name)
    if _compact(normalized) != _compact(LEGACY_H3_INT8_TEXT_ENCODER):
        return normalized
    preferred = _preferred_nvfp4_encoder()
    if preferred and _compact(preferred) != _compact(normalized):
        LOGGER.warning(
            "[H3 Studio] Migrating legacy H3 text encoder %s -> %s. "
            "The official ComfyUI H3 templates use the smaller NVFP4 AWQ encoder.",
            normalized,
            preferred,
        )
        return preferred
    return normalized


def analyzer_choices() -> list[str]:
    values = _filenames("text_encoders", "clip")
    selected = [
        value
        for value in values
        if "qwen3vl" in _compact(value) and "minimax" not in _compact(value) and "h3" not in _compact(value)
    ]
    return [AUTO_ANALYZER, DISABLED_ANALYZER, *selected]


def prompt_writer_choices() -> list[str]:
    """Offer shared, size-targeted, and explicit full Qwen writer checkpoints."""

    automatic = []
    if _preferred_writer("4b"):
        automatic.append(AUTO_WRITER_4B)
    if _preferred_writer("8b"):
        automatic.append(AUTO_WRITER_8B)
    return [SAME_AS_ANALYZER, *automatic, DETERMINISTIC_WRITER, *analyzer_choices()[2:]]


def _resolve_analyzer(name: str) -> str | None:
    if name == DISABLED_ANALYZER or _is_none(name):
        return None
    values = analyzer_choices()[2:]
    if name != AUTO_ANALYZER:
        return name
    preferred = next((value for value in values if "qwen3vl4bfp8scaled" in _compact(value)), None)
    return preferred or next((value for value in values if "qwen3vl4b" in _compact(value)), None)


def _preferred_writer(size: str) -> str | None:
    values = analyzer_choices()[2:]
    exact = next((value for value in values if f"qwen3vl{size}fp8scaled" in _compact(value)), None)
    return exact or next((value for value in values if f"qwen3vl{size}" in _compact(value)), None)


def _resolve_prompt_writer(name: str, analyzer_name: str | None) -> str | None:
    if name == SAME_AS_ANALYZER:
        return analyzer_name
    if name == AUTO_WRITER_4B:
        selected = _preferred_writer("4b")
        if not selected:
            raise ValueError("Auto 4B prompt writer was selected, but no full Qwen3-VL 4B checkpoint is installed.")
        return selected
    if name == AUTO_WRITER_8B:
        selected = _preferred_writer("8b")
        if not selected:
            raise ValueError("Auto 8B prompt writer was selected, but no full Qwen3-VL 8B checkpoint is installed.")
        return selected
    if name in {FAST_WRITER, DETERMINISTIC_WRITER, DISABLED_ANALYZER} or _is_none(name):
        return None
    return _normalize(name)


def vae_choices() -> list[str]:
    values = _filenames("vae")
    return _filtered(values, lambda value: "minimaxh3video" in _compact(value), "minimax_h3_video_vae_fp16.safetensors")


def image_vae_choices() -> list[str]:
    """Experimental T=1 image-specialized H3 decoders."""

    values = _filenames("vae")
    selected = [
        value
        for value in values
        if "minimaxh3" in _compact(value) and ("imagevae" in _compact(value) or "t1" in _compact(value))
    ]
    return [DISABLED_IMAGE_VAE, *selected]


def _registered_class(*names: str):
    mappings = getattr(nodes, "NODE_CLASS_MAPPINGS", {})
    for name in names:
        candidate = mappings.get(name)
        if candidate is not None:
            return candidate
    return None


def _load_unet(name: str):
    if _normalize(name).lower().endswith(".gguf"):
        loader_class = _registered_class("UnetLoaderGGUF", "UNETLoaderGGUF", "UnetLoaderGGUFAdvanced")
        if loader_class is None:
            raise ValueError("The selected GGUF transformer requires ComfyUI-GGUF.")
        loader = loader_class()
        for method_name in ("load_unet", "load_model", "load"):
            method = getattr(loader, method_name, None)
            if method:
                result = method(name)
                return result[0] if isinstance(result, tuple) else result
        raise ValueError("Installed ComfyUI-GGUF loader does not expose a compatible model-loading method.")
    result = nodes.UNETLoader().load_unet(name, "default")
    return result[0]


def _local_cache_target(source: Path) -> Path:
    stat = source.stat()
    identity = hashlib.sha256(
        f"{source.resolve()}|{stat.st_size}|{getattr(stat, 'st_mtime_ns', 0)}".encode()
    ).hexdigest()[:16]
    root = Path(os.environ.get("H3STUDIO_MODEL_CACHE", Path(tempfile.gettempdir()) / "h3studio-model-cache"))
    return root / f"{identity}-{source.name}"


def _stage_model_locally(source_path: str) -> str:
    """Create a bounded local-disk read-through copy of one large model."""

    source = Path(source_path).resolve()
    if str(os.environ.get("H3STUDIO_DISABLE_LOCAL_MODEL_CACHE", "0")).lower() in {"1", "true", "yes", "on"}:
        return str(source)
    try:
        target = _local_cache_target(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        source_device = getattr(source.stat(), "st_dev", None)
        target_device = getattr(target.parent.stat(), "st_dev", None)
        if source_device is not None and source_device == target_device:
            return str(source)
    except OSError:
        return str(source)

    with _LOCAL_CACHE_LOCK:
        partial = target.with_suffix(f"{target.suffix}.partial")
        try:
            size = source.stat().st_size
            if target.is_file() and target.stat().st_size == size:
                LOGGER.info("[H3 Studio Cache] local encoder ready | path=%s | size=%.2fGiB", target, size / GIB)
                return str(target)
            free = shutil.disk_usage(target.parent).free
            if free < size + GIB:
                LOGGER.warning(
                    "[H3 Studio Cache] skipped local encoder staging; need %.2fGiB, free %.2fGiB",
                    (size + GIB) / GIB,
                    free / GIB,
                )
                return str(source)
            started = time.monotonic()
            LOGGER.info("[H3 Studio Cache] staging encoder to local disk | %.2fGiB | %s", size / GIB, target)
            with source.open("rb", buffering=0) as reader, partial.open("wb", buffering=0) as writer:
                shutil.copyfileobj(reader, writer, length=16 * 1024 * 1024)
            os.replace(partial, target)
            elapsed = time.monotonic() - started
            LOGGER.info("[H3 Studio Cache] encoder staged | %.2fs | %.2fGiB", elapsed, size / GIB)
            return str(target)
        except OSError as error:
            with contextlib.suppress(OSError):
                partial.unlink()
            LOGGER.warning("[H3 Studio Cache] local staging unavailable (%s); using original model", error)
            return str(source)


def start_preferred_encoder_staging() -> None:
    """Use server startup time to populate the ephemeral encoder cache."""

    def worker():
        try:
            name = _preferred_nvfp4_encoder()
            if not name:
                return
            source = folder_paths.get_full_path("text_encoders", name) or folder_paths.get_full_path("clip", name)
            if source:
                _stage_model_locally(source)
        except Exception as error:
            LOGGER.debug("[H3 Studio Cache] background staging unavailable: %s", error)

    threading.Thread(target=worker, name="h3studio-encoder-cache", daemon=True).start()


def _resident_h3_text_encoder_policy(name: str) -> tuple[bool, str]:
    """Keep the 32B encoder non-dynamic only when it fits as one GPU stage."""

    try:
        manager = comfy.model_management
        device = manager.text_encoder_device()
        total_bytes = max(0, int(manager.get_total_memory(device)))
        minimum_bytes = max(GIB, int(manager.minimum_inference_memory()))
        path = folder_paths.get_full_path_or_raise("text_encoders", name)
        model_bytes = max(0, int(Path(path).stat().st_size))
    except Exception as error:
        return False, f"native-dynamic; budget unavailable ({type(error).__name__})"

    # File size is a reliable upper-bound proxy for the quantized H3 encoder's
    # resident weights (the official NVFP4 artifact and staged model are both
    # about 14.6 GiB). Keep an additional 1 GiB plus ComfyUI's own inference
    # reserve and 5% allocator headroom. This selects 20+ GiB GPUs such as L4,
    # while 16 GiB and smaller cards retain DynamicVRAM.
    required_bytes = model_bytes + minimum_bytes + GIB
    capacity_bytes = int(total_bytes * 0.95)
    resident = model_bytes > 0 and required_bytes <= capacity_bytes
    mode = "resident-direct" if resident else "native-dynamic"
    return (
        resident,
        f"{mode}; checkpoint={model_bytes / GIB:.2f}GiB; "
        f"required={required_bytes / GIB:.2f}GiB; gpu={total_bytes / GIB:.2f}GiB",
    )


def _load_clip(name: str):
    resident, policy = _resident_h3_text_encoder_policy(name)
    if resident:
        try:
            import comfy.sd

            source_path = folder_paths.get_full_path_or_raise("text_encoders", name)
            clip_path = _stage_model_locally(source_path)
            clip = comfy.sd.load_clip(
                ckpt_paths=[clip_path],
                embedding_directory=folder_paths.get_folder_paths("embeddings"),
                clip_type=comfy.sd.CLIPType.MINIMAX,
                # Construct the fitting quantized encoder on its execution
                # device.  ComfyUI's legacy non-dynamic CPU path otherwise
                # copies every module separately and synchronizes CUDA after
                # each module, turning one 14.6 GiB stage into hundreds of
                # serialized transfers on H3's 32B encoder.
                model_options={"initial_device": comfy.model_management.text_encoder_device()},
                disable_dynamic=True,
            )
            LOGGER.info("[H3 Studio] H3 text encoder policy=%s", policy)
            return clip
        except (AttributeError, TypeError) as error:
            LOGGER.warning(
                "[H3 Studio] Resident H3 text encoder unsupported by this ComfyUI (%s); using DynamicVRAM.",
                type(error).__name__,
            )

    LOGGER.info("[H3 Studio] H3 text encoder policy=%s", policy)
    source_path = folder_paths.get_full_path_or_raise("text_encoders", name)
    clip_path = _stage_model_locally(source_path)
    if clip_path != source_path:
        try:
            import comfy.sd

            return comfy.sd.load_clip(
                ckpt_paths=[clip_path],
                embedding_directory=folder_paths.get_folder_paths("embeddings"),
                clip_type=comfy.sd.CLIPType.MINIMAX,
                disable_dynamic=False,
            )
        except (AttributeError, TypeError):
            pass
    loader = nodes.CLIPLoader()
    try:
        return loader.load_clip(name, "minimax")[0]
    except TypeError:
        return loader.load_clip(name, type="minimax")[0]


class H3StudioTextEncoder:
    """Transparent, reloadable CLIP handle with an explicit stage lifetime.

    H3's encoder and transformer each fit an L4, but retaining both through
    CPU offload exhausts a 32 GiB host.  The handle preserves the public CLIP
    output while allowing the completed encoder instance to be discarded once
    its small conditioning result has entered the prompt cache.
    """

    def __init__(self, name: str, clip: Any = None):
        self.name = str(name)
        self._clip = clip
        self._lock = threading.RLock()

    @property
    def cache_identity(self) -> tuple[str, int]:
        return self.name, id(self)

    def materialize(self):
        with self._lock:
            if self._clip is None:
                LOGGER.info("[H3 Studio] Reloading text encoder stage=%s", self.name)
                self._clip = _load_clip(self.name)
            return self._clip

    def discard(self, transition: str = "text-encoder->transformer") -> bool:
        with self._lock:
            clip = self._clip
            self._clip = None
        if clip is None:
            return False
        from ..runtime_lifecycle import release_stage_model

        release_stage_model(clip, transition)
        return True

    def __getattr__(self, name: str):
        return getattr(self.materialize(), name)


def _load_analyzer_clip(name: str):
    loader = nodes.CLIPLoader()
    try:
        return loader.load_clip(name, "krea2")[0]
    except TypeError:
        return loader.load_clip(name, type="krea2")[0]


def _load_vae(name: str):
    return nodes.VAELoader().load_vae(name)[0]


@dataclass(slots=True)
class H3StudioBundle:
    fl2va_name: str
    ref2va_name: str
    clip_name: str
    video_vae_name: str
    image_vae_name: str | None
    analyzer_name: str | None
    prompt_writer_name: str | None
    clip: Any
    video_vae: Any
    analyzer_clip: Any = None
    prompt_writer_clip: Any = None
    image_vae: Any = None
    _model: Any = field(default=None, init=False, repr=False)
    _model_name: str = field(default="", init=False, repr=False)
    _model_kind: str = field(default="", init=False, repr=False)
    _lock: Any = field(default_factory=threading.RLock, init=False, repr=False)

    def selected_name(self, kind: str) -> str:
        preferred = self.ref2va_name if kind == "ref2va" else self.fl2va_name
        fallback = self.fl2va_name if kind == "ref2va" else self.ref2va_name
        if not _is_none(preferred):
            return preferred
        if not _is_none(fallback):
            return fallback
        raise ValueError("Select at least one H3 transformer in H3 Studio Loader.")

    def text_encoder_for_conditioning(self):
        materialize = getattr(self.clip, "materialize", None)
        return materialize() if callable(materialize) else self.clip

    def release_text_encoder(self) -> bool:
        discard = getattr(self.clip, "discard", None)
        return bool(discard()) if callable(discard) else False

    def analyzer_for_analysis(self):
        if not self.analyzer_name:
            return None
        with self._lock:
            if self.analyzer_clip is None:
                LOGGER.info("[H3 Studio] Loading visual analyzer=%s", self.analyzer_name)
                self.analyzer_clip = _load_analyzer_clip(self.analyzer_name)
            return self.analyzer_clip

    def writer_for_enhancement(self):
        if not self.prompt_writer_name:
            return None
        if _compact(self.prompt_writer_name) == _compact(self.analyzer_name or ""):
            LOGGER.info("[H3 Studio] Reusing visual analyzer for prompt writing=%s", self.prompt_writer_name)
            return self.analyzer_for_analysis()
        with self._lock:
            if self.prompt_writer_clip is None:
                LOGGER.info("[H3 Studio] Loading text-only prompt writer=%s", self.prompt_writer_name)
                self.prompt_writer_clip = _load_analyzer_clip(self.prompt_writer_name)
            return self.prompt_writer_clip

    def image_vae_for_decode(self):
        if not self.image_vae_name:
            raise ValueError(
                "Select Mamad8's experimental MiniMax H3 Image VAE in H3 Studio Loader, or use the normal 5-frame decoder."
            )
        with self._lock:
            if self.image_vae is None:
                LOGGER.info("[H3 Studio] Loading optional T=1 image VAE=%s", self.image_vae_name)
                self.image_vae = _load_vae(self.image_vae_name)
            return self.image_vae

    def model_for(self, kind: str):
        kind = "ref2va" if kind == "ref2va" else "fl2va"
        name = self.selected_name(kind)
        with self._lock:
            if self._model is not None and self._model_name == name:
                trace("transformer.route.hit", patcher=self._model, route=kind, model=name)
                return self._model
            self.release_model()
            LOGGER.info("[H3 Studio] Loading transformer route=%s model=%s", kind, name)
            with span(
                "transformer.construct",
                state=True,
                route=kind,
                **model_source_fields("diffusion_models", name, "transformer"),
            ) as result:
                self._model = _load_unet(name)
                result.update(patcher_id=id(self._model), model_id=id(getattr(self._model, "model", None)))
            self._model_name = name
            self._model_kind = kind
            return self._model

    def release_model(self) -> None:
        with self._lock:
            self._model = None
            self._model_name = ""
            self._model_kind = ""

    def summary(self) -> str:
        vae_io = detect_vae_io(self.video_vae)
        return (
            f"FL2VA={self.fl2va_name} | REF2VA={self.ref2va_name} | "
            f"CLIP={self.clip_name} | Video VAE={self.video_vae_name} | "
            f"Image VAE={self.image_vae_name or 'disabled'} | "
            f"Image analyzer={self.analyzer_name or 'disabled/missing'} | "
            f"Prompt writer={self.prompt_writer_name or 'disabled/missing'} | VAE I/O={vae_io.label}"
        )


class H3StudioLoader:
    CATEGORY = "H3 Studio"
    FUNCTION = "load"
    RETURN_TYPES = ("H3_STUDIO_BUNDLE", "CLIP", "VAE", "STRING")
    RETURN_NAMES = ("h3_bundle", "clip", "video_vae", "model_info")
    DESCRIPTION = (
        "Load H3's conditioning encoder and VAE, plus optional full Qwen3-VL models for cached pixel analysis and "
        "generative prompt direction. Same as image analyzer reuses one model; mixed 4B/8B choices load two. "
        "NVFP4 AWQ is preferred for H3's native 32B conditioning encoder."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "fl2va_model": (
                    fl2va_choices(),
                    {"default": next((v for v in fl2va_choices() if v != NONE_MODEL), NONE_MODEL)},
                ),
                "ref2va_model": (
                    ref2va_choices(),
                    {"default": next((v for v in ref2va_choices() if v != NONE_MODEL), NONE_MODEL)},
                ),
                "text_encoder": (
                    clip_choices(),
                    {
                        "default": clip_choices()[0],
                        "tooltip": (
                            "NVFP4 AWQ is the official ComfyUI H3 template choice. INT8 ConvRot remains selectable "
                            "but can stream very slowly when its staged representation exceeds available memory."
                        ),
                    },
                ),
                "video_vae": (vae_choices(),),
                "image_vae": (
                    image_vae_choices(),
                    {
                        "default": DISABLED_IMAGE_VAE,
                        "tooltip": "Optional Mamad8 T=1 image decoder. Experimental and image-only; never replaces the normal H3 video VAE.",
                    },
                ),
                "image_analyzer": (analyzer_choices(), {"default": AUTO_ANALYZER}),
                "prompt_writer": (
                    prompt_writer_choices(),
                    {
                        "default": SAME_AS_ANALYZER,
                        "tooltip": (
                            "Same as image analyzer is fastest and reuses one loaded checkpoint. Auto 4B/8B or an "
                            "explicit file permits mixed models but must stage the second checkpoint."
                        ),
                    },
                ),
            }
        }

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return "|".join(
            str(kwargs.get(key, ""))
            for key in (
                "fl2va_model",
                "ref2va_model",
                "text_encoder",
                "video_vae",
                "image_vae",
                "image_analyzer",
                "prompt_writer",
            )
        )

    @staticmethod
    def load(
        fl2va_model: str,
        ref2va_model: str,
        text_encoder: str,
        video_vae: str,
        image_vae: str = DISABLED_IMAGE_VAE,
        image_analyzer: str = AUTO_ANALYZER,
        prompt_writer: str = SAME_AS_ANALYZER,
    ):
        if _is_none(fl2va_model) and _is_none(ref2va_model):
            raise ValueError("Select at least one MiniMax H3 transformer: FL2VA or REF2VA.")
        resolved_text_encoder = _resolve_text_encoder(text_encoder)
        if "int8convrot" in _compact(resolved_text_encoder):
            LOGGER.warning(
                "[H3 Studio] H3 text encoder %s uses the large INT8 ConvRot path; prefer %s on an L4 when installed.",
                resolved_text_encoder,
                _preferred_nvfp4_encoder() or OFFICIAL_H3_TEXT_ENCODER,
            )
        trace(
            "loader.begin",
            state=True,
            **model_source_fields("text_encoders", resolved_text_encoder, "text_encoder"),
            **model_source_fields("vae", video_vae, "video_vae"),
            **model_source_fields("diffusion_models", fl2va_model, "fl2va"),
            **model_source_fields("diffusion_models", ref2va_model, "ref2va"),
        )
        with span("loader.text_encoder.construct", state=True, model=resolved_text_encoder) as result:
            loaded_clip = _load_clip(resolved_text_encoder)
            clip = H3StudioTextEncoder(resolved_text_encoder, loaded_clip)
            result.update(patcher_id=id(getattr(loaded_clip, "patcher", loaded_clip)))
        with span("loader.video_vae.construct", state=True, model=video_vae) as result:
            vae = _load_vae(video_vae)
            result.update(patcher_id=id(getattr(vae, "patcher", vae)))
        analyzer_name = _resolve_analyzer(image_analyzer)
        prompt_writer_name = _resolve_prompt_writer(prompt_writer, analyzer_name)
        bundle = H3StudioBundle(
            fl2va_name=fl2va_model,
            ref2va_name=ref2va_model,
            clip_name=resolved_text_encoder,
            video_vae_name=video_vae,
            image_vae_name=None if image_vae == DISABLED_IMAGE_VAE or _is_none(image_vae) else image_vae,
            analyzer_name=analyzer_name,
            prompt_writer_name=prompt_writer_name,
            clip=clip,
            video_vae=vae,
        )
        trace(
            "loader.end",
            state=True,
            bundle_id=id(bundle),
            clip_patcher_id=id(getattr(clip, "patcher", clip)),
            vae_patcher_id=id(getattr(vae, "patcher", vae)),
        )
        vae_io = detect_vae_io(vae)
        if vae_io.chunked:
            LOGGER.info("[H3 Studio] %s", vae_io.detail)
        else:
            LOGGER.warning("[H3 Studio] %s", vae_io.detail)
        LOGGER.info("\n[H3 Studio] Model bundle\n  %s", bundle.summary())
        return bundle, clip, vae, bundle.summary()
