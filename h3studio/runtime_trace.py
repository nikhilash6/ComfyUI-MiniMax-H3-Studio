"""Passive stage-boundary telemetry for constrained H3 runtimes.

The collector deliberately does not synchronize CUDA, clear caches, load or
unload models, or walk model state dictionaries. It reads lightweight counters
at stage boundaries so paging/reclaim stalls can be proved instead of guessed.
"""

from __future__ import annotations

import itertools
import logging
import os
import time
from collections.abc import Iterator
from contextlib import contextmanager, suppress
from pathlib import Path
from typing import Any

LOGGER = logging.getLogger(__name__)
PREFIX = "[H3 Studio Runtime]"
GIB = 1024**3
_SEQUENCE = itertools.count(1)
_STARTED = time.monotonic()


def _flag(name: str, default: bool) -> bool:
    value = str(os.environ.get(name, "1" if default else "0")).strip().lower()
    return value in {"1", "true", "yes", "on"}


def enabled() -> bool:
    return _flag("H3STUDIO_RUNTIME_TRACE", True)


def _clean(value: Any) -> str:
    if value is None:
        return "none"
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, float):
        return f"{value:.4f}"
    return str(value).replace("\n", "\\n").replace("\r", "\\r").replace(" | ", "/")


def _proc_meminfo() -> dict[str, int]:
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


def _proc_vmstat() -> dict[str, int]:
    wanted = {"pgmajfault", "pswpin", "pswpout"}
    values: dict[str, int] = {}
    pgscan = 0
    pgsteal = 0
    try:
        for line in Path("/proc/vmstat").read_text(encoding="utf-8").splitlines():
            key, _, raw = line.partition(" ")
            if key in wanted:
                values[key] = int(raw)
            elif key.startswith("pgscan_"):
                pgscan += int(raw)
            elif key.startswith("pgsteal_"):
                pgsteal += int(raw)
    except (OSError, ValueError):
        pass
    if pgscan:
        values["pgscan_total"] = pgscan
    if pgsteal:
        values["pgsteal_total"] = pgsteal
    return values


def _process_swap_bytes() -> int:
    try:
        for line in Path("/proc/self/smaps_rollup").read_text(encoding="utf-8").splitlines():
            if line.startswith("Swap:"):
                return int(line.split()[1]) * 1024
    except (OSError, ValueError, IndexError):
        pass
    return 0


def _process_fields() -> dict[str, Any]:
    fields: dict[str, Any] = {}
    meminfo = _proc_meminfo()
    try:
        import psutil

        process = psutil.Process()
        memory = psutil.virtual_memory()
        swap = psutil.swap_memory()
        fields.update(
            ram_total_gib=int(memory.total) / GIB,
            ram_available_gib=int(memory.available) / GIB,
            ram_used_pct=float(memory.percent),
            swap_total_gib=int(swap.total) / GIB,
            swap_free_gib=int(swap.free) / GIB,
            swap_used_gib=int(swap.used) / GIB,
            rss_gib=int(process.memory_info().rss) / GIB,
            process_swap_gib=_process_swap_bytes() / GIB,
        )
        io = process.io_counters()
        fields.update(
            io_read_gib=int(getattr(io, "read_bytes", 0)) / GIB,
            io_write_gib=int(getattr(io, "write_bytes", 0)) / GIB,
        )
    except Exception:
        pass

    if meminfo:
        fields.update(
            mem_cached_gib=(
                meminfo.get("Cached", 0)
                + meminfo.get("SReclaimable", 0)
                - meminfo.get("Shmem", 0)
            )
            / GIB,
            swap_cached_gib=meminfo.get("SwapCached", 0) / GIB,
            shmem_gib=meminfo.get("Shmem", 0) / GIB,
            sreclaimable_gib=meminfo.get("SReclaimable", 0) / GIB,
        )

    try:
        import resource

        usage = resource.getrusage(resource.RUSAGE_SELF)
        fields["page_fault_minor"] = int(usage.ru_minflt)
        fields["page_fault_major"] = int(usage.ru_majflt)
    except Exception:
        pass

    vmstat = _proc_vmstat()
    if vmstat:
        fields.update(
            vm_pgmajfault=vmstat.get("pgmajfault", 0),
            vm_pswpin=vmstat.get("pswpin", 0),
            vm_pswpout=vmstat.get("pswpout", 0),
            vm_pgscan_total=vmstat.get("pgscan_total", 0),
            vm_pgsteal_total=vmstat.get("pgsteal_total", 0),
        )
    return fields


def _cuda_fields() -> dict[str, Any]:
    fields: dict[str, Any] = {}
    try:
        import torch

        if torch.cuda.is_available():
            device = torch.cuda.current_device()
            free, total = torch.cuda.mem_get_info(device)
            fields.update(
                vram_free_gib=int(free) / GIB,
                vram_total_gib=int(total) / GIB,
                cuda_allocated_gib=int(torch.cuda.memory_allocated(device)) / GIB,
                cuda_reserved_gib=int(torch.cuda.memory_reserved(device)) / GIB,
            )
    except Exception:
        pass
    return fields


def patcher_fields(patcher: Any, prefix: str = "patcher") -> dict[str, Any]:
    if patcher is None:
        return {f"{prefix}_id": "none"}
    model = getattr(patcher, "model", None)
    parent = getattr(patcher, "parent", None)
    dynamic_probe = getattr(patcher, "is_dynamic", False)
    with suppress(Exception):
        if callable(dynamic_probe):
            dynamic_probe = dynamic_probe()
    fields: dict[str, Any] = {
        f"{prefix}_id": id(patcher),
        f"{prefix}_model_id": id(model) if model is not None else "none",
        f"{prefix}_parent_id": id(parent) if parent is not None else "none",
        f"{prefix}_class": type(model).__name__ if model is not None else type(patcher).__name__,
        f"{prefix}_dynamic": bool(dynamic_probe),
    }
    for label, method_name in (("loaded_gib", "loaded_size"), ("pinned_gib", "pinned_memory_size")):
        method = getattr(patcher, method_name, None)
        if callable(method):
            with suppress(Exception):
                fields[f"{prefix}_{label}"] = int(method()) / GIB
    size = int(getattr(patcher, "size", 0) or 0)
    if size > 0:
        fields[f"{prefix}_size_gib"] = size / GIB
    return fields


