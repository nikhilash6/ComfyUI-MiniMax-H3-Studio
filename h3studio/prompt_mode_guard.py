"""Make the Director's visible prompt-format choice authoritative.

A workflow can contain legacy/stale state where ``enhance_mode == 'off'`` while
``deep_enhancement`` is still true.  That used to make the UI say "Keep my
prompt" while the backend nevertheless ran the prompt-director fallback and
changed H3 conditioning.  Repair that contradiction at the backend boundary so
old workflows cannot silently rewrite a prompt.
"""

from __future__ import annotations

import logging
from dataclasses import replace
from typing import Any

LOGGER = logging.getLogger(__name__)


def _keep_prompt_guard(original):
    if bool(getattr(original, "__h3studio_keep_prompt_guard__", False)):
        return original

    def guarded(*args: Any, **kwargs: Any):
        state = original(*args, **kwargs)
        options = state.prompt_options
        if str(options.enhance_mode) == "off" and bool(options.deep_enhancement):
            state = replace(
                state,
                prompt_options=replace(options, deep_enhancement=False),
            )
            LOGGER.info(
                "[H3 Studio] Repaired stale Director state: Keep my prompt disables Qwen prompt enhancement"
            )
        return state

    guarded.__h3studio_keep_prompt_guard__ = True
    return guarded


def install() -> None:
    from .nodes import director

    current = director._state_from_widgets
    if bool(getattr(current, "__h3studio_keep_prompt_guard__", False)):
        return
    director._state_from_widgets = _keep_prompt_guard(current)


__all__ = ["install"]
