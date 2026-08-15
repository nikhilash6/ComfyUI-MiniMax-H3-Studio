"""Adopt known existing llama.cpp runtimes before prompt-prep backend detection.

This is intentionally conservative: H3 Studio only auto-adopts a runtime from
its own studio root (currently the historical `.llama-cuda` prefix used by the
manual installer command) and only when all required binaries are present.
"""

from __future__ import annotations

import os
from pathlib import Path


def _comfy_root() -> Path:
    try:
        import folder_paths

        return Path(getattr(folder_paths, "base_path", "") or Path(__file__).resolve().parents[2]).resolve()
    except Exception:
        return Path(__file__).resolve().parents[2]


def _binary(prefix: Path, name: str) -> Path | None:
    suffixes = [".exe", ""] if os.name == "nt" else [""]
    for directory in (prefix / "bin", prefix / "Library" / "bin", prefix / "Scripts", prefix):
        for suffix in suffixes:
            candidate = directory / f"{name}{suffix}"
            if candidate.is_file() and (os.name == "nt" or os.access(candidate, os.X_OK)):
                return candidate
    return None


def adopt_existing_runtime() -> Path | None:
    """Bind a previously installed known-good runtime if the launch shell lost its exports."""

    # Respect explicit user/runtime bindings first.
    explicit = [
        str(os.environ.get("H3STUDIO_LLAMA_SERVER") or "").strip(),
        str(os.environ.get("H3STUDIO_LLAMA_MTMD_CLI") or "").strip(),
        str(os.environ.get("H3STUDIO_LLAMA_CLI") or "").strip(),
    ]
    if all(value and Path(value).is_file() for value in explicit):
        return Path(explicit[0]).resolve().parent.parent

    studio_root = _comfy_root().parent
    candidates = [
        studio_root / ".llama-cuda",
    ]

    for prefix in candidates:
        server = _binary(prefix, "llama-server")
        mtmd = _binary(prefix, "llama-mtmd-cli")
        cli = _binary(prefix, "llama-cli")
        if not (server and mtmd and cli):
            continue

        os.environ["H3STUDIO_LLAMA_SERVER"] = str(server)
        os.environ["H3STUDIO_LLAMA_MTMD_CLI"] = str(mtmd)
        os.environ["H3STUDIO_LLAMA_CLI"] = str(cli)

        # Conda-forge binaries need their sibling runtime libraries visible.
        path_dirs = [prefix / "bin", prefix / "Library" / "bin", prefix / "Scripts"]
        existing_path = os.environ.get("PATH", "")
        additions = [str(path) for path in path_dirs if path.is_dir()]
        if additions:
            os.environ["PATH"] = os.pathsep.join(additions + [existing_path])
        if os.name != "nt" and (prefix / "lib").is_dir():
            existing_ld = os.environ.get("LD_LIBRARY_PATH", "")
            os.environ["LD_LIBRARY_PATH"] = os.pathsep.join([str(prefix / "lib"), existing_ld]).rstrip(os.pathsep)

        print(f"[H3 Studio] Adopted existing llama.cpp runtime: {prefix}")
        return prefix

    return None


__all__ = ["adopt_existing_runtime"]
