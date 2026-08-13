"""Stage-boundary residency handoffs for constrained H3 systems.

ComfyUI remains the only model loader and residency manager. H3 Studio invokes
its cache, AIMDO-pin, and targeted-unload helpers only at completed H3 stage
boundaries. This is intentionally not a global cache flush and never mutates
DynamicVRAM internals.
"""

from __future__ import annotations

import logging
import time
from contextlib import contextmanager, suppress
from typing import Any

LOGGER = logging.getLogger(__name__)
GIB = 1024**3
PIN_EVICTION_HYSTERESIS = 512 * 1024**2


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


def ensure_stage_ram_headroom(
    transition: str,
    target_gib: float,
    *,
    evict_active_pins: bool = False,
) -> int:
    """Ask ComfyUI to reclaim inactive AIMDO pins before a heavy H3 stage.

    ComfyUI normally checks RAM pressure only after a node completes and while
    each new HostBuffer allocation is already in progress. H3 Studio's
    conditioning node runs the 32B encoder and selects the transformer inside
    one node, so a repeat prompt can otherwise begin with the previous
    transformer and VAE still resident. Reclaim through ComfyUI's own cache and
    pin managers; never mutate HostBuffers/VBARs or globally unload models.
    """

    try:
        import comfy.memory_management as memory
        import comfy.model_management as manager
        import psutil
    except Exception:
        return 0

    try:
        snapshot = psutil.virtual_memory()
        total_bytes = max(0, int(snapshot.total))
        available_before = max(0, int(snapshot.available))
        # A fixed 14 GiB target is appropriate for the measured 32 GiB L4, but
        # smaller hosts must retain most of their RAM for Python and live
        # tensors. The 45% cap makes this policy degrade conservatively there.
        configured_headroom = max(0, int(getattr(memory, "RAM_CACHE_HEADROOM", 0)))
        target_bytes = min(
            max(configured_headroom, max(0, int(float(target_gib) * GIB))),
            int(total_bytes * 0.45),
        )
    except Exception:
        return 0

    if target_bytes <= 0 or available_before >= target_bytes:
        return 0

    with suppress(Exception):
        from .runtime_trace import emit

        emit(
            "ram_handoff.begin",
            state=True,
            transition=transition,
            target_gib=target_bytes / GIB,
            available_before_gib=available_before / GIB,
            evict_active_pins=evict_active_pins,
        )

    cache_freed = 0
    release_cache = getattr(memory, "extra_ram_release", None)
    if callable(release_cache):
        with suppress(Exception):
            cache_freed = max(0, int(release_cache(target_bytes, free_active=False) or 0))

    try:
        available_after_cache = max(0, int(psutil.virtual_memory().available))
    except Exception:
        available_after_cache = available_before
    shortfall = max(0, target_bytes - available_after_cache)

    pins_freed = 0
    free_pins = getattr(manager, "free_pins", None)
    if shortfall > 0 and callable(free_pins):
        try:
            # Evicting pins from the stage that just completed is safe only
            # after its asynchronous CUDA work has reached the stage boundary.
            if evict_active_pins:
                synchronize = getattr(manager, "synchronize", None)
                if callable(synchronize):
                    synchronize()
            pins_freed = max(
                0,
                int(
                    free_pins(
                        shortfall + PIN_EVICTION_HYSTERESIS,
                        evict_active=evict_active_pins,
                    )
                    or 0
                ),
            )
            # AIMDO decommit can briefly outrun Linux's available-RAM counter.
            if pins_freed > 64 * 1024**2:
                time.sleep(0.05)
        except Exception as error:
            LOGGER.debug("H3 Studio RAM handoff unavailable for %s: %s", transition, error)

    try:
        available_after = max(0, int(psutil.virtual_memory().available))
    except Exception:
        available_after = available_after_cache
    released = cache_freed + pins_freed
    if released:
        LOGGER.info(
            "[H3 Studio] RAM handoff %s: available %.2f -> %.2f GiB; "
            "cache %.2f GiB, AIMDO pins %.2f GiB",
            transition,
            available_before / GIB,
            available_after / GIB,
            cache_freed / GIB,
            pins_freed / GIB,
        )

    with suppress(Exception):
        from .runtime_trace import emit

        emit(
            "ram_handoff.end",
            state=True,
            transition=transition,
            target_gib=target_bytes / GIB,
            available_before_gib=available_before / GIB,
            available_after_gib=available_after / GIB,
            cache_freed_gib=cache_freed / GIB,
            pins_freed_gib=pins_freed / GIB,
            evict_active_pins=evict_active_pins,
        )
    return released


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
    "ensure_stage_ram_headroom",
    "full_text_encoder_when_safe",
    "model_patcher",
    "release_stage_model",
]
