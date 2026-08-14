from __future__ import annotations

import inspect

import pytest

from h3studio import analyzer_runtime_fixes, analyzer_stack


def test_model_family_detection_keeps_h3_conditioner_separate() -> None:
    assert analyzer_stack.model_family("qwen3.5_4b_bf16.safetensors") == "qwen35"
    assert analyzer_stack.model_family("qwen3vl_8b_fp8_scaled.safetensors") == "qwen3vl"
    assert analyzer_stack.model_family("MiniCPM-V-4_6-Q4_K_M.gguf") == "minicpm_v46"
    assert analyzer_stack._is_h3_conditioner("qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors")


def test_old_auto_default_migrates_but_explicit_legacy_file_does_not(monkeypatch) -> None:
    monkeypatch.setattr(analyzer_stack, "preferred_qwen35", lambda size="4b": f"qwen3.5_{size}_bf16.safetensors")
    assert analyzer_stack.resolve_analyzer(analyzer_stack.OLD_AUTO_ANALYZER) == "qwen3.5_4b_bf16.safetensors"
    explicit = "qwen3vl_8b_fp8_scaled.safetensors"
    assert analyzer_stack.resolve_analyzer(explicit) == explicit


def test_minicpm_same_writer_resolves_to_qwen35_4b(monkeypatch) -> None:
    monkeypatch.setattr(analyzer_stack, "preferred_qwen35", lambda size="4b": "qwen3.5_4b_bf16.safetensors")
    assert analyzer_stack.resolve_writer("Same as image analyzer", analyzer_stack.FASTEST_MINICPM_V46) == "qwen3.5_4b_bf16.safetensors"


def test_minicpm_spec_requires_separate_projector() -> None:
    spec = analyzer_stack.analyzer_spec(analyzer_stack.FASTEST_MINICPM_V46)
    assert spec is not None
    assert spec.family == "minicpm_v46"
    assert spec.backend == "llama.cpp/mtmd"
    assert spec.model_file == analyzer_stack.MINICPM_V46_FILE
    assert spec.mmproj_file == analyzer_stack.MINICPM_V46_MMPROJ
    assert spec.can_write is False


def test_compact_analysis_contract_keeps_references_schema() -> None:
    assert '"references"' in analyzer_runtime_fixes.SYSTEM_INSTRUCTION
    assert '"images"' not in analyzer_runtime_fixes.SYSTEM_INSTRUCTION
    assert "35-60" in analyzer_runtime_fixes.SYSTEM_INSTRUCTION


def test_compact_analysis_validator_accepts_dense_records_and_rejects_essays() -> None:
    words = " ".join(["visible"] * 45)
    result = analyzer_runtime_fixes._validate_records(
        {"references": [{"ordinal": 1, "role": "character", "description": words}]},
        {1},
    )
    assert result[1]["description"] == words

    with pytest.raises(ValueError, match="hard range"):
        analyzer_runtime_fixes._validate_records(
            {"references": [{"ordinal": 1, "description": " ".join(["word"] * 91)}]},
            {1},
        )


def test_compact_generate_forces_deterministic_ceiling() -> None:
    class Raw:
        def generate(self, _tokens, **kwargs):
            return kwargs

    class Proxy:
        raw_clip = Raw()
        _image_count = 2

    result = analyzer_runtime_fixes._compact_generate(
        Proxy(),
        object(),
        max_length=9999,
        do_sample=True,
    )
    assert result["do_sample"] is False
    assert result["max_length"] == 248


def test_minicpm_decode_accepts_comfy_decode_kwargs() -> None:
    assert analyzer_runtime_fixes._minicpm_decode('{"references":[]}', skip_special_tokens=True) == '{"references":[]}'


def test_writer_validation_does_not_require_aesthetic_keyword_checklists() -> None:
    candidate = " ".join(
        [
            "Create",
            "a",
            "single",
            "coherent",
            "JoJo-inspired",
            "anime",
            "portrait",
        ]
        + ["visual"] * 90
    )
    failures = analyzer_runtime_fixes._hard_writer_failures(candidate, "make this JoJo style")
    assert not any("JoJo" in failure or "angular" in failure or "cross-hatch" in failure for failure in failures)


def test_writer_fallback_is_bounded_instead_of_becoming_an_essay() -> None:
    class Ref:
        ordinal = 1
        effective_role = "character"
        retention = "fully_preserved"

    prompt = " ".join(["detailed"] * 900)
    result = analyzer_runtime_fixes._compact_fallback_prompt(prompt, [Ref()])
    assert len(result.split()) <= 220
    assert "@Image1" in result


def test_qwen35_native_loader_requests_non_dynamic_comfy_clip() -> None:
    source = inspect.getsource(analyzer_runtime_fixes._load_native_qwen35_resident)
    assert "load_text_encoder_state_dicts" in source
    assert "disable_dynamic=True" in source
    assert "CLIPType.STABLE_DIFFUSION" in source


def test_writer_second_generation_is_reserved_for_json_repair() -> None:
    source = inspect.getsource(analyzer_runtime_fixes._run_prompt_writer_fast)
    assert "for attempt, ceiling in enumerate((224, 160)" in source
    assert "previous response could not be parsed" in source
    assert "JoJo style lacks concrete traits" not in source
