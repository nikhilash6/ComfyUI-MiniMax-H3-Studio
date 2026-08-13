from __future__ import annotations

import sys
from types import ModuleType, SimpleNamespace

from h3studio.runtime_lifecycle import model_patcher, release_stage_model


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
