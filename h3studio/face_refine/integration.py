"""Director integration for still-image H3 Face Refine.

This module intentionally patches the *boundaries* between the existing H3 Studio
nodes instead of forking the large generated workflow. The normal H3 sampler and
VAE decode stay unchanged. Face Refine receives the one still chosen by
``H3StudioFrameSelector`` and then performs a source-anchored FL2VA crop rerender.
"""

from __future__ import annotations

import logging
import os
import threading
import uuid
from collections import OrderedDict
from dataclasses import asdict
from typing import Any

from .pipeline import FaceRefineConfig, FaceRefineResult, H3FaceRefinePipeline

LOGGER = logging.getLogger("h3studio.face_refine.integration")
_INSTALL_LOCK = threading.RLock()
_INSTALLED = False
_RUNTIME_LOCK = threading.RLock()
_RUNTIME_CACHE: "OrderedDict[int, dict[str, Any]]" = OrderedDict()
_RUNTIME_CACHE_LIMIT = 12


def _remember_sampling(context: Any, *, model: Any, sampler: Any, sigmas: Any, info: str) -> None:
    if context is None:
        return
    key = id(context)
    with _RUNTIME_LOCK:
        _RUNTIME_CACHE[key] = {
            "model": model,
            "sampler": sampler,
            "sigmas": sigmas,
            "info": str(info or ""),
        }
        _RUNTIME_CACHE.move_to_end(key)
        while len(_RUNTIME_CACHE) > _RUNTIME_CACHE_LIMIT:
            _RUNTIME_CACHE.popitem(last=False)


def _sampling_for(context: Any) -> dict[str, Any]:
    if context is None:
        return {}
    with _RUNTIME_LOCK:
        value = _RUNTIME_CACHE.get(id(context))
        return dict(value) if value else {}


def _face_config(context: Any) -> FaceRefineConfig:
    generation = context.state.generation
    ui = dict(context.state.ui)
    advanced = ui.get("face_refine") if isinstance(ui.get("face_refine"), dict) else {}
    mode = str(generation.face_refine_mode or "off").lower()
    max_faces = 1 if mode == "auto" else max(1, min(16, int(advanced.get("max_faces", 4))))
    return FaceRefineConfig(
        mode=mode,
        crop_factor=float(generation.face_refine_crop_factor),
        guide_size=int(generation.face_refine_guide_size),
        denoise=float(generation.face_refine_denoise),
        blend_feather=max(2, min(96, int(advanced.get("blend_feather", 16)))),
        max_faces=max_faces,
        min_face_size=max(8, min(96, int(advanced.get("min_face_size", 16)))),
        auto_max_face_px=max(48, min(320, int(advanced.get("auto_max_face_px", 160)))),
        color_match=advanced.get("color_match", True) is not False,
        mask_mode="sam_auto" if str(advanced.get("mask_mode", "feather")).lower() in {"sam", "sam_auto", "sam if available"} else "feather",
        adaptive_denoise=advanced.get("adaptive_denoise", True) is not False,
    )


def _director_node_id(context: Any) -> str:
    try:
        value = dict(context.state.ui).get("director_node_id")
        return "" if value in (None, "") else str(value)
    except Exception:
        return ""


def _send_event(context: Any, payload: dict[str, Any]) -> None:
    node_id = _director_node_id(context)
    if not node_id:
        return
    try:
        from server import PromptServer

        server = getattr(PromptServer, "instance", None)
        if server is None:
            return
        message = {"node_id": node_id, **payload}
        client_id = getattr(server, "client_id", None)
        try:
            server.send_sync("h3studio-face-refine", message, client_id)
        except TypeError:
            server.send_sync("h3studio-face-refine", message)
    except Exception:
        LOGGER.debug("Face Refine UI event skipped", exc_info=True)


def _tensor_to_pil(image: Any):
    from PIL import Image
    import numpy as np

    tensor = image[0, ..., :3].detach().float().clamp(0, 1).cpu()
    array = (tensor.numpy() * 255.0).round().astype(np.uint8)
    return Image.fromarray(array, mode="RGB")


