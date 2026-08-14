"""Recoverable startup guards for known conflicting MiniMax frontends."""

from __future__ import annotations

import os
from collections.abc import Callable
from pathlib import Path

LEGACY_EASY_UI = "minimax_h3_easy_ui.js"
LEGACY_H3_HUB_UI = "h3_studio_hub_v5_40.js"
CONFLICTING_FRONTENDS = (LEGACY_EASY_UI, LEGACY_H3_HUB_UI)


def _enabled(value: str | None) -> bool:
    return value is None or value.strip().lower() not in {"0", "false", "no", "off"}


def quarantine_conflicting_frontends(
    custom_node_root: Path,
    environ: dict[str, str] | None = None,
    printer: Callable[[str], None] = print,
) -> tuple[Path, ...]:
    """Disable only known conflicting frontend files while preserving backends.

    The legacy Easy UI and H3 Studio Hub both install browser-side wrappers that
    can stack with the current Studio frontend. The Hub backend also owns nodes
    used by the Lightning launcher, so disabling the whole package is incorrect.
    Rename only the exact conflicting JavaScript files; keep every Python module
    and node registration intact.
    """

    env = os.environ if environ is None else environ
    if not _enabled(env.get("H3STUDIO_QUARANTINE_LEGACY_EASY_UI")):
        return ()

    custom_nodes = custom_node_root.parent
    quarantined: list[Path] = []
    for frontend_name in CONFLICTING_FRONTENDS:
        for source in custom_nodes.rglob(frontend_name):
            if custom_node_root in source.parents or source.is_symlink() or not source.is_file():
                continue
            destination = source.with_name(source.name + ".h3studio-disabled")
            if destination.exists():
                destination = source.with_name(source.name + f".h3studio-disabled-{os.getpid()}")
            try:
                os.replace(source, destination)
            except OSError as error:
                printer(f"[H3 Studio] Could not disable conflicting legacy frontend {source}: {error}")
                continue
            quarantined.append(destination)
            printer(f"[H3 Studio] Disabled conflicting legacy frontend: {source}")
            printer(f"[H3 Studio] Recoverable backup: {destination}")
    return tuple(quarantined)


__all__ = [
    "CONFLICTING_FRONTENDS",
    "LEGACY_EASY_UI",
    "LEGACY_H3_HUB_UI",
    "quarantine_conflicting_frontends",
]
