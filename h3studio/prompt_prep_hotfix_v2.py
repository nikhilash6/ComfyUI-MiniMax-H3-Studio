"""Second-stage prompt-prep reliability fixes from real H3 Studio workloads.

The visual helper is optional and must never turn a valid factual answer into a
second full multimodal generation merely because it was verbose.  It also must
not be loaded full-resident beside a previous H3 conditioning model when the GPU
is already tight enough to force the host into paging.
"""

from __future__ import annotations

import gc
import logging
import os
from contextlib import suppress
from typing import Any

LOGGER = logging.getLogger(__name__)
GIB = 1024**3


def _trim_words(text: str, maximum: int = 90) -> str:
    normalized = " ".join(str(text or "").split())
    words = normalized.split()
    if len(words) <= maximum:
        return normalized
    trimmed = " ".join(words[:maximum]).rstrip(" ,;:")
    if trimmed and trimmed[-1] not in ".!?":
        trimmed += "."
    return trimmed


def _validated_records_compact(payload: dict[str, Any], expected_ordinals: set[int]) -> dict[int, dict[str, Any]]:
    """Validate structure, then compact verbosity locally instead of regenerating."""

    if not isinstance(payload, dict) or not isinstance(payload.get("references"), list):
        raise ValueError("Analyzer JSON did not contain a references list.")
    records: dict[int, dict[str, Any]] = {}
    for item in payload["references"]:
        if not isinstance(item, dict) or not str(item.get("ordinal", "")).isdigit():
            continue
        ordinal = int(item["ordinal"])
        if ordinal in records:
            raise ValueError(f"Analyzer returned duplicate reference ordinal {ordinal}.")
        if ordinal not in expected_ordinals:
            continue
        description = " ".join(str(item.get("description") or "").split())
        if not description:
            raise ValueError(f"Analyzer reference {ordinal} had an empty description.")
        words = len(description.split())
        compact = _trim_words(description, 90)
        if words > 90:
            LOGGER.info(
                "[H3 Studio - Vision] Compacting verbose factual record locally | @Image%d %d→%d words | no retry",
                ordinal,
                words,
                len(compact.split()),
            )
        elif words < 20:
            LOGGER.info(
                "[H3 Studio - Vision] Short factual record accepted | @Image%d %d words | no stylistic retry",
                ordinal,
                words,
            )
        records[ordinal] = {**item, "description": compact}
    missing = sorted(expected_ordinals - records.keys())
    if missing:
        raise ValueError("Analyzer omitted reference records: " + ", ".join(map(str, missing)) + ".")
    return records


def _compact_generate_v2(self, tokens, *args, **kwargs):
    """Bound normal factual output while leaving enough room to close its JSON."""

    image_count = max(1, int(getattr(self, "_image_count", 1)))
    ceiling = min(768, 64 + image_count * 80)
    requested = int(kwargs.get("max_length") or ceiling)
    kwargs["max_length"] = min(requested, ceiling)
    kwargs["do_sample"] = False
    return self.raw_clip.generate(tokens, *args, **kwargs)


def _cache_miss_requires_visual_model(clip, references, images, kwargs) -> bool:
    """Mirror the analyzer cache probe so residency work happens only on real misses."""

    if clip is not None or not images or not references:
        return False
    from .prompting import comfy_analyzer

    identity = str(kwargs.get("analyzer_name") or "default")
    edge = int(kwargs.get("max_image_edge", 512))
    paired = list(zip(references, images, strict=False))
    try:
        with comfy_analyzer._CACHE_LOCK:
            for reference, image in paired:
                key = comfy_analyzer._analysis_cache_key(identity, edge, reference, image)
                if comfy_analyzer._ANALYSIS_CACHE.get(key) is not None:
                    continue
                if getattr(reference, "fingerprint", None) and str(getattr(reference, "description", "")).strip():
                    continue
                return True
        return False
    except Exception:
        # Cache internals changing must never break generation.  A conservative
        # barrier is still safer than co-resident 8.5 + 11.4 GiB helpers.
        return True