def _preview_font(size: int, *, bold: bool = False):
    from PIL import ImageFont

    names = ("DejaVuSans-Bold.ttf", "Arial Bold.ttf") if bold else ("DejaVuSans.ttf", "Arial.ttf")
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _draw_boxes(image, boxes, selected_boxes, scale: float):
    from PIL import ImageDraw

    draw = ImageDraw.Draw(image)
    selected = set(selected_boxes)
    for box in boxes:
        is_selected = box in selected
        stroke = (238, 184, 78) if is_selected else (132, 142, 150)
        width = 3 if is_selected else 2
        x0 = int(round(box.x * scale))
        y0 = int(round(box.y * scale))
        x1 = int(round(box.x2 * scale))
        y1 = int(round(box.y2 * scale))
        draw.rounded_rectangle((x0, y0, x1, y1), radius=max(2, width * 2), outline=stroke, width=width)
        if is_selected:
            label = f"{box.max_dim}px"
            tw = max(34, len(label) * 7)
            top = max(0, y0 - 19)
            draw.rounded_rectangle((x0, top, x0 + tw, top + 17), radius=4, fill=(20, 23, 26))
            draw.text((x0 + 5, top + 2), label, font=_preview_font(11, bold=True), fill=stroke)
    return image


def _build_comparison_canvas(
    source_img,
    refined_img,
    *,
    is_landscape: bool,
    panel_w: int,
    panel_h: int,
    mode: str,
    result: FaceRefineResult,
):
    from PIL import Image, ImageDraw

    gap = 14
    pad = 18
    header_h = 36
    footer_h = 42

    if is_landscape:
        canvas_w = panel_w + pad * 2
        canvas_h = header_h + panel_h + gap + header_h + panel_h + footer_h + pad * 2
        canvas = Image.new("RGB", (canvas_w, canvas_h), (17, 20, 23))
        draw = ImageDraw.Draw(canvas)

        # Top panel: BEFORE
        top_img_y = pad + header_h
        draw.text((pad, pad + 4), "SELECTED STILL · BEFORE", font=_preview_font(14, bold=True), fill=(220, 225, 229))
        canvas.paste(source_img, (pad, top_img_y))
        draw.rounded_rectangle((pad - 1, top_img_y - 1, pad + panel_w, top_img_y + panel_h), radius=5, outline=(62, 69, 75), width=1)

        # Bottom panel: AFTER
        bottom_header_y = top_img_y + panel_h + gap
        bottom_img_y = bottom_header_y + header_h
        draw.text((pad, bottom_header_y + 4), "AFTER H3 FACE REFINE", font=_preview_font(14, bold=True), fill=(220, 225, 229))
        canvas.paste(refined_img, (pad, bottom_img_y))
        draw.rounded_rectangle((pad - 1, bottom_img_y - 1, pad + panel_w, bottom_img_y + panel_h), radius=5, outline=(62, 69, 75), width=1)

        # Footer
        mask = "/".join(sorted(set(result.mask_modes))) if result.mask_modes else "feather"
        footer = (
            f"{str(mode).upper()} · {result.detector_name or 'detector unavailable'} · "
            f"{result.faces_selected} selected / {result.faces_refined} refined · {mask} · {result.duration_ms / 1000.0:.1f}s"
        )
        draw.text((pad, bottom_img_y + panel_h + 14), footer, font=_preview_font(12), fill=(169, 178, 185))
        return canvas
    else:
        canvas_w = panel_w * 2 + gap + pad * 2
        canvas_h = header_h + panel_h + footer_h + pad * 2
        canvas = Image.new("RGB", (canvas_w, canvas_h), (17, 20, 23))
        draw = ImageDraw.Draw(canvas)

        left_x = pad
        right_x = pad + panel_w + gap
        image_y = pad + header_h

        draw.text((left_x, pad + 4), "SELECTED STILL · BEFORE", font=_preview_font(14, bold=True), fill=(220, 225, 229))
        draw.text((right_x, pad + 4), "AFTER H3 FACE REFINE", font=_preview_font(14, bold=True), fill=(220, 225, 229))
        canvas.paste(source_img, (left_x, image_y))
        canvas.paste(refined_img, (right_x, image_y))
        draw.rounded_rectangle((left_x - 1, image_y - 1, left_x + panel_w, image_y + panel_h), radius=5, outline=(62, 69, 75), width=1)
        draw.rounded_rectangle((right_x - 1, image_y - 1, right_x + panel_w, image_y + panel_h), radius=5, outline=(62, 69, 75), width=1)

        mask = "/".join(sorted(set(result.mask_modes))) if result.mask_modes else "feather"
        footer = (
            f"{str(mode).upper()} · {result.detector_name or 'detector unavailable'} · "
            f"{result.faces_selected} selected / {result.faces_refined} refined · {mask} · {result.duration_ms / 1000.0:.1f}s"
        )
        draw.text((pad, image_y + panel_h + 14), footer, font=_preview_font(12), fill=(169, 178, 185))
        return canvas


