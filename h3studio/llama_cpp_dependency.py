"""Fixed-source llama.cpp dependency setup for H3 Studio prompt prep.

No arbitrary repository, path or shell command is accepted from the browser.
The optional builder is intended mainly for Linux CUDA workspaces such as the
L4 setup used for H3 Studio; other platforms can install llama.cpp normally and
will still be detected by the runtime.
"""

from __future__ import annotations

import asyncio
import os
import platform
import shutil
import subprocess
from pathlib import Path
from typing import Any

from aiohttp import web
from server import PromptServer

from .qwen35_gguf import status as qwen35_gguf_status

LLAMA_REPO = "https://github.com/ggml-org/llama.cpp.git"
# Current verified master when this integration was added. Pinning avoids a
# surprise breaking libmtmd change during a one-click setup.
LLAMA_COMMIT = "7e4c0a96880dae4fc4268ad441f8a6446bd5460a"

_REGISTERED = False


def _comfy_root() -> Path:
    import folder_paths

    return Path(getattr(folder_paths, "base_path", "") or Path(__file__).resolve().parents[2]).resolve()


def dependency_root() -> Path:
    return _comfy_root().parent / "llama.cpp"


def _run(args: list[str], *, cwd: Path | None = None, timeout: int = 1200) -> str:
    result = subprocess.run(
        args,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )
    output = (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")
    if result.returncode != 0:
        raise RuntimeError(f"{' '.join(args[:4])} failed ({result.returncode}):\n{output[-5000:]}")
    return output


def _cuda_arch() -> str:
    try:
        import torch

        if torch.cuda.is_available():
            major, minor = torch.cuda.get_device_capability()
            return f"{major}{minor}"
    except Exception:
        pass
    return ""


def _git_clean(repo: Path) -> bool:
    try:
        return not _run(["git", "status", "--porcelain"], cwd=repo, timeout=30).strip()
    except Exception:
        return False


def _repo_origin(repo: Path) -> str:
    try:
        return _run(["git", "remote", "get-url", "origin"], cwd=repo, timeout=30).strip()
    except Exception:
        return ""


def _build_runtime() -> dict[str, Any]:
    if platform.system().lower() != "linux":
        raise RuntimeError(
            "Automatic llama.cpp build is currently enabled only on Linux. Install llama.cpp manually; H3 Studio will detect llama-server/llama-mtmd-cli from PATH."
        )
    for tool in ("git", "cmake"):
        if not shutil.which(tool):
            raise RuntimeError(f"Cannot build llama.cpp because {tool} is not installed.")

    repo = dependency_root()
    if repo.exists() and not (repo / ".git").is_dir():
        raise RuntimeError(f"Refusing to overwrite non-git path: {repo}")
    if not repo.exists():
        _run(["git", "clone", "--filter=blob:none", LLAMA_REPO, str(repo)], timeout=300)
    else:
        origin = _repo_origin(repo).lower().removesuffix(".git")
        if "github.com/ggml-org/llama.cpp" not in origin:
            raise RuntimeError(f"Refusing to modify unexpected llama.cpp checkout with origin {origin or '<unknown>'}.")
        if not _git_clean(repo):
            raise RuntimeError("Existing llama.cpp checkout has local changes. Commit/stash them or remove the checkout before using Repair runtime.")

    _run(["git", "fetch", "origin", LLAMA_COMMIT, "--depth", "1"], cwd=repo, timeout=300)
    _run(["git", "checkout", "--detach", LLAMA_COMMIT], cwd=repo, timeout=60)

    build = repo / "build"
    arch = _cuda_arch()
    cuda_available = bool(arch and (shutil.which("nvcc") or Path("/usr/local/cuda/bin/nvcc").is_file()))
    configure = [
        "cmake",
        "-S", str(repo),
        "-B", str(build),
        "-DCMAKE_BUILD_TYPE=Release",
        "-DLLAMA_CURL=OFF",
        f"-DGGML_CUDA={'ON' if cuda_available else 'OFF'}",
    ]
    if cuda_available:
        configure.append(f"-DCMAKE_CUDA_ARCHITECTURES={arch}")
    _run(configure, timeout=300)
    jobs = str(max(2, min(16, os.cpu_count() or 4)))
    _run(
        [
            "cmake", "--build", str(build), "--config", "Release",
            "--target", "llama-server", "llama-mtmd-cli", "-j", jobs,
        ],
        timeout=1200,
    )

    runtime = qwen35_gguf_status()
    if not runtime.get("available"):
        raise RuntimeError("llama.cpp build completed but H3 Studio could not discover llama-server or llama-mtmd-cli.")
    return {
        "ok": True,
        "root": str(repo),
        "commit": LLAMA_COMMIT,
        "cuda": cuda_available,
        "cuda_arch": arch if cuda_available else "",
        "runtime": runtime,
        "restart_required": False,
    }


def dependency_status() -> dict[str, Any]:
    repo = dependency_root()
    runtime = qwen35_gguf_status()
    return {
        "ok": True,
        "platform": platform.system(),
        "root": str(repo),
        "checkout_present": (repo / ".git").is_dir(),
        "origin": _repo_origin(repo) if (repo / ".git").is_dir() else "",
        "clean": _git_clean(repo) if (repo / ".git").is_dir() else True,
        "pinned_commit": LLAMA_COMMIT,
        "git": bool(shutil.which("git")),
        "cmake": bool(shutil.which("cmake")),
        "nvcc": bool(shutil.which("nvcc") or Path("/usr/local/cuda/bin/nvcc").is_file()),
        "cuda_arch": _cuda_arch(),
        "runtime": runtime,
    }


def register_routes() -> None:
    global _REGISTERED
    if _REGISTERED:
        return
    _REGISTERED = True

    @PromptServer.instance.routes.get("/h3studio/dependencies/llama/status")
    async def llama_status(_request):
        return web.json_response(dependency_status(), headers={"Cache-Control": "no-store"})

    @PromptServer.instance.routes.post("/h3studio/dependencies/llama/install")
    async def llama_install(_request):
        try:
            result = await asyncio.to_thread(_build_runtime)
            return web.json_response(result, headers={"Cache-Control": "no-store"})
        except Exception as error:
            return web.json_response(
                {"ok": False, "error": f"{type(error).__name__}: {error}", "status": dependency_status()},
                status=500,
                headers={"Cache-Control": "no-store"},
            )


__all__ = ["LLAMA_COMMIT", "LLAMA_REPO", "dependency_root", "dependency_status", "register_routes"]
