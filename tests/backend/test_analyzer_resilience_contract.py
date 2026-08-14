from __future__ import annotations

from pathlib import Path


def test_prompt_prep_hotfix_is_installed_after_runtime_guard():
    source = Path("h3studio/extension.py").read_text(encoding="utf-8")
    assert "install_runtime_guards()" in source
    assert "install_prompt_prep_hotfix_v2()" in source
    assert source.index("install_runtime_guards()") < source.index("install_prompt_prep_hotfix_v2()")


def test_fastest_and_fast_analyzer_paths_have_graceful_fallbacks():
    source = Path("h3studio/prompt_prep_hotfix_v2.py").read_text(encoding="utf-8")
    assert "Fastest Vision unavailable" in source
    assert "Fast Qwen3.5 2B selected but its checkpoint is not installed" in source
    assert "falling back to installed" in source
    assert "unload_all_models()" in source
