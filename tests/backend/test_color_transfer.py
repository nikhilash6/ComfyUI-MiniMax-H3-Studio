"""Tests for ReinhardColorTransfer in Lab color space."""

try:
    import pytest
except ImportError:
    pytest = None

if pytest:
    np = pytest.importorskip("numpy")
    torch = pytest.importorskip("torch")
else:
    import numpy as np
    import torch

from h3studio.face_refine.color import ReinhardColorTransfer


def test_reinhard_color_transfer_matches_distribution() -> None:
    transfer = ReinhardColorTransfer()

    source_tensor = torch.zeros((1, 100, 100, 3), dtype=torch.float32)
    source_tensor[:, :, :, 0] = 0.8  # Red
    source_tensor[:, :, :, 1] = 0.3  # Green
    source_tensor[:, :, :, 2] = 0.2  # Blue

    target_tensor = torch.zeros((1, 100, 100, 3), dtype=torch.float32)
    target_tensor[:, :, :, 0] = 0.1  # Red
    target_tensor[:, :, :, 1] = 0.2  # Green
    target_tensor[:, :, :, 2] = 0.9  # Blue

    result = transfer.transfer_tensor(target_tensor, source_tensor)

    assert result.shape == target_tensor.shape
    assert result.dtype == target_tensor.dtype
    assert result[0, 50, 50, 0].item() > target_tensor[0, 50, 50, 0].item()
    assert torch.all(result >= 0.0)
    assert torch.all(result <= 1.0)
