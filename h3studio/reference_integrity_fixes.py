"""Reference-analysis integrity fixes for H3 Studio.

Multi-image structured generations are compact, but Qwen can occasionally
cross-contaminate records (for example, returning Image1's description for
Image2).  That is worse than a small analysis overhead because the wrong record
is then cached and persisted into the Director card.

For 2+ active references this module therefore keeps the same stage-scoped GGUF
server and cache, but analyzes each *fresh* image in an independent single-image
turn. Cached images remain free.  A single writer pass runs only after all
ordered records are ready.  Exact duplicate auto-descriptions attached to
different image fingerprints are treated as stale pre-fix data and invalidated.

The final enhanced instruction also receives a compact explicit @ImageN mapping
for every active reference, so card order, prompt order and H3 conditioning order
cannot silently drift apart.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import replace
from typing import Any

LOGGER = logging.getLogger(__name__)
_MARKER = "H3STUDIO ORDERED REFERENCE CONTRACT"
_MAX_SUMMARY_WORDS = 18


def _words(value: Any) -> str:
    return " ".join(str(value or "").split())


def _short_description(reference: Any) -> str:
    words = _words(getattr(reference, "description", "")).split()
    if not words:
        return "connected visual guide"
    suffix = "..." if len(words) > _MAX_SUMMARY_WORDS else ""
    return " ".join(words[:_MAX_SUMMARY_WORDS]) + suffix


def _ordered_contract(references: Sequence[Any]) -> str:
    parts: list[str] = []
    for fallback, ref in enumerate(references, start=1):
        ordinal = int(getattr(ref, "ordinal", fallback) or fallback)
        role = str(getattr(ref, "effective_role", None) or getattr(ref, "role", "reference"))
        parts.append(f"@Image{ordinal} = {role}: {_short_description(ref)}")
    return "; ".join(parts)


def _ensure_ordered_mentions(text: str, references: Sequence[Any]) -> str:
    """Always prepend one compact source-order contract for active references."""

    value = _words(text)
    refs = tuple(references)
    if not refs:
        return value
    return f"Reference mapping: {_ordered_contract(refs)}. {value}".strip()


def _suspicious_duplicate_ordinals(references: Sequence[Any]) -> set[int]:
    """Detect persisted pre-fix auto descriptions copied across different pixels."""

    groups: dict[str, list[Any]] = defaultdict(list)
    for ref in references:
        description = _words(getattr(ref, "description", ""))
        if not description:
            continue
        is_auto = bool(getattr(ref, "description_auto", False)) or "visually_analyzed" in tuple(
            getattr(ref, "tags", ()) or ()
        )
        if is_auto:
            groups[description.casefold()].append(ref)

    stale: set[int] = set()
    for items in groups.values():
        if len(items) < 2:
            continue
        fingerprints = {_words(getattr(item, "fingerprint", "")) for item in items}
        fingerprints.discard("")
        if len(fingerprints) < 2:
            continue
        stale.update(int(getattr(item, "ordinal", 0) or 0) for item in items)
    stale.discard(0)
    return stale


def _clear_stale_reference(reference: Any) -> Any:
    tags = tuple(tag for tag in tuple(getattr(reference, "tags", ()) or ()) if tag != "visually_analyzed")
    return replace(reference, description="", description_auto=True, tags=tags)


def install() -> None:
    from .prompting import comfy_analyzer as analyzer

    current = analyzer.analyze_references
    if bool(getattr(current, "__h3studio_reference_integrity__", False)):
        return

    original = current
    original_validator = analyzer._validated_analysis_records

    def validated_analysis_records(payload: dict[str, Any], expected_ordinals: set[int]):
        # A one-image turn is unambiguous even if a VLM reflexively calls it
        # ordinal 1. Remap that sole record to the requested card ordinal before
        # normal validation so @Image2 does not need a second generation merely
        # because the model returned {"ordinal": 1}.
        if len(expected_ordinals) == 1 and isinstance(payload.get("references"), list):
            candidates = [item for item in payload["references"] if isinstance(item, dict)]
            if len(candidates) == 1:
                expected = next(iter(expected_ordinals))
                payload = {**payload, "references": [{**candidates[0], "ordinal": expected}]}
        return original_validator(payload, expected_ordinals)

    analyzer._validated_analysis_records = validated_analysis_records

    def analyze_references(
        clip: Any,
        prompt: str,
        references: Sequence[Any],
        images: Sequence[Any],
        *,
        analyzer_name: str = "",
        clip_loader: Any = None,
        max_image_edge: int = 512,
        deep_enhancement: bool = False,
        writer_clip: Any = None,
        writer_name: str = "",
        writer_loader: Any = None,
        writer_instruction: str = "",
    ):
        refs = list(references)
        imgs = tuple(images)

        if not refs or not imgs:
            return original(
                clip,
                prompt,
                tuple(refs),
                imgs,
                analyzer_name=analyzer_name,
                clip_loader=clip_loader,
                max_image_edge=max_image_edge,
                deep_enhancement=deep_enhancement,
                writer_clip=writer_clip,
                writer_name=writer_name,
                writer_loader=writer_loader,
                writer_instruction=writer_instruction,
            )

        stale_ordinals = _suspicious_duplicate_ordinals(refs)
        if stale_ordinals:
            identity = analyzer_name or (type(clip).__name__ if clip is not None else "default")
            for index, ref in enumerate(refs):
                if int(getattr(ref, "ordinal", index + 1)) not in stale_ordinals or index >= len(imgs):
                    continue
                try:
                    key = analyzer._analysis_cache_key(identity, int(max_image_edge), ref, imgs[index])
                    with analyzer._CACHE_LOCK:
                        analyzer._ANALYSIS_CACHE.pop(key, None)
                except Exception:
                    pass
                refs[index] = _clear_stale_reference(ref)
            LOGGER.warning(
                "[H3 Studio - Vision] Invalidated duplicated auto-description(s) across different image fingerprints | ordinals=%s",
                ",".join(f"@Image{value}" for value in sorted(stale_ordinals)),
            )

        # Preserve exact historical one-reference behavior. Multi-reference
        # analysis is intentionally isolated one image at a time because the
        # model has proven capable of returning valid JSON with crossed records.
        if len(refs) == 1:
            analyzed, enhanced, note = original(
                clip,
                prompt,
                tuple(refs),
                imgs,
                analyzer_name=analyzer_name,
                clip_loader=clip_loader,
                max_image_edge=max_image_edge,
                deep_enhancement=deep_enhancement,
                writer_clip=writer_clip,
                writer_name=writer_name,
                writer_loader=writer_loader,
                writer_instruction=writer_instruction,
            )
            if deep_enhancement:
                enhanced = _ensure_ordered_mentions(enhanced, analyzed)
                note += " Ordered reference tag verified for @Image1."
            return analyzed, enhanced, note

        analyzed: list[Any] = []
        notes: list[str] = []
        failed: list[int] = []
        for index, ref in enumerate(refs):
            if index >= len(imgs):
                analyzed.append(ref)
                continue
            ordinal = int(getattr(ref, "ordinal", index + 1) or index + 1)
            try:
                one_refs, _unused, one_note = original(
                    clip,
                    prompt,
                    (ref,),
                    (imgs[index],),
                    analyzer_name=analyzer_name,
                    clip_loader=clip_loader,
                    max_image_edge=max_image_edge,
                    deep_enhancement=False,
                    writer_clip=None,
                    writer_name="",
                    writer_loader=None,
                    writer_instruction="",
                )
                resolved = one_refs[0] if one_refs else ref
                resolved = replace(resolved, ordinal=ordinal)
                analyzed.append(resolved)
                notes.append(f"@Image{ordinal}: {one_note}")
                if not _words(getattr(resolved, "description", "")):
                    failed.append(ordinal)
            except Exception as exc:
                analyzed.append(ref)
                failed.append(ordinal)
                LOGGER.warning(
                    "[H3 Studio - Vision] Independent analysis failed for @Image%d | %s: %s",
                    ordinal,
                    type(exc).__name__,
                    exc,
                )

        analyzed_tuple = tuple(analyzed)
        note = (
            f"Image analysis: {len(analyzed_tuple)} ordered reference image(s) processed independently to prevent "
            "cross-image record contamination. "
            + " ".join(notes)
        )
        if stale_ordinals:
            note += " Stale duplicated persisted descriptions were invalidated before analysis."
        if failed:
            note += " Unresolved description(s): " + ", ".join(f"@Image{value}" for value in failed) + "."

        enhanced = str(prompt)
        if deep_enhancement:
            internal = (
                f"{_MARKER}: There are exactly {len(analyzed_tuple)} ordered connected image sources. "
                "Use each exact literal tag @Image1, @Image2, and so on in the final instruction. Never renumber, swap, "
                "collapse, or replace these tags with Picture/Subject/filename labels. Each @ImageN refers only to the "
                "same numbered Director card and its factual source record. User-requested changes may alter source "
                "traits, but the source identity/order must remain explicit and unambiguous."
            )
            user_instruction = str(writer_instruction or "").strip()
            merged_instruction = f"{user_instruction}\n\n{internal}".strip() if user_instruction else internal
            enhanced, writer_note = analyzer._run_prompt_writer(
                writer_clip,
                prompt,
                analyzed_tuple,
                writer_name=writer_name,
                clip_loader=writer_loader,
                additional_instruction=merged_instruction,
            )
            enhanced = _ensure_ordered_mentions(enhanced, analyzed_tuple)
            note = f"{note} {writer_note} Ordered @Image mapping enforced for {len(analyzed_tuple)} active source(s)."

        return analyzed_tuple, enhanced, note

    analyze_references.__h3studio_reference_integrity__ = True
    analyze_references.__wrapped__ = original
    analyzer.analyze_references = analyze_references


__all__ = [
    "_ensure_ordered_mentions",
    "_ordered_contract",
    "_suspicious_duplicate_ordinals",
    "install",
]
