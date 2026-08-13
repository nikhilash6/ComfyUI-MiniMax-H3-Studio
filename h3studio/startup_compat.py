"""Recoverable startup guards for known conflicting MiniMax frontends."""

from __future__ import annotations

import os
from collections.abc import Callable
from pathlib import Path

LEGACY_EASY_UI = "minimax_h3_easy_ui.js"


def _enabled(value: str | None) -> bool:
    return value is None or value.strip().lower() not in {"0", "false", "no", "off"}


def quarantine_conflicting_frontends(
    custom_node_root: Path,
    environ: dict[str, str] | None = None,
    printer: Callable[[str], None] = print,
) -> tuple[Path, ...]:
    """Disable the old Easy UI file that globally wraps the same Studio nodes.

    The backend node remains installed. Renaming only the exact conflicting JS
    file is reversible and prevents two ordered-media serializers plus two
    media-preview lifecycles from stacking on every ComfyUI queue operation.
    """

    env = os.environ if environ is None else environ
    if not _enabled(env.get("H3STUDIO_QUARANTINE_LEGACY_EASY_UI")):
        return ()
    custom_nodes = custom_node_root.parent
    quarantined = []
    for source in custom_nodes.rglob(LEGACY_EASY_UI):
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


__all__ = ["LEGACY_EASY_UI", "quarantine_conflicting_frontends"]
