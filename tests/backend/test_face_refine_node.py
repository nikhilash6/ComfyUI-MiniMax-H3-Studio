"""Tests for H3StudioFaceRefine ComfyUI node."""

try:
    import pytest
except ImportError:
    pytest = None

if pytest:
    torch = pytest.importorskip("torch")
else:
    import torch

from h3studio.nodes.face_refine_node import H3StudioFaceRefine


def test_face_refine_node_execution() -> None:
    node = H3StudioFaceRefine()
    input_types = node.INPUT_TYPES()
    assert "image" in input_types["required"]
    assert "mode" in input_types["required"]

    canvas = torch.ones((1, 512, 512, 3), dtype=torch.float32)
    output_image, status = node.refine(
        image=canvas,
        mode="Off",
        crop_factor=2.5,
        guide_size=768,
        denoise=0.22,
        blend_feather=16,
        max_faces=4,
        color_match=True,
    )

    assert output_image.shape == canvas.shape
    assert isinstance(status, str)
