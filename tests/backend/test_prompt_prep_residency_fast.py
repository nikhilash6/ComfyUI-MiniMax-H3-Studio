from __future__ import annotations

import inspect

from h3studio.prompt_prep_residency_fast import _adaptive_server_ensure, _is_qwen35_gguf_name


def test_qwen35_gguf_choice_is_detected_without_matching_native_qwen():
    assert _is_qwen35_gguf_name("Fastest · Qwen3.5 4B GGUF Q4_K_XL")
    assert not _is_qwen35_gguf_name("qwen3.5_4b_bf16.safetensors")


def test_external_gguf_server_auto_fits_instead_of_flushing_comfy_models():
    source = inspect.getsource(_adaptive_server_ensure)
    assert '"--n-gpu-layers", configured' in source
    assert '"--fit", "on"' in source
    assert "unload_all_models" not in source
    assert '"--n-gpu-layers", "0"' in source
