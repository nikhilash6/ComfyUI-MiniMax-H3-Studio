"""Standalone and Director-integrated face refinement for H3 Studio.

The refiner deliberately reuses H3 Studio's real FL2VA preparation contract:
Qwen vision/text conditioning, frame-0 keyframe binding, the joint AV latent,
ModelSamplingAV shifts, ComfyUI nested noise generation, and the active H3
sampling recipe. It never treats the H3 latent as an ordinary image latent.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Callable, Optional, Tuple

import torch

from ..constants import ROUTE_FL2VA, SAMPLING_PROFILES
from ..face_refine import FaceRefineConfig, FaceRefineResult, H3FaceRefinePipeline
from ..face_refine.geometry import CropRegion

LOGGER = logging.getLogger("h3studio.nodes.face_refine")
MAX_SAFE_COMFY_SEED = (1 << 50) - 1
_SEED_RANGE = MAX_SAFE_COMFY_SEED + 1
_GOLDEN_SEED_STEP = 0x9E3779B97F4A7C15


@dataclass(slots=True)
class FaceRefineSamplingRuntime:
    """Execution objects captured from the Director run that produced the still."""

    h3_bundle: Any
    studio_context: Any = None
    video_vae: Any = None
    sampling_model: Any = None
    sampler: Any = None
    sampling_profile: str = "base_balanced_12"
    seed: int = 0
    sampling_info: str = ""


def _face_seed(seed: int, face_index: int) -> int:
    """Stable per-face sub-seed without ever crossing ComfyUI's 2^50 ceiling."""

    base = max(0, int(seed)) % _SEED_RANGE
    return (base + (_GOLDEN_SEED_STEP * (int(face_index) + 1))) % _SEED_RANGE


def _profile_for_fl2va(profile: str) -> tuple[str, bool]:
    """Return a safe FL2VA recipe and whether the requested profile was preserved."""

    key = str(profile or "base_balanced_12")
    recipe = SAMPLING_PROFILES.get(key)
    if recipe is not None and recipe.get("route") in (None, ROUTE_FL2VA):
        return key, True
    # PDD and dedicated REF2VA LightX adapters cannot be applied to the FL2VA
    # checkpoint used for a source-anchored face edit. Base Balanced is always
    # available and keeps the fallback explicit rather than silently crossing routes.
    return "base_balanced_12", False


def _apply_runtime_to_fl2va(model: Any, studio_context: Any, guide_size: int) -> Any:
    """Apply the Director's runtime policy to an alternate FL2VA checkpoint."""

    if studio_context is None:
        return model
    try:
        from ..runtime_optimization import (
            RuntimeWorkload,
            apply_runtime_decision,
            detect_capabilities,
            resolve_runtime,
        )

        ui = dict(studio_context.state.ui)
        requested = str(ui.get("runtime_optimization") or "auto")
        advanced = ui.get("runtime_advanced") if isinstance(ui.get("runtime_advanced"), dict) else {}
        workload = RuntimeWorkload(
            route=ROUTE_FL2VA,
            mode="image_to_image",
            reference_count=1,
            frames=5,
            width=int(guide_size),
            height=int(guide_size),
            megapixels=float(guide_size * guide_size) / float(1024 * 1024),
            sequence_length=0,
            sequence_breakdown="face-refine crop",
        )
        decision = resolve_runtime(requested, detect_capabilities(), workload, advanced)
        patched, _label, _heads, _ffn, _notes = apply_runtime_decision(model, decision)
        return patched
    except Exception as exc:
        LOGGER.warning("[H3 Studio FaceRefine] Runtime policy could not be applied to FL2VA fallback: %s", exc)
        return model


def _build_alternate_fl2va_sampling(runtime: FaceRefineSamplingRuntime, guide_size: int):
    """Build FL2VA sampling objects when the main generation used REF2VA."""

    bundle = runtime.h3_bundle
    if bundle is None or not hasattr(bundle, "model_for"):
        raise RuntimeError("Face Refine requires the H3 Studio model bundle to access FL2VA.")

    model = bundle.model_for(ROUTE_FL2VA)
    model = _apply_runtime_to_fl2va(model, runtime.studio_context, guide_size)

    profile, preserved = _profile_for_fl2va(runtime.sampling_profile)
    recipe = SAMPLING_PROFILES[profile]

    # Match the main path's order: runtime patches first, then user custom LoRAs,
    # then the acceleration profile. Reserved LightX/PDD artifacts are not part
    # of the user custom stack, so this is safe for the alternate checkpoint.
    try:
        from ..lora_stack import apply_custom_lora_stack, normalize_custom_loras

        if runtime.studio_context is not None:
            specs = normalize_custom_loras(dict(runtime.studio_context.state.ui).get("custom_loras", ()))
            model, _custom_info = apply_custom_lora_stack(model, specs)
    except Exception as exc:
        LOGGER.warning("[H3 Studio FaceRefine] Custom LoRA reuse skipped on FL2VA fallback: %s", exc)

    if profile.startswith("lightx_"):
        from ..acceleration import build_lightx_backend

        model, sampler, _full_sigmas, info = build_lightx_backend(model, profile)
    else:
        from .image_runtime import H3StudioSamplingSettings

        model, sampler, _full_sigmas, info = H3StudioSamplingSettings().build(
            model=model,
            sampler_name=str(recipe["sampler"]),
            scheduler=str(recipe["scheduler"]),
            steps=int(recipe["steps"]),
            denoise=1.0,
            shift_video=float(recipe["shift_video"]),
            shift_audio=float(recipe["shift_audio"]),
            beta_alpha=0.6,
            beta_beta=0.6,
        )

    if not preserved:
        LOGGER.info(
            "[H3 Studio FaceRefine] Main profile %s is REF2VA-only; face crop uses %s on FL2VA.",
            runtime.sampling_profile,
            profile,
        )
    return model, sampler, profile, info


