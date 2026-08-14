from __future__ import annotations

from pathlib import Path


def test_llama_cpp_builder_is_fixed_source_and_pinned() -> None:
    source = Path("h3studio/llama_cpp_dependency.py").read_text(encoding="utf-8")
    assert 'LLAMA_REPO = "https://github.com/ggml-org/llama.cpp.git"' in source
    assert 'LLAMA_COMMIT = "7e4c0a96880dae4fc4268ad441f8a6446bd5460a"' in source
    assert '"--target", "llama-server", "llama-mtmd-cli", "llama-cli"' in source
    assert 'f"-DCMAKE_CUDA_ARCHITECTURES={arch}"' in source
    assert "Refusing a silent CPU build" in source


def test_qwen35_gguf_is_installed_after_existing_prompt_guards() -> None:
    source = Path("h3studio/extension.py").read_text(encoding="utf-8")
    assert source.index("install_prompt_prep_hotfix_v2()") < source.index("install_qwen35_gguf()")
    assert source.index("install_qwen35_gguf()") < source.index("install_qwen35_gguf_text_fallback()")
    assert "register_llama_cpp_routes()" in source


def test_runtime_guard_closes_external_llama_helper_before_h3() -> None:
    source = Path("h3studio/runtime_guards.py").read_text(encoding="utf-8")
    assert "_close_external_helper(analyzer)" in source
    assert "_close_external_helper(writer)" in source
    assert "Released optional analyzer/writer before H3 conditioning" in source
