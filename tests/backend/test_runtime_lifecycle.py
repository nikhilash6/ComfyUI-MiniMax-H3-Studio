from __future__ import annotations

import sys
from types import ModuleType, SimpleNamespace

from h3studio.runtime_lifecycle import (
    ensure_stage_ram_headroom,
    full_text_encoder_when_safe,
    model_patcher,
    release_stage_model,
)


def test_model_patcher_accepts_clip_vae_and_model_values() -> None:
    patcher = SimpleNamespace(clone_base_uuid="base", model=object())
    assert model_patcher(SimpleNamespace(patcher=patcher)) is patcher
    assert model_patcher(patcher) is patcher
    assert model_patcher(object()) is None


def test_release_uses_comfy_targeted_clone_family_only(monkeypatch) -> None:
    calls = []
    manager = ModuleType("comfy.model_management")
    manager.unload_model_and_clones = lambda *args, **kwargs: calls.append((args, kwargs))
    comfy = ModuleType("comfy")
    comfy.__path__ = []
    comfy.model_management = manager
    monkeypatch.setitem(sys.modules, "comfy", comfy)
    monkeypatch.setitem(sys.modules, "comfy.model_management", manager)
    patcher = SimpleNamespace(clone_base_uuid="base", model=object())

    assert release_stage_model(patcher, "sampler->vae") is True
    assert calls == [((patcher,), {"unload_additional_models": False, "all_devices": False})]


def _ram_handoff_stubs(monkeypatch, available_values):
    gib = 1024**3
    monkeypatch.setenv("H3STUDIO_RUNTIME_TRACE", "0")
    values = iter(available_values)
    psutil = ModuleType("psutil")
    psutil.virtual_memory = lambda: SimpleNamespace(total=32 * gib, available=next(values))

    calls = []
    manager = ModuleType("comfy.model_management")
    manager.synchronize = lambda: calls.append(("synchronize",))
    manager.free_pins = lambda size, **kwargs: calls.append(("free_pins", size, kwargs)) or size
    memory = ModuleType("comfy.memory_management")
    memory.RAM_CACHE_HEADROOM = 0
    memory.extra_ram_release = lambda target, **kwargs: calls.append(("cache", target, kwargs)) or 0
    comfy = ModuleType("comfy")
    comfy.__path__ = []
    comfy.model_management = manager
    comfy.memory_management = memory
    monkeypatch.setitem(sys.modules, "psutil", psutil)
    monkeypatch.setitem(sys.modules, "comfy", comfy)
    monkeypatch.setitem(sys.modules, "comfy.model_management", manager)
    monkeypatch.setitem(sys.modules, "comfy.memory_management", memory)
    monkeypatch.setattr("h3studio.runtime_lifecycle.time.sleep", lambda _seconds: None)
    return calls


def test_stage_handoff_preclaims_native_ram_headroom(monkeypatch) -> None:
    gib = 1024**3
    calls = _ram_handoff_stubs(monkeypatch, [1 * gib, 1 * gib, 14 * gib])

    released = ensure_stage_ram_headroom(
        "conditioning->transformer",
        14.0,
        evict_active_pins=True,
    )

    assert calls[0] == ("cache", 14 * gib, {"free_active": False})
    assert calls[1] == ("synchronize",)
    assert calls[2][0] == "free_pins"
    assert calls[2][1] == 13 * gib + 512 * 1024**2
    assert calls[2][2] == {"evict_active": True}
    assert released == calls[2][1]


def test_stage_handoff_is_noop_when_ram_is_healthy(monkeypatch) -> None:
    gib = 1024**3
    calls = _ram_handoff_stubs(monkeypatch, [20 * gib])

    assert ensure_stage_ram_headroom("conditioning->transformer", 10.0) == 0
    assert calls == []


def _manager_stubs(monkeypatch, *, free_bytes: int):
    calls = []
    manager = ModuleType("comfy.model_management")
    manager.get_free_memory = lambda _device: free_bytes
    manager.minimum_inference_memory = lambda: 2 * 1024**3
    manager.load_models_gpu = lambda *args, **kwargs: calls.append((args, kwargs))
    comfy = ModuleType("comfy")
    comfy.__path__ = []
    comfy.model_management = manager
    monkeypatch.setitem(sys.modules, "comfy", comfy)
    monkeypatch.setitem(sys.modules, "comfy.model_management", manager)
    return calls


def _fake_clip():
    gib = 1024**3
    patcher = SimpleNamespace(
        clone_base_uuid="encoder",
        model=object(),
        load_device="cuda:0",
        model_size=lambda: 15 * gib,
        loaded_size=lambda: 0,
        is_dynamic=lambda: False,
    )
    original_calls = []
    clip = SimpleNamespace(
        patcher=patcher,
        cond_stage_model=SimpleNamespace(memory_estimation_function=lambda _tokens, device: 2 * gib),
        load_model=lambda tokens=None: original_calls.append(tokens),
    )
    return clip, original_calls


def test_safe_text_encoder_stage_uses_one_official_full_load(monkeypatch) -> None:
    calls = _manager_stubs(monkeypatch, free_bytes=22 * 1024**3)
    clip, original_calls = _fake_clip()
    original = clip.load_model

    with full_text_encoder_when_safe(clip, {"tokens": 1}) as policy:
        assert policy.startswith("native-full-once")
        clip.load_model({"tokens": 1})

    assert clip.load_model is original
    assert original_calls == []
    assert calls[0][0] == ([clip.patcher],)
    assert calls[0][1] == {"memory_required": 2 * 1024**3, "force_full_load": True}


def test_low_vram_text_encoder_keeps_native_dynamic_loading(monkeypatch) -> None:
    calls = _manager_stubs(monkeypatch, free_bytes=16 * 1024**3)
    clip, original_calls = _fake_clip()
    original = clip.load_model

    with full_text_encoder_when_safe(clip, {"tokens": 1}) as policy:
        assert policy.startswith("native-dynamic")
        assert clip.load_model is original

    assert calls == []
    assert original_calls == []


def test_dynamic_patcher_does_not_claim_force_full_load(monkeypatch) -> None:
    calls = _manager_stubs(monkeypatch, free_bytes=22 * 1024**3)
    clip, original_calls = _fake_clip()
    clip.patcher.is_dynamic = lambda: True
    original = clip.load_model

    with full_text_encoder_when_safe(clip, {"tokens": 1}) as policy:
        assert policy == "native-dynamic; reason=dynamic-patcher"
        assert clip.load_model is original

    assert calls == []
    assert original_calls == []
