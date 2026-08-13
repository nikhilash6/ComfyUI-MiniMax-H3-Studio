from __future__ import annotations

import sys
from types import ModuleType, SimpleNamespace

sys.modules.setdefault("folder_paths", ModuleType("folder_paths"))
sys.modules.setdefault("nodes", ModuleType("nodes"))


class H3StudioSamplingPreset:
    def build(self, model, profile):
        return model, "sampler", "sigmas", profile


image_runtime = ModuleType("h3studio.nodes.image_runtime")
image_runtime.H3StudioSamplingPreset = H3StudioSamplingPreset
sys.modules.setdefault("h3studio.nodes.image_runtime", image_runtime)

import h3studio.nodes.director as director_module  # noqa: E402
from h3studio.context import H3StudioContext  # noqa: E402
from h3studio.nodes.director import H3StudioContextSamplingPreset  # noqa: E402


def _context(*, profile: str = "base_quality_20", custom_loras=()) -> H3StudioContext:
    state = SimpleNamespace(
        generation=SimpleNamespace(sampling_profile=profile),
        ui={"custom_loras": list(custom_loras)},
    )
    return H3StudioContext(
        schema_version=1,
        state=state,
        compile_result=None,
        resolution=None,
        route=SimpleNamespace(selected="fl2va"),
        images=(),
        image_filenames=(),
    )


def test_base_profile_reuses_one_shifted_model_identity(monkeypatch) -> None:
    source_model = object()
    built_model = object()
    calls = []
    monkeypatch.setattr(director_module, "_BASE_PATCH_CACHE_KEY", None)
    monkeypatch.setattr(director_module, "_BASE_PATCH_CACHE_VALUE", None)

    def build(_self, model, profile):
        calls.append((model, profile))
        return built_model, "sampler", "sigmas", "base-info"

    monkeypatch.setattr(H3StudioSamplingPreset, "build", build)
    preset = H3StudioContextSamplingPreset()
    context = _context()

    first = preset.build(source_model, context)
    second = preset.build(source_model, context)

    assert first[0] is built_model
    assert second[0] is built_model
    assert calls == [(source_model, "base quality | RES 20 steps")]
    assert "patch_cache=hit" in second[3]


def test_base_custom_lora_is_applied_before_stable_sampling_patch(monkeypatch) -> None:
    source_model = object()
    lora_model = object()
    built_model = object()
    calls = []
    monkeypatch.setattr(director_module, "_BASE_PATCH_CACHE_KEY", None)
    monkeypatch.setattr(director_module, "_BASE_PATCH_CACHE_VALUE", None)

    def apply_stack(model, specs, **_kwargs):
        calls.append(("lora", model, tuple(spec.name for spec in specs)))
        return lora_model, "custom_loras=1"

    def build(_self, model, profile):
        calls.append(("sampling", model, profile))
        return built_model, "sampler", "sigmas", "base-info"

    monkeypatch.setattr("h3studio.lora_stack.apply_custom_lora_stack", apply_stack)
    monkeypatch.setattr(H3StudioSamplingPreset, "build", build)
    context = _context(custom_loras=({"name": "style.safetensors", "strength": 0.8},))

    result = H3StudioContextSamplingPreset().build(source_model, context)

    assert result[0] is built_model
    assert calls == [
        ("lora", source_model, ("style.safetensors",)),
        ("sampling", lora_model, "base quality | RES 20 steps"),
    ]
    assert "custom_loras=1" in result[3]
