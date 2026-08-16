"""H3 Studio Face Refinement Subsystem."""

from __future__ import annotations

from .color import ColorStats, ReinhardColorTransfer
from .detector import (
    AutoFaceDetector,
    FaceDetector,
    MediaPipeDetector,
    OpenCVHaarDetector,
    YoloDetector,
)
from .geometry import BoundingBox, CropContextManager, CropRegion
from .masking import FeatherBlender, MaskGenerator
from .pipeline import FaceRefineConfig, FaceRefineResult, H3FaceRefinePipeline

__all__ = [
    "BoundingBox",
    "CropRegion",
    "CropContextManager",
    "ColorStats",
    "ReinhardColorTransfer",
    "MaskGenerator",
    "FeatherBlender",
    "FaceDetector",
    "OpenCVHaarDetector",
    "YoloDetector",
    "MediaPipeDetector",
    "AutoFaceDetector",
    "FaceRefineConfig",
    "FaceRefineResult",
    "H3FaceRefinePipeline",
]
