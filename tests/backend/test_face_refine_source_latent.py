"""Regression tests for genuine H3 img2img source-latent injection."""

from __future__ import annotations

import sys
import types

try:
    import pytest
except ImportError:
    pytest = None

if pytest:
    torch = pytest.importorskip("torch")
else:
    import torch

from h3studio.face_refine.sampling_bridge import _inject_source_video_latent


class FakeNestedTensor:
    def __init__(self, members):
        self._members = tuple(members)
        self.is_nested = True

    def unbind(self):
        return self._members


class FakeVideoVAE:
    def __init__(self):
        self.seen_frames = 0

    def encode(self, images):
        self.seen_frames = int(images.shape[0])
        # H3 Video-VAE image-batch convention [T,C,H,W]. The bridge converts
        # this to [1,C,T,H,W] and injects it into the AV NestedTensor.
        return torch.ones((2, 24, 4, 5), dtype=torch.float32)


def test_source_crop_replaces_zero_video_latent_and_locks_audio(monkeypatch) -> None:
    fake_nested_module = types.ModuleType("comfy.nested_tensor")
    fake_nested_module.NestedTensor = FakeNestedTensor
    fake_comfy = types.ModuleType("comfy")
    fake_comfy.nested_tensor = fake_nested_module
    monkeypatch.setitem(sys.modules, "comfy", fake_comfy)
    monkeypatch.setitem(sys.modules, "comfy.nested_tensor", fake_nested_module)

    video = torch.zeros((1, 24, 2, 4, 5), dtype=torch.float32)
    audio = torch.full((1, 8, 3), 7.0, dtype=torch.float32)
    latent = {
        "samples": FakeNestedTensor((video, audio)),
        "h3_context_frames": 5,
    }
    patch = torch.rand((1, 64, 80, 3), dtype=torch.float32)
    vae = FakeVideoVAE()

    out = _inject_source_video_latent(latent, patch, vae)
    out_video, out_audio = out["samples"].unbind()
    mask_video, mask_audio = out["noise_mask"].unbind()

    assert vae.seen_frames == 5
    assert torch.all(out_video == 1)
    assert torch.equal(out_audio, audio)
    assert torch.all(mask_video == 1)
    assert torch.all(mask_audio == 0)
    assert out["h3_face_refine_source_latent"] is True