def _prompt_helper_residency_barrier() -> None:
    """Ask ComfyUI to free prior GPU models before a cold full-resident helper."""

    try:
        import comfy.model_management as manager

        device = manager.get_torch_device()
        before = max(0, int(manager.get_free_memory(device)))
        try:
            floor = max(8.0, float(os.environ.get("H3STUDIO_PROMPT_HELPER_FREE_GIB", "12.0"))) * GIB
        except (TypeError, ValueError):
            floor = 12.0 * GIB
        if before >= floor:
            return
        loaded = len(manager.loaded_models()) if callable(getattr(manager, "loaded_models", None)) else -1
        LOGGER.info(
            "[H3 Studio - Vision] Residency barrier | %.2f GiB free < %.2f GiB target | releasing %s prior Comfy model(s)",
            before / GIB,
            floor / GIB,
            loaded if loaded >= 0 else "loaded",
        )
        # This is ComfyUI's own public execution-time unload path.  H3 Studio
        # does not touch ModelPatcher internals or DynamicVRAM pin tables.
        manager.unload_all_models()
        gc.collect()
        with suppress(Exception):
            from .host_memory import relieve_host_memory_pressure

            relieve_host_memory_pressure("prompt-prep.before-helper", logger=LOGGER)
        after = max(0, int(manager.get_free_memory(device)))
        LOGGER.info("[H3 Studio - Vision] Residency barrier complete | VRAM free %.2f→%.2f GiB", before / GIB, after / GIB)
    except Exception as error:
        # Failing open preserves ComfyUI compatibility; its normal loader still
        # decides what can fit.
        LOGGER.warning("[H3 Studio - Vision] Residency barrier unavailable: %s: %s", type(error).__name__, error)


def _fallback_qwen35(reason: str, *, prefer_2b: bool = True) -> str | None:
    from . import analyzer_stack

    selected = None
    if prefer_2b:
        selected = analyzer_stack.preferred_qwen35("2b")
    selected = selected or analyzer_stack.preferred_qwen35("4b")
    if selected:
        LOGGER.warning("[H3 Studio] %s; falling back to installed %s", reason, selected)
    return selected


def _resolve_analyzer_resilient(value: str | None) -> str | None:
    from . import analyzer_stack

    normalized = analyzer_stack._normalize(value)
    if normalized == analyzer_stack.FASTEST_MINICPM_V46:
        status = analyzer_stack.minicpm_status()
        missing = []
        if not status.get("available"):
            missing.append("llama.cpp server unavailable")
        if not status.get("model_present"):
            missing.append("MiniCPM GGUF missing")
        if not status.get("mmproj_present"):
            missing.append("MiniCPM mmproj missing")
        if missing:
            fallback = _fallback_qwen35("Fastest Vision unavailable (" + ", ".join(missing) + ")")
            if fallback:
                return fallback
    if normalized == analyzer_stack.FAST_QWEN35_2B and not analyzer_stack.preferred_qwen35("2b"):
        fallback = _fallback_qwen35("Fast Qwen3.5 2B selected but its checkpoint is not installed", prefer_2b=False)
        if fallback:
            return fallback
    return analyzer_stack.resolve_analyzer(value)


def _resolve_writer_resilient(value: str | None, analyzer_name: str | None) -> str | None:
    from . import analyzer_stack

    normalized = analyzer_stack._normalize(value)
    if normalized == analyzer_stack.AUTO_WRITER_QWEN35_2B and not analyzer_stack.preferred_qwen35("2b"):
        fallback = _fallback_qwen35("Qwen3.5 2B writer selected but its checkpoint is not installed", prefer_2b=False)
        if fallback:
            return fallback
    return analyzer_stack.resolve_writer(value, analyzer_name)


def install() -> None:
    """Install after analyzer_stack/runtime_guards so this is the final contract."""

    from . import analyzer_stack
    from .nodes import loader
    from .prompting import comfy_analyzer

    comfy_analyzer._ANALYSIS_SCHEMA_VERSION = 5
    comfy_analyzer._validated_analysis_records = _validated_records_compact
    analyzer_stack._AnalyzerBudgetProxy.generate = _compact_generate_v2

    # Loader imported these as mutable module globals; update both the canonical
    # stack functions and the already-modernized Loader aliases.
    loader._resolve_analyzer = _resolve_analyzer_resilient
    loader._resolve_prompt_writer = _resolve_writer_resilient

    current = comfy_analyzer.analyze_references
    if not bool(getattr(current, "__h3studio_prompt_prep_v2__", False)):
        def analyze_with_residency(clip, prompt, references, images, **kwargs):
            if _cache_miss_requires_visual_model(clip, references, images, kwargs):
                _prompt_helper_residency_barrier()
            return current(clip, prompt, references, images, **kwargs)

        analyze_with_residency.__h3studio_prompt_prep_v2__ = True
        comfy_analyzer.analyze_references = analyze_with_residency


__all__ = [
    "_compact_generate_v2",
    "_prompt_helper_residency_barrier",
    "_resolve_analyzer_resilient",
    "_resolve_writer_resilient",
    "_trim_words",
    "_validated_records_compact",
    "install",
]