def _manager_fields() -> dict[str, Any]:
    fields: dict[str, Any] = {}
    try:
        import comfy.model_management as manager

        fields.update(
            pinned_total_gib=int(getattr(manager, "TOTAL_PINNED_MEMORY", 0)) / GIB,
            pinned_budget_gib=max(0, int(getattr(manager, "MAX_PINNED_MEMORY", 0))) / GIB,
            fast_disk=bool(getattr(getattr(manager, "args", None), "fast_disk", False)),
        )
        getter = getattr(manager, "loaded_models", None)
        loaded = tuple(getter()) if callable(getter) else ()
        fields["loaded_model_count"] = len(loaded)
        expand_models = _flag("H3STUDIO_RUNTIME_TRACE_MODELS", True)
        summaries = []
        for item in loaded:
            summary = f"{type(getattr(item, 'model', item)).__name__}:{id(item)}"
            if expand_models:
                identity = patcher_fields(item)
                summary = f"{summary}:{float(identity.get('patcher_loaded_gib', 0)):.2f}GiB"
            summaries.append(summary)
        fields["loaded_patchers"] = ",".join(summaries) or "none"
    except Exception:
        pass
    return fields


def snapshot() -> dict[str, Any]:
    fields = _process_fields()
    fields.update(_manager_fields())
    fields.update(_cuda_fields())
    return fields


def model_source_fields(category: str, name: str, prefix: str) -> dict[str, Any]:
    """Resolve one configured model source once, outside execution hot loops."""

    fields: dict[str, Any] = {f"{prefix}_name": name}
    try:
        import folder_paths

        path = folder_paths.get_full_path(category, name)
        fallback_category = {"diffusion_models": "unet", "text_encoders": "clip"}.get(category)
        if not path and fallback_category:
            path = folder_paths.get_full_path(fallback_category, name)
        if path:
            realpath = os.path.realpath(path)
            fields.update(
                {
                    f"{prefix}_path": path,
                    f"{prefix}_realpath": realpath,
                    f"{prefix}_device": os.stat(realpath).st_dev,
                    f"{prefix}_tmpfs": realpath.startswith(("/dev/shm/", "/run/shm/")),
                }
            )
            try:
                import psutil

                candidates = [
                    part
                    for part in psutil.disk_partitions(all=True)
                    if realpath.startswith(part.mountpoint)
                ]
                if candidates:
                    mount = max(candidates, key=lambda part: len(part.mountpoint))
                    fields[f"{prefix}_filesystem"] = mount.fstype
                    fields[f"{prefix}_mount"] = mount.mountpoint
            except Exception:
                pass
    except Exception as error:
        fields[f"{prefix}_path_error"] = type(error).__name__
    return fields


def emit(event: str, *, state: bool = False, patcher: Any = None, **fields: Any) -> None:
    if not enabled():
        return
    payload: dict[str, Any] = {
        "seq": next(_SEQUENCE),
        "uptime_s": time.monotonic() - _STARTED,
        "event": event,
        **fields,
    }
    if patcher is not None:
        payload.update(patcher_fields(patcher))
    if state:
        payload.update(snapshot())
    LOGGER.info(
        "%s %s",
        PREFIX,
        " | ".join(f"{key}={_clean(value)}" for key, value in payload.items()),
    )


_DELTA_FIELDS = {
    "vm_pgmajfault": "delta_pgmajfault",
    "vm_pswpin": "delta_pswpin",
    "vm_pswpout": "delta_pswpout",
    "vm_pgscan_total": "delta_pgscan",
    "vm_pgsteal_total": "delta_pgsteal",
    "io_read_gib": "delta_io_read_gib",
    "io_write_gib": "delta_io_write_gib",
    "page_fault_major": "delta_process_major_faults",
}


def _stage_deltas(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    deltas: dict[str, Any] = {}
    for source, target in _DELTA_FIELDS.items():
        a = before.get(source)
        b = after.get(source)
        if isinstance(a, (int, float)) and isinstance(b, (int, float)):
            deltas[target] = b - a
    return deltas


@contextmanager
def span(
    event: str,
    *,
    state: bool = False,
    patcher: Any = None,
    **fields: Any,
) -> Iterator[dict[str, Any]]:
    started = time.monotonic()
    result: dict[str, Any] = {}
    before = snapshot() if state and enabled() else {}
    emit(
        f"{event}.begin",
        state=False,
        patcher=patcher,
        **fields,
        **before,
    )
    try:
        yield result
    except Exception as error:
        after = snapshot() if state and enabled() else {}
        emit(
            f"{event}.error",
            state=False,
            patcher=patcher,
            elapsed_s=time.monotonic() - started,
            error_type=type(error).__name__,
            error=str(error),
            **fields,
            **after,
            **_stage_deltas(before, after),
        )
        raise
    else:
        after = snapshot() if state and enabled() else {}
        emit(
            f"{event}.end",
            state=False,
            patcher=patcher,
            elapsed_s=time.monotonic() - started,
            **fields,
            **result,
            **after,
            **_stage_deltas(before, after),
        )


__all__ = [
    "emit",
    "enabled",
    "model_source_fields",
    "patcher_fields",
    "snapshot",
    "span",
]
