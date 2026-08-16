"""Adopt known existing llama.cpp runtimes before prompt-prep backend detection.

This is intentionally conservative about *where* H3 Studio adopts binaries
from, but permissive about which llama.cpp frontends are present.  The old fast
Lightning setup worked with the historical ``.llama-cuda`` prefix and primarily
used ``llama-server``.  Requiring server + mtmd + cli simultaneously caused a
regression where a perfectly usable GPU runtime was ignored and H3 Studio
silently loaded the much larger native Qwen3.5 helper instead.

A server alone is enough for multimodal analysis + text writing.  mtmd alone is
also useful for multimodal analysis and H3 Studio's neutral-placeholder text
adapter.  llama-cli is an optional text-only fallback, never a readiness gate.
"""

from __future__ import annotations

import json
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


def _private_pointer_prefix(studio_root: Path) -> Path | None:
    """Resolve H3 Studio's own active private runtime without importing its web manager."""

    runtime_root = studio_root / ".h3studio" / "runtime" / "llama-cpp"
    pointer = runtime_root / "current.json"
    if not pointer.is_file():
        return None
    try:
        data = json.loads(pointer.read_text(encoding="utf-8"))
        relative = str(data.get("prefix") or "").strip()
        if not relative:
            return None
        versions = (runtime_root / "versions").resolve()
        prefix = (runtime_root / relative).resolve()
        if not prefix.is_relative_to(versions) or not prefix.is_dir():
            return None
        return prefix
    except Exception:
        return None


def _bind(prefix: Path, *, overwrite: bool = False) -> bool:
    server = _binary(prefix, "llama-server")
    mtmd = _binary(prefix, "llama-mtmd-cli")
    cli = _binary(prefix, "llama-cli")

    # llama.cpp officially supports multimodal work through llama-server and
    # llama-mtmd-cli.  Either one makes this prefix useful; llama-cli is only a
    # convenience fallback for text-only writing.
    if not (server or mtmd):
        return False

    bindings = {
        "H3STUDIO_LLAMA_SERVER": server,
        "H3STUDIO_LLAMA_MTMD_CLI": mtmd,
        "H3STUDIO_LLAMA_CLI": cli,
    }
    for key, path in bindings.items():
        if path is None:
            continue
        current = str(os.environ.get(key) or "").strip()
        if overwrite or not current or not Path(current).is_file():
            os.environ[key] = str(path)

    # Conda-forge/private binaries need sibling runtime libraries visible to
    # child llama.cpp processes.  This does not alter ComfyUI's Python env.
    path_dirs = [prefix / "bin", prefix / "Library" / "bin", prefix / "Scripts"]
    existing_path = os.environ.get("PATH", "")
    additions = [str(path) for path in path_dirs if path.is_dir()]
    if additions:
        existing_parts = existing_path.split(os.pathsep) if existing_path else []
        os.environ["PATH"] = os.pathsep.join(additions + [item for item in existing_parts if item not in additions])
    if os.name != "nt" and (prefix / "lib").is_dir():
        existing_ld = os.environ.get("LD_LIBRARY_PATH", "")
        current_parts = existing_ld.split(os.pathsep) if existing_ld else []
        lib = str(prefix / "lib")
        os.environ["LD_LIBRARY_PATH"] = os.pathsep.join([lib] + [item for item in current_parts if item != lib])

    available = ", ".join(
        name
        for name, value in (("server", server), ("mtmd", mtmd), ("cli", cli))
        if value is not None
    )
    print(f"[H3 Studio] Adopted existing llama.cpp runtime: {prefix} ({available})")
    return True


def adopt_existing_runtime() -> Path | None:
    """Bind a previously installed known-good runtime if launch exports were lost."""

    # Respect any still-valid explicit binding.  One usable multimodal frontend
    # is sufficient; do not require three unrelated executables.
    explicit_server = str(os.environ.get("H3STUDIO_LLAMA_SERVER") or "").strip()
    explicit_mtmd = str(os.environ.get("H3STUDIO_LLAMA_MTMD_CLI") or "").strip()
    explicit_cli = str(os.environ.get("H3STUDIO_LLAMA_CLI") or "").strip()
    for value in (explicit_server, explicit_mtmd):
        if value and Path(value).is_file():
            return Path(value).resolve().parent.parent
    # cli by itself cannot analyze images, so keep searching for a multimodal
    # runtime even if an unrelated llama-cli happens to be on the environment.
    del explicit_cli

    studio_root = _comfy_root().parent
    candidates: list[Path] = []
    private_prefix = _private_pointer_prefix(studio_root)
    if private_prefix is not None:
        candidates.append(private_prefix)
    candidates.append(studio_root / ".llama-cuda")

    seen: set[str] = set()
    for prefix in candidates:
        try:
            key = str(prefix.resolve())
        except Exception:
            key = str(prefix)
        if key in seen:
            continue
        seen.add(key)
        if _bind(prefix):
            return prefix

    return None


__all__ = ["adopt_existing_runtime"]