def _save_visual_preview(before: Any, after: Any, result: FaceRefineResult, mode: str) -> dict[str, Any] | None:
    """Save marked and clean before/after diagnostics to ComfyUI's temp directory."""

    try:
        from PIL import Image
        import folder_paths

        source = _tensor_to_pil(before)
        refined = _tensor_to_pil(after)
        source_w, source_h = source.size
        is_landscape = (float(source_w) / max(1.0, float(source_h))) >= 1.15
        max_side = 840 if is_landscape else 640
        scale = min(1.0, max_side / max(source_w, source_h))
        target = (max(1, int(round(source_w * scale))), max(1, int(round(source_h * scale))))
        source_clean = source.resize(target, Image.Resampling.LANCZOS) if scale < 1.0 else source.copy()
        refined_clean = refined.resize(target, Image.Resampling.LANCZOS) if scale < 1.0 else refined.copy()

        source_marked = _draw_boxes(source_clean.copy(), result.bounding_boxes, result.selected_boxes, scale)
        refined_marked = _draw_boxes(refined_clean.copy(), result.bounding_boxes, result.selected_boxes, scale)

        panel_w, panel_h = target
        canvas_marked = _build_comparison_canvas(
            source_marked, refined_marked,
            is_landscape=is_landscape, panel_w=panel_w, panel_h=panel_h,
            mode=mode, result=result,
        )
        canvas_clean = _build_comparison_canvas(
            source_clean, refined_clean,
            is_landscape=is_landscape, panel_w=panel_w, panel_h=panel_h,
            mode=mode, result=result,
        )

        temp_root = folder_paths.get_temp_directory()
        subfolder = "h3studio_face_refine"
        directory = os.path.join(temp_root, subfolder)
        os.makedirs(directory, exist_ok=True)
        session_id = uuid.uuid4().hex[:12]
        filename_marked = f"face_refine_{session_id}.png"
        filename_clean = f"face_refine_{session_id}_clean.png"
        canvas_marked.save(os.path.join(directory, filename_marked), format="PNG", optimize=True)
        canvas_clean.save(os.path.join(directory, filename_clean), format="PNG", optimize=True)

        return {
            "filename": filename_marked,
            "clean_filename": filename_clean,
            "subfolder": subfolder,
            "type": "temp",
        }
    except Exception as exc:
        LOGGER.warning("[H3 Studio FaceRefine] Could not create visual inspection preview: %s", exc)
        return None


