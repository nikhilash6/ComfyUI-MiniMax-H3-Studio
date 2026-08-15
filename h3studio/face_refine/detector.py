"""Object-oriented face detection backends with zero-crash fallback chain."""

from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from typing import Any, List, Optional

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None

try:
    import torch
except ImportError:  # pragma: no cover
    torch = None

from .geometry import BoundingBox

LOGGER = logging.getLogger("h3studio.face_refine.detector")


class FaceDetector(ABC):
    """Abstract base class for face detection backends."""

    @abstractmethod
    def detect(self, image: Any, min_face_size: int = 16) -> List[BoundingBox]:
        """
        Detect faces in the given image.
        image: [H, W, C] in [0, 1] (float32) or [0, 255] (uint8).
        Returns a list of BoundingBox objects.
        """
        raise NotImplementedError

    @property
    @abstractmethod
    def name(self) -> str:
        """Name of the detector backend."""
        raise NotImplementedError

    @property
    @abstractmethod
    def is_available(self) -> bool:
        """Return True if this detector backend is installed and operational."""
        raise NotImplementedError


class OpenCVHaarDetector(FaceDetector):
    """Zero-external-dependency face detector using OpenCV's built-in Haar cascades."""

    def __init__(self, scale_factor: float = 1.1, min_neighbors: int = 4) -> None:
        self.scale_factor = scale_factor
        self.min_neighbors = min_neighbors
        self._cascade = None
        self._initialized = False

    def _init_cascade(self) -> bool:
        if self._initialized:
            return self._cascade is not None
        self._initialized = True
        try:
            import cv2

            bundled_path = os.path.join(os.path.dirname(__file__), "data", "haarcascade_frontalface_default.xml")
            if os.path.exists(bundled_path):
                cascade_path = bundled_path
            else:
                cascade_path = os.path.join(getattr(cv2.data, "haarcascades", ""), "haarcascade_frontalface_default.xml")

            if os.path.exists(cascade_path):
                self._cascade = cv2.CascadeClassifier(cascade_path)
            else:
                LOGGER.warning("[H3 Studio FaceRefine] OpenCV Haar cascade xml not found at %s", cascade_path)
        except Exception as e:
            LOGGER.warning("[H3 Studio FaceRefine] OpenCV import error: %s", e)
            self._cascade = None
        return self._cascade is not None

    @property
    def name(self) -> str:
        return "OpenCV Haar"

    @property
    def is_available(self) -> bool:
        return self._init_cascade()

    def detect(self, image: Any, min_face_size: int = 16) -> List[BoundingBox]:
        if not self.is_available or self._cascade is None:
            return []

        import cv2

        if torch is not None and isinstance(image, torch.Tensor):
            if image.ndim == 4:
                image = image[0]
            img_np = (image.detach().cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
        elif np is not None and isinstance(image, np.ndarray):
            img_np = (image * 255.0).clip(0, 255).astype(np.uint8) if image.dtype == np.float32 else image
        else:
            return []

        if img_np.shape[-1] == 3:
            gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
        elif img_np.shape[-1] == 4:
            gray = cv2.cvtColor(img_np, cv2.COLOR_RGBA2GRAY)
        else:
            gray = img_np

        faces = self._cascade.detectMultiScale(
            gray,
            scaleFactor=self.scale_factor,
            minNeighbors=self.min_neighbors,
            minSize=(min_face_size, min_face_size),
        )

        boxes: List[BoundingBox] = []
        if faces is not None and len(faces) > 0:
            for x, y, w, h in faces:
                boxes.append(BoundingBox(x=int(x), y=int(y), width=int(w), height=int(h), confidence=0.9))

        return boxes


class YoloDetector(FaceDetector):
    """Optional deep-learning face detector using Ultralytics YOLOv8-face if installed."""

    def __init__(self, model_name: str = "yolov8n-face.pt", conf_thresh: float = 0.35) -> None:
        self.model_name = model_name
        self.conf_thresh = conf_thresh
        self._model = None
        self._checked = False

    @property
    def name(self) -> str:
        return "YOLO Face"

    @property
    def is_available(self) -> bool:
        if self._checked:
            return self._model is not None
        self._checked = True
        try:
            from ultralytics import YOLO

            self._model = YOLO(self.model_name)
        except Exception:
            self._model = None
        return self._model is not None

    def detect(self, image: Any, min_face_size: int = 16) -> List[BoundingBox]:
        if not self.is_available or self._model is None:
            return []

        if torch is not None and isinstance(image, torch.Tensor):
            if image.ndim == 4:
                image = image[0]
            img_np = (image.detach().cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
        elif np is not None and isinstance(image, np.ndarray):
            img_np = (image * 255.0).clip(0, 255).astype(np.uint8) if image.dtype == np.float32 else image
        else:
            return []

        results = self._model(img_np, conf=self.conf_thresh, verbose=False)
        boxes: List[BoundingBox] = []
        for r in results:
            for box in r.boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                conf = float(box.conf[0])
                w = int(round(x2 - x1))
                h = int(round(y2 - y1))
                if w >= min_face_size and h >= min_face_size:
                    boxes.append(BoundingBox(x=int(round(x1)), y=int(round(y1)), width=w, height=h, confidence=conf))
        return boxes


class MediaPipeDetector(FaceDetector):
    """Optional face detector using Google MediaPipe if installed."""

    def __init__(self, min_detection_confidence: float = 0.5) -> None:
        self.min_detection_confidence = min_detection_confidence
        self._detector = None
        self._checked = False

    @property
    def name(self) -> str:
        return "MediaPipe Face"

    @property
    def is_available(self) -> bool:
        if self._checked:
            return self._detector is not None
        self._checked = True
        try:
            import mediapipe as mp

            self._mp_face = mp.solutions.face_detection
            self._detector = self._mp_face.FaceDetection(
                model_selection=1,
                min_detection_confidence=self.min_detection_confidence,
            )
        except Exception:
            self._detector = None
        return self._detector is not None

    def detect(self, image: Any, min_face_size: int = 16) -> List[BoundingBox]:
        if not self.is_available or self._detector is None:
            return []

        if torch is not None and isinstance(image, torch.Tensor):
            if image.ndim == 4:
                image = image[0]
            img_np = (image.detach().cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
        elif np is not None and isinstance(image, np.ndarray):
            img_np = (image * 255.0).clip(0, 255).astype(np.uint8) if image.dtype == np.float32 else image
        else:
            return []

        h_img, w_img = img_np.shape[:2]
        results = self._detector.process(img_np)
        boxes: List[BoundingBox] = []

        if results.detections:
            for detection in results.detections:
                bbox = detection.location_data.relative_bounding_box
                x = max(0, int(round(bbox.xmin * w_img)))
                y = max(0, int(round(bbox.ymin * h_img)))
                w = min(w_img - x, int(round(bbox.width * w_img)))
                h = min(h_img - y, int(round(bbox.height * h_img)))
                conf = float(detection.score[0]) if detection.score else 0.8
                if w >= min_face_size and h >= min_face_size:
                    boxes.append(BoundingBox(x=x, y=y, width=w, height=h, confidence=conf))

        return boxes


class AutoFaceDetector(FaceDetector):
    """
    Composite detector fallback chain:
    Tries MediaPipe -> YOLO -> OpenCV Haar.
    If no backends are available, gracefully returns an empty list with a single log warning.
    """

    def __init__(self, detectors: Optional[List[FaceDetector]] = None) -> None:
        self.detectors = detectors or [
            MediaPipeDetector(),
            YoloDetector(),
            OpenCVHaarDetector(),
        ]
        self._active_detector: Optional[FaceDetector] = None

    @property
    def name(self) -> str:
        active = self.get_active_detector()
        return f"Auto ({active.name})" if active else "Auto (None available)"

    @property
    def is_available(self) -> bool:
        return self.get_active_detector() is not None

    def get_active_detector(self) -> Optional[FaceDetector]:
        if self._active_detector is not None and self._active_detector.is_available:
            return self._active_detector
        for d in self.detectors:
            if d.is_available:
                self._active_detector = d
                return d
        return None

    def detect(self, image: Any, min_face_size: int = 16) -> List[BoundingBox]:
        detector = self.get_active_detector()
        if not detector:
            LOGGER.warning("[H3 Studio FaceRefine] No face detection backend available; skipping face refinement gracefully.")
            return []
        return detector.detect(image, min_face_size=min_face_size)
