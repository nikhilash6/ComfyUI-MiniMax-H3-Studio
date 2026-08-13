"""Stage-boundary residency handoffs for constrained H3 systems.

ComfyUI remains the only model loader.  H3 Studio merely tells ComfyUI when a
model and all of its derived clones are no longer needed by the completed
stage, using ComfyUI's public targeted-unload helper.  This is intentionally
not a global cache flush and never manipulates DynamicVRAM internals.
"""

from __future__ import annotations

import logging
from contextlib import suppress
from typing import Any

LOGGER = logging.getLogger(__name__)


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

        emit("residency.release", patcher=patcher, transition=transition)
    return True


__all__ = ["model_patcher", "release_stage_model"]
