from __future__ import annotations

from pathlib import Path


def test_existing_llama_runtime_adoption_is_wired_before_gguf_install():
    extension = Path("h3studio/extension.py").read_text(encoding="utf-8")
    adopter = Path("h3studio/llama_existing_runtime.py").read_text(encoding="utf-8")

    assert "adopt_existing_runtime()" in extension
    assert extension.index("adopt_existing_runtime()") < extension.index("install_qwen35_gguf()")
    assert 'studio_root / ".llama-cuda"' in adopter
    assert 'os.environ["H3STUDIO_LLAMA_SERVER"]' in adopter
    assert 'os.environ["H3STUDIO_LLAMA_MTMD_CLI"]' in adopter
    assert 'os.environ["H3STUDIO_LLAMA_CLI"]' in adopter
    assert 'os.environ["LD_LIBRARY_PATH"]' in adopter
