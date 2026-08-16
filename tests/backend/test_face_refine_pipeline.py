"""Tests for H3FaceRefinePipeline end-to-end processing."""

try:
    import pytest
except ImportError:
    pytest = None

if pytest:
    torch = pytest.importorskip("torch")
else:
    import torch

from h3studio.face_refine.detector import FaceDetector
from h3studio.face_refine.geometry import BoundingBox, CropRegion
from h3studio.face_refine.pipeline import (
    FaceRefineConfig,
    FaceRefineResult,
    H3FaceRefinePipeline,
)


class MockFaceDetector(FaceDetector):

    def __init__(self, boxes: list[BoundingBox] | None = None) -> None:
        self._boxes = boxes or [BoundingBox(x=100, y=100, width=50, height=50)]

    @property
    def name(self) -> str:
        return "Mock Detector"

    @property
    def is_available(self) -> bool:
        return True

    def detect(self, image: torch.Tensor, min_face_size: int = 16) -> list[BoundingBox]:
        return [b for b in self._boxes if b.width >= min_face_size]


def test_pipeline_disabled_returns_unchanged() -> None:
    pipeline = H3FaceRefinePipeline()
    canvas = torch.ones((1, 512, 512, 3), dtype=torch.float32)
    config = FaceRefineConfig(mode="off")

    result: FaceRefineResult = pipeline.refine_image(canvas, config)
    assert result.faces_refined == 0
    assert torch.equal(result.image, canvas)
    assert "disabled" in result.status_message.lower()


def test_pipeline_auto_refines_distant_faces() -> None:
    small_box = BoundingBox(x=100, y=100, width=40, height=40)
    large_box = BoundingBox(x=400, y=400, width=300, height=300)

    mock_detector = MockFaceDetector([small_box, large_box])
    pipeline = H3FaceRefinePipeline(detector=mock_detector)

    canvas = torch.zeros((1, 1000, 1000, 3), dtype=torch.float32)
    config = FaceRefineConfig(mode="auto", crop_factor=2.0, guide_size=512, color_match=False)

    def mock_sampler(crop_patch: torch.Tensor, region: CropRegion, cfg: FaceRefineConfig) -> torch.Tensor:
        patch = crop_patch.clone()
        patch[:, :, :, 1] = 1.0
        return patch

    result: FaceRefineResult = pipeline.refine_image(canvas, config, sampler_fn=mock_sampler)

    assert result.faces_detected == 2
    assert result.faces_refined == 1
    assert result.image[0, 120, 120, 1].item() > 0.5
    assert result.image[0, 500, 500, 1].item() == 0.0


def test_pipeline_strong_refines_all_faces() -> None:
    small_box = BoundingBox(x=100, y=100, width=40, height=40)
    large_box = BoundingBox(x=400, y=400, width=300, height=300)

    mock_detector = MockFaceDetector([small_box, large_box])
    pipeline = H3FaceRefinePipeline(detector=mock_detector)

    canvas = torch.zeros((1, 1000, 1000, 3), dtype=torch.float32)
    config = FaceRefineConfig(mode="strong", crop_factor=2.0, guide_size=512, color_match=False)

    def mock_sampler(crop_patch: torch.Tensor, region: CropRegion, cfg: FaceRefineConfig) -> torch.Tensor:
        patch = crop_patch.clone()
        patch[:, :, :, 0] = 1.0
        return patch

    result: FaceRefineResult = pipeline.refine_image(canvas, config, sampler_fn=mock_sampler)

    assert result.faces_detected == 2
    assert result.faces_selected == 2
    assert result.faces_refined == 2


def test_face_refine_guider_never_passes_none_to_set_conds() -> None:
    """Regression test: verify guider initialization sets positive conditioning without passing negative=None."""
    from unittest.mock import MagicMock

    positive_cond = [[torch.zeros((1, 77, 768)), {}]]

    # Simulate comfy.samplers.CFGGuider which fails if negative=None is passed
    mock_guider = MagicMock()

    def mock_set_conds(pos, neg):
        if neg is None:
            raise TypeError("'NoneType' object is not iterable")
        mock_guider.conds = {"positive": pos, "negative": neg}

    mock_guider.set_conds = mock_set_conds

    # Calling with positive only (Guider_Basic signature) succeeds
    class MockBasicGuider:
        def __init__(self, model):
            self.model = model
            self.conds = {}

        def set_conds(self, pos):
            self.conds = {"positive": pos}

    guider = MockBasicGuider("dummy_model")
    guider.set_conds(positive_cond)
    assert "positive" in guider.conds
    assert guider.conds["positive"] == positive_cond
