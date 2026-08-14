from __future__ import annotations

import sys
from types import ModuleType, SimpleNamespace

from h3studio.runtime_lifecycle import (
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
