"""Remove deterministic prompt rewriting from H3 Studio's optional writer path.

The user's prompt is the source of truth.  If no generative writer is available,
or if a selected writer fails validation, H3 Studio must preserve the original
prompt byte-for-byte instead of silently replacing it with a generic production
brief.  Existing workflows that explicitly selected the old deterministic-only
writer remain loadable; they now resolve to passthrough behavior.
"""

from __future__ import annotations

import logging
from typing import Any

LOGGER = logging.getLogger(__name__)

_OLD_FALLBACK_CHOICES = {
    "Deterministic fallback only",
    "Fast deterministic - no second model",
}


def _without_fallback_choices(values) -> list[str]:
    return [value for value in list(values) if str(value) not in _OLD_FALLBACK_CHOICES]


def install() -> None:
    from . import analyzer_stack
    from .nodes import loader
    from .prompting import comfy_analyzer as analyzer

    if bool(getattr(analyzer, "__h3studio_writer_passthrough_v1__", False)):
        return
    analyzer.__h3studio_writer_passthrough_v1__ = True

    # Neutralize the legacy helper itself.  This also protects any internal path
    # that still calls it directly: fallback means identity passthrough now.
    def original_prompt_passthrough(
        prompt: str,
        _references,
        additional_instruction: str = "",
    ) -> str:
        del additional_instruction
        return str(prompt)

    analyzer._deterministic_writer_fallback = original_prompt_passthrough

    # Old fallback results may already be resident in the process cache from a
    # workflow run before this patch loaded.  Drop only those entries so a stale
    # compressed prompt can never survive the behavior change.
    with analyzer._CACHE_LOCK:
        stale = [
            key
            for key, value in analyzer._WRITER_CACHE.items()
            if isinstance(value, tuple)
            and len(value) >= 2
            and "deterministic fallback" in str(value[1]).lower()
        ]
        for key in stale:
            analyzer._WRITER_CACHE.pop(key, None)

    original_run_prompt_writer = analyzer._run_prompt_writer

    def run_prompt_writer_passthrough(
        clip: Any,
        prompt: str,
        references,
        *,
        writer_name: str,
        clip_loader: Any = None,
        additional_instruction: str = "",
    ):
        candidate, note = original_run_prompt_writer(
            clip,
            prompt,
            references,
            writer_name=writer_name,
            clip_loader=clip_loader,
            additional_instruction=additional_instruction,
        )
        if "deterministic fallback" not in str(note).lower():
            return candidate, note

        # The underlying compatibility path may still report its historical
        # fallback label, but its candidate is already neutralized above.  Make
        # the user-visible execution report truthful as well.
        LOGGER.warning(
            "[H3 Studio - Prompt Director] Writer unavailable or invalid; preserving original prompt unchanged"
        )
        return str(prompt), "Prompt director: writer unavailable or invalid; used original prompt unchanged."

    run_prompt_writer_passthrough.__h3studio_writer_passthrough_v1__ = True
    analyzer._run_prompt_writer = run_prompt_writer_passthrough

    # Remove the old product option from newly rendered Loader controls.  A
    # serialized old value still resolves to None through the existing resolver,
    # which is intentionally handled by the passthrough contract above.
    stack_choices = analyzer_stack.prompt_writer_choices
    loader_choices = loader.prompt_writer_choices

    def prompt_writer_choices_stack() -> list[str]:
        return _without_fallback_choices(stack_choices())

    def prompt_writer_choices_loader() -> list[str]:
        return _without_fallback_choices(loader_choices())

    analyzer_stack.prompt_writer_choices = prompt_writer_choices_stack
    loader.prompt_writer_choices = prompt_writer_choices_loader


__all__ = ["install"]
