"""Consolidated H3 Studio integrity, prompt, conditioning, PNG, and preview fixes.

This module intentionally patches the already-registered runtime in one place so
recent UI/runtime compatibility layers do not fight each other.  It keeps the
working GGUF residency policy untouched while fixing the remaining product-level
regressions: raw mention repair, truncated reference mappings, guided-T2I prompt
truthfulness, smaller semantic reference copies for the 32B text encoder,
restorable enhanced prompts in saved PNG workflows, and high-resolution TAEH3
preview artifacts caused by variance-destroying latent interpolation.
"""

from __future__ import annotations

import logging
import time
from contextlib import suppress
from dataclasses import replace
from typing import Any

LOGGER = logging.getLogger(__name__)
_MARKER = "__h3studio_consolidated_integrity_v18__"


def _compact(value: Any) -> str:
    return " ".join(str(value or "").split())


def _repair_missing_mentions_clean(candidate: str, original_prompt: str) -> tuple[str, list[int]]:
    """Keep missing @Image tags without pasting raw/truncated user clauses back in."""

    from .references import mention_ordinals

    required = set(mention_ordinals(original_prompt))
    present = set(mention_ordinals(candidate))
    missing = sorted(required - present)
    if not missing:
        return _compact(candidate), []

    bindings = "; ".join(
        f"@Image{ordinal} remains the same numbered visual source requested by the user"
        for ordinal in missing
    )
    repaired = _compact(f"{candidate} Reference bindings: {bindings}.")
    return repaired, missing


def _ordered_mentions_clean(text: str, references) -> str:
    """Enforce exact ordered tags without lossy source summaries or ellipses."""

    value = _compact(text)
    refs = tuple(references)
    if not refs:
        return value

    required = [int(getattr(ref, "ordinal", index) or index) for index, ref in enumerate(refs, start=1)]
    lower = value.casefold()
    missing = [ordinal for ordinal in required if f"@image{ordinal}" not in lower]
    if not missing:
        return value

    clause = "; ".join(f"@Image{ordinal} = visual source {ordinal}" for ordinal in missing)
    return _compact(f"{value} Reference bindings: {clause}. User-requested edits override conflicting source traits.")


def _semantic_copy(image: Any, max_edge: int = 512) -> Any:
    """Downscale only the 32B semantic copy; FL2VA VAE/keyframe pixels stay full resolution."""

    try:
        import torch
        import torch.nn.functional as F

        if not isinstance(image, torch.Tensor) or image.ndim != 4:
            return image
        height, width = int(image.shape[1]), int(image.shape[2])
        longest = max(height, width)
        if longest <= max_edge:
            return image
        scale = float(max_edge) / float(longest)
        target_h = max(32, int(round(height * scale / 8.0)) * 8)
        target_w = max(32, int(round(width * scale / 8.0)) * 8)
        nchw = image.permute(0, 3, 1, 2)
        small = F.interpolate(nchw, size=(target_h, target_w), mode="area")
        return small.permute(0, 2, 3, 1).contiguous()
    except Exception:
        return image


def _limit_latent_preserve_distribution(torch, value, max_resolution: int):
    """Shrink preview latents without the variance collapse caused by bilinear interpolation."""

    output_height, output_width = value.shape[-2] * 16, value.shape[-1] * 16
    longest = max(output_height, output_width)
    if longest <= max_resolution:
        return value

    scale = max_resolution / longest
    latent_height = max(2, round(value.shape[-2] * scale))
    latent_width = max(2, round(value.shape[-1] * scale))
    reduced = torch.nn.functional.interpolate(
        value,
        size=(latent_height, latent_width),
        mode="area",
    )
    src_mean = value.mean(dim=(-2, -1), keepdim=True)
    src_std = value.std(dim=(-2, -1), keepdim=True, unbiased=False).clamp_min(1e-6)
    dst_mean = reduced.mean(dim=(-2, -1), keepdim=True)
    dst_std = reduced.std(dim=(-2, -1), keepdim=True, unbiased=False).clamp_min(1e-6)
    return (reduced - dst_mean) * (src_std / dst_std).clamp(0.25, 4.0) + src_mean


def _install_prompt_fixes() -> None:
    from . import analyzer_runtime_fixes as runtime
    from . import reference_integrity_fixes as integrity
    from .constants import ENHANCE_COMPILE, MODE_TEXT_TO_IMAGE
    from .prompting import comfy_analyzer
    from .prompting import compiler as compiler_module
    from .references import compile_mentions

    stronger_writer = runtime.WRITER_SYSTEM_INSTRUCTION.replace(
        "Preserve the user's actual intent instead of mechanically expanding every source field.",
        (
            "Preserve the user's actual intent instead of mechanically expanding every source field. "
            "Explicit user-requested changes always outrank conflicting source-image facts: if the user removes, replaces, "
            "or changes clothing, pose, environment, expression, object, or style, describe the requested final state and "
            "do not reintroduce the old source trait as a final-image requirement. Source records are evidence for traits "
            "the user did not override, not constraints that can cancel an explicit edit."
        ),
    ).replace(
        "References are source material, never extra panels, duplicate bodies, floating props or a collage.",
        (
            "References are source material, never extra panels, duplicate bodies, floating props or a collage. "
            "Never paste shortened source descriptions with literal ellipses into the instruction and never repeat raw user clauses to repair tags."
        ),
    )
    runtime.WRITER_SYSTEM_INSTRUCTION = stronger_writer
    comfy_analyzer.WRITER_SYSTEM_INSTRUCTION = stronger_writer
    runtime._repair_missing_mentions = _repair_missing_mentions_clean
    integrity._ensure_ordered_mentions = _ordered_mentions_clean

    with comfy_analyzer._CACHE_LOCK:
        comfy_analyzer._WRITER_CACHE.clear()

    current = compiler_module.PromptCompiler.compile
    if not bool(getattr(current, _MARKER, False)):
        original = current

        def compile(self, state, *args, **kwargs):
            result = original(self, state, *args, **kwargs)
            if (
                result.resolved_mode == MODE_TEXT_TO_IMAGE
                and result.references
                and state.prompt_options.enhance_mode == ENHANCE_COMPILE
            ):
                compact = compiler_module._single_prompt(
                    compiler_module.normalize_user_prompt(state.prompt),
                    result.references,
                    result.resolved_mode,
                )
                native = compile_mentions(compact, result.references, tag="picture")
                return replace(result, native_prompt=native)
            return result

        setattr(compile, _MARKER, True)
        compiler_module.PromptCompiler.compile = compile


