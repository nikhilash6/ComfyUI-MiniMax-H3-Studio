from __future__ import annotations

import importlib
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest


@pytest.fixture(autouse=True)
def _discard_stubbed_loader():
    yield
    sys.modules.pop("h3studio.nodes.loader", None)


def _load_with_models(monkeypatch, filenames):
    folder_paths = ModuleType("folder_paths")
    folder_paths.get_filename_list = lambda category: list(filenames) if category in {"text_encoders", "clip"} else []
    nodes = ModuleType("nodes")
    nodes.NODE_CLASS_MAPPINGS = {}
    comfy = ModuleType("comfy")
    comfy.__path__ = []
    model_management = ModuleType("comfy.model_management")
    comfy.model_management = model_management
    monkeypatch.setitem(sys.modules, "folder_paths", folder_paths)
    monkeypatch.setitem(sys.modules, "nodes", nodes)
    monkeypatch.setitem(sys.modules, "comfy", comfy)
    monkeypatch.setitem(sys.modules, "comfy.model_management", model_management)
    sys.modules.pop("h3studio.nodes.loader", None)
    return importlib.import_module("h3studio.nodes.loader")


def test_nvfp4_is_preferred_and_legacy_default_migrates(monkeypatch) -> None:
    nvfp4 = "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"
    int8 = "qwen3vl_32b_minimax_h3_int8_convrot.safetensors"
    loader = _load_with_models(monkeypatch, [int8, nvfp4])
    assert loader.clip_choices() == [nvfp4, int8]
    assert loader._resolve_text_encoder(int8) == nvfp4


def test_deliberately_named_int8_choice_is_respected(monkeypatch) -> None:
    nvfp4 = "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"
    explicit = "custom_qwen3vl_32b_minimax_h3_int8_convrot_v2.safetensors"
    loader = _load_with_models(monkeypatch, [explicit, nvfp4])
    assert loader._resolve_text_encoder(explicit) == explicit


def test_prompt_writer_supports_shared_4b_8b_and_mixed_choices(monkeypatch) -> None:
    loader = _load_with_models(
        monkeypatch,
        ["qwen3vl_4b_fp8_scaled.safetensors", "qwen3vl_8b_fp8_scaled.safetensors"],
    )
    choices = loader.prompt_writer_choices()
    assert choices[:3] == [loader.SAME_AS_ANALYZER, loader.AUTO_WRITER_4B, loader.AUTO_WRITER_8B]
    assert loader._resolve_prompt_writer(loader.SAME_AS_ANALYZER, "qwen3vl_8b_fp8_scaled.safetensors") == (
        "qwen3vl_8b_fp8_scaled.safetensors"
    )
    assert loader._resolve_prompt_writer(loader.AUTO_WRITER_4B, "qwen3vl_8b_fp8_scaled.safetensors") == (
        "qwen3vl_4b_fp8_scaled.safetensors"
    )
    assert loader._resolve_prompt_writer(loader.AUTO_WRITER_8B, "qwen3vl_4b_fp8_scaled.safetensors") == (
        "qwen3vl_8b_fp8_scaled.safetensors"
    )
    assert loader._resolve_prompt_writer(loader.DETERMINISTIC_WRITER, "qwen3vl_4b_fp8_scaled.safetensors") is None

    shared = object()
    bundle = loader.H3StudioBundle(
        fl2va_name="fl.safetensors",
        ref2va_name="ref.safetensors",
        clip_name="h3.safetensors",
        video_vae_name="vae.safetensors",
        image_vae_name=None,
        analyzer_name="qwen3vl_4b_fp8_scaled.safetensors",
        prompt_writer_name="qwen3vl_4b_fp8_scaled.safetensors",
        clip=object(),
        video_vae=object(),
        analyzer_clip=shared,
    )
    assert bundle.writer_for_enhancement() is shared


def test_resident_h3_encoder_policy_selects_l4_but_not_16gb(monkeypatch, tmp_path: Path) -> None:
    loader = _load_with_models(monkeypatch, ["qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"])
    checkpoint = tmp_path / "encoder.safetensors"
    checkpoint.write_bytes(b"x")
    monkeypatch.setattr(loader.Path, "stat", lambda _self: type("Stat", (), {"st_size": int(14.61 * 1024**3)})())
    monkeypatch.setattr(
        loader.folder_paths,
        "get_full_path_or_raise",
        lambda _category, _name: str(checkpoint),
        raising=False,
    )
    loader.comfy.model_management.text_encoder_device = lambda: "cuda:0"
    loader.comfy.model_management.minimum_inference_memory = lambda: int(1.2 * 1024**3)

    loader.comfy.model_management.get_total_memory = lambda _device: 22 * 1024**3
    resident, policy = loader._resident_h3_text_encoder_policy(checkpoint.name)
    assert resident is True
    assert policy.startswith("resident-direct")

    loader.comfy.model_management.get_total_memory = lambda _device: 16 * 1024**3
    resident, policy = loader._resident_h3_text_encoder_policy(checkpoint.name)
    assert resident is False
    assert policy.startswith("native-dynamic")


def test_l4_loads_h3_encoder_with_official_non_dynamic_patcher(monkeypatch, tmp_path: Path) -> None:
    loader = _load_with_models(monkeypatch, ["qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"])
    checkpoint = tmp_path / "encoder.safetensors"
    checkpoint.write_bytes(b"x")
    monkeypatch.setattr(loader.Path, "stat", lambda _self: type("Stat", (), {"st_size": int(14.61 * 1024**3)})())
    monkeypatch.setattr(
        loader.folder_paths,
        "get_full_path_or_raise",
        lambda _category, _name: str(checkpoint),
        raising=False,
    )
    monkeypatch.setattr(loader.folder_paths, "get_folder_paths", lambda _category: [str(tmp_path)], raising=False)
    loader.comfy.model_management.text_encoder_device = lambda: "cuda:0"
    loader.comfy.model_management.minimum_inference_memory = lambda: int(1.2 * 1024**3)
    loader.comfy.model_management.get_total_memory = lambda _device: 22 * 1024**3

    calls = []
    expected = object()
    sd = ModuleType("comfy.sd")
    sd.CLIPType = SimpleNamespace(MINIMAX="minimax")
    sd.load_clip = lambda **kwargs: calls.append(kwargs) or expected
    loader.comfy.sd = sd
    monkeypatch.setitem(sys.modules, "comfy.sd", sd)

    assert loader._load_clip(checkpoint.name) is expected
    assert calls[0]["disable_dynamic"] is True
    assert calls[0]["clip_type"] == "minimax"
    assert calls[0]["model_options"] == {"initial_device": "cuda:0"}


def test_text_encoder_handle_discards_and_reloads_completed_stage(monkeypatch) -> None:
    loader = _load_with_models(monkeypatch, ["qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"])
    first = SimpleNamespace(marker="first")
    second = SimpleNamespace(marker="second")
    releases = []
    lifecycle = ModuleType("h3studio.runtime_lifecycle")
    lifecycle.release_stage_model = lambda value, transition: releases.append((value, transition)) or True
    monkeypatch.setitem(sys.modules, "h3studio.runtime_lifecycle", lifecycle)
    monkeypatch.setattr(loader, "_load_clip", lambda _name: second)

    handle = loader.H3StudioTextEncoder("encoder.safetensors", first)
    assert handle.materialize() is first
    assert handle.discard() is True
    assert releases == [(first, "text-encoder->transformer")]
    assert handle.materialize() is second
