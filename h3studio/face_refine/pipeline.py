"""H3 face-refinement pipeline: detect, crop, rerender, mask, colour-match, blend."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable, List, Optional

try:
    import torch
except ImportError:  # pragma: no cover
    torch = None

from .color import ReinhardColorTransfer
from .detector import AutoFaceDetector, FaceDetector
from .geometry import BoundingBox, CropContextManager, CropRegion
from .masking import FeatherBlender, ImpactSAMMasker

LOGGER = logging.getLogger("h3studio.face_refine.pipeline")


@dataclass
class FaceRefineConfig:
    """Configuration for one selected still-image face-refine pass."""

    mode: str = "auto"  # off | auto | strong
    crop_factor: float = 2.5
    guide_size: int = 768
    denoise: float = 0.22
    blend_feather: int = 16
    max_faces: int = 4
    min_face_size: int = 16
    auto_max_face_px: int = 160
    color_match: bool = True
    mask_mode: str = "feather"  # feather | sam_auto
    adaptive_denoise: bool = True

    @property
    def is_enabled(self) -> bool:
        return self.mode.lower() in ("auto", "strong")

    def effective_denoise(self, face_px: int) -> float:
        """Scale synthesis strength by source-face size.

        Tiny faces contain little trustworthy detail and need H3 to synthesize more;
        larger faces already contain useful identity/detail and should be changed less.
        The curve is intentionally more conservative than the video pack's 1.0 -> 0.35
        multiplier because this still-image pass must preserve identity in one frame.
        """

        base = max(0.05, min(0.80, float(self.denoise)))
        if not self.adaptive_denoise:
            return base
        px = max(1.0, float(face_px))
        tiny = max(base, 0.58 if self.mode.lower() == "strong" else 0.52)
        large = min(base, 0.22)
        if px <= 32.0:
            return tiny
        if px >= 120.0:
            return large
        t = (px - 32.0) / (120.0 - 32.0)
        t = t * t * (3.0 - 2.0 * t)
        return tiny + (large - tiny) * t


@dataclass
class FaceRefineResult:
    image: Any
    faces_detected: int = 0
    faces_selected: int = 0
    faces_refined: int = 0
    duration_ms: float = 0.0
    status_message: str = ""
    bounding_boxes: List[BoundingBox] = field(default_factory=list)
    selected_boxes: List[BoundingBox] = field(default_factory=list)
    failures: List[str] = field(default_factory=list)
    mask_modes: List[str] = field(default_factory=list)
    detector_name: str = ""


SamplerFn = Callable[[Any, CropRegion, FaceRefineConfig], Any]


class H3FaceRefinePipeline:
    """Still-image face detailer specialized for H3's source-anchored FL2VA path."""

    def __init__(
        self,
        detector: Optional[FaceDetector] = None,
        crop_manager: Optional[CropContextManager] = None,
        color_transfer: Optional[ReinhardColorTransfer] = None,
        blender: Optional[FeatherBlender] = None,
        sam_masker: Optional[ImpactSAMMasker] = None,
    ) -> None:
        self.detector = detector or AutoFaceDetector()
        self.crop_manager = crop_manager or CropContextManager()
        self.color_transfer = color_transfer or ReinhardColorTransfer()
        self.blender = blender or FeatherBlender()
        self.sam_masker = sam_masker or ImpactSAMMasker()

    def filter_faces(
        self,
        boxes: List[BoundingBox],
        canvas_width: int,
        canvas_height: int,
        config: FaceRefineConfig,
    ) -> List[BoundingBox]:
        """Auto targets genuinely small heads; Strong targets every detected face."""

        if not boxes:
            return []
        if config.mode.lower() != "auto":
            return sorted(boxes, key=lambda b: b.confidence, reverse=True)[: config.max_faces]

        # A pure canvas-area threshold treated surprisingly large portrait faces as
        # "distant" on 4 MP images. Use source-pixel head size with a proportional
        # cap so the rule scales down on native 768p canvases.
        short_edge_cap = max(48, int(round(min(canvas_width, canvas_height) * 0.14)))
        max_px = min(max(48, int(config.auto_max_face_px)), short_edge_cap)
        selected = [box for box in boxes if box.max_dim <= max_px]
        return sorted(selected, key=lambda b: (b.max_dim, -b.confidence))[: config.max_faces]

    def _mask_for_crop(self, crop_patch: Any, region: CropRegion, config: FaceRefineConfig):
        if config.mask_mode != "sam_auto":
            return None, "feather"
        try:
            mask = self.sam_masker.segment(crop_patch, region)
            if mask is not None:
                return mask, "SAM"
        except Exception as exc:
            LOGGER.warning("[H3 Studio FaceRefine] SAM mask failed; using feathered face mask: %s", exc)
        return None, "feather fallback"

    def refine_image(
        self,
        image_tensor: Any,
        config: FaceRefineConfig,
        sampler_fn: Optional[SamplerFn] = None,
    ) -> FaceRefineResult:
        start_time = time.perf_counter()

        if not config.is_enabled:
            return FaceRefineResult(image=image_tensor, status_message="Face Refine is disabled (Off).")
        if getattr(image_tensor, "ndim", 0) != 4 or int(image_tensor.shape[0]) != 1:
            return FaceRefineResult(
                image=image_tensor,
                status_message="Face Refine expects exactly one selected still [1,H,W,C].",
            )
        if sampler_fn is None:
            return FaceRefineResult(
                image=image_tensor,
                status_message="Face Refine skipped: a valid H3 FL2VA sampler was not available; original still preserved.",
            )

        _batch, h, w, _channels = image_tensor.shape
        detected_boxes = self.detector.detect(image_tensor[0], min_face_size=config.min_face_size)
        detector_name = self.detector.name
        if not detected_boxes:
            elapsed = (time.perf_counter() - start_time) * 1000.0
            return FaceRefineResult(
                image=image_tensor,
                duration_ms=elapsed,
                status_message=f"No faces detected ({detector_name}).",
                detector_name=detector_name,
            )

        faces_to_refine = self.filter_faces(detected_boxes, w, h, config)
        if not faces_to_refine:
            elapsed = (time.perf_counter() - start_time) * 1000.0
            return FaceRefineResult(
                image=image_tensor,
                faces_detected=len(detected_boxes),
                duration_ms=elapsed,
                status_message=(
                    f"Detected {len(detected_boxes)} face(s) with {detector_name}; none are small enough for Auto."
                ),
                bounding_boxes=detected_boxes,
                detector_name=detector_name,
            )

        current_canvas = image_tensor.clone()
        refined_count = 0
        failures: list[str] = []
        mask_modes: list[str] = []

        for index, box in enumerate(faces_to_refine):
            try:
                region = self.crop_manager.compute_crop_region(
                    box=box,
                    canvas_width=w,
                    canvas_height=h,
                    crop_factor=config.crop_factor,
                    guide_size=config.guide_size,
                )
                crop_patch, _target_size = self.crop_manager.extract_crop_tensor(current_canvas, region)
                source_mask, mask_label = self._mask_for_crop(crop_patch, region, config)
                refined_patch = sampler_fn(crop_patch, region, config)
                if not isinstance(refined_patch, torch.Tensor) or refined_patch.ndim != 4 or refined_patch.shape[0] < 1:
                    raise RuntimeError("H3 sampler returned an invalid image tensor")
                refined_patch = refined_patch[:1, ..., :3]
                resampled_patch = self.crop_manager.resize_back_to_crop(refined_patch, region)
                original_crop = current_canvas[:, region.y:region.y2, region.x:region.x2, :3]
                if config.color_match:
                    resampled_patch = self.color_transfer.transfer_tensor(resampled_patch, original_crop)
                current_canvas = self.blender.blend_patch(
                    base_canvas=current_canvas,
                    refined_patch=resampled_patch,
                    region=region,
                    feather_radius=config.blend_feather,
                    source_mask=source_mask,
                )
                refined_count += 1
                mask_modes.append(mask_label)
            except Exception as exc:
                failures.append(f"face {index + 1}: {type(exc).__name__}: {exc}")
                LOGGER.warning(
                    "[H3 Studio FaceRefine] Face %d/%d failed and was left unchanged: %s",
                    index + 1,
                    len(faces_to_refine),
                    exc,
                )

        elapsed = (time.perf_counter() - start_time) * 1000.0
        mask_summary = ",".join(sorted(set(mask_modes))) if mask_modes else "n/a"
        message = (
            f"Face Refine: detected={len(detected_boxes)}, selected={len(faces_to_refine)}, "
            f"refined={refined_count}, detector={detector_name}, mask={mask_summary}, {elapsed:.0f}ms."
        )
        if failures:
            message += f" {len(failures)} failure(s); failed faces were preserved unchanged."
        return FaceRefineResult(
            image=current_canvas,
            faces_detected=len(detected_boxes),
            faces_selected=len(faces_to_refine),
            faces_refined=refined_count,
            duration_ms=elapsed,
            status_message=message,
            bounding_boxes=detected_boxes,
            selected_boxes=faces_to_refine,
            failures=failures,
            mask_modes=mask_modes,
            detector_name=detector_name,
        )