def _result_payload(result: FaceRefineResult, *, mode: str, status: str, preview: Any = None) -> dict[str, Any]:
    preview_clean = None
    if isinstance(preview, dict) and preview.get("clean_filename"):
        preview_clean = {
            "filename": preview["clean_filename"],
            "subfolder": preview.get("subfolder", ""),
            "type": preview.get("type", "temp"),
        }
    return {
        "status": status,
        "mode": str(mode),
        "message": result.status_message,
        "detected": int(result.faces_detected),
        "selected": int(result.faces_selected),
        "refined": int(result.faces_refined),
        "detector": str(result.detector_name or ""),
        "mask": ", ".join(sorted(set(result.mask_modes))) if result.mask_modes else "",
        "duration_ms": round(float(result.duration_ms), 1),
        "boxes": [asdict(box) for box in result.bounding_boxes],
        "failures": list(result.failures),
        "preview": preview,
        "preview_clean": preview_clean,
    }


def _install_condition_capture() -> None:
    from ..nodes.runtime import H3StudioRuntimeCondition

    if getattr(H3StudioRuntimeCondition.condition, "__h3_face_refine_capture__", False):
        return
    original = H3StudioRuntimeCondition.condition

    def condition(self, h3_bundle, studio_context):
        result = original(self, h3_bundle, studio_context)
        try:
            latent = result[3]
            if isinstance(latent, dict):
                latent["h3_studio_context"] = studio_context
                latent["h3_bundle"] = h3_bundle
                latent["h3_prompt"] = studio_context.prompt
                latent["h3_face_refine_mode"] = studio_context.state.generation.face_refine_mode
        except Exception:
            LOGGER.debug("Could not attach Face Refine context to H3 latent", exc_info=True)
        return result

    condition.__h3_face_refine_capture__ = True
    condition.__wrapped__ = original
    H3StudioRuntimeCondition.condition = condition


def _install_sampling_capture() -> None:
    from ..nodes.runtime import H3StudioRuntimeSamplingPreset

    if getattr(H3StudioRuntimeSamplingPreset.build, "__h3_face_refine_capture__", False):
        return
    original = H3StudioRuntimeSamplingPreset.build

    def build(self, model, studio_context):
        result = original(self, model, studio_context)
        try:
            _remember_sampling(
                studio_context,
                model=result[0],
                sampler=result[1],
                sigmas=result[2],
                info=result[3],
            )
        except Exception:
            LOGGER.debug("Could not remember final H3 sampling objects for Face Refine", exc_info=True)
        return result

    build.__h3_face_refine_capture__ = True
    build.__wrapped__ = original
    H3StudioRuntimeSamplingPreset.build = build


def _install_decode_bridge() -> None:
    from ..nodes.decode import H3StudioDecode
    from ..nodes.face_refine_node import FaceRefineSamplingRuntime

    if getattr(H3StudioDecode.decode, "__h3_face_refine_bridge__", False):
        return
    original = H3StudioDecode.decode

    def decode(self, samples, vae, *args, **kwargs):
        # The first implementation refined the entire decoded packet here. Force
        # that legacy block off, then carry its context to FrameSelector instead.
        decode_samples = dict(samples) if isinstance(samples, dict) else samples
        if isinstance(decode_samples, dict):
            decode_samples["h3_face_refine_mode"] = "off"
        result = original(self, decode_samples, vae, *args, **kwargs)
        try:
            if not isinstance(samples, dict):
                return result
            context = samples.get("h3_studio_context")
            bundle = samples.get("h3_bundle")
            if context is None:
                return result
            remembered = _sampling_for(context)
            runtime = FaceRefineSamplingRuntime(
                h3_bundle=bundle,
                studio_context=context,
                video_vae=getattr(bundle, "video_vae", None) or vae,
                sampling_model=remembered.get("model"),
                sampler=remembered.get("sampler"),
                sampling_profile=str(context.state.generation.sampling_profile),
                seed=int(context.seed),
                sampling_info=str(remembered.get("info") or ""),
            )
            frames = result[0]
            setattr(frames, "_h3studio_face_refine_runtime", runtime)
        except Exception:
            LOGGER.warning("[H3 Studio FaceRefine] Could not bridge Decode -> FrameSelector; refinement will be skipped.", exc_info=True)
        return result

    decode.__h3_face_refine_bridge__ = True
    decode.__wrapped__ = original
    H3StudioDecode.decode = decode


