"""Final compatibility fixes for the modern analyzer stack.

Kept separate from :mod:`analyzer_stack` so the modernization can stay additive
while existing Qwen3-VL workflows keep their explicit model choices.
"""

from __future__ import annotations

from typing import Any


def _validate_records(payload: dict[str, Any], expected_ordinals: set[int]) -> dict[int, dict[str, Any]]:
    """Validate compact factual records with the existing H3 Studio contract."""

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
        words = len(description.split())
        # 35-70 is the requested target. A little headroom is deliberate for
        # dense OCR/material/environment scenes; essay-like captions still fail
        # validation and use the existing one repair/retry path.
        if words < 35 or words > 105:
            raise ValueError(
                f"Analyzer reference {ordinal} description has {words} words; target 35-70, hard range 35-105."
            )
        records[ordinal] = {**item, "description": description}
    missing = sorted(expected_ordinals - records.keys())
    if missing:
        raise ValueError("Analyzer omitted reference records: " + ", ".join(map(str, missing)) + ".")
    return records


def _compact_generate(self, tokens, *args, **kwargs):
    image_count = max(1, int(getattr(self, "_image_count", 1)))
    # Roughly enough room for 35-70 factual words/image plus compact JSON.
    # This clamps the old 1.5K/2K retry ceilings without changing its repair and
    # one-retry semantics.
    ceiling = min(896, 112 + image_count * 92)
    requested = int(kwargs.get("max_length") or ceiling)
    kwargs["max_length"] = min(requested, ceiling)
    kwargs["do_sample"] = False
    return self.raw_clip.generate(tokens, *args, **kwargs)


def install() -> None:
    from . import analyzer_stack
    from .prompting import comfy_analyzer

    comfy_analyzer._validated_analysis_records = _validate_records
    analyzer_stack._AnalyzerBudgetProxy.generate = _compact_generate
