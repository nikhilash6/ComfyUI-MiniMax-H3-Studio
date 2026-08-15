"""Tests for FaceDetector backends and AutoFaceDetector fallback chain."""

try:
    import pytest
except ImportError:
    pytest = None

if pytest:
    torch = pytest.importorskip("torch")
else:
    import torch

from h3studio.face_refine.detector import AutoFaceDetector, FaceDetector, OpenCVHaarDetector
from h3studio.face_refine.geometry import BoundingBox


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


def test_auto_face_detector_fallback() -> None:
    mock = MockFaceDetector([BoundingBox(x=50, y=50, width=60, height=60)])
    auto = AutoFaceDetector(detectors=[mock])

    assert auto.is_available
    assert "Mock Detector" in auto.name

    dummy_img = torch.zeros((1, 400, 400, 3), dtype=torch.float32)
    boxes = auto.detect(dummy_img, min_face_size=20)
    assert len(boxes) == 1
    assert boxes[0].width == 60


def test_auto_face_detector_empty_graceful() -> None:
    class UnavailableDetector(FaceDetector):
        @property
        def name(self) -> str:
            return "Unavailable"

        @property
        def is_available(self) -> bool:
            return False

        def detect(self, image: torch.Tensor, min_face_size: int = 16) -> list[BoundingBox]:
            return []

    auto = AutoFaceDetector(detectors=[UnavailableDetector()])
    assert not auto.is_available
    dummy_img = torch.zeros((1, 400, 400, 3), dtype=torch.float32)
    boxes = auto.detect(dummy_img)
    assert boxes == []
