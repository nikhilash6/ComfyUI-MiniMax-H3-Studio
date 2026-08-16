"""Face detectors for H3 still-image refinement.

Priority is deliberate: a local YOLOv8-Face checkpoint (preferably
``face_yolov8m.pt``) is best suited to tiny/distant heads, then MediaPipe, then
the bundled OpenCV Haar cascade. Nothing in this module downloads a model.
"""

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
_YOLO_PREFERENCE = (
    "face_yolov8m.pt",
    "face_yolov8s.pt",
    "face_yolov8n.pt",
    "yolov8m-face.pt",
    "yolov8s-face.pt",
    "yolov8n-face.pt",
)


def _to_rgb8(image: Any):
    if np is None:
        return None
    if torch is not None and isinstance(image, torch.Tensor):
        if image.ndim == 4:
            image = image[0]
        array = image.detach().float().clamp(0, 1).cpu().numpy()
        return (array[..., :3] * 255.0).round().astype(np.uint8)
    if isinstance(image, np.ndarray):
        array = image
        if array.ndim == 4:
            array = array[0]
        if np.issubdtype(array.dtype, np.floating):
            array = (np.clip(array, 0, 1) * 255.0).round().astype(np.uint8)
        elif array.dtype != np.uint8:
            array = np.clip(array, 0, 255).astype(np.uint8)
        return array[..., :3]
    return None


def _dedupe(boxes: List[BoundingBox], iou_threshold: float = 0.55) -> List[BoundingBox]:
    """Small NMS helper for detector fallbacks without pulling in torchvision."""

    def iou(a: BoundingBox, b: BoundingBox) -> float:
        x0, y0 = max(a.x, b.x), max(a.y, b.y)
        x1, y1 = min(a.x2, b.x2), min(a.y2, b.y2)
        inter = max(0, x1 - x0) * max(0, y1 - y0)
        if inter <= 0:
            return 0.0
        return inter / float(max(1, a.area + b.area - inter))

    kept: List[BoundingBox] = []
    for box in sorted(boxes, key=lambda item: item.confidence, reverse=True):
        if all(iou(box, other) < iou_threshold for other in kept):
            kept.append(box)
    return kept


class FaceDetector(ABC):
    @abstractmethod
    def detect(self, image: Any, min_face_size: int = 16) -> List[BoundingBox]:
        raise NotImplementedError

    @property
    @abstractmethod
    def name(self) -> str:
        raise NotImplementedError

    @property
    @abstractmethod
    def is_available(self) -> bool:
        raise NotImplementedError


