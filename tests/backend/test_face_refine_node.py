"""Tests for H3StudioFaceRefine ComfyUI node and H3 sampler bridge."""

from dataclasses import dataclass
from typing import Any

try:
    import pytest
except ImportError:
    pytest = None

if pytest:
    torch = pytest.importorskip("torch")
else:
    import torch

from h3studio.face_refine.geometry import BoundingBox
from h3studio.face_refine.pipeline import FaceRefineConfig
from h3studio.nodes.face_refine_node import H3StudioFaceRefine, build_h3_face_sampler


class MockVAE:
    def encode(self, patch: torch.Tensor) -> dict[str, torch.Tensor]:
        return {"samples": patch.clone() * 0.5}

    def decode(self, latent: torch.Tensor) -> torch.Tensor:
        if isinstance(latent, dict):
            latent = latent.get("samples", latent)
        return latent * 2.0


class MockModel:
    pass


class MockBundle:
    def __init__(self) -> None:
        self.video_vae = MockVAE()
        self.model = MockModel()

    def model_for(self, route: str) -> MockModel:
        return self.model


def test_face_refine_node_input_types() -> None:
    node = H3StudioFaceRefine()
    input_types = node.INPUT_TYPES()
    assert "image" in input_types["required"]
    assert "mode" in input_types["required"]
    assert "h3_bundle" in input_types["optional"]


def test_face_refine_node_execution_off() -> None:
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

    assert output_image.shape == canvas.shape
    assert isinstance(status, str)
    assert "disabled" in status.lower()


def test_build_h3_face_sampler_with_bundle() -> None:
    bundle = MockBundle()
    sampler_fn = build_h3_face_sampler(h3_bundle=bundle, prompt="test face")
    assert callable(sampler_fn)

    crop = torch.ones((1, 512, 512, 3), dtype=torch.float32)
    config = FaceRefineConfig(mode="auto", denoise=0.22)
    refined = sampler_fn(crop, None, config)
    assert refined.shape == crop.shape
    assert isinstance(refined, torch.Tensor)


def test_face_refine_node_execution_with_bundle() -> None:
    node = H3StudioFaceRefine()
    bundle = MockBundle()
    canvas = torch.ones((1, 512, 512, 3), dtype=torch.float32)

    output_image, status = node.refine(
        image=canvas,
        mode="Auto",
        crop_factor=2.5,
        guide_size=512,
        denoise=0.22,
        blend_feather=16,
        max_faces=4,
        color_match=True,
        h3_bundle=bundle,
        prompt="photorealistic portrait",
    )

    assert output_image.shape == canvas.shape
    assert isinstance(status, str)
