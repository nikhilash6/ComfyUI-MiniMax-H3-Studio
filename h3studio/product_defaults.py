"""Product-level defaults for new H3 Studio nodes.

Keep defaults in one install layer so existing serialized workflows remain
unchanged while newly created Director/Loader nodes start on the preferred
fast production setup.
"""

from __future__ import annotations

from typing import Any

DEFAULT_DIRECTOR_MEGAPIXELS = 1.5
DEFAULT_DIRECTOR_SAMPLING_PROFILE = "lightx_v1_fl2v_8"


def install() -> None:
    from .nodes import director, loader
    from .qwen35_gguf import FASTEST_QWEN35_4B_GGUF

    if bool(getattr(director.H3StudioDirector, "__h3studio_product_defaults_v1__", False)):
        return

    original_director_inputs = director.H3StudioDirector.INPUT_TYPES
    original_loader_inputs = loader.H3StudioLoader.INPUT_TYPES

    @classmethod
    def director_inputs(cls) -> dict[str, Any]:
        data = original_director_inputs()
        required = data.get("required", {})

        if "megapixels" in required:
            values, config = required["megapixels"]
            required["megapixels"] = (values, {**dict(config or {}), "default": DEFAULT_DIRECTOR_MEGAPIXELS})

        if "sampling_profile" in required:
            values, config = required["sampling_profile"]
            required["sampling_profile"] = (
                values,
                {**dict(config or {}), "default": DEFAULT_DIRECTOR_SAMPLING_PROFILE},
            )
        return data

    @classmethod
    def loader_inputs(cls) -> dict[str, Any]:
        data = original_loader_inputs()
        required = data.get("required", {})

        if "image_analyzer" in required:
            values, config = required["image_analyzer"]
            choices = list(values)
            if FASTEST_QWEN35_4B_GGUF not in choices:
                choices.insert(0, FASTEST_QWEN35_4B_GGUF)
            required["image_analyzer"] = (
                choices,
                {**dict(config or {}), "default": FASTEST_QWEN35_4B_GGUF},
            )

        if "prompt_writer" in required:
            values, config = required["prompt_writer"]
            required["prompt_writer"] = (
                values,
                {**dict(config or {}), "default": loader.SAME_AS_ANALYZER},
            )
        return data

    director.H3StudioDirector.INPUT_TYPES = director_inputs
    loader.H3StudioLoader.INPUT_TYPES = loader_inputs
    # Keep helper code that consults this module-level default aligned with the
    # visible Loader default. Explicit GGUF resolution already falls back to the
    # native Qwen3.5-4B backend when llama.cpp/model assets are unavailable.
    loader.AUTO_ANALYZER = FASTEST_QWEN35_4B_GGUF

    director.H3StudioDirector.__h3studio_product_defaults_v1__ = True
    loader.H3StudioLoader.__h3studio_product_defaults_v1__ = True


__all__ = [
    "DEFAULT_DIRECTOR_MEGAPIXELS",
    "DEFAULT_DIRECTOR_SAMPLING_PROFILE",
    "install",
]
