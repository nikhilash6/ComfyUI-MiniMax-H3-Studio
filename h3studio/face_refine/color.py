"""Reinhard statistical color matching in Lab color space to eliminate seam lines and lighting shifts."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Tuple

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None

try:
    import torch
except ImportError:  # pragma: no cover
    torch = None


@dataclass(frozen=True)
class ColorStats:
    """Statistical moments (mean and standard deviation) of an image patch."""

    mean: Any
    std: Any


class ReinhardColorTransfer:
    """
    Implements Reinhard et al. (2001) color transfer in Lab color space.
    Matches the mean and standard deviation of color channels so the refined
    face crop retains the exact ambient lighting, tint, and shadow temperature
    of the original image canvas.
    """

    def __init__(self, eps: float = 1e-6) -> None:
        self.eps = eps

    def _rgb_to_lab_np(self, rgb: Any) -> Any:
        """Convert float RGB [0, 1] to Lab color space."""
        if np is None:
            return rgb
        # RGB to XYZ matrix (sRGB standard)
        matrix = np.array(
            [
                [0.412453, 0.357580, 0.180423],
                [0.212671, 0.715160, 0.072169],
                [0.019334, 0.119193, 0.950227],
            ],
            dtype=np.float32,
        )
        xyz = np.dot(rgb, matrix.T)

        # Reference white D65
        xyz[:, :, 0] /= 0.950456
        xyz[:, :, 1] /= 1.000000
        xyz[:, :, 2] /= 1.088754

        delta = 6.0 / 29.0
        delta_cubed = delta**3

        mask = xyz > delta_cubed
        f_xyz = np.where(mask, np.cbrt(np.maximum(self.eps, xyz)), (xyz / (3.0 * delta**2)) + (4.0 / 29.0))

        l_chan = 116.0 * f_xyz[:, :, 1] - 16.0
        a_chan = 500.0 * (f_xyz[:, :, 0] - f_xyz[:, :, 1])
        b_chan = 200.0 * (f_xyz[:, :, 1] - f_xyz[:, :, 2])

        return np.stack([l_chan, a_chan, b_chan], axis=-1)

    def _lab_to_rgb_np(self, lab: Any) -> Any:
        """Convert Lab to float RGB [0, 1]."""
        if np is None:
            return lab
        l_chan = lab[:, :, 0]
        a_chan = lab[:, :, 1]
        b_chan = lab[:, :, 2]

        fy = (l_chan + 16.0) / 116.0
        fx = fy + (a_chan / 500.0)
        fz = fy - (b_chan / 200.0)

        delta = 6.0 / 29.0

        x = np.where(fx > delta, fx**3, 3.0 * (delta**2) * (fx - 4.0 / 29.0)) * 0.950456
        y = np.where(fy > delta, fy**3, 3.0 * (delta**2) * (fy - 4.0 / 29.0)) * 1.000000
        z = np.where(fz > delta, fz**3, 3.0 * (delta**2) * (fz - 4.0 / 29.0)) * 1.088754

        xyz = np.stack([x, y, z], axis=-1)

        # Inverse XYZ to RGB matrix
        inv_matrix = np.array(
            [
                [3.240479, -1.537150, -0.498535],
                [-0.969256, 1.875992, 0.041556],
                [0.055648, -0.204043, 1.057311],
            ],
            dtype=np.float32,
        )
        rgb = np.dot(xyz, inv_matrix.T)
        return np.clip(rgb, 0.0, 1.0)

    def compute_stats(self, lab: Any) -> ColorStats:
        """Compute mean and standard deviation across height and width."""
        if np is None:
            return ColorStats(mean=0, std=1)
        mean = np.mean(lab, axis=(0, 1), keepdims=True)
        std = np.std(lab, axis=(0, 1), keepdims=True)
        std = np.maximum(std, self.eps)
        return ColorStats(mean=mean, std=std)

    def transfer_numpy(self, target_rgb: Any, source_rgb: Any) -> Any:
        """
        Transfer color distribution of source_rgb (original crop) onto target_rgb (refined patch).
        Both images must be float32 in [0, 1] range.
        """
        if np is None:
            return target_rgb
        target_lab = self._rgb_to_lab_np(target_rgb)
        source_lab = self._rgb_to_lab_np(source_rgb)

        target_stats = self.compute_stats(target_lab)
        source_stats = self.compute_stats(source_lab)

        # Center target
        normalized = target_lab - target_stats.mean
        # Scale to match source variance
        scaled = normalized * (source_stats.std / target_stats.std)
        # Shift to source mean
        transferred_lab = scaled + source_stats.mean

        return self._lab_to_rgb_np(transferred_lab)

    def transfer_tensor(self, target_tensor: Any, source_tensor: Any) -> Any:
        """
        Apply Reinhard color transfer on PyTorch tensors [B, H, W, C] in [0, 1] range.
        """
        if torch is None or np is None:
            return target_tensor

        device = target_tensor.device
        dtype = target_tensor.dtype

        target_np = target_tensor.detach().cpu().numpy().astype(np.float32)
        source_np = source_tensor.detach().cpu().numpy().astype(np.float32)

        batch_size = target_np.shape[0]
        results = []

        for b in range(batch_size):
            t_img = target_np[b]
            s_img = source_np[b] if b < source_np.shape[0] else source_np[0]
            matched = self.transfer_numpy(t_img, s_img)
            results.append(matched)

        out_np = np.stack(results, axis=0)
        return torch.from_numpy(out_np).to(device=device, dtype=dtype)
