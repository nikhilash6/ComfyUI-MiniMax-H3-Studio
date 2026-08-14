"""Final compatibility fixes for the modern analyzer stack.

These patches keep the existing factual-analysis schema/cache/retry contract
while tightening generation budgets for the modern Qwen3.5/MiniCPM backends.
"""

from __future__ import annotations

from typing import Any

SYSTEM_INSTRUCTION = """You are the factual visual reference analyst for MiniMax H3 image generation.
Study every attached image pixel-by-pixel. The user's later creative request is not evidence and must never change what you claim is visible.
Return JSON only with this exact shape:
{"references":[{"ordinal":1,"role":"character","description":"dense factual source-pixel observation"}]}

Allowed roles: auto, identity, face, character, style, composition, pose, outfit, object, environment, layout, typography, color_palette, lighting, texture, reference.
Target roughly 35-70 information-dense factual words per image. Cover, when visibly supported: subject appearance; face and hair; pose, expression and gaze; clothing; important objects and physical contact; spatial relationships; composition, framing and camera angle; environment; lighting; palette; visual medium or style; and legible text. Omit invisible categories instead of padding. State uncertainty instead of inventing hidden identity, anatomy, text or context. Never import a requested new action, prop, pose, gaze, wardrobe change, style, environment or edit into the source description unless it is already visible. Avoid repetition and generic filler.
Choose role only as a conservative visible-content category. Do not emit prose outside JSON."""


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
        # 35-70 is the target. Extra headroom is deliberate for OCR-heavy or
        # complex material/environment scenes; essay-like captions still retry.
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
    # This clamps the old 1.5K/2K ceilings without changing repair/retry logic.
    ceiling = min(896, 112 + image_count * 92)
    requested = int(kwargs.get("max_length") or ceiling)
    kwargs["max_length"] = min(requested, ceiling)
    kwargs["do_sample"] = False
    return self.raw_clip.generate(tokens, *args, **kwargs)


def _minicpm_decode(generated, *_args, **_kwargs) -> str:
    """Match Comfy CLIP.decode's permissive call shape."""

    return str(generated)


def install() -> None:
    from . import analyzer_stack
    from .prompting import comfy_analyzer

    # Preserve the established {references:[...]} parser/repair/cache contract.
    comfy_analyzer._ANALYSIS_SCHEMA_VERSION = 3
    comfy_analyzer.SYSTEM_INSTRUCTION = SYSTEM_INSTRUCTION
    comfy_analyzer._validated_analysis_records = _validate_records

    # Only the factual vision pass gets the smaller deterministic budget. The
    # prompt writer keeps its independent 120-220-word validated contract.
    analyzer_stack._AnalyzerBudgetProxy.generate = _compact_generate
    analyzer_stack.MiniCPMV46ClipProxy.decode = staticmethod(_minicpm_decode)
