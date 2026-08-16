"""Small post-merge fixes for guided T2I conditioning and automatic reference roles."""

from __future__ import annotations

import logging
from contextlib import suppress

LOGGER = logging.getLogger(__name__)
_MARKER = "__h3studio_post_merge_v21__"


def _install_single_reference_semantic_resize() -> None:
    """Apply the existing 512px semantic-copy optimization to one-reference T2I too."""

    from .consolidated_integrity_fix import _semantic_copy
    from .constants import MODE_TEXT_TO_IMAGE
    from .nodes.director import H3StudioCondition

    current = H3StudioCondition.condition
    if bool(getattr(current, _MARKER, False)):
        return
    previous = current

    def condition(self, h3_bundle, studio_context):
        refs = tuple(getattr(studio_context, "images", ()) or ())
        mode = str(getattr(getattr(studio_context, "compile_result", None), "resolved_mode", ""))
        clip = getattr(h3_bundle, "clip", None)
        tokenize = getattr(clip, "tokenize", None)

        # The consolidated v18 wrapper already handles 2+ references. Only fill
        # the accidental one-reference gap here, leaving FL2VA source/VAE pixels untouched.
        if mode != MODE_TEXT_TO_IMAGE or len(refs) != 1 or not callable(tokenize):
            return previous(self, h3_bundle, studio_context)

        def semantic_tokenize(text, *args, **kwargs):
            images = kwargs.get("images")
            if isinstance(images, (list, tuple)) and images:
                kwargs = dict(kwargs)
                kwargs["images"] = [_semantic_copy(image, 512) for image in images]
                LOGGER.info(
                    "[H3 Studio] Guided T2I semantic ref capped at 512px for 32B conditioning; full-res FL2VA keyframe preserved"
                )
            return tokenize(text, *args, **kwargs)

        try:
            clip.tokenize = semantic_tokenize
        except Exception:
            return previous(self, h3_bundle, studio_context)
        try:
            return previous(self, h3_bundle, studio_context)
        finally:
            with suppress(Exception):
                clip.tokenize = tokenize

    setattr(condition, _MARKER, True)
    H3StudioCondition.condition = condition


def _install_prompt_aware_auto_roles() -> None:
    """Let explicit @Image prompt language outrank a coarse VLM content label."""

    from .nodes import director as director_module
    from .prompting import comfy_analyzer
    from .references import infer_roles_from_prompt

    current = comfy_analyzer.analyze_references
    if bool(getattr(current, _MARKER, False)):
        return
    previous = current

    def analyze_references(clip, prompt, references, images, **kwargs):
        analyzed, enhanced, note = previous(clip, prompt, references, images, **kwargs)
        corrected = infer_roles_from_prompt(prompt, analyzed)
        changes = [
            f"@Image{before.ordinal}:{before.effective_role}->{after.effective_role}"
            for before, after in zip(analyzed, corrected, strict=False)
            if before.effective_role != after.effective_role
        ]
        if changes:
            LOGGER.info("[H3 Studio - Vision] Prompt-aware auto roles | %s", ", ".join(changes))
            note = f"{note} Prompt-aware role correction: {', '.join(changes)}."
        return corrected, enhanced, note

    setattr(analyze_references, _MARKER, True)
    comfy_analyzer.analyze_references = analyze_references

    # Director imports the function directly, so update that live binding too.
    if getattr(director_module, "analyze_references", None) is previous:
        director_module.analyze_references = analyze_references


def install() -> None:
    _install_single_reference_semantic_resize()
    _install_prompt_aware_auto_roles()
    LOGGER.info("[H3 Studio] Post-merge v21 conditioning/role fixes installed")


__all__ = ["install"]
