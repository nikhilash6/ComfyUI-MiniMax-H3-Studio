from __future__ import annotations

import inspect

import pytest

from h3studio import qwen35_gguf, qwen35_gguf_text_fallback


def test_qwen35_gguf_pair_uses_unique_local_names() -> None:
    assert qwen35_gguf.QWEN35_GGUF_REMOTE_MODEL == "Qwen3.5-4B-UD-Q4_K_XL.gguf"
    assert qwen35_gguf.QWEN35_GGUF_REMOTE_MMPROJ == "mmproj-BF16.gguf"
    assert qwen35_gguf.QWEN35_GGUF_MODEL_FILE == "qwen3.5_4b_ud_q4_k_xl.gguf"
    assert qwen35_gguf.QWEN35_GGUF_MMPROJ_FILE == "qwen3.5_4b_mmproj_bf16.gguf"
    assert "unsloth/Qwen3.5-4B-GGUF" in qwen35_gguf.QWEN35_GGUF_MODEL_URL


def test_proxy_keeps_multiple_images_and_forces_non_thinking_contract() -> None:
    proxy = qwen35_gguf.Qwen35GGUFClipProxy()
    images = [object(), object()]
    tokens = proxy.tokenize("describe", images=images, thinking=False)
    assert tokens["text"] == "describe"
    assert tokens["images"] == images
    with pytest.raises(ValueError, match="thinking=False"):
        proxy.tokenize("describe", images=images, thinking=True)


def test_image_generation_prefers_shared_llama_server(monkeypatch) -> None:
    proxy = qwen35_gguf.Qwen35GGUFClipProxy()
    monkeypatch.setattr(qwen35_gguf, "_server_command", lambda: ["llama-server"])
    monkeypatch.setattr(qwen35_gguf._SERVER, "complete", lambda text, images, max_tokens: '{"references":[]}')
    result = proxy.generate({"text": "facts", "images": [object()]}, max_length=144)
    assert result == '{"references":[]}'
    assert proxy._used_server is True


def test_text_only_fallback_never_calls_mtmd_cli(monkeypatch) -> None:
    qwen35_gguf_text_fallback.install()
    proxy = qwen35_gguf.Qwen35GGUFClipProxy()
    monkeypatch.setattr(qwen35_gguf, "_server_command", lambda: None)
    monkeypatch.setattr(qwen35_gguf_text_fallback, "_llama_cli", lambda: "/fake/llama-cli")
    monkeypatch.setattr(
        qwen35_gguf_text_fallback,
        "_complete_text_cli",
        lambda text, max_tokens: '{"instruction":"compact prompt"}',
    )
    result = proxy.generate({"text": "write", "images": []}, max_length=160)
    assert result == '{"instruction":"compact prompt"}'


def test_image_cli_fallback_supports_repeated_image_arguments() -> None:
    source = inspect.getsource(qwen35_gguf._complete_cli)
    assert 'command.extend(["--image", path])' in source
    assert '"-ngl", "99"' in source
    assert '"-c", "4096"' in source
    assert '"/no_think\\n"' in source


def test_stage_scoped_server_has_explicit_close() -> None:
    source = inspect.getsource(qwen35_gguf.Qwen35GGUFClipProxy.close)
    assert "_SERVER.stop()" in source
