"""Reference-analysis integrity fixes for H3 Studio.

Keep the fast batched vision pass, but never allow one malformed multi-image JSON
response to silently leave a later reference undescribed. Missing records are
retried one image at a time and the prompt writer runs only after every possible
record has been recovered.

The final enhanced instruction also carries an explicit, ordered @ImageN
contract for every active reference. This makes the textual reference mapping
match the same ordinal ordering used by the Director cards and H3 conditioning.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import replace
from typing import Any

LOGGER = logging.getLogger(__name__)
_MARKER = "H3STUDIO ORDERED REFERENCE CONTRACT"


def _ordered_contract(references: Sequence[Any]) -> str:
    parts: list[str] = []
    for ref in references:
        ordinal = int(getattr(ref, "ordinal", len(parts) + 1))
        role = str(getattr(ref, "effective_role", None) or getattr(ref, "role", "reference"))
        retention = str(getattr(ref, "retention", "reference_only"))
        description = " ".join(str(getattr(ref, "description", "") or "").split())
        if len(description) > 260:
            description = description[:257].rstrip() + "..."
        detail = f"; visible source facts: {description}" if description else ""
        parts.append(f"@Image{ordinal} = {role} ({retention}){detail}")
    return "; ".join(parts)


def _ensure_mentions(text: str, references: Sequence[Any]) -> str:
    """Guarantee every active ordinal is named without changing its ordering."""

    value = " ".join(str(text or "").split())
    missing = [
        ref for ref in references
        if f"@Image{int(getattr(ref, 'ordinal', 0))}" not in value
    ]
    if not missing:
        return value

    # Add only the absent ordinals. The writer already receives the full factual
    # record; this is a final integrity guard, not another generation pass.
    contract = _ordered_contract(missing)
    return f"Reference guidance: {contract}. {value}".strip()


def install() -> None:
    from .prompting import comfy_analyzer as analyzer

    current = analyzer.analyze_references
    if bool(getattr(current, "__h3studio_reference_integrity__", False)):
        return

    original = current

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
        refs = tuple(references)
        imgs = tuple(images)

        # Run the existing optimized batch analyzer, but defer the writer until
        # reference recovery is complete so we never pay for two writer passes.
        analyzed, _unused, note = original(
            clip,
            prompt,
            refs,
            imgs,
            analyzer_name=analyzer_name,
            clip_loader=clip_loader,
            max_image_edge=max_image_edge,
            deep_enhancement=False,
            writer_clip=None,
            writer_name="",
            writer_loader=None,
            writer_instruction="",
        )
        analyzed = list(analyzed)

        missing_indices = [
            index for index, ref in enumerate(analyzed)
            if index < len(imgs) and not str(getattr(ref, "description", "") or "").strip()
        ]
        recovered = 0
        failed: list[int] = []
        for index in missing_indices:
            ref = analyzed[index]
            image = imgs[index]
            try:
                one_refs, _unused_one, one_note = original(
                    clip,
                    prompt,
                    (ref,),
                    (image,),
                    analyzer_name=analyzer_name,
                    clip_loader=clip_loader,
                    max_image_edge=max_image_edge,
                    deep_enhancement=False,
                    writer_clip=None,
                    writer_name="",
                    writer_loader=None,
                    writer_instruction="",
                )
                note = f"{note} Recovery @{getattr(ref, 'ordinal', index + 1)}: {one_note}"
                if one_refs and str(getattr(one_refs[0], "description", "") or "").strip():
                    analyzed[index] = replace(one_refs[0], ordinal=getattr(ref, "ordinal", index + 1))
                    recovered += 1
                else:
                    failed.append(int(getattr(ref, "ordinal", index + 1)))
            except Exception as exc:  # preserve generation if optional analysis fails
                failed.append(int(getattr(ref, "ordinal", index + 1)))
                LOGGER.warning(
                    "[H3 Studio - Vision] Per-reference recovery failed for @Image%d | %s: %s",
                    int(getattr(ref, "ordinal", index + 1)),
                    type(exc).__name__,
                    exc,
                )

        analyzed_tuple = tuple(analyzed)
        if missing_indices:
            LOGGER.info(
                "[H3 Studio - Vision] Reference integrity recovery | missing=%d | recovered=%d | unresolved=%s",
                len(missing_indices),
                recovered,
                failed or "none",
            )
            note += (
                f" Reference integrity recovery: {recovered}/{len(missing_indices)} missing description(s) recovered individually."
            )
            if failed:
                note += " Unresolved ordinals: " + ", ".join(f"@Image{value}" for value in failed) + "."

        enhanced = str(prompt)
        if deep_enhancement:
            internal = (
                f"{_MARKER}: Every active reference MUST appear in the final instruction using its exact literal ordinal "
                "tag (@Image1, @Image2, ...). Never renumber, swap, rename, collapse, or replace these tags. "
                "Each tag must describe only the source facts and role belonging to that same ordered reference card. "
                "Do not call them Picture 1/2, filenames, subjects, or generic references."
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
            enhanced = _ensure_mentions(enhanced, analyzed_tuple)
            note = f"{note} {writer_note} Ordered reference tags verified for {len(analyzed_tuple)} active image(s)."

        return analyzed_tuple, enhanced, note

    analyze_references.__h3studio_reference_integrity__ = True
    analyze_references.__wrapped__ = original
    analyzer.analyze_references = analyze_references


__all__ = ["install"]
