"""Pressure-aware handoff to ComfyUI's native pinned-memory manager.

This module never unloads models itself. It only asks ComfyUI's existing
ensure_pin_budget() policy to release stale/inactive host pins when the machine
is under real RAM or swap pressure.
"""

from __future__ import annotations

import logging
import os
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from typing import Any

LOGGER = logging.getLogger(__name__)
GIB = 1024**3


def _flag(name: str, default: bool) -> bool:
    value = str(os.environ.get(name, "1" if default else "0")).strip().lower()
    return value in {"1", "true", "yes", "on"}


def _gib_env(name: str, default: float) -> int:
    try:
        return max(0, int(float(os.environ.get(name, str(default))) * GIB))
    except (TypeError, ValueError):
        return int(default * GIB)


def _meminfo() -> dict[str, int]:
    values: dict[str, int] = {}
    try:
        for line in Path("/proc/meminfo").read_text(encoding="utf-8").splitlines():
            key, _, rest = line.partition(":")
            if not rest:
                continue
            values[key] = int(rest.strip().split()[0]) * 1024
    except (OSError, ValueError, IndexError):
        pass
    return values


@dataclass(frozen=True)
class HostPressure:
    total: int
    available: int
    swap_total: int
    swap_free: int
    shmem: int
    pinned: int

    @property
    def swap_used_ratio(self) -> float:
        if self.swap_total <= 0:
            return 0.0
        return max(0.0, min(1.0, (self.swap_total - self.swap_free) / self.swap_total))


@dataclass(frozen=True)
class PressureRelief:
    stage: str
    attempted: bool
    manager_result: bool | None
    before: HostPressure
    after: HostPressure
    requested_bytes: int
    reason: str


def snapshot(manager: Any | None = None) -> HostPressure:
    info = _meminfo()
    pinned = 0
    if manager is not None:
        try:
            pinned = max(0, int(getattr(manager, "TOTAL_PINNED_MEMORY", 0)))
        except Exception:
            pinned = 0
    return HostPressure(
        total=info.get("MemTotal", 0),
        available=info.get("MemAvailable", 0),
        swap_total=info.get("SwapTotal", 0),
        swap_free=info.get("SwapFree", 0),
        shmem=info.get("Shmem", 0),
        pinned=pinned,
    )


def _import_manager():
    try:
        import comfy.memory_management as memory_management
        import comfy.model_management as manager

        return manager, memory_management
    except Exception:
        return None, None


def _pressure_reason(state: HostPressure, warning: int, critical: int) -> tuple[bool, int, str]:
    swap_pressure = state.swap_total > 0 and state.swap_used_ratio >= 0.75
    critical_ram = state.available > 0 and state.available < critical
    warning_ram = state.available > 0 and state.available < warning

    if critical_ram:
        return True, warning, f"MemAvailable {state.available / GIB:.2f} GiB below critical floor"
    if swap_pressure:
        # A swap-heavy warm state can have temporarily decent MemAvailable while
        # stale pinned model pages are still keeping useful file-backed pages out.
        # Ask Comfy for a modest extra 2 GiB of headroom so this path cannot
        # collapse into a no-op merely because available RAM bounced above 6 GiB.
        desired = max(warning, state.available + 2 * GIB)
        return True, desired, f"swap {state.swap_used_ratio * 100:.1f}% used"
    if warning_ram and state.swap_used_ratio >= 0.50:
        return True, warning, (
            f"MemAvailable {state.available / GIB:.2f} GiB with "
            f"swap {state.swap_used_ratio * 100:.1f}% used"
        )
    return False, critical, "headroom healthy"


def relieve_host_memory_pressure(
    stage: str,
    *,
    logger: logging.Logger | None = None,
) -> PressureRelief:
    """Ask ComfyUI to shed only stale/inactive pins when host pressure is real."""

    log = LOGGER if logger is None else logger
    manager, memory_management = _import_manager()
    before = snapshot(manager)

    if not _flag("H3STUDIO_HOST_MEMORY_GUARD", True):
        return PressureRelief(stage, False, None, before, before, 0, "guard disabled")

    warning = _gib_env("H3STUDIO_HOST_MEMORY_WARNING_GIB", 6.0)
    critical = _gib_env("H3STUDIO_HOST_MEMORY_CRITICAL_GIB", 4.0)
    should_relieve, desired_available, reason = _pressure_reason(before, warning, critical)
    if not should_relieve:
        return PressureRelief(stage, False, None, before, before, 0, reason)

    ensure = getattr(manager, "ensure_pin_budget", None) if manager is not None else None
    if not callable(ensure):
        return PressureRelief(
            stage,
            False,
            None,
            before,
            before,
            0,
            f"{reason}; Comfy ensure_pin_budget unavailable",
        )

    base_headroom = 2 * GIB
    if memory_management is not None:
        with suppress(Exception):
            base_headroom = max(
                int(getattr(memory_management, "RAM_CACHE_HEADROOM", 0)) // 2,
                2 * GIB,
            )

    requested = max(0, desired_available - base_headroom)
    try:
        manager_result = bool(ensure(requested, evict_active=False, loaded=False))
    except TypeError:
        manager_result = bool(ensure(requested))
    except Exception as error:
        after = snapshot(manager)
        log.warning(
            "[H3 Host] %s pressure relief failed: %s: %s",
            stage,
            type(error).__name__,
            error,
        )
        return PressureRelief(
            stage,
            True,
            False,
            before,
            after,
            requested,
            f"{reason}; manager error {type(error).__name__}",
        )

    after = snapshot(manager)
    log.info(
        "[H3 Host] %s | %s | Comfy pin relief=%s | requested=%.2f GiB | "
        "MemAvailable %.2f→%.2f GiB | pinned %.2f→%.2f GiB | SwapFree %.2f→%.2f GiB",
        stage,
        reason,
        manager_result,
        requested / GIB,
        before.available / GIB,
        after.available / GIB,
        before.pinned / GIB,
        after.pinned / GIB,
        before.swap_free / GIB,
        after.swap_free / GIB,
    )
    return PressureRelief(stage, True, manager_result, before, after, requested, reason)


__all__ = [
    "HostPressure",
    "PressureRelief",
    "relieve_host_memory_pressure",
    "snapshot",
]