def _sampling_objects(runtime: FaceRefineSamplingRuntime, guide_size: int):
    """Prefer the exact already-patched FL2VA model from the main run."""

    route = getattr(getattr(runtime.studio_context, "route", None), "selected", None)
    profile, profile_is_fl2va = _profile_for_fl2va(runtime.sampling_profile)
    if route == ROUTE_FL2VA and runtime.sampling_model is not None and runtime.sampler is not None and profile_is_fl2va:
        return runtime.sampling_model, runtime.sampler, profile, runtime.sampling_info or "reused main FL2VA sampling model"
    return _build_alternate_fl2va_sampling(runtime, guide_size)


def _denoise_sigmas(model: Any, profile: str, denoise: float) -> torch.Tensor:
    """BasicScheduler-equivalent truncated schedule using the profile's real model sampling."""

    import comfy.samplers

    recipe = SAMPLING_PROFILES[profile]
    steps = max(1, int(recipe["steps"]))
    strength = max(0.01, min(1.0, float(denoise)))
    total_steps = steps if strength >= 1.0 else max(steps, int(steps / strength))
    scheduler = str(recipe["scheduler"])
    if scheduler == "trained_blocks":
        raise RuntimeError("REF2VA trained-block schedules are not valid for the FL2VA face-refine pass.")
    sigmas = comfy.samplers.calculate_sigmas(
        model.get_model_object("model_sampling"), scheduler, total_steps
    ).cpu()
    return sigmas[-(steps + 1):]


def _decode_refined_still(vae: Any, samples: Any) -> torch.Tensor:
    """Decode only H3's video member and choose a completed edited still."""

    video = samples.unbind()[0] if getattr(samples, "is_nested", False) else samples
    decoded = vae.decode(video)
    if decoded.ndim == 5:
        packet = decoded[0]
    elif decoded.ndim == 4:
        packet = decoded
    else:
        raise RuntimeError(f"Unexpected H3 face-refine VAE output shape: {tuple(decoded.shape)}")
    if int(packet.shape[0]) <= 1:
        return packet[:1]

    # Frame 0 is the exact FL2VA source anchor. Choose the earliest stable edited
    # frame after it instead of accidentally pasting the unchanged anchor back.
    from .image_runtime import _first_stable_edit_frame

    selected, _change = _first_stable_edit_frame(packet)
    selected = max(1, min(int(packet.shape[0]) - 1, int(selected)))
    return packet[selected:selected + 1]


