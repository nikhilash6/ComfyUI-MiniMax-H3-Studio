"""Stage-boundary residency handoffs for constrained H3 systems.

ComfyUI remains the only model loader and residency manager. H3 Studio may use
ComfyUI's public targeted-unload helper only after a stage is complete. It does
not flush global caches, evict AIMDO pins, or mutate DynamicVRAM internals.
"""

from __future__ import annotations

import logging
from contextlib import contextmanager, suppress
from typing import Any

LOGGER = logging.getLogger(__name__)
GIB = 1024**3


def model_patcher(value: Any) -> Any | None:
    """Return a ComfyUI ModelPatcher from a MODEL, CLIP or VAE value."""

    if value is None:
        return None
    patcher = getattr(value, "patcher", None)
    if patcher is not None:
        return patcher
    if hasattr(value, "clone_base_uuid") and hasattr(value, "model"):
        return value
    return None


def release_stage_model(value: Any, transition: str) -> bool:
    """Release one completed stage without disturbing unrelated models."""

    patcher = model_patcher(value)
    if patcher is None:
        return False
    with suppress(Exception):
        from .runtime_trace import emit

        emit("residency.release.begin", state=True, patcher=patcher, transition=transition)
    try:
        import comfy.model_management as manager

        manager.unload_model_and_clones(
            patcher,
            unload_additional_models=False,
            all_devices=False,
        )
    except Exception as error:
        # Compatibility first: older ComfyUI builds may not expose the targeted
        # helper.  Falling back to normal manager behavior is safer than a
        # global unload or touching DynamicVRAM's private pin/VBAR state.
        LOGGER.debug("H3 Studio stage release unavailable for %s: %s", transition, error)
        return False

    with suppress(Exception):
        from .runtime_trace import emit

        emit("residency.release.end", state=True, patcher=patcher, transition=transition)
    return True


def _callable_int(value: Any, name: str) -> int:
    probe = getattr(value, name, None)
    if not callable(probe):
        return 0
    with suppress(Exception):
        return max(0, int(probe()))
    return 0


@contextmanager
def full_text_encoder_when_safe(clip: Any, tokens: Any):
    """Use one native full load when this encoder fits the current GPU.

    DynamicVRAM is still the fallback for genuinely constrained cards.  The
    override changes only the one CLIP.load_model call made by the current
    encode, avoiding both eager prewarming and a second manager load.
    """

    patcher = model_patcher(clip)
    original_load = getattr(clip, "load_model", None)
    if patcher is None or not callable(original_load):
        yield "native-dynamic"
        return

    is_dynamic = getattr(patcher, "is_dynamic", None)
    with suppress(Exception):
        if callable(is_dynamic) and is_dynamic():
            # Current ComfyUI's ModelPatcherDynamic intentionally ignores
            # force_full_load and keeps VBAR streaming active. Do not report a
            # false full-residency policy; fitting H3 encoders are constructed
            # as non-dynamic patchers by the Loader instead.
            yield "native-dynamic; reason=dynamic-patcher"
            return

    try:
        import comfy.model_management as manager

        device = patcher.load_device
        model_bytes = _callable_int(patcher, "model_size") or int(getattr(patcher, "size", 0) or 0)
        loaded_bytes = _callable_int(patcher, "loaded_size")
        activation_bytes = 0
        estimator = getattr(getattr(clip, "cond_stage_model", None), "memory_estimation_function", None)
        if callable(estimator):
            with suppress(Exception):
                activation_bytes = max(0, int(estimator(tokens, device=device)))
        available_bytes = max(0, int(manager.get_free_memory(device))) + loaded_bytes
        reserve_bytes = max(GIB, int(manager.minimum_inference_memory()))
        required_bytes = model_bytes + activation_bytes + reserve_bytes
    except Exception:
        yield "native-dynamic"
        return

    # Unknown-size patchers and cards that cannot hold the complete encoder use
    # ComfyUI's normal dynamic policy.  Keep 5% headroom for allocator variance.
    if model_bytes <= 0 or required_bytes > int(available_bytes * 0.95):
        yield (
            f"native-dynamic; model={model_bytes / GIB:.2f}GiB; "
            f"activation={activation_bytes / GIB:.2f}GiB; available={available_bytes / GIB:.2f}GiB"
        )
        return

    had_override = "load_model" in getattr(clip, "__dict__", {})
    previous_override = getattr(clip, "__dict__", {}).get("load_model") if had_override else None

    def load_full_once(load_tokens=None):
        selected_tokens = tokens if load_tokens is None else load_tokens
        memory_used = activation_bytes
        if callable(estimator):
            with suppress(Exception):
                memory_used = max(0, int(estimator(selected_tokens, device=device)))
        manager.load_models_gpu(
            [patcher],
            memory_required=memory_used,
            force_full_load=True,
        )
        return patcher

    clip.load_model = load_full_once
    try:
        yield (
            f"native-full-once; model={model_bytes / GIB:.2f}GiB; "
            f"activation={activation_bytes / GIB:.2f}GiB; available={available_bytes / GIB:.2f}GiB"
        )
    finally:
        if had_override:
            clip.load_model = previous_override
        else:
            with suppress(AttributeError):
                delattr(clip, "load_model")


__all__ = [
    "full_text_encoder_when_safe",
    "model_patcher",
    "release_stage_model",
]