def _install_selector_refine() -> None:
    from ..nodes.image_runtime import H3StudioFrameSelector
    from ..nodes.face_refine_node import build_h3_face_sampler

    if getattr(H3StudioFrameSelector.select, "__h3_face_refine_selected_still__", False):
        return
    original = H3StudioFrameSelector.select

    def select(
        self,
        frames,
        strategy,
        manual_index,
        skip_first_frames,
        candidate_start,
        candidate_end,
        similarity_weight,
        top_k,
        source_image=None,
        emit_candidate_batch=False,
        recommended_index=None,
    ):
        runtime = getattr(frames, "_h3studio_face_refine_runtime", None)
        base_result = original(
            self,
            frames,
            strategy,
            manual_index,
            skip_first_frames,
            candidate_start,
            candidate_end,
            similarity_weight,
            top_k,
            source_image,
            emit_candidate_batch,
            recommended_index,
        )
        if runtime is None or runtime.studio_context is None:
            return base_result

        context = runtime.studio_context
        config = _face_config(context)
        if not config.is_enabled:
            return base_result

        primary, debug, selected_index, selected_score, report = base_result
        selected_index = max(0, min(int(frames.shape[0]) - 1, int(selected_index)))
        selected_before = frames[selected_index:selected_index + 1].clone()
        _send_event(context, {
            "status": "running",
            "mode": config.mode,
            "message": "Inspecting the selected still for small faces…",
            "detected": 0,
            "selected": 0,
            "refined": 0,
            "preview": None,
        })

        try:
            sampler_fn = build_h3_face_sampler(runtime=runtime, prompt=context.prompt)
            pipeline = H3FaceRefinePipeline()
            refine_result = pipeline.refine_image(selected_before, config, sampler_fn=sampler_fn)
            refined = refine_result.image

            if refine_result.faces_refined > 0:
                if int(primary.shape[0]) == int(frames.shape[0]):
                    primary = primary.clone()
                    primary[selected_index:selected_index + 1] = refined.to(primary.device, primary.dtype)
                else:
                    primary = refined
                # For fixed strategies debug is the chosen frame; for scored
                # strategies top-k is sorted best-first, so row 0 is selected.
                if getattr(debug, "ndim", 0) == 4 and int(debug.shape[0]) > 0:
                    debug = debug.clone()
                    debug[0:1] = refined.to(debug.device, debug.dtype)

            report = f"{report} {refine_result.status_message}"
            preview = _save_visual_preview(selected_before, refined, refine_result, config.mode)
            status = "done" if refine_result.faces_refined > 0 else "skipped"
            _send_event(context, _result_payload(refine_result, mode=config.mode, status=status, preview=preview))
            LOGGER.info("[H3 Studio FaceRefine] %s", refine_result.status_message)
            return primary, debug, selected_index, selected_score, report
        except Exception as exc:
            message = f"Face Refine failed after final-still selection: {type(exc).__name__}: {exc}. Original still preserved."
            LOGGER.exception("[H3 Studio FaceRefine] %s", message)
            failed = FaceRefineResult(
                image=selected_before,
                status_message=message,
                failures=[message],
            )
            preview = _save_visual_preview(selected_before, selected_before, failed, config.mode)
            _send_event(context, _result_payload(failed, mode=config.mode, status="error", preview=preview))
            return primary, debug, selected_index, selected_score, f"{report} {message}"

    select.__h3_face_refine_selected_still__ = True
    select.__wrapped__ = original
    H3StudioFrameSelector.select = select


def install() -> None:
    """Install the selected-still integration exactly once."""

    global _INSTALLED
    with _INSTALL_LOCK:
        if _INSTALLED:
            return
        _install_condition_capture()
        _install_sampling_capture()
        _install_decode_bridge()
        _install_selector_refine()
        _INSTALLED = True
        LOGGER.info("[H3 Studio] Face Refine integration: final-still stage enabled")


__all__ = ["install"]