def _install_semantic_reference_resize() -> None:
    """Keep full FL2VA anchors while reducing only Qwen3-VL's semantic image copies."""

    from .constants import MODE_TEXT_TO_IMAGE
    from .nodes.director import H3StudioCondition

    current = H3StudioCondition.condition
    if bool(getattr(current, _MARKER, False)):
        return
    original = current

    def condition(self, h3_bundle, studio_context):
        refs = tuple(getattr(studio_context, "images", ()) or ())
        mode = str(getattr(getattr(studio_context, "compile_result", None), "resolved_mode", ""))
        clip = getattr(h3_bundle, "clip", None)
        tokenize = getattr(clip, "tokenize", None)
        if mode != MODE_TEXT_TO_IMAGE or len(refs) < 2 or not callable(tokenize):
            return original(self, h3_bundle, studio_context)

        def semantic_tokenize(text, *args, **kwargs):
            images = kwargs.get("images")
            if isinstance(images, (list, tuple)) and len(images) >= 2:
                kwargs = dict(kwargs)
                kwargs["images"] = [_semantic_copy(image, 512) for image in images]
                LOGGER.info(
                    "[H3 Studio] Guided T2I semantic refs capped at 512px for 32B conditioning; full-res FL2VA keyframes preserved"
                )
            return tokenize(text, *args, **kwargs)

        try:
            clip.tokenize = semantic_tokenize
        except Exception:
            return original(self, h3_bundle, studio_context)
        try:
            return original(self, h3_bundle, studio_context)
        finally:
            with suppress(Exception):
                clip.tokenize = tokenize

    setattr(condition, _MARKER, True)
    H3StudioCondition.condition = condition


def _install_png_result_restore() -> None:
    from .nodes import save as save_module

    current = save_module.completed_png_metadata
    if bool(getattr(current, _MARKER, False)):
        return
    original = current

    def completed_png_metadata(prompt, extra_pnginfo, context):
        saved_prompt, saved_extra = original(prompt, extra_pnginfo, context)
        payload = {
            "compiled_prompt": str(context.compile_result.native_prompt or ""),
            "enhanced_prompt": str(context.state.prompt or ""),
            "actual_h3_prompt": str(context.prompt or ""),
            "reference_labels": [
                f"@Image{reference.ordinal} · {reference.effective_role} · {reference.retention} · {reference.filename}"
                for reference in context.compile_result.references
            ],
            "reference_descriptions": [reference.description for reference in context.compile_result.references],
        }
        workflow = saved_extra.get("workflow") if isinstance(saved_extra, dict) else None
        if isinstance(workflow, dict):
            for director in save_module._director_nodes(workflow):
                director.setdefault("properties", {})["h3studio_saved_result"] = payload
        if isinstance(saved_extra, dict):
            saved_extra.setdefault("h3studio", {})["enhanced_prompt"] = payload["enhanced_prompt"]
            saved_extra["h3studio"]["actual_h3_prompt"] = payload["actual_h3_prompt"]
        return saved_prompt, saved_extra

    setattr(completed_png_metadata, _MARKER, True)
    save_module.completed_png_metadata = completed_png_metadata


def _install_preview_fix() -> None:
    from .nodes import preview as preview_module

    preview_module._limit_latent = _limit_latent_preserve_distribution
    current = preview_module._PreviewWrapper.__call__
    if bool(getattr(current, _MARKER, False)):
        return
    original = current

    def call(self, *args, **kwargs):
        started = time.perf_counter()
        try:
            return original(self, *args, **kwargs)
        finally:
            elapsed = time.perf_counter() - started
            try:
                from server import PromptServer

                server = PromptServer.instance
                server.send_sync(
                    "h3studio-preview-timing",
                    {
                        "node_id": self.node_id,
                        "sampling_seconds": elapsed,
                        "preview_mode": "distribution-preserving area",
                    },
                    server.client_id,
                )
            except Exception:
                pass

    setattr(call, _MARKER, True)
    preview_module._PreviewWrapper.__call__ = call


def install() -> None:
    _install_prompt_fixes()
    _install_semantic_reference_resize()
    _install_png_result_restore()
    _install_preview_fix()
    LOGGER.info("[H3 Studio] Consolidated integrity v18 installed")


__all__ = ["install"]