def build_h3_face_sampler(
    h3_bundle: Any = None,
    model: Any = None,
    vae: Any = None,
    clip: Any = None,
    prompt: str = "",
    *,
    runtime: FaceRefineSamplingRuntime | None = None,
) -> Optional[Callable[[Any, CropRegion, FaceRefineConfig], Any]]:
    """Build a source-anchored native H3 FL2VA callback for each detected face."""

    if runtime is None:
        if h3_bundle is None and (model is None or vae is None or clip is None):
            return None
        runtime = FaceRefineSamplingRuntime(
            h3_bundle=h3_bundle,
            studio_context=None,
            video_vae=vae or getattr(h3_bundle, "video_vae", None),
            sampling_model=model,
            sampler=None,
            sampling_profile="base_balanced_12",
            seed=0,
        )

    bundle = runtime.h3_bundle or h3_bundle
    resolved_vae = runtime.video_vae or vae or getattr(bundle, "video_vae", None) or getattr(bundle, "vae", None)
    resolved_clip = clip or getattr(bundle, "clip", None) or getattr(bundle, "text_encoder", None)
    scene_prompt = prompt or getattr(runtime.studio_context, "prompt", "")
    if resolved_vae is None or resolved_clip is None:
        return None

    face_counter = 0

    def h3_sampler(crop_patch: torch.Tensor, region: CropRegion, config: FaceRefineConfig) -> torch.Tensor:
        nonlocal face_counter
        face_index = face_counter
        face_counter += 1
        patch = crop_patch if crop_patch.ndim == 4 else crop_patch.unsqueeze(0)
        guide_dim = int(config.guide_size)
        effective_denoise = config.effective_denoise(region.orig_box.max_dim)

        sampling_model, sampler, profile, _sampling_info = _sampling_objects(runtime, guide_dim)
        recipe = SAMPLING_PROFILES[profile]

        from .image_runtime import H3StudioPrepare, RECOMMENDED_FRAME_PROFILE

        instruction = (
            "Refine the face in <Picture 1> only. Preserve the same person, expression, gaze, pose, hairstyle, "
            "lighting, camera perspective, age, proportions, and existing visual style. Restore coherent eyes, "
            "mouth, facial anatomy and fine detail appropriate to the source style. Do not redesign the subject "
            "or change the surrounding composition."
        )
        face_prompt = instruction if not scene_prompt else f"{instruction}\n\nOriginal scene and style description:\n{scene_prompt}"
        positive, h3_latent, _fitted, _frames, _compiled, _info = H3StudioPrepare().prepare(
            clip=resolved_clip,
            vae=resolved_vae,
            mode="image_to_image (FL2VA)",
            prompt=face_prompt,
            width=guide_dim,
            height=guide_dim,
            frame_preset=RECOMMENDED_FRAME_PROFILE,
            optimize_prompt=True,
            preserve_strength=0.95,
            source_fit="stretch",
            reference_size="match_generation_area",
            source_image=patch,
        )

        import comfy.model_management
        import comfy.sample
        import comfy.samplers

        latent = h3_latent["samples"]
        seed = _face_seed(runtime.seed, face_index)
        noise = comfy.sample.prepare_noise(latent, seed, h3_latent.get("batch_index"))
        sigmas = _denoise_sigmas(sampling_model, profile, effective_denoise)
        try:
            from comfy_extras.nodes_custom_sampler import Guider_Basic
            guider = Guider_Basic(sampling_model)
            guider.set_conds(positive)
        except Exception:
            if hasattr(comfy.samplers, "CFGGuider"):
                guider = comfy.samplers.CFGGuider(sampling_model)
                if hasattr(guider, "inner_set_conds"):
                    guider.inner_set_conds({"positive": positive})
                else:
                    guider.set_conds(positive, positive)
                guider.set_cfg(1.0)
            else:
                from comfy_extras.nodes_custom_sampler import BasicGuider
                guider = BasicGuider().get_guider(sampling_model, positive)[0]

        try:
            import latent_preview
            steps_count = sigmas.shape[0] - 1 if hasattr(sigmas, "shape") else len(sigmas) - 1
            callback = latent_preview.prepare_callback(sampling_model, max(1, steps_count))
        except Exception:
            callback = None

        refined = guider.sample(
            noise,
            latent,
            sampler,
            sigmas,
            denoise_mask=h3_latent.get("noise_mask"),
            callback=callback,
            disable_pbar=False,
            seed=seed,
        )
        refined = refined.to(comfy.model_management.intermediate_device())
        decoded = _decode_refined_still(resolved_vae, refined)
        LOGGER.info(
            "[H3 Studio FaceRefine] face=%d seed=%d size=%dpx denoise=%.3f profile=%s",
            face_index + 1,
            seed,
            region.orig_box.max_dim,
            effective_denoise,
            profile,
        )
        return decoded

    return h3_sampler


class H3StudioFaceRefine:
    """Standalone face-refine node; Director mode is integrated after final still selection."""

    CATEGORY = "H3Studio"
    FUNCTION = "refine"
    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("image", "status")

    def __init__(self) -> None:
        self.pipeline = H3FaceRefinePipeline()

    @classmethod
    def INPUT_TYPES(cls):
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
                "mask_mode": (["Feathered", "SAM if available"], {"default": "Feathered"}),
                "adaptive_denoise": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "h3_bundle": ("H3_STUDIO_BUNDLE",),
                "model": ("MODEL",),
                "vae": ("VAE",),
                "clip": ("CLIP",),
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
        mask_mode: str = "Feathered",
        adaptive_denoise: bool = True,
        h3_bundle: Any = None,
        model: Any = None,
        vae: Any = None,
        clip: Any = None,
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
            mask_mode="sam_auto" if str(mask_mode).lower().startswith("sam") else "feather",
            adaptive_denoise=bool(adaptive_denoise),
        )
        sampler_fn = build_h3_face_sampler(
            h3_bundle=h3_bundle,
            model=model,
            vae=vae,
            clip=clip,
            prompt=prompt,
        )
        result: FaceRefineResult = self.pipeline.refine_image(image, config, sampler_fn=sampler_fn)
        LOGGER.info("[H3 Studio FaceRefine] %s", result.status_message)
        return result.image, result.status_message


__all__ = [
    "FaceRefineSamplingRuntime",
    "H3StudioFaceRefine",
    "MAX_SAFE_COMFY_SEED",
    "build_h3_face_sampler",
]
