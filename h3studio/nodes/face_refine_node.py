"""Standalone and Director-integrated Face Refinement Node for H3 Studio."""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, Optional, Tuple

import torch

from ..face_refine import (
    FaceRefineConfig,
    FaceRefineResult,
    H3FaceRefinePipeline,
)
from ..face_refine.geometry import CropRegion

LOGGER = logging.getLogger("h3studio.nodes.face_refine")


def build_h3_face_sampler(
    h3_bundle: Any = None,
    model: Any = None,
    vae: Any = None,
    clip: Any = None,
    prompt: str = "",
) -> Optional[Callable[[Any, CropRegion, FaceRefineConfig], Any]]:
    """
    Build a real H3 FL2VA sampling callback for face crop refinement.
    Uses H3StudioPrepare to create joint AV latents and tokenized prompt conditioning,
    then samples with the FL2VA model at the configured denoise level.
    """
    resolved_vae = vae or getattr(h3_bundle, "video_vae", None) or getattr(h3_bundle, "vae", None)
    resolved_model = model or (
        h3_bundle.model_for("fl2va")
        if hasattr(h3_bundle, "model_for")
        else getattr(h3_bundle, "model", None)
    )
    resolved_clip = clip or getattr(h3_bundle, "clip", None) or getattr(h3_bundle, "text_encoder", None)

    if resolved_vae is None or resolved_model is None:
        return None

    def h3_sampler(crop_patch: torch.Tensor, region: CropRegion, config: FaceRefineConfig) -> torch.Tensor:
        patch = crop_patch
        if patch.ndim == 3:
            patch = patch.unsqueeze(0)

        # 1. Use H3StudioPrepare to build authentic FL2VA latent & conditioning
        from .image_runtime import H3StudioPrepare

        face_prompt = (
            f"high-detail photorealistic face, sharp facial features, natural skin texture: {prompt}"
            if prompt
            else "high-detail photorealistic face, sharp facial features, natural skin texture"
        )
        guide_dim = int(config.guide_size)
        prep = H3StudioPrepare()

        positive, h3_latent, _, _, _, _ = prep.prepare(
            clip=resolved_clip,
            vae=resolved_vae,
            mode="image_to_image (FL2VA)",
            prompt=face_prompt,
            width=guide_dim,
            height=guide_dim,
            frame_preset="5 frames (fastest / recommended)",
            optimize_prompt=False,
            preserve_strength=1.0 - config.denoise,
            source_fit="stretch",
            reference_size="same",
            source_image=patch,
        )

        # 2. Run sampling with H3 model
        import comfy.sample

        latent_samples = h3_latent["samples"] if isinstance(h3_latent, dict) else h3_latent
        noise = torch.randn_like(latent_samples)
        refined_latent = comfy.sample.sample(
            resolved_model,
            noise,
            config.steps,
            config.cfg,
            "euler",
            "simple",
            positive,
            [],
            latent_samples,
            denoise=config.denoise,
        )

        # 3. Decode refined latent back to RGB image
        decoded = resolved_vae.decode(refined_latent)
        if decoded.ndim == 5:
            # Video VAE [B, F, H, W, C] -> extract single still frame 0
            decoded = decoded[0, 0:1]
        elif decoded.ndim == 4 and decoded.shape[0] > 1:
            decoded = decoded[0:1]
        return decoded

    return h3_sampler


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
                "h3_bundle": ("H3_STUDIO_BUNDLE",),
                "model": ("MODEL",),
                "vae": ("VAE",),
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
        model: Any = None,
        vae: Any = None,
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

        sampler_fn = build_h3_face_sampler(
            h3_bundle=h3_bundle,
            model=model,
            vae=vae,
            prompt=prompt,
        )

        result: FaceRefineResult = self.pipeline.refine_image(image, config, sampler_fn=sampler_fn)
        LOGGER.info("[H3 Studio FaceRefine] %s", result.status_message)
        return (result.image, result.status_message)


__all__ = ["H3StudioFaceRefine", "build_h3_face_sampler"]
