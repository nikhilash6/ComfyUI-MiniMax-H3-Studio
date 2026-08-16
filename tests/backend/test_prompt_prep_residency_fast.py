from __future__ import annotations

import inspect
from pathlib import Path

from h3studio.prompt_prep_residency_fast import (
    _adaptive_server_ensure,
    _gguf_target_free_bytes,
    _is_qwen35_gguf_name,
    _prepare_gpu_room,
    _start_full_gpu_server,
)


def test_qwen35_gguf_choice_is_detected_without_matching_native_qwen():
    assert _is_qwen35_gguf_name("Fastest · Qwen3.5 4B GGUF Q4_K_XL")
    assert not _is_qwen35_gguf_name("qwen3.5_4b_bf16.safetensors")


def test_external_gguf_server_uses_known_full_gpu_path_without_autofit():
    source = inspect.getsource(_start_full_gpu_server)
    assert '"--n-gpu-layers", "99"' in source
    assert '"--fit", "off"' in source
    assert "auto-fit" not in source
    assert "unload_all_models" not in source


def test_production_path_does_not_silently_accept_cpu_fallback():
    source = inspect.getsource(_adaptive_server_ensure)
    assert "H3STUDIO_GGUF_ALLOW_CPU_FALLBACK" in source
    assert "CPU fallback is disabled" in source
    assert '"--n-gpu-layers", "0"' in source  # explicit opt-in escape hatch only


def test_targeted_room_policy_prefers_vae_then_text_encoder():
    source = inspect.getsource(_prepare_gpu_room)
    vae = source.index('"video VAE"')
    text_encoder = source.index('"H3 text encoder"')
    assert vae < text_encoder
    assert "unload_all_models" not in source


def test_gguf_target_uses_actual_local_artifact_sizes(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("H3STUDIO_GGUF_TARGET_FREE_GIB", raising=False)
    model = tmp_path / "model.gguf"
    mmproj = tmp_path / "mmproj.gguf"
    model.write_bytes(b"0" * 1024)
    mmproj.write_bytes(b"0" * 1024)
    # Tiny fake files still receive the safety floor rather than an unrealistically low target.
    assert _gguf_target_free_bytes(model, mmproj) >= int(4.25 * 1024**3)