class ComfyUIYoloFaceDetector(FaceDetector):
    """Use Impact Subpack's model discovery/loader when it is installed.

    We still ask the loaded Ultralytics model for a larger inference canvas than
    its default when possible. That materially helps faces which are only tens of
    pixels in a multi-megapixel H3 still while preserving original coordinates.
    """

    def __init__(self, conf_thresh: float = 0.30, max_inference_size: int = 1280) -> None:
        self.conf_thresh = float(conf_thresh)
        self.max_inference_size = int(max_inference_size)
        self._bbox_detector = None
        self._model_name = ""
        self._checked = False

    @staticmethod
    def _choose(names: list[str]) -> str | None:
        if not names:
            return None
        normalized = {os.path.basename(str(name)).lower(): str(name) for name in names}
        for preferred in _YOLO_PREFERENCE:
            if preferred.lower() in normalized:
                return normalized[preferred.lower()]
        face_names = [str(name) for name in names if "face" in os.path.basename(str(name)).lower()]
        return face_names[0] if face_names else None

    def _load(self) -> bool:
        if self._checked:
            return self._bbox_detector is not None
        self._checked = True
        try:
            import folder_paths
            import nodes

            provider_cls = getattr(nodes, "NODE_CLASS_MAPPINGS", {}).get("UltralyticsDetectorProvider")
            if provider_cls is None or "ultralytics_bbox" not in getattr(folder_paths, "folder_names_and_paths", {}):
                return False
            model_name = self._choose(list(folder_paths.get_filename_list("ultralytics_bbox")))
            if not model_name:
                return False
            self._bbox_detector = provider_cls().doit(f"bbox/{model_name}")[0]
            self._model_name = os.path.basename(model_name)
            LOGGER.info("[H3 Studio FaceRefine] YOLO detector: %s via Impact Subpack", self._model_name)
        except Exception as exc:
            LOGGER.info("[H3 Studio FaceRefine] Impact YOLO unavailable: %s", exc)
            self._bbox_detector = None
        return self._bbox_detector is not None

    @property
    def name(self) -> str:
        model = self._model_name or "face model"
        return f"YOLOv8-Face ({model})"

    @property
    def is_available(self) -> bool:
        return self._load()

    def detect(self, image: Any, min_face_size: int = 16) -> List[BoundingBox]:
        if not self.is_available:
            return []
        rgb = _to_rgb8(image)
        if rgb is None:
            return []

        boxes: List[BoundingBox] = []
        model = getattr(self._bbox_detector, "bbox_model", None)
        if model is not None:
            try:
                long_edge = max(int(rgb.shape[0]), int(rgb.shape[1]))
                imgsz = min(self.max_inference_size, max(640, ((long_edge + 31) // 32) * 32))
                prediction = model(rgb, conf=self.conf_thresh, imgsz=imgsz, verbose=False)
                for result in prediction:
                    for raw in result.boxes:
                        x1, y1, x2, y2 = raw.xyxy[0].tolist()
                        width = int(round(x2 - x1))
                        height = int(round(y2 - y1))
                        if width >= min_face_size and height >= min_face_size:
                            boxes.append(
                                BoundingBox(
                                    x=max(0, int(round(x1))),
                                    y=max(0, int(round(y1))),
                                    width=width,
                                    height=height,
                                    confidence=float(raw.conf[0]),
                                )
                            )
                return _dedupe(boxes)
            except Exception as exc:
                LOGGER.debug("[H3 Studio FaceRefine] Large-canvas YOLO path fell back to provider API: %s", exc)

        # Provider API fallback uses the same safely loaded checkpoint.
        try:
            batch = image.unsqueeze(0) if torch is not None and isinstance(image, torch.Tensor) and image.ndim == 3 else image
            _shape, segments = self._bbox_detector.detect(
                batch,
                self.conf_thresh,
                0,
                1.0,
                max(1, int(min_face_size) - 1),
            )
            for segment in segments:
                y1, x1, y2, x2 = [float(value) for value in segment.bbox]
                width = int(round(x2 - x1))
                height = int(round(y2 - y1))
                if width >= min_face_size and height >= min_face_size:
                    boxes.append(
                        BoundingBox(
                            x=max(0, int(round(x1))),
                            y=max(0, int(round(y1))),
                            width=width,
                            height=height,
                            confidence=float(segment.confidence),
                        )
                    )
        except Exception as exc:
            LOGGER.warning("[H3 Studio FaceRefine] Impact YOLO detection failed: %s", exc)
        return _dedupe(boxes)


class LocalUltralyticsFaceDetector(FaceDetector):
    """Direct local YOLO fallback when Impact Subpack is not installed."""

    def __init__(self, conf_thresh: float = 0.30, max_inference_size: int = 1280) -> None:
        self.conf_thresh = float(conf_thresh)
        self.max_inference_size = int(max_inference_size)
        self._model = None
        self._model_name = ""
        self._checked = False

    @staticmethod
    def _candidate_paths() -> list[str]:
        candidates: list[str] = []
        try:
            import folder_paths

            if "ultralytics_bbox" in getattr(folder_paths, "folder_names_and_paths", {}):
                for name in folder_paths.get_filename_list("ultralytics_bbox"):
                    path = folder_paths.get_full_path("ultralytics_bbox", name)
                    if path:
                        candidates.append(path)
            models_dir = getattr(folder_paths, "models_dir", "")
            for root in (
                os.path.join(models_dir, "ultralytics", "bbox"),
                os.path.join(models_dir, "ultralytics"),
                os.path.join(models_dir, "face_detection"),
            ):
                for name in _YOLO_PREFERENCE:
                    candidates.append(os.path.join(root, name))
        except Exception:
            pass
        return list(dict.fromkeys(candidates))

    def _load(self) -> bool:
        if self._checked:
            return self._model is not None
        self._checked = True
        paths = [path for path in self._candidate_paths() if os.path.isfile(path)]
        if not paths:
            return False
        def rank(path: str) -> int:
            base = os.path.basename(path).lower()
            for index, preferred in enumerate(_YOLO_PREFERENCE):
                if base == preferred.lower():
                    return index
            return len(_YOLO_PREFERENCE)
        paths.sort(key=rank)
        try:
            from ultralytics import YOLO

            self._model = YOLO(paths[0])
            self._model_name = os.path.basename(paths[0])
            LOGGER.info("[H3 Studio FaceRefine] YOLO detector: %s (direct local loader)", self._model_name)
        except Exception as exc:
            LOGGER.info("[H3 Studio FaceRefine] Direct local YOLO unavailable: %s", exc)
            self._model = None
        return self._model is not None

    @property
    def name(self) -> str:
        return f"YOLOv8-Face ({self._model_name or 'local'})"

    @property
    def is_available(self) -> bool:
        return self._load()

    def detect(self, image: Any, min_face_size: int = 16) -> List[BoundingBox]:
        if not self.is_available:
            return []
        rgb = _to_rgb8(image)
        if rgb is None:
            return []
        long_edge = max(int(rgb.shape[0]), int(rgb.shape[1]))
        imgsz = min(self.max_inference_size, max(640, ((long_edge + 31) // 32) * 32))
        boxes: List[BoundingBox] = []
        try:
            for result in self._model(rgb, conf=self.conf_thresh, imgsz=imgsz, verbose=False):
                for raw in result.boxes:
                    x1, y1, x2, y2 = raw.xyxy[0].tolist()
                    width = int(round(x2 - x1))
                    height = int(round(y2 - y1))
                    if width >= min_face_size and height >= min_face_size:
                        boxes.append(BoundingBox(
                            x=max(0, int(round(x1))),
                            y=max(0, int(round(y1))),
                            width=width,
                            height=height,
                            confidence=float(raw.conf[0]),
                        ))
        except Exception as exc:
            LOGGER.warning("[H3 Studio FaceRefine] Direct YOLO detection failed: %s", exc)
        return _dedupe(boxes)


class MediaPipeDetector(FaceDetector):
    def __init__(self, min_detection_confidence: float = 0.45) -> None:
        self.min_detection_confidence = float(min_detection_confidence)
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
            self._detector = mp.solutions.face_detection.FaceDetection(
                model_selection=1,
                min_detection_confidence=self.min_detection_confidence,
            )
        except Exception:
            self._detector = None
        return self._detector is not None

    def detect(self, image: Any, min_face_size: int = 16) -> List[BoundingBox]:
        if not self.is_available:
            return []
        rgb = _to_rgb8(image)
        if rgb is None:
            return []
        height, width = rgb.shape[:2]
        result = self._detector.process(rgb)
        boxes: List[BoundingBox] = []
        for detection in result.detections or ():
            raw = detection.location_data.relative_bounding_box
            x = max(0, int(round(raw.xmin * width)))
            y = max(0, int(round(raw.ymin * height)))
            w = min(width - x, int(round(raw.width * width)))
            h = min(height - y, int(round(raw.height * height)))
            if w >= min_face_size and h >= min_face_size:
                boxes.append(BoundingBox(
                    x=x,
                    y=y,
                    width=w,
                    height=h,
                    confidence=float(detection.score[0]) if detection.score else 0.8,
                ))
        return _dedupe(boxes)


class OpenCVHaarDetector(FaceDetector):
    """Bundled zero-extra-model fallback; useful when no neural detector exists."""

    def __init__(self, scale_factor: float = 1.08, min_neighbors: int = 4) -> None:
        self.scale_factor = float(scale_factor)
        self.min_neighbors = int(min_neighbors)
        self._cascade = None
        self._initialized = False

    def _init(self) -> bool:
        if self._initialized:
            return self._cascade is not None
        self._initialized = True
        try:
            import cv2
            bundled = os.path.join(os.path.dirname(__file__), "data", "haarcascade_frontalface_default.xml")
            path = bundled if os.path.isfile(bundled) else os.path.join(
                getattr(cv2.data, "haarcascades", ""), "haarcascade_frontalface_default.xml"
            )
            if os.path.isfile(path):
                cascade = cv2.CascadeClassifier(path)
                self._cascade = None if cascade.empty() else cascade
        except Exception as exc:
            LOGGER.info("[H3 Studio FaceRefine] OpenCV Haar unavailable: %s", exc)
            self._cascade = None
        return self._cascade is not None

    @property
    def name(self) -> str:
        return "OpenCV Haar fallback"

    @property
    def is_available(self) -> bool:
        return self._init()

    def detect(self, image: Any, min_face_size: int = 16) -> List[BoundingBox]:
        if not self.is_available:
            return []
        import cv2
        rgb = _to_rgb8(image)
        if rgb is None:
            return []
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        raw_faces = self._cascade.detectMultiScale(
            gray,
            scaleFactor=self.scale_factor,
            minNeighbors=self.min_neighbors,
            minSize=(int(min_face_size), int(min_face_size)),
        )
        return [
            BoundingBox(int(x), int(y), int(w), int(h), 0.55)
            for x, y, w, h in raw_faces
            if int(w) >= min_face_size and int(h) >= min_face_size
        ]


# Backwards-compatible name used by the first implementation/tests.
YoloDetector = ComfyUIYoloFaceDetector


class AutoFaceDetector(FaceDetector):
    """YOLOv8-Face -> local YOLO -> MediaPipe -> bundled Haar, with zero-crash fallback."""

    def __init__(self, detectors: Optional[List[FaceDetector]] = None) -> None:
        self.detectors = detectors or [
            ComfyUIYoloFaceDetector(),
            LocalUltralyticsFaceDetector(),
            MediaPipeDetector(),
            OpenCVHaarDetector(),
        ]
        self._last_detector: Optional[FaceDetector] = None
        self._warned_none = False

    @property
    def name(self) -> str:
        if self._last_detector is not None:
            return self._last_detector.name
        available = next((detector for detector in self.detectors if detector.is_available), None)
        return available.name if available else "No detector"

    @property
    def is_available(self) -> bool:
        return any(detector.is_available for detector in self.detectors)

    def get_active_detector(self) -> Optional[FaceDetector]:
        if self._last_detector is not None and self._last_detector.is_available:
            return self._last_detector
        return next((detector for detector in self.detectors if detector.is_available), None)

    def detect(self, image: Any, min_face_size: int = 16) -> List[BoundingBox]:
        had_backend = False
        for detector in self.detectors:
            if not detector.is_available:
                continue
            had_backend = True
            try:
                boxes = detector.detect(image, min_face_size=min_face_size)
            except Exception as exc:
                LOGGER.warning("[H3 Studio FaceRefine] %s failed: %s", detector.name, exc)
                continue
            if boxes:
                self._last_detector = detector
                return boxes
        if not had_backend and not self._warned_none:
            self._warned_none = True
            LOGGER.warning(
                "[H3 Studio FaceRefine] No face detector is available. Install Impact Subpack + face_yolov8m.pt "
                "for best distant-face detection; Face Refine will leave the image unchanged."
            )
        return []


__all__ = [
    "AutoFaceDetector",
    "ComfyUIYoloFaceDetector",
    "FaceDetector",
    "LocalUltralyticsFaceDetector",
    "MediaPipeDetector",
    "OpenCVHaarDetector",
    "YoloDetector",
]
