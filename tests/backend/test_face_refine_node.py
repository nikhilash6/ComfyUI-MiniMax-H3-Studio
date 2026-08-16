"""Contracts for the standalone Face Refine node and production sampler bridge."""

try:
    import pytest
except ImportError:
    pytest = None

if pytest:
    torch = pytest.importorskip("torch")
else:
    import torch

from h3studio.nodes.face_refine_node import H3StudioFaceRefine
from h3studio.face_refine.sampling_bridge import build_h3_face_sampler


def test_face_refine_node_input_types() -> None:
    node = H3StudioFaceRefine()
    input_types = node.INPUT_TYPES()
    assert "image" in input_types["required"]
    assert "mode" in input_types["required"]
    assert "h3_bundle" in input_types["optional"]
    assert "mask_mode" in input_types["required"]


def test_face_refine_node_execution_off_is_zero_cost_passthrough() -> None:
    node = H3StudioFaceRefine()
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
    assert output_image is canvas
    assert "disabled" in status.lower()


def test_sampler_refuses_incomplete_h3_runtime_instead_of_fake_refining() -> None:
    class IncompleteBundle:
        video_vae = object()

    sampler = build_h3_face_sampler(h3_bundle=IncompleteBundle(), prompt="face")
    assert sampler is None


def test_profile_for_fl2va_prefers_fast_lightx_4step() -> None:
    from h3studio.nodes.face_refine_node import _profile_for_fl2va

    profile, preserved = _profile_for_fl2va("lightx_v1_fl2v_8")
    assert profile in ("lightx_v1_fl2v_4_pruned", "lightx_er_sde_4")
    assert preserved is True

    profile_base, _ = _profile_for_fl2va("base_quality_20")
    assert profile_base == "base_quality_20"

