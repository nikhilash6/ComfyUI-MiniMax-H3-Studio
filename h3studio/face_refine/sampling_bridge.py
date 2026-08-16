"""Production H3 FL2VA sampler bridge for still-image face refinement.

The original H3 FaceRefine project demonstrated an important MiniMax H3 detail:
FL2VA keyframes are conditioning, not an img2img starting latent. A low-denoise
face pass therefore has to encode the source crop into the VIDEO member of H3's
joint AV latent before sampling. This module applies that principle to H3 Studio's
selected-still pipeline while preserving its active runtime policy and sampling
profile where the profile is FL2VA-compatible.

Technique adapted from Carasibana/ComfyUI-H3-FaceRefine (MIT),
copyright (c) 2026 Carasibana. The implementation here is independently adapted
for H3 Studio's still-image runtime and state model.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Optional

import torch
import torch.nn.functional as F

from .geometry import CropRegion

LOGGER = logging.getLogger("h3studio.face_refine.sampling_bridge")
_INSTALLED = False


def _align32(value: int) -> int:
    return max(32, int(round(max(32, int(value)) / 32.0)) * 32)


def _resize_patch_to_h3_grid(patch: torch.Tensor) -> torch.Tensor:
    """Keep the crop aspect while making both axes valid H3 canvas dimensions."""

    if patch.ndim != 4:
        raise ValueError("Face Refine source patch must be [B,H,W,C].")
    height, width = int(patch.shape[1]), int(patch.shape[2])
    target_h, target_w = _align32(height), _align32(width)
    source = patch[:1, ..., :3].float().clamp(0.0, 1.0)
    if (target_h, target_w) == (height, width):
        return source
    resized = F.interpolate(
        source.movedim(-1, 1),
        size=(target_h, target_w),
        mode="bicubic",
        align_corners=False,
        antialias=True,
    )
    return resized.movedim(1, -1).clamp(0.0, 1.0)


def _inject_source_video_latent(h3_latent: dict[str, Any], patch: torch.Tensor, vae: Any) -> dict[str, Any]:
    """Turn H3's empty AV latent into a real low-denoise img2img starting point.

    The face crop is a still, so it is repeated across the requested H3 context
    frames before Video-VAE encoding. The encoded video stream replaces the zero
    video stream; audio is left intact and receives a zero noise mask so an image
    refinement pass cannot waste work changing it.
    """

    import comfy.nested_tensor

    samples = h3_latent.get("samples")
    if samples is None or not getattr(samples, "is_nested", False):
        raise ValueError("Face Refine expected MiniMax H3's joint AV NestedTensor latent.")

    members = list(samples.unbind())
    if not members:
        raise ValueError("H3 joint AV latent has no video member.")
    video_template = members[0]

    frame_count = max(1, int(h3_latent.get("h3_context_frames", h3_latent.get("h3_requested_frames", 5))))
    source_frames = patch[:1, ..., :3].repeat(frame_count, 1, 1, 1)
    encoded = vae.encode(source_frames)
    if encoded.ndim == 4:
        # VAE image-batch convention [T,C,H,W] -> H3 [1,C,T,H,W].
        encoded = encoded.unsqueeze(0).movedim(1, 2)
    if encoded.ndim != 5:
        raise RuntimeError(f"Unexpected H3 Video-VAE source latent shape: {tuple(encoded.shape)}")

    target_t, target_h, target_w = map(int, video_template.shape[-3:])
    got_t, got_h, got_w = map(int, encoded.shape[-3:])
    if (got_h, got_w) != (target_h, target_w):
        raise RuntimeError(
            f"Face Refine source latent is {got_w}x{got_h}, but H3 expects {target_w}x{target_h}. "
            "The crop canvas must match the prepared H3 canvas."
        )

    if got_t > target_t:
        encoded = encoded[..., :target_t, :, :]
    elif got_t < target_t:
        # This is a still-image source: extend the final encoded temporal slice,
        # never pad with zeros that would partially erase the img2img anchor.
        tail = encoded[..., -1:, :, :].expand(*encoded.shape[:-3], target_t - got_t, got_h, got_w)
        encoded = torch.cat((encoded, tail), dim=-3)

    members[0] = encoded.to(device=video_template.device, dtype=video_template.dtype)
    out = dict(h3_latent)
    out["samples"] = comfy.nested_tensor.NestedTensor(tuple(members))

    masks = [torch.ones_like(members[0])]
    masks.extend(torch.zeros_like(member) for member in members[1:])
    out["noise_mask"] = comfy.nested_tensor.NestedTensor(tuple(masks))
    out["h3_face_refine_source_latent"] = True
    return out


def _direct_sampling(runtime: Any, guide_size: int):
    """Build a conservative FL2VA recipe for the standalone node path."""

    from ..constants import SAMPLING_PROFILES
    from ..nodes.image_runtime import H3StudioSamplingSettings

    model = runtime.sampling_model
    if model is None:
        bundle = runtime.h3_bundle
        if bundle is None or not hasattr(bundle, "model_for"):
            raise RuntimeError("Face Refine requires an FL2VA model or an H3 Studio bundle.")
        model = bundle.model_for("fl2va")

    profile = "base_balanced_12"
    recipe = SAMPLING_PROFILES[profile]
    model, sampler, _sigmas, info = H3StudioSamplingSettings().build(
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
    return model, sampler, profile, info


def build_h3_face_sampler(
    h3_bundle: Any = None,
    model: Any = None,
    vae: Any = None,
    clip: Any = None,
    prompt: str = "",
    *,
    runtime: Any = None,
) -> Optional[Callable[[Any, CropRegion, Any], Any]]:
    """Build a true source-latent H3 FL2VA callback for each selected face."""

    from ..nodes import face_refine_node as legacy

    if runtime is None:
        if h3_bundle is None and (model is None or vae is None or clip is None):
            return None
        runtime = legacy.FaceRefineSamplingRuntime(
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

    def h3_sampler(crop_patch: torch.Tensor, region: CropRegion, config: Any) -> torch.Tensor:
        nonlocal face_counter
        import comfy.model_management
        import comfy.sample
        import comfy.samplers

        comfy.model_management.throw_exception_if_processing_interrupted()
        face_index = face_counter
        face_counter += 1

        patch = crop_patch if crop_patch.ndim == 4 else crop_patch.unsqueeze(0)
        patch = _resize_patch_to_h3_grid(patch)
        patch_h, patch_w = int(patch.shape[1]), int(patch.shape[2])
        effective_denoise = config.effective_denoise(region.orig_box.max_dim)

        if runtime.studio_context is None:
            sampling_model, sampler, profile, sampling_info = _direct_sampling(runtime, max(patch_h, patch_w))
        else:
            sampling_model, sampler, profile, sampling_info = legacy._sampling_objects(
                runtime, max(patch_h, patch_w)
            )

        from ..nodes.image_runtime import H3StudioPrepare, RECOMMENDED_FRAME_PROFILE

        instruction = (
            "Refine only the face in <Picture 1>. Preserve the same identity, expression, gaze, pose, hairstyle, "
            "age, proportions, camera perspective, lighting and source visual style. Restore coherent eyes, mouth, "
            "facial anatomy and fine detail that are plausible for the existing image. Keep hair, clothing, background "
            "and composition stable; do not beautify, redesign, restyle or recast the subject."
        )
        face_prompt = instruction if not scene_prompt else (
            f"{instruction}\n\nUse this original scene description only to preserve identity/style/context; "
            f"do not recreate the whole scene inside the crop:\n{scene_prompt}"
        )
        positive, h3_latent, _fitted, _frames, _compiled, _info = H3StudioPrepare().prepare(
            clip=resolved_clip,
            vae=resolved_vae,
            mode="image_to_image (FL2VA)",
            prompt=face_prompt,
            width=patch_w,
            height=patch_h,
            frame_preset=RECOMMENDED_FRAME_PROFILE,
            optimize_prompt=True,
            preserve_strength=0.98,
            source_fit="stretch",
            reference_size="match_generation_area",
            source_image=patch,
        )

        h3_latent = _inject_source_video_latent(h3_latent, patch, resolved_vae)
        latent = h3_latent["samples"]
        seed = legacy._face_seed(runtime.seed, face_index)
        noise = comfy.sample.prepare_noise(latent, seed, h3_latent.get("batch_index"))
        sigmas = legacy._denoise_sigmas(sampling_model, profile, effective_denoise)
        if hasattr(comfy.samplers, "CFGGuider"):
            guider = comfy.samplers.CFGGuider(sampling_model)
            guider.set_conds(positive, None)
            guider.set_cfg(1.0)
        elif hasattr(comfy.samplers, "Guider_Basic"):
            guider = comfy.samplers.Guider_Basic(sampling_model)
            guider.set_conds(positive)
        else:
            from comfy_extras.nodes_custom_sampler import BasicGuider
            guider = BasicGuider().get_guider(sampling_model, positive)[0]

        refined = guider.sample(
            noise,
            latent,
            sampler,
            sigmas,
            denoise_mask=h3_latent.get("noise_mask"),
            callback=None,
            disable_pbar=False,
            seed=seed,
        )
        if hasattr(refined, "to"):
            refined = refined.to(comfy.model_management.intermediate_device())
        decoded = legacy._decode_refined_still(resolved_vae, refined)
        LOGGER.info(
            "[H3 Studio FaceRefine] face=%d seed=%d source=%dx%d face=%dpx denoise=%.3f profile=%s source_latent=yes | %s",
            face_index + 1,
            seed,
            patch_w,
            patch_h,
            region.orig_box.max_dim,
            effective_denoise,
            profile,
            sampling_info,
        )
        return decoded

    return h3_sampler


def _fix_impact_bbox_fallback() -> None:
    """Correct Impact SEG.bbox interpretation to native Ultralytics [x1,y1,x2,y2]."""

    from . import detector as detector_module

    cls = detector_module.ComfyUIYoloFaceDetector
    if getattr(cls.detect, "__h3studio_xyxy_fixed__", False):
        return
    original = cls.detect

    def detect(self, image: Any, min_face_size: int = 16):
        # Prefer the original large-canvas path. Only replace its provider fallback
        # when the raw model path is unavailable/failed.
        if not self.is_available:
            return []
        rgb = detector_module._to_rgb8(image)
        if rgb is None:
            return []
        boxes = []
        model = getattr(self._bbox_detector, "bbox_model", None)
        if model is not None:
            try:
                long_edge = max(int(rgb.shape[0]), int(rgb.shape[1]))
                imgsz = min(self.max_inference_size, max(640, ((long_edge + 31) // 32) * 32))
                prediction = model(rgb, conf=self.conf_thresh, imgsz=imgsz, verbose=False)
                for result in prediction:
                    for raw in result.boxes:
                        x1, y1, x2, y2 = raw.xyxy[0].tolist()
                        width, height = int(round(x2 - x1)), int(round(y2 - y1))
                        if width >= min_face_size and height >= min_face_size:
                            boxes.append(detector_module.BoundingBox(
                                x=max(0, int(round(x1))), y=max(0, int(round(y1))),
                                width=width, height=height, confidence=float(raw.conf[0]),
                            ))
                return detector_module._dedupe(boxes)
            except Exception as exc:
                LOGGER.debug("Large-canvas YOLO fell back to Impact provider API: %s", exc)
        try:
            batch = image.unsqueeze(0) if isinstance(image, torch.Tensor) and image.ndim == 3 else image
            _shape, segments = self._bbox_detector.detect(
                batch, self.conf_thresh, 0, 1.0, max(1, int(min_face_size) - 1)
            )
            for segment in segments:
                x1, y1, x2, y2 = [float(value) for value in segment.bbox]
                width, height = int(round(x2 - x1)), int(round(y2 - y1))
                if width >= min_face_size and height >= min_face_size:
                    boxes.append(detector_module.BoundingBox(
                        x=max(0, int(round(x1))), y=max(0, int(round(y1))),
                        width=width, height=height, confidence=float(segment.confidence),
                    ))
        except Exception as exc:
            LOGGER.warning("[H3 Studio FaceRefine] Impact YOLO provider fallback failed: %s", exc)
        return detector_module._dedupe(boxes)

    detect.__h3studio_xyxy_fixed__ = True
    detect.__wrapped__ = original
    cls.detect = detect


def install() -> None:
    """Replace the provisional sampler bridge before selected-still integration captures it."""

    global _INSTALLED
    if _INSTALLED:
        return
    from ..nodes import face_refine_node

    _fix_impact_bbox_fallback()
    face_refine_node.build_h3_face_sampler = build_h3_face_sampler
    _INSTALLED = True
    LOGGER.info("[H3 Studio] Face Refine sampler: source-latent FL2VA bridge enabled")


__all__ = ["build_h3_face_sampler", "install", "_inject_source_video_latent"]
