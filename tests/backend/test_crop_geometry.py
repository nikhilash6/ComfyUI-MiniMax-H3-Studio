"""Tests for CropContextManager and BoundingBox geometry operations."""

try:
    import pytest
except ImportError:
    pytest = None

if pytest:
    torch = pytest.importorskip("torch")
else:
    import torch

from h3studio.face_refine.geometry import BoundingBox, CropContextManager, CropRegion


def test_bounding_box_properties() -> None:
    box = BoundingBox(x=100, y=200, width=50, height=60, confidence=0.95)
    assert box.x2 == 150
    assert box.y2 == 260
    assert box.center_x == 125.0
    assert box.center_y == 230.0
    assert box.area == 3000
    assert box.max_dim == 60
    assert box.min_dim == 50
    assert abs(box.aspect_ratio - (50 / 60.0)) < 1e-4


def test_bounding_box_distance_classification() -> None:
    canvas_w, canvas_h = 1920, 1080
    small_box = BoundingBox(x=500, y=300, width=40, height=40)
    assert small_box.is_distant_face(canvas_w, canvas_h, threshold_ratio=0.04)

    large_box = BoundingBox(x=500, y=300, width=500, height=500)
    assert not large_box.is_distant_face(canvas_w, canvas_h, threshold_ratio=0.04)


def test_crop_context_manager_expansion_and_clamping() -> None:
    manager = CropContextManager(default_crop_factor=2.5, default_guide_size=768)
    canvas_w, canvas_h = 1000, 1000

    box = BoundingBox(x=450, y=450, width=100, height=100)
    region = manager.compute_crop_region(box, canvas_w, canvas_h, crop_factor=2.5, guide_size=768)

    assert region.width == 250
    assert region.height == 250
    assert region.x >= 0 and region.x2 <= canvas_w
    assert region.y >= 0 and region.y2 <= canvas_h

    edge_box = BoundingBox(x=0, y=0, width=80, height=80)
    edge_region = manager.compute_crop_region(edge_box, canvas_w, canvas_h, crop_factor=2.5, guide_size=768)

    assert edge_region.x >= 0
    assert edge_region.y >= 0
    assert edge_region.x2 <= canvas_w
    assert edge_region.y2 <= canvas_h


def test_extract_and_resize_back_tensor() -> None:
    manager = CropContextManager(default_crop_factor=2.0, default_guide_size=512)
    dummy_image = torch.ones((1, 800, 800, 3), dtype=torch.float32) * 0.5
    box = BoundingBox(x=200, y=200, width=100, height=100)
    region = manager.compute_crop_region(box, 800, 800, crop_factor=2.0, guide_size=512)

    crop_patch, (target_w, target_h) = manager.extract_crop_tensor(dummy_image, region)
    assert crop_patch.shape == (1, target_h, target_w, 3)
    assert target_w == 512 and target_h == 512

    downscaled = manager.resize_back_to_crop(crop_patch, region)
    assert downscaled.shape == (1, region.height, region.width, 3)
