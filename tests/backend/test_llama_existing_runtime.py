from __future__ import annotations

import os
from pathlib import Path

from h3studio.llama_existing_runtime import _bind


def _make_executable(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    path.chmod(0o755)


def test_existing_llama_runtime_adoption_is_wired_before_gguf_install():
    extension = Path("h3studio/extension.py").read_text(encoding="utf-8")
    adopter = Path("h3studio/llama_existing_runtime.py").read_text(encoding="utf-8")

    assert "adopt_existing_runtime()" in extension
    assert extension.index("adopt_existing_runtime()") < extension.index("install_qwen35_gguf()")
    assert 'studio_root / ".llama-cuda"' in adopter
    assert "H3STUDIO_LLAMA_SERVER" in adopter
    assert "H3STUDIO_LLAMA_MTMD_CLI" in adopter
    assert "H3STUDIO_LLAMA_CLI" in adopter
    assert 'os.environ["LD_LIBRARY_PATH"]' in adopter


def test_existing_runtime_accepts_llama_server_without_cli(monkeypatch, tmp_path: Path) -> None:
    prefix = tmp_path / ".llama-cuda"
    server = prefix / "bin" / "llama-server"
    _make_executable(server)

    for key in ("H3STUDIO_LLAMA_SERVER", "H3STUDIO_LLAMA_MTMD_CLI", "H3STUDIO_LLAMA_CLI"):
        monkeypatch.delenv(key, raising=False)

    assert _bind(prefix) is True
    assert os.environ["H3STUDIO_LLAMA_SERVER"] == str(server)
    assert "H3STUDIO_LLAMA_MTMD_CLI" not in os.environ
    assert "H3STUDIO_LLAMA_CLI" not in os.environ


def test_existing_runtime_accepts_mtmd_without_server_or_cli(monkeypatch, tmp_path: Path) -> None:
    prefix = tmp_path / ".llama-cuda"
    mtmd = prefix / "bin" / "llama-mtmd-cli"
    _make_executable(mtmd)

    for key in ("H3STUDIO_LLAMA_SERVER", "H3STUDIO_LLAMA_MTMD_CLI", "H3STUDIO_LLAMA_CLI"):
        monkeypatch.delenv(key, raising=False)

    assert _bind(prefix) is True
    assert os.environ["H3STUDIO_LLAMA_MTMD_CLI"] == str(mtmd)
    assert "H3STUDIO_LLAMA_SERVER" not in os.environ
    assert "H3STUDIO_LLAMA_CLI" not in os.environ


def test_existing_runtime_rejects_cli_only(monkeypatch, tmp_path: Path) -> None:
    prefix = tmp_path / ".llama-cuda"
    _make_executable(prefix / "bin" / "llama-cli")

    for key in ("H3STUDIO_LLAMA_SERVER", "H3STUDIO_LLAMA_MTMD_CLI", "H3STUDIO_LLAMA_CLI"):
        monkeypatch.delenv(key, raising=False)

    assert _bind(prefix) is False
