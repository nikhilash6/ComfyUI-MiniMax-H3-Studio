"""Face-aware feather masks plus optional Impact Pack SAM segmentation."""

from __future__ import annotations

import logging
from typing import Any, Optional

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None

try:
    import torch
    import torch.nn.functional as F
except ImportError:  # pragma: no cover
    torch = None
    F = None

from .geometry import CropRegion

LOGGER = logging.getLogger("h3studio.face_refine.masking")


class MaskGenerator:
    """Generate soft masks around the detected face rather than crop centre."""

    def __init__(self, default_feather_radius: int = 16, falloff_power: float = 1.0) -> None:
        self.default_feather_radius = max(2, int(default_feather_radius))
        self.falloff_power = max(0.5, float(falloff_power))

    @staticmethod
    def _gaussian_blur_2d(mask: Any, radius: int) -> Any:
        if torch is None or F is None or radius <= 0:
            return mask
        radius = max(1, int(radius))
        kernel_size = (radius * 2 + 1) | 1
        x = torch.arange(kernel_size, dtype=torch.float32, device=mask.device) - kernel_size // 2
        sigma = max(0.8, float(radius) / 2.5)
        kernel = torch.exp(-(x ** 2) / (2.0 * sigma ** 2))
        kernel /= kernel.sum()
        image = mask.view(1, 1, mask.shape[-2], mask.shape[-1])
        image = F.conv2d(image, kernel.view(1, 1, -1, 1), padding=(kernel_size // 2, 0))
        image = F.conv2d(image, kernel.view(1, 1, 1, -1), padding=(0, kernel_size // 2))
        return image[0, 0].clamp(0.0, 1.0)

    def create_face_region_mask(self, region: CropRegion, feather_radius: int | None = None) -> Any:
        """Create a grown, softly feathered rectangle around the detector bbox.

        The old implementation centered a giant ellipse on the crop. Near image
        boundaries or asymmetric crops that could replace unrelated background while
        missing part of the actual head. This mask is detector-anchored instead.
        """

        if torch is None:
            return None
        h, w = int(region.height), int(region.width)
        box = region.orig_box
        local_x = float(box.x - region.x)
        local_y = float(box.y - region.y)
        grow_x = max(4.0, float(box.width) * 0.28)
        grow_y = max(4.0, float(box.height) * 0.34)
        x0 = max(0, int(round(local_x - grow_x)))
        y0 = max(0, int(round(local_y - grow_y)))
        x1 = min(w, int(round(local_x + box.width + grow_x)))
        y1 = min(h, int(round(local_y + box.height + grow_y)))
        mask = torch.zeros((h, w), dtype=torch.float32)
        if x1 > x0 and y1 > y0:
            mask[y0:y1, x0:x1] = 1.0
        radius = int(feather_radius or self.default_feather_radius)
        mask = self._gaussian_blur_2d(mask, radius)
        if self.falloff_power != 1.0:
            mask = mask.pow(self.falloff_power)
        return mask

    def create_elliptical_mask(
        self,
        region: CropRegion,
        feather_radius: int | None = None,
        face_coverage: float = 0.82,
    ) -> Any:
        """Compatibility alias for the old public helper."""

        del face_coverage
        return self.create_face_region_mask(region, feather_radius)


class ImpactSAMMasker:
    """Lazy optional SAM integration through Impact Pack's registered SAMLoader.

    Face Refine never downloads SAM and Impact Pack remains optional. If a SAM
    checkpoint already exists in ``ComfyUI/models/sams`` and Impact Pack is loaded,
    the source crop is segmented. Any missing dependency or failed prediction simply
    returns ``None`` so the normal detector-anchored feather mask is used.
    """

    def __init__(self, threshold: float = 0.93) -> None:
        self.threshold = float(threshold)
        self._sam_model: Any = None
        self._attempted = False
        self._model_name = ""

    @staticmethod
    def _choose_model(names: list[str]) -> str | None:
        valid = [str(name) for name in names if str(name).lower().endswith((".pt", ".pth", ".safetensors"))]
        if not valid:
            return None
        preferences = (
            "sam2.1_hiera_tiny",
            "sam2_hiera_tiny",
            "sam_vit_b",
            "vit_b",
            "hiera_small",
            "hiera_base",
        )
        lowered = {name: name.lower() for name in valid}
        for token in preferences:
            for name in valid:
                if token in lowered[name] and "hq" not in lowered[name]:
                    return name
        return next((name for name in valid if "hq" not in lowered[name]), valid[0])

    def _load(self) -> Any:
        if self._attempted:
            return self._sam_model
        self._attempted = True
        try:
            import folder_paths
            import nodes

            loader_cls = getattr(nodes, "NODE_CLASS_MAPPINGS", {}).get("SAMLoader")
            if loader_cls is None:
                return None
            model_name = self._choose_model(list(folder_paths.get_filename_list("sams")))
            if not model_name:
                return None
            self._sam_model = loader_cls().load_model(model_name, "AUTO")[0]
            self._model_name = model_name
            LOGGER.info("[H3 Studio FaceRefine] Optional SAM enabled with %s", model_name)
        except Exception as exc:
            LOGGER.info("[H3 Studio FaceRefine] Optional SAM unavailable: %s", exc)
            self._sam_model = None
        return self._sam_model

    @property
    def model_name(self) -> str:
        return self._model_name

    def segment(self, crop_patch: Any, region: CropRegion) -> Optional[Any]:
        if torch is None or np is None or not isinstance(crop_patch, torch.Tensor):
            return None
        sam_model = self._load()
        if sam_model is None:
            return None

        image = crop_patch[0, ..., :3].detach().float().clamp(0, 1)
        guide_h, guide_w = int(image.shape[0]), int(image.shape[1])
        scale_x = guide_w / max(1.0, float(region.width))
        scale_y = guide_h / max(1.0, float(region.height))
        box = region.orig_box
        face_x = (float(box.x) - float(region.x)) * scale_x
        face_y = (float(box.y) - float(region.y)) * scale_y
        face_w = float(box.width) * scale_x
        face_h = float(box.height) * scale_y
        bbox = [
            max(0, int(round(face_x))),
            max(0, int(round(face_y))),
            min(guide_w, int(round(face_x + face_w))),
            min(guide_h, int(round(face_y + face_h))),
        ]
        point = [(
            max(0, min(guide_w - 1, int(round(face_x + face_w / 2.0)))),
            max(0, min(guide_h - 1, int(round(face_y + face_h / 2.0)))),
        )]
        sam_obj = getattr(sam_model, "sam_wrapper", sam_model)
        if hasattr(sam_obj, "prepare_device"):
            sam_obj.prepare_device()
        try:
            rgb = (image.cpu().numpy() * 255.0).astype(np.uint8)
            prediction = sam_obj.predict(rgb, point, [1], bbox, self.threshold)
            if prediction is None:
                return None
            if isinstance(prediction, torch.Tensor):
                raw = prediction
            elif isinstance(prediction, (list, tuple)) and prediction:
                raw = prediction[0]
            else:
                return None
            mask = torch.as_tensor(np.asarray(raw), dtype=torch.float32).squeeze()
            if mask.ndim != 2:
                return None
            return (mask > 0.5).float()
        finally:
            if hasattr(sam_obj, "release_device"):
                try:
                    sam_obj.release_device()
                except Exception:
                    pass


class FeatherBlender:
    """Composite an H3-refined crop through SAM or a face-aware feather mask."""

    def __init__(self, mask_generator: MaskGenerator | None = None) -> None:
        self.mask_generator = mask_generator or MaskGenerator()

    def blend_patch(
        self,
        base_canvas: Any,
        refined_patch: Any,
        region: CropRegion,
        feather_radius: int = 16,
        source_mask: Any = None,
    ) -> Any:
        if torch is None or F is None:
            return base_canvas

        output = base_canvas.clone()
        if source_mask is None:
            mask_2d = self.mask_generator.create_face_region_mask(region, feather_radius)
        else:
            mask_2d = torch.as_tensor(source_mask, dtype=torch.float32)
            if mask_2d.ndim > 2:
                mask_2d = mask_2d.squeeze()
            if tuple(mask_2d.shape[-2:]) != (region.height, region.width):
                mask_2d = F.interpolate(
                    mask_2d.view(1, 1, mask_2d.shape[-2], mask_2d.shape[-1]),
                    size=(region.height, region.width),
                    mode="bilinear",
                    align_corners=False,
                )[0, 0]
            # SAM gives a crisp source silhouette. Grow it slightly and feather the
            # edge so jaw/hair motion from the H3 rerender cannot reveal old pixels.
            dilation = max(2, min(12, int(round(region.orig_box.max_dim * 0.08))))
            kernel = dilation * 2 + 1
            mask_2d = F.max_pool2d(mask_2d.view(1, 1, region.height, region.width), kernel, 1, dilation)[0, 0]
            mask_2d = self.mask_generator._gaussian_blur_2d(mask_2d, max(2, feather_radius // 2))

        if mask_2d is None:
            output[:, region.y:region.y2, region.x:region.x2, :] = refined_patch
            return output

        mask_4d = mask_2d.view(1, region.height, region.width, 1).to(
            device=base_canvas.device,
            dtype=base_canvas.dtype,
        ).clamp(0.0, 1.0)
        original = output[:, region.y:region.y2, region.x:region.x2, :]
        refined = refined_patch.to(device=original.device, dtype=original.dtype)
        if refined.shape[-1] != original.shape[-1]:
            refined = refined[..., : original.shape[-1]]
        blended = refined * mask_4d + original * (1.0 - mask_4d)
        output[:, region.y:region.y2, region.x:region.x2, :] = blended
        return output
