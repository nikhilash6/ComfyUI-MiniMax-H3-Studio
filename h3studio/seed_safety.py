"""End-to-end Director seed safety for ComfyUI's numeric widget ceiling."""

from __future__ import annotations

import logging
from copy import deepcopy

LOGGER = logging.getLogger(__name__)
MAX_SAFE_COMFY_SEED = (1 << 50) - 1
_INSTALLED = False


def clamp_seed(value) -> int:
    try:
        seed = int(value)
    except (TypeError, ValueError):
        return 0
    return max(0, min(MAX_SAFE_COMFY_SEED, seed))


def install() -> None:
    """Clamp widget/API/manual seeds and expose the exact executed seed to the UI."""

    global _INSTALLED
    if _INSTALLED:
        return

    from .nodes.director import H3StudioDirector

    original_input_types = H3StudioDirector.INPUT_TYPES
    original_direct = H3StudioDirector.direct

    def input_types(cls):
        data = deepcopy(original_input_types())
        required = data.get("required", {})
        spec = required.get("seed")
        if spec:
            kind, options = spec
            required["seed"] = (
                kind,
                {
                    **dict(options or {}),
                    "min": 0,
                    "max": MAX_SAFE_COMFY_SEED,
                    "step": 1,
                    "tooltip": (
                        "H3 Studio seed. Values are limited to 2^50-1 so LiteGraph/ComfyUI never clamps "
                        "different randomized seeds to the same 2^50 boundary value."
                    ),
                },
            )
        return data

    def direct(cls, *args, **kwargs):
        args = list(args)
        if "seed" in kwargs:
            kwargs["seed"] = clamp_seed(kwargs["seed"])
        elif len(args) > 13:
            # Bound classmethod signature: mode..megapixels are 0..12, seed is 13.
            args[13] = clamp_seed(args[13])

        response = original_direct(*args, **kwargs)
        if isinstance(response, dict):
            values = response.get("result")
            if isinstance(values, (tuple, list)) and len(values) > 5:
                exact_seed = clamp_seed(values[5])
                response.setdefault("ui", {})["seed"] = [exact_seed]
                LOGGER.info("[H3 Studio] Director executed seed=%d", exact_seed)
        return response

    H3StudioDirector.INPUT_TYPES = classmethod(input_types)
    H3StudioDirector.direct = classmethod(direct)
    _INSTALLED = True


__all__ = ["MAX_SAFE_COMFY_SEED", "clamp_seed", "install"]
