"""Runtime guards for helper models and host-memory stage handoffs.

The Studio does not become a second model manager. Optional helper objects are
released as before, and after H3 text conditioning we ask ComfyUI's own
ensure_pin_budget() policy to shed stale/inactive pins only when real host RAM
or swap pressure warrants it.
"""

from __future__ import annotations

import gc
import logging

from . import conditioning_cache
from .host_memory import relieve_host_memory_pressure
from .prompting import comfy_analyzer
from .runtime_lifecycle import release_stage_model

LOGGER = logging.getLogger(__name__)

_ORIGINAL_ANALYZE_REFERENCES = comfy_analyzer.analyze_references
_ORIGINAL_ENCODE_PROMPT = conditioning_cache._encode_prompt


def _helper_bundle(*loaders):
    for loader in loaders:
        owner = getattr(loader, "__self__", None)
        if owner is not None and hasattr(owner, "analyzer_clip") and hasattr(owner, "prompt_writer_clip"):
            return owner
    return None


def _release_optional_helpers(bundle) -> None:
    if bundle is None:
        return
    analyzer = getattr(bundle, "analyzer_clip", None)
    writer = getattr(bundle, "prompt_writer_clip", None)
    if analyzer is None and writer is None:
        return

    release_stage_model(analyzer, "visual-analyzer->h3-conditioning")
    if writer is not analyzer:
        release_stage_model(writer, "prompt-writer->h3-conditioning")
    bundle.analyzer_clip = None
    bundle.prompt_writer_clip = None
    del analyzer, writer
    gc.collect()

    LOGGER.info("[H3 Studio] Released optional Qwen analyzer/writer before H3 conditioning")


def _memory_safe_analyze_references(clip, prompt, references, images, **kwargs):
    """Run the configured helper normally, then release it before H3 encode."""

    bundle = _helper_bundle(kwargs.get("writer_loader"), kwargs.get("clip_loader"))
    try:
        return _ORIGINAL_ANALYZE_REFERENCES(clip, prompt, references, images, **kwargs)
    finally:
        _release_optional_helpers(bundle)


def _pressure_safe_encode_prompt(*args, **kwargs):
    """Preserve conditioning semantics, then let Comfy relieve stale pins if needed."""

    try:
        return _ORIGINAL_ENCODE_PROMPT(*args, **kwargs)
    finally:
        relieve_host_memory_pressure("conditioning.text.done", logger=LOGGER)


def install_runtime_guards() -> None:
    """Install idempotent helper-release and host-pressure guards."""

    current = comfy_analyzer.analyze_references
    if not bool(getattr(current, "__h3studio_helper_release_guard__", False)):
        _memory_safe_analyze_references.__h3studio_helper_release_guard__ = True
        comfy_analyzer.analyze_references = _memory_safe_analyze_references

    current_encode = conditioning_cache._encode_prompt
    if not bool(getattr(current_encode, "__h3studio_host_pressure_guard__", False)):
        _pressure_safe_encode_prompt.__h3studio_host_pressure_guard__ = True
        conditioning_cache._encode_prompt = _pressure_safe_encode_prompt
