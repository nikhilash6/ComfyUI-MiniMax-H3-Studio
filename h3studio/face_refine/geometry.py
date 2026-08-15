"""Geometry and coordinate transformations for face cropping and re-compositing."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Tuple

try:
    import torch
    import torch.nn.functional as F
except ImportError:  # pragma: no cover
    torch = None
    F = None


@dataclass(frozen=True)
class BoundingBox:
    """Represents a detected face bounding box in pixel coordinates."""

    x: int
    y: int
    width: int
    height: int
    confidence: float = 1.0

    @property
    def x2(self) -> int:
        return self.x + self.width

    @property
    def y2(self) -> int:
        return self.y + self.height

    @property
    def center_x(self) -> float:
        return self.x + self.width / 2.0

    @property
    def center_y(self) -> float:
        return self.y + self.height / 2.0

    @property
    def area(self) -> int:
        return self.width * self.height

    @property
    def max_dim(self) -> int:
        return max(self.width, self.height)

    @property
    def min_dim(self) -> int:
        return min(self.width, self.height)

    @property
    def aspect_ratio(self) -> float:
        return self.width / float(self.height) if self.height > 0 else 1.0

    def relative_to_canvas(self, canvas_width: int, canvas_height: int) -> float:
        """Calculate the ratio of the face area relative to the total canvas area."""
        total_canvas = float(max(1, canvas_width * canvas_height))
        return float(self.area) / total_canvas

    def is_distant_face(self, canvas_width: int, canvas_height: int, threshold_ratio: float = 0.04) -> bool:
        """Return True if the face occupies less than threshold_ratio of the canvas area."""
        return self.relative_to_canvas(canvas_width, canvas_height) < threshold_ratio


@dataclass(frozen=True)
class CropRegion:
    """Represents an expanded, boundary-clamped crop area around a face."""

    x: int
    y: int
    width: int
    height: int
    orig_box: BoundingBox
    canvas_width: int
    canvas_height: int
    guide_size: int = 768

    @property
    def x2(self) -> int:
        return self.x + self.width

    @property
    def y2(self) -> int:
        return self.y + self.height

    @property
    def target_size(self) -> Tuple[int, int]:
        """Compute the scaled target resolution (width, height) up to guide_size."""
        aspect = self.width / float(max(1, self.height))
        if aspect >= 1.0:
            target_w = self.guide_size
            target_h = max(64, int(round(self.guide_size / aspect)))
        else:
            target_h = self.guide_size
            target_w = max(64, int(round(self.guide_size * aspect)))
        # Align to multiple of 8 for diffusion autoencoders
        target_w = (target_w + 7) & ~7
        target_h = (target_h + 7) & ~7
        return target_w, target_h


class CropContextManager:
    """Manages context-aware face cropping, resampling, and spatial projection."""

    def __init__(self, default_crop_factor: float = 2.5, default_guide_size: int = 768) -> None:
        self.default_crop_factor = max(1.0, float(default_crop_factor))
        self.default_guide_size = max(128, int(default_guide_size))

    def compute_crop_region(
        self,
        box: BoundingBox,
        canvas_width: int,
        canvas_height: int,
        crop_factor: float | None = None,
        guide_size: int | None = None,
    ) -> CropRegion:
        """Calculate an expanded, aspect-preserving bounding box around the face."""
        factor = float(crop_factor or self.default_crop_factor)
        g_size = int(guide_size or self.default_guide_size)

        cx = box.center_x
        cy = box.center_y

        expanded_w = int(math.ceil(box.width * factor))
        expanded_h = int(math.ceil(box.height * factor))

        # Make it square or near-square for balanced face conditioning
        side = max(expanded_w, expanded_h)
        expanded_w = side
        expanded_h = side

        # Calculate bounding coordinates
        x1 = max(0, int(round(cx - expanded_w / 2.0)))
        y1 = max(0, int(round(cy - expanded_h / 2.0)))
        x2 = min(canvas_width, x1 + expanded_w)
        y2 = min(canvas_height, y1 + expanded_h)

        # Re-adjust start if clamped on right/bottom
        if x2 - x1 < expanded_w and x1 > 0:
            x1 = max(0, x2 - expanded_w)
        if y2 - y1 < expanded_h and y1 > 0:
            y1 = max(0, y2 - expanded_h)

        actual_w = max(16, x2 - x1)
        actual_h = max(16, y2 - y1)

        return CropRegion(
            x=x1,
            y=y1,
            width=actual_w,
            height=actual_h,
            orig_box=box,
            canvas_width=canvas_width,
            canvas_height=canvas_height,
            guide_size=g_size,
        )

    def extract_crop_tensor(self, image: Any, region: CropRegion) -> Tuple[Any, Tuple[int, int]]:
        """
        Extract the cropped region from a [B, H, W, C] or [B, C, H, W] tensor
        and upscale it to target guide resolution.
        """
        if torch is None or F is None:
            return image, region.target_size

        is_bhwc = getattr(image, "ndim", 0) == 4 and image.shape[-1] in (1, 3, 4)
        if is_bhwc:
            tensor_chw = image.permute(0, 3, 1, 2)
        else:
            tensor_chw = image

        # Slice crop region
        cropped = tensor_chw[:, :, region.y : region.y2, region.x : region.x2]

        target_w, target_h = region.target_size
        upscaled = F.interpolate(
            cropped,
            size=(target_h, target_w),
            mode="bicubic",
            align_corners=False,
            antialias=True,
        )

        if is_bhwc:
            return upscaled.permute(0, 2, 3, 1), (target_w, target_h)
        return upscaled, (target_w, target_h)

    def resize_back_to_crop(
        self,
        refined_tensor: Any,
        region: CropRegion,
    ) -> Any:
        """Downscale the refined patch back to the exact pixel size of the original crop region."""
        if torch is None or F is None:
            return refined_tensor

        is_bhwc = getattr(refined_tensor, "ndim", 0) == 4 and refined_tensor.shape[-1] in (1, 3, 4)
        if is_bhwc:
            tensor_chw = refined_tensor.permute(0, 3, 1, 2)
        else:
            tensor_chw = refined_tensor

        resampled = F.interpolate(
            tensor_chw,
            size=(region.height, region.width),
            mode="bicubic",
            align_corners=False,
            antialias=True,
        )

        if is_bhwc:
            return resampled.permute(0, 2, 3, 1)
        return resampled
