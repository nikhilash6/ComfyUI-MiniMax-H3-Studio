"""Tests for soft mask generation and FeatherBlender compositing."""

try:
    import pytest
except ImportError:
    pytest = None

if pytest:
    torch = pytest.importorskip("torch")
else:
    import torch

from h3studio.face_refine.geometry import BoundingBox, CropRegion
from h3studio.face_refine.masking import FeatherBlender, MaskGenerator


def test_elliptical_mask_properties() -> None:
    generator = MaskGenerator(default_feather_radius=16)
    box = BoundingBox(x=50, y=50, width=100, height=100)
    region = CropRegion(
        x=20,
        y=20,
        width=160,
        height=160,
        orig_box=box,
        canvas_width=500,
        canvas_height=500,
    )

    mask = generator.create_elliptical_mask(region, feather_radius=16)
    assert mask.shape == (160, 160)
    assert mask[80, 80].item() > 0.95
    assert mask[0, 0].item() < 0.05
    assert mask[159, 159].item() < 0.05


def test_feather_blender_compositing() -> None:
    blender = FeatherBlender()
    box = BoundingBox(x=100, y=100, width=50, height=50)
    region = CropRegion(
        x=50,
        y=50,
        width=150,
        height=150,
        orig_box=box,
        canvas_width=400,
        canvas_height=400,
    )

    base_canvas = torch.zeros((1, 400, 400, 3), dtype=torch.float32)
    refined_patch = torch.ones((1, 150, 150, 3), dtype=torch.float32)

    composited = blender.blend_patch(base_canvas, refined_patch, region, feather_radius=16)

    assert composited.shape == (1, 400, 400, 3)
    assert composited[0, 125, 125, 0].item() > 0.9
    assert composited[0, 10, 10, 0].item() == 0.0
