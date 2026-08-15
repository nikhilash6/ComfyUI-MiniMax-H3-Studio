"""Backport ComfyUI's runtime attention override API for older H3-tested pins.

H3 Studio supports DynamicVRAM builds that predate ModelPatcher.set_model_optimized_attention().
Current ComfyUI exposes that helper natively. Older builds already understand the
same ``optimized_attention_override`` transformer option, so we install the exact
compatibility surface only when the method is missing.
"""

from __future__ import annotations

import logging
from typing import Any

LOGGER = logging.getLogger(__name__)


def _set_model_optimized_attention(self: Any, optimized_attention: Any) -> None:
    def optimized_attention_override(_original, *args, **kwargs):
        return optimized_attention(*args, **kwargs)

    container_function = getattr(optimized_attention, "container_function", None)
    if container_function is not None:
        optimized_attention_override.container_function = container_function

    model_options = getattr(self, "model_options", None)
    if not isinstance(model_options, dict):
        raise RuntimeError("ComfyUI model patcher has no mutable model_options mapping.")

    transformer_options = model_options.setdefault("transformer_options", {})
    transformer_options["optimized_attention_override"] = optimized_attention_override


def install() -> None:
    try:
        from comfy.model_patcher import ModelPatcher
    except ImportError:
        return

    if callable(getattr(ModelPatcher, "set_model_optimized_attention", None)):
        return

    setattr(ModelPatcher, "set_model_optimized_attention", _set_model_optimized_attention)
    LOGGER.info("[H3 Studio] Backported ModelPatcher.set_model_optimized_attention for this ComfyUI build")


__all__ = ["install"]
