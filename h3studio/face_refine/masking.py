"""Soft mask generation, Gaussian edge feathering, and alpha composition blending."""

from __future__ import annotations

import math
from typing import Any, Tuple

try:
    import torch
    import torch.nn.functional as F
except ImportError:  # pragma: no cover
    torch = None
    F = None

from .geometry import CropRegion


class MaskGenerator:
    """Generates soft, elliptical, feathered masks tailored for face region blending."""

    def __init__(self, default_feather_radius: int = 16, falloff_power: float = 1.8) -> None:
        self.default_feather_radius = max(2, int(default_feather_radius))
        self.falloff_power = max(0.5, float(falloff_power))

    def create_elliptical_mask(
        self,
        region: CropRegion,
        feather_radius: int | None = None,
        face_coverage: float = 0.82,
    ) -> Any:
        """
        Create a 2D float tensor [H, W] with smooth elliptical values [0, 1].
        1.0 in the face center, smoothly falling off to 0.0 at the crop edges.
        """
        if torch is None or F is None:
            return None

        h, w = region.height, region.width
        radius = int(feather_radius or self.default_feather_radius)

        # Coordinate grids normalized to [-1, 1]
        y_grid = torch.linspace(-1.0, 1.0, steps=h, dtype=torch.float32)
        x_grid = torch.linspace(-1.0, 1.0, steps=w, dtype=torch.float32)
        mesh_y, mesh_x = torch.meshgrid(y_grid, x_grid, indexing="ij")

        # Elliptical normalized distance from center
        dist = torch.sqrt(mesh_x**2 + (mesh_y * 1.05) ** 2)

        # Inner radius threshold where mask is 1.0
        inner_r = max(0.2, face_coverage - (radius / float(max(h, w))))
        outer_r = min(1.0, face_coverage + (radius / float(max(h, w))))

        # Smooth Hermite/Cosine interpolation (smoothstep)
        t = torch.clamp((dist - inner_r) / max(1e-5, outer_r - inner_r), 0.0, 1.0)
        mask = 1.0 - (t * t * (3.0 - 2.0 * t))

        # Apply falloff power
        if self.falloff_power != 1.0:
            mask = torch.pow(mask, self.falloff_power)

        # Add Gaussian feathering pass if requested
        if radius > 0:
            mask = self._gaussian_blur_2d(mask, kernel_size=max(3, (radius * 2) | 1), sigma=float(radius) / 2.5)

        return mask

    def _gaussian_blur_2d(self, mask: Any, kernel_size: int, sigma: float) -> Any:
        """Apply a separable 2D Gaussian blur to a [H, W] mask tensor."""
        if torch is None or F is None:
            return mask
        k = kernel_size | 1
        x = torch.arange(k, dtype=torch.float32) - (k - 1) / 2.0
        kernel_1d = torch.exp(-(x**2) / (2.0 * max(1e-5, sigma) ** 2))
        kernel_1d = kernel_1d / kernel_1d.sum()

        kernel_2d = kernel_1d.view(1, 1, -1, 1)
        padding_h = k // 2

        # Reshape to [1, 1, H, W]
        img = mask.view(1, 1, mask.shape[0], mask.shape[1])
        # Vertical blur
        img = F.conv2d(img, kernel_2d, padding=(padding_h, 0))
        # Horizontal blur
        kernel_2d_h = kernel_1d.view(1, 1, 1, -1)
        padding_w = k // 2
        img = F.conv2d(img, kernel_2d_h, padding=(0, padding_w))

        return img.view(mask.shape[0], mask.shape[1])


class FeatherBlender:
    """Blends refined face patches back into the base canvas with feathered alpha masking."""

    def __init__(self, mask_generator: MaskGenerator | None = None) -> None:
        self.mask_generator = mask_generator or MaskGenerator()

    def blend_patch(
        self,
        base_canvas: Any,
        refined_patch: Any,
        region: CropRegion,
        feather_radius: int = 16,
    ) -> Any:
        """
        Composite the refined patch onto the base canvas.
        base_canvas: [B, H, W, C] in [0, 1]
        refined_patch: [B, crop_h, crop_w, C] in [0, 1]
        """
        if torch is None:
            return base_canvas

        output = base_canvas.clone()
        mask_2d = self.mask_generator.create_elliptical_mask(region, feather_radius=feather_radius)
        if mask_2d is None:
            output[:, region.y : region.y2, region.x : region.x2, :] = refined_patch
            return output

        mask_4d = mask_2d.view(1, region.height, region.width, 1).to(device=base_canvas.device, dtype=base_canvas.dtype)

        # Slice original region
        orig_crop = output[:, region.y : region.y2, region.x : region.x2, :]

        # Blend: blended = refined * mask + original * (1 - mask)
        blended = (refined_patch * mask_4d) + (orig_crop * (1.0 - mask_4d))

        output[:, region.y : region.y2, region.x : region.x2, :] = blended
        return output
