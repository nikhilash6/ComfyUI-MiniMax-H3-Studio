"""Standalone and Director-integrated Face Refinement Node for H3 Studio."""

from __future__ import annotations

import logging
from typing import Any, Dict, Tuple

import torch

from ..face_refine import (
    FaceRefineConfig,
    FaceRefineResult,
    H3FaceRefinePipeline,
)

LOGGER = logging.getLogger("h3studio.nodes.face_refine")


class H3StudioFaceRefine:
    """
    Post-processes small or distant faces in H3 generated images by detecting faces,
    cropping them with context (~2.5x), refining them through H3 at high token density,
    and blending them back with feathered masks and Lab color matching.
    """

    CATEGORY = "H3Studio"
    FUNCTION = "refine"
    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("image", "status")

    def __init__(self) -> None:
        self.pipeline = H3FaceRefinePipeline()

    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Any]:
        return {
            "required": {
                "image": ("IMAGE",),
                "mode": (["Off", "Auto", "Strong"], {"default": "Auto"}),
                "crop_factor": ("FLOAT", {"default": 2.5, "min": 1.2, "max": 5.0, "step": 0.1}),
                "guide_size": ([512, 768, 1024], {"default": 768}),
                "denoise": ("FLOAT", {"default": 0.22, "min": 0.05, "max": 0.8, "step": 0.01}),
                "blend_feather": ("INT", {"default": 16, "min": 2, "max": 64, "step": 2}),
                "max_faces": ("INT", {"default": 4, "min": 1, "max": 16, "step": 1}),
                "color_match": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "h3_bundle": ("H3_BUNDLE",),
                "prompt": ("STRING", {"forceInput": True, "multiline": True}),
            },
        }

    def refine(
        self,
        image: torch.Tensor,
        mode: str = "Auto",
        crop_factor: float = 2.5,
        guide_size: int = 768,
        denoise: float = 0.22,
        blend_feather: int = 16,
        max_faces: int = 4,
        color_match: bool = True,
        h3_bundle: Any = None,
        prompt: str = "",
    ) -> Tuple[torch.Tensor, str]:
        config = FaceRefineConfig(
            mode=mode.lower(),
            crop_factor=crop_factor,
            guide_size=guide_size,
            denoise=denoise,
            blend_feather=blend_feather,
            max_faces=max_faces,
            color_match=color_match,
        )

        result: FaceRefineResult = self.pipeline.refine_image(image, config)
        LOGGER.info("[H3 Studio FaceRefine] %s", result.status_message)
        return (result.image, result.status_message)
