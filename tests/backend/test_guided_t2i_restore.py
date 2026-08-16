from __future__ import annotations

from pathlib import Path

import numpy as np

from h3studio.constants import MODE_TEXT_TO_IMAGE
from h3studio.legacy_t2i_multiguide import (
    _guide_positions,
    _install_compiler_diagnostics_patch,
)
from h3studio.prompting.compiler import PromptCompiler
from h3studio.qwen35_gguf_text_fallback import _complete_text_mtmd
from h3studio.references import ReferenceImage
from h3studio.state import GenerationOptions, StudioState


def _ref(ordinal: int = 1) -> ReferenceImage:
    return ReferenceImage(
        id=f"ref-{ordinal}",
        filename=f"ref-{ordinal}.png",
        ordinal=ordinal,
        role="reference",
        retention="reference_only",
    )


def test_guided_t2i_multi_refs_are_simultaneous_frame_zero_anchors() -> None:
    assert _guide_positions(1, 5) == (0,)
    assert _guide_positions(4, 5) == (0, 0, 0, 0)
    assert _guide_positions(9, 20) == (0,) * 9


def test_explicit_t2i_diagnostic_says_reference_is_guided_not_ignored() -> None:
    _install_compiler_diagnostics_patch()
    result = PromptCompiler().compile(
        StudioState(
            prompt="Create something new",
            references=(_ref(),),
            generation=GenerationOptions(mode=MODE_TEXT_TO_IMAGE),
        )
    )

    codes = {item.code for item in result.diagnostics}
    assert "references_guided_in_t2i" in codes
    assert "references_ignored_in_t2i" not in codes
    message = next(item.message for item in result.diagnostics if item.code == "references_guided_in_t2i")
    assert "real FL2VA visual guide" in message
    assert "not ignored" in message


def test_mtmd_text_adapter_uses_information_free_placeholder(monkeypatch, tmp_path: Path) -> None:
    from h3studio import qwen35_gguf as gguf

    mmproj = tmp_path / "mmproj.gguf"
    mmproj.write_bytes(b"stub")
    captured = {}

    monkeypatch.setattr(gguf, "_mtmd_cli", lambda: "/fake/llama-mtmd-cli")
    monkeypatch.setattr(gguf, "mmproj_path", lambda: mmproj)

    def fake_complete(text, images, max_tokens):
        captured["text"] = text
        captured["images"] = images
        captured["max_tokens"] = max_tokens
        return "rewritten prompt"

    monkeypatch.setattr(gguf, "_complete_cli", fake_complete)

    output = _complete_text_mtmd("write a concise H3 instruction", 224)
    assert output == "rewritten prompt"
    assert captured["max_tokens"] == 224
    assert "TEXT-ONLY TASK" in captured["text"]
    assert "ignore it completely" in captured["text"]
    assert len(captured["images"]) == 1
    placeholder = captured["images"][0]
    assert isinstance(placeholder, np.ndarray)
    assert placeholder.shape == (16, 16, 3)
    assert np.all(placeholder == 127)
