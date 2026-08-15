"""H3 Face Refinement Pipeline: Detection, Crop Expansion, Low-Denoise Refinement, and Feathered Blending."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

try:
    import torch
except ImportError:  # pragma: no cover
    torch = None

from .color import ReinhardColorTransfer
from .detector import AutoFaceDetector, FaceDetector
from .geometry import BoundingBox, CropContextManager, CropRegion
from .masking import FeatherBlender, MaskGenerator

LOGGER = logging.getLogger("h3studio.face_refine.pipeline")


@dataclass
class FaceRefineConfig:
    """Configuration parameters for the Face Refine post-processing stage."""

    mode: str = "auto"  # "off", "auto", "strong"
    crop_factor: float = 2.5
    guide_size: int = 768
    denoise: float = 0.22
    blend_feather: int = 16
    max_faces: int = 4
    distant_face_threshold: float = 0.05  # Ratio of canvas area (5% max for auto mode)
    min_face_size: int = 16
    color_match: bool = True
    reuse_references: bool = True
    steps: int = 8  # Refine sampling steps
    cfg: float = 3.5

    @property
    def is_enabled(self) -> bool:
        return self.mode.lower() in ("auto", "strong")


@dataclass
class FaceRefineResult:
    """Execution output and telemetry from the Face Refine pipeline."""

    image: Any
    faces_detected: int = 0
    faces_refined: int = 0
    duration_ms: float = 0.0
    status_message: str = ""
    bounding_boxes: List[BoundingBox] = field(default_factory=list)


class H3FaceRefinePipeline:
    """
    Object-oriented Face Refinement Pipeline for MiniMax H3.
    Detects small/distant faces in wide-angle and full-body scenes, scales them
    to high-density token canvases, refines them with H3 DiT img2img, and
    blends them back seamlessly with feathered alpha masks and Lab color matching.
    """

    def __init__(
        self,
        detector: Optional[FaceDetector] = None,
        crop_manager: Optional[CropContextManager] = None,
        color_transfer: Optional[ReinhardColorTransfer] = None,
        blender: Optional[FeatherBlender] = None,
    ) -> None:
        self.detector = detector or AutoFaceDetector()
        self.crop_manager = crop_manager or CropContextManager()
        self.color_transfer = color_transfer or ReinhardColorTransfer()
        self.blender = blender or FeatherBlender()

    def filter_faces(
        self,
        boxes: List[BoundingBox],
        canvas_width: int,
        canvas_height: int,
        config: FaceRefineConfig,
    ) -> List[BoundingBox]:
        """
        Filter detected faces based on configured mode:
        - Auto: Refine only small/distant faces under distant_face_threshold. Close-ups are left untouched.
        - Strong: Refine all detected faces up to max_faces.
        """
        if not boxes:
            return []

        if config.mode.lower() == "auto":
            sorted_boxes = sorted(boxes, key=lambda b: b.area)
            selected = [
                b for b in sorted_boxes if b.is_distant_face(canvas_width, canvas_height, config.distant_face_threshold)
            ]
        else:
            selected = sorted(boxes, key=lambda b: b.confidence, reverse=True)

        return selected[: config.max_faces]

    def refine_image(
        self,
        image_tensor: Any,
        config: FaceRefineConfig,
        sampler_fn: Optional[Callable[[Any, CropRegion, FaceRefineConfig], Any]] = None,
    ) -> FaceRefineResult:
        """
        Execute Face Refine on an image tensor [B, H, W, C] in [0, 1] range.
        If sampler_fn is provided, it is invoked on each upscaled crop to produce the refined patch.
        If sampler_fn is None, a passthrough/bilateral refinement is performed for validation.
        """
        start_time = time.perf_counter()

        if not config.is_enabled:
            return FaceRefineResult(
                image=image_tensor,
                faces_detected=0,
                faces_refined=0,
                duration_ms=0.0,
                status_message="Face Refine is disabled (Off).",
            )

        if getattr(image_tensor, "ndim", 0) != 4:
            return FaceRefineResult(
                image=image_tensor,
                faces_detected=0,
                faces_refined=0,
                duration_ms=0.0,
                status_message="Invalid image dimension (expected 4D tensor).",
            )

        batch_size, h, w, c = image_tensor.shape
        detected_boxes = self.detector.detect(image_tensor[0], min_face_size=config.min_face_size)

        if not detected_boxes:
            elapsed = (time.perf_counter() - start_time) * 1000.0
            return FaceRefineResult(
                image=image_tensor,
                faces_detected=0,
                faces_refined=0,
                duration_ms=elapsed,
                status_message="No faces detected in canvas.",
                bounding_boxes=[],
            )

        faces_to_refine = self.filter_faces(detected_boxes, w, h, config)
        if not faces_to_refine:
            elapsed = (time.perf_counter() - start_time) * 1000.0
            return FaceRefineResult(
                image=image_tensor,
                faces_detected=len(detected_boxes),
                faces_refined=0,
                duration_ms=elapsed,
                status_message=f"Detected {len(detected_boxes)} face(s), but none were below the distant-face threshold in Auto mode.",
                bounding_boxes=detected_boxes,
            )

        current_canvas = image_tensor.clone() if hasattr(image_tensor, "clone") else image_tensor
        refined_count = 0

        for idx, box in enumerate(faces_to_refine):
            try:
                region = self.crop_manager.compute_crop_region(
                    box=box,
                    canvas_width=w,
                    canvas_height=h,
                    crop_factor=config.crop_factor,
                    guide_size=config.guide_size,
                )

                # Extract upscaled patch
                crop_patch, (target_w, target_h) = self.crop_manager.extract_crop_tensor(current_canvas, region)

                # Run refinement sampler callback
                if sampler_fn is not None:
                    refined_patch = sampler_fn(crop_patch, region, config)
                else:
                    refined_patch = crop_patch

                # Downsample back to crop size
                resampled_patch = self.crop_manager.resize_back_to_crop(refined_patch, region)

                # Extract original unrefined crop for color statistics matching
                orig_crop = current_canvas[:, region.y : region.y2, region.x : region.x2, :]

                # Color transfer in Lab space to prevent hue drift
                if config.color_match:
                    resampled_patch = self.color_transfer.transfer_tensor(resampled_patch, orig_crop)

                # Alpha blend with feathered elliptical mask
                current_canvas = self.blender.blend_patch(
                    base_canvas=current_canvas,
                    refined_patch=resampled_patch,
                    region=region,
                    feather_radius=config.blend_feather,
                )
                refined_count += 1

            except Exception as e:
                LOGGER.warning("[H3 Studio FaceRefine] Error refining face %d: %s. Continuing with remaining faces.", idx + 1, e)

        elapsed = (time.perf_counter() - start_time) * 1000.0
        msg = f"Refined {refined_count}/{len(detected_boxes)} face(s) in {elapsed:.1f}ms ({config.mode.capitalize()} mode)."

        return FaceRefineResult(
            image=current_canvas,
            faces_detected=len(detected_boxes),
            faces_refined=refined_count,
            duration_ms=elapsed,
            status_message=msg,
            bounding_boxes=detected_boxes,
        )
