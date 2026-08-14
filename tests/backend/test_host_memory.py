from __future__ import annotations

from types import ModuleType

import h3studio.host_memory as host_memory


def _pressure(available_gib: float, swap_used_ratio: float, pinned_gib: float = 14.0):
    total = 32 * host_memory.GIB
    swap_total = 16 * host_memory.GIB
    swap_free = int(swap_total * (1.0 - swap_used_ratio))
    return host_memory.HostPressure(
        total=total,
        available=int(available_gib * host_memory.GIB),
        swap_total=swap_total,
        swap_free=swap_free,
        shmem=0,
        pinned=int(pinned_gib * host_memory.GIB),
    )


def test_healthy_host_does_not_touch_comfy_manager(monkeypatch) -> None:
    calls = []
    manager = ModuleType("comfy.model_management")
    manager.TOTAL_PINNED_MEMORY = 14 * host_memory.GIB
    manager.ensure_pin_budget = lambda *_args, **_kwargs: calls.append("called") or True
    memory_management = ModuleType("comfy.memory_management")
    memory_management.RAM_CACHE_HEADROOM = 4 * host_memory.GIB

    monkeypatch.setattr(host_memory, "_import_manager", lambda: (manager, memory_management))
    state = _pressure(available_gib=8.0, swap_used_ratio=0.10)
    monkeypatch.setattr(host_memory, "snapshot", lambda _manager=None: state)

    result = host_memory.relieve_host_memory_pressure("conditioning.text.done")
    assert result.attempted is False
    assert calls == []


def test_critical_ram_uses_comfy_ensure_pin_budget_without_active_eviction(monkeypatch) -> None:
    calls = []
    manager = ModuleType("comfy.model_management")
    manager.TOTAL_PINNED_MEMORY = 14 * host_memory.GIB

    def ensure(size, **kwargs):
        calls.append((size, kwargs))
        manager.TOTAL_PINNED_MEMORY = 10 * host_memory.GIB
        return True

    manager.ensure_pin_budget = ensure
    memory_management = ModuleType("comfy.memory_management")
    memory_management.RAM_CACHE_HEADROOM = 4 * host_memory.GIB

    monkeypatch.setattr(host_memory, "_import_manager", lambda: (manager, memory_management))
    states = iter([
        _pressure(available_gib=2.0, swap_used_ratio=0.90, pinned_gib=14.0),
        _pressure(available_gib=5.0, swap_used_ratio=0.80, pinned_gib=10.0),
    ])
    monkeypatch.setattr(host_memory, "snapshot", lambda _manager=None: next(states))

    result = host_memory.relieve_host_memory_pressure("conditioning.text.done")
    assert result.attempted is True
    assert result.manager_result is True
    assert len(calls) == 1
    requested, kwargs = calls[0]
    assert requested == 4 * host_memory.GIB
    assert kwargs == {"evict_active": False, "loaded": False}


def test_swap_pressure_forces_real_headroom_even_when_available_ram_recovered(monkeypatch) -> None:
    calls = []
    manager = ModuleType("comfy.model_management")
    manager.TOTAL_PINNED_MEMORY = 12 * host_memory.GIB
    manager.ensure_pin_budget = lambda size, **kwargs: calls.append((size, kwargs)) or True
    memory_management = ModuleType("comfy.memory_management")
    memory_management.RAM_CACHE_HEADROOM = 4 * host_memory.GIB

    monkeypatch.setattr(host_memory, "_import_manager", lambda: (manager, memory_management))
    states = iter([
        _pressure(available_gib=7.0, swap_used_ratio=0.90, pinned_gib=12.0),
        _pressure(available_gib=7.0, swap_used_ratio=0.85, pinned_gib=12.0),
    ])
    monkeypatch.setattr(host_memory, "snapshot", lambda _manager=None: next(states))

    result = host_memory.relieve_host_memory_pressure("conditioning.text.done")
    assert result.attempted is True
    assert calls == [
        (7 * host_memory.GIB, {"evict_active": False, "loaded": False}),
    ]
