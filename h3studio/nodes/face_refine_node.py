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
    prompt: str = "",
) -> Optional[Callable[[Any, CropRegion, FaceRefineConfig], Any]]:
    """
    Build a real H3 FL2VA sampling callback for face crop refinement.
    Uses the loaded H3 VAE for latent encode/decode and DiT model with prompt conditioning.
    """
    resolved_vae = vae or getattr(h3_bundle, "video_vae", None) or getattr(h3_bundle, "vae", None)
    resolved_model = model or (
        h3_bundle.model_for("fl2va")
        if hasattr(h3_bundle, "model_for")
        else getattr(h3_bundle, "model", None)
    )
    resolved_clip = getattr(h3_bundle, "clip", None) or getattr(h3_bundle, "text_encoder", None)

    if resolved_vae is None and resolved_model is None:
        return None

    def h3_sampler(crop_patch: torch.Tensor, region: CropRegion, config: FaceRefineConfig) -> torch.Tensor:
        try:
            patch = crop_patch
            if patch.ndim == 3:
                patch = patch.unsqueeze(0)

            # 1. Encode patch to latent space via VAE
            latent_samples = None
            if resolved_vae is not None and hasattr(resolved_vae, "encode"):
                encoded = resolved_vae.encode(patch)
                if isinstance(encoded, dict):
                    latent_samples = encoded.get("samples", encoded)
                else:
                    latent_samples = encoded

            # 2. Conditioning and sampling pass with H3 model
            refined_latent = None
            if resolved_model is not None and latent_samples is not None:
                try:
                    import comfy.sample

                    face_prompt = (
                        f"sharp facial details, clear photorealistic eyes and skin texture: {prompt}"
                        if prompt
                        else "sharp facial details, clear photorealistic eyes and skin texture"
                    )
                    cond = []
                    if resolved_clip is not None and hasattr(resolved_clip, "tokenize"):
                        tokens = resolved_clip.tokenize(face_prompt)
                        cond = resolved_clip.encode_from_tokens(tokens)

                    noise = torch.randn_like(latent_samples)
                    refined_latent = comfy.sample.sample(
                        resolved_model,
                        noise,
                        config.steps,
                        config.cfg,
                        "euler",
                        "simple",
                        cond,
                        [],
                        latent_samples,
                        denoise=config.denoise,
                    )
                except Exception as ex:
                    LOGGER.debug("[H3 FaceRefine] Sampling pass exception: %s", ex)

            # 3. Decode latent back to image via VAE
            if resolved_vae is not None and hasattr(resolved_vae, "decode"):
                target = refined_latent if refined_latent is not None else latent_samples
                if target is not None:
                    decoded = resolved_vae.decode(target)
                    if decoded.ndim == 5:
                        decoded = decoded[:, 0]
                    return decoded

            if refined_latent is not None:
                return refined_latent

            return crop_patch

        except Exception as err:
            LOGGER.warning("[H3 FaceRefine] Patch refinement error: %s; using original crop.", err)
            return crop_patch

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
