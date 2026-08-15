"""Private llama.cpp runtime management for H3 Studio prompt prep.

Normal installs use a pinned prebuilt conda-forge CUDA package inside an H3
Studio-owned prefix.  Source compilation remains available only as an explicit
fallback.  Browser callers cannot supply arbitrary repositories, package specs,
paths, or shell commands.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import platform
import shutil
import subprocess
import tempfile
import time
import urllib.request
import uuid
from pathlib import Path
from typing import Any

from aiohttp import web
from server import PromptServer

from .qwen35_gguf import mmproj_path as qwen35_mmproj_path
from .qwen35_gguf import model_path as qwen35_model_path
from .qwen35_gguf import status as qwen35_gguf_status

# Prebuilt runtime pinned to a verified conda-forge Linux x64 CUDA 13.0 build.
PREBUILT_LLAMA_VERSION = "10158"
PREBUILT_LLAMA_BUILD = "cuda130_h8268db4_0"
PREBUILT_CUDA_VERSION = "13.0"
PREBUILT_CHANNEL = "conda-forge"

# Micromamba is a single-file bootstrapper.  Pin both release and checksum so
# H3 Studio never executes an unverified installer payload.
MICROMAMBA_VERSION = "2.8.1-0"
MICROMAMBA_URL = (
    "https://github.com/mamba-org/micromamba-releases/releases/download/"
    f"{MICROMAMBA_VERSION}/micromamba-linux-64"
)
MICROMAMBA_SHA256 = "9689782d863c05a1bf5d2d371ba527104e7a4eb4310c1637d8653b751aed9c82"

# Explicit source-build fallback.  Kept pinned independently of the prebuilt
# package so a conda outage does not force H3 Studio onto an arbitrary master.
LLAMA_REPO = "https://github.com/ggml-org/llama.cpp.git"
LLAMA_COMMIT = "7e4c0a96880dae4fc4268ad441f8a6446bd5460a"

_REGISTERED = False
_INSTALL_LOCK = asyncio.Lock()


def _comfy_root() -> Path:
    import folder_paths

    return Path(getattr(folder_paths, "base_path", "") or Path(__file__).resolve().parents[2]).resolve()


def _studio_root() -> Path:
    return _comfy_root().parent


def runtime_root() -> Path:
    return _studio_root() / ".h3studio" / "runtime" / "llama-cpp"


def dependency_root() -> Path:
    """Backward-compatible public helper: now points at the private runtime."""

    return runtime_root()


def _versions_root() -> Path:
    return runtime_root() / "versions"


def _active_link() -> Path:
    return runtime_root() / "current"


def _tools_root() -> Path:
    return _studio_root() / ".h3studio" / "tools"


def _micromamba_path() -> Path:
    return _tools_root() / "micromamba" / MICROMAMBA_VERSION / "micromamba"


def _mamba_root() -> Path:
    return _studio_root() / ".h3studio" / "mamba-root"


def _source_root() -> Path:
    return _studio_root() / "llama.cpp"


def _run(
    args: list[str],
    *,
    cwd: Path | None = None,
    timeout: int = 1200,
    env: dict[str, str] | None = None,
) -> str:
    result = subprocess.run(
        args,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        env=env,
    )
    output = (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")
    if result.returncode != 0:
        raise RuntimeError(f"{' '.join(args[:5])} failed ({result.returncode}):\n{output[-6000:]}")
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


def _prebuilt_supported() -> bool:
    machine = platform.machine().lower()
    return platform.system().lower() == "linux" and machine in {"x86_64", "amd64"} and bool(_cuda_arch())


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _ensure_micromamba() -> Path:
    target = _micromamba_path()
    if target.is_file() and os.access(target, os.X_OK) and _sha256(target) == MICROMAMBA_SHA256:
        return target

    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix="micromamba-", dir=str(target.parent))
    os.close(fd)
    temp = Path(temp_name)
    try:
        request = urllib.request.Request(MICROMAMBA_URL, headers={"User-Agent": "H3-Studio/PromptPrep"})
        with urllib.request.urlopen(request, timeout=120) as response, temp.open("wb") as output:
            shutil.copyfileobj(response, output)
        actual = _sha256(temp)
        if actual != MICROMAMBA_SHA256:
            raise RuntimeError(
                f"Micromamba checksum mismatch: expected {MICROMAMBA_SHA256}, got {actual}. Refusing to execute it."
            )
        temp.chmod(0o755)
        os.replace(temp, target)
    finally:
        if temp.exists():
            temp.unlink(missing_ok=True)
    return target


def _private_prefix() -> Path | None:
    link = _active_link()
    if not link.is_symlink():
        return None
    try:
        prefix = link.resolve(strict=True)
    except OSError:
        return None
    return prefix if prefix.is_dir() else None


def _binary_paths(prefix: Path) -> dict[str, Path]:
    suffix = ".exe" if os.name == "nt" else ""
    bindir = prefix / ("Scripts" if os.name == "nt" else "bin")
    return {
        "server": bindir / f"llama-server{suffix}",
        "mtmd": bindir / f"llama-mtmd-cli{suffix}",
        "cli": bindir / f"llama-cli{suffix}",
    }


def _runtime_binaries_ok(prefix: Path) -> bool:
    return all(path.is_file() and os.access(path, os.X_OK) for path in _binary_paths(prefix).values())


def _activate_private_runtime(*, force: bool = False) -> Path | None:
    prefix = _private_prefix()
    if not prefix or not _runtime_binaries_ok(prefix):
        return None
    binaries = _binary_paths(prefix)
    bindings = {
        "H3STUDIO_LLAMA_SERVER": binaries["server"],
        "H3STUDIO_LLAMA_MTMD_CLI": binaries["mtmd"],
        "H3STUDIO_LLAMA_CLI": binaries["cli"],
    }
    for key, path in bindings.items():
        current = str(os.environ.get(key) or "").strip()
        if force or not current:
            os.environ[key] = str(path)
    return prefix


def _read_manifest(prefix: Path | None) -> dict[str, Any]:
    if not prefix:
        return {}
    path = prefix / ".h3studio-runtime.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_manifest(prefix: Path, payload: dict[str, Any]) -> None:
    (prefix / ".h3studio-runtime.json").write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _activate_prefix(prefix: Path) -> None:
    root = runtime_root()
    root.mkdir(parents=True, exist_ok=True)
    link = _active_link()
    if link.exists() and not link.is_symlink():
        raise RuntimeError(f"Refusing to replace non-symlink runtime path: {link}")
    temp = root / f".current-{uuid.uuid4().hex[:8]}"
    relative = os.path.relpath(prefix, root)
    os.symlink(relative, temp, target_is_directory=True)
    os.replace(temp, link)


def _cleanup_old_versions(active: Path, keep: int = 2) -> None:
    versions = _versions_root()
    if not versions.is_dir():
        return
    candidates = [p for p in versions.iterdir() if p.is_dir() and p.resolve() != active.resolve()]
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    for stale in candidates[max(0, keep - 1) :]:
        shutil.rmtree(stale, ignore_errors=True)


def _smoke_image(path: Path) -> None:
    # Tiny valid PNG, enough to exercise libmtmd without depending on PIL here.
    payload = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZJ1sAAAAASUVORK5CYII="
    )
    path.write_bytes(payload)


def _smoke_test(prefix: Path) -> dict[str, Any]:
    binaries = _binary_paths(prefix)
    versions = {}
    for key, binary in binaries.items():
        versions[key] = _run([str(binary), "--version"], timeout=30).strip().splitlines()[-1:]

    model = qwen35_model_path()
    mmproj = qwen35_mmproj_path()
    if not model.is_file() or not mmproj.is_file():
        return {
            "ok": True,
            "multimodal": False,
            "reason": "Qwen3.5 GGUF model/mmproj are not installed yet; binary smoke test passed.",
            "versions": versions,
        }

    with tempfile.TemporaryDirectory(prefix="h3studio-llama-smoke-") as folder:
        image = Path(folder) / "pixel.png"
        _smoke_image(image)
        started = time.perf_counter()
        output = _run(
            [
                str(binaries["mtmd"]),
                "-m", str(model),
                "--mmproj", str(mmproj),
                "--image", str(image),
                "-n", "4",
                "--temp", "0",
                "-ngl", "99",
                "-c", "2048",
                "-p", "/no_think\\nReturn exactly: OK",
            ],
            timeout=180,
        )
        elapsed = time.perf_counter() - started
    return {
        "ok": True,
        "multimodal": True,
        "seconds": round(elapsed, 3),
        "output_tail": output[-500:],
        "versions": versions,
    }


def _micromamba_env() -> dict[str, str]:
    env = dict(os.environ)
    env["MAMBA_ROOT_PREFIX"] = str(_mamba_root())
    env["MAMBA_NO_BANNER"] = "1"
    return env


def _install_prebuilt_runtime() -> dict[str, Any]:
    if not _prebuilt_supported():
        raise RuntimeError(
            "The prebuilt fast runtime currently targets Linux x86_64 with an NVIDIA CUDA GPU. "
            "Use the explicit source fallback on unsupported platforms."
        )

    micromamba = _ensure_micromamba()
    versions = _versions_root()
    versions.mkdir(parents=True, exist_ok=True)
    prefix = versions / f"llama-{PREBUILT_LLAMA_VERSION}-cuda130-{uuid.uuid4().hex[:8]}"
    package_spec = f"llama.cpp={PREBUILT_LLAMA_VERSION}={PREBUILT_LLAMA_BUILD}"

    try:
        _run(
            [
                str(micromamba),
                "create",
                "-y",
                "-p", str(prefix),
                "-c", PREBUILT_CHANNEL,
                "--override-channels",
                package_spec,
                f"cuda-version={PREBUILT_CUDA_VERSION}",
            ],
            timeout=600,
            env=_micromamba_env(),
        )
        if not _runtime_binaries_ok(prefix):
            missing = [name for name, path in _binary_paths(prefix).items() if not path.is_file()]
            raise RuntimeError(f"Prebuilt llama.cpp environment is missing required binaries: {', '.join(missing)}")

        smoke = _smoke_test(prefix)
        manifest = {
            "provider": "conda-forge",
            "install_mode": "prebuilt",
            "llama_cpp_version": PREBUILT_LLAMA_VERSION,
            "llama_cpp_build": PREBUILT_LLAMA_BUILD,
            "cuda_version": PREBUILT_CUDA_VERSION,
            "micromamba_version": MICROMAMBA_VERSION,
            "installed_at_unix": int(time.time()),
            "cuda_arch": _cuda_arch(),
            "smoke": smoke,
        }
        _write_manifest(prefix, manifest)
        _activate_prefix(prefix)
        _activate_private_runtime(force=True)
        _cleanup_old_versions(prefix)
    except Exception:
        shutil.rmtree(prefix, ignore_errors=True)
        raise

    return {
        "ok": True,
        "root": str(runtime_root()),
        "prefix": str(prefix),
        "provider": "conda-forge",
        "install_mode": "prebuilt",
        "package": package_spec,
        "cuda": True,
        "cuda_version": PREBUILT_CUDA_VERSION,
        "cuda_arch": _cuda_arch(),
        "smoke": smoke,
        "runtime": qwen35_gguf_status(),
        "restart_required": False,
    }


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


def _build_source_runtime() -> dict[str, Any]:
    """Explicit slow fallback for platforms without the pinned prebuilt path."""

    if platform.system().lower() != "linux":
        raise RuntimeError("Automatic source fallback is currently enabled only on Linux.")
    for tool in ("git", "cmake"):
        if not shutil.which(tool):
            raise RuntimeError(f"Cannot build llama.cpp because {tool} is not installed.")

    repo = _source_root()
    if repo.exists() and not (repo / ".git").is_dir():
        raise RuntimeError(f"Refusing to overwrite non-git path: {repo}")
    if not repo.exists():
        _run(["git", "clone", "--filter=blob:none", LLAMA_REPO, str(repo)], timeout=300)
    else:
        origin = _repo_origin(repo).lower().removesuffix(".git")
        if "github.com/ggml-org/llama.cpp" not in origin:
            raise RuntimeError(f"Refusing to modify unexpected llama.cpp checkout with origin {origin or '<unknown>'}.")
        if not _git_clean(repo):
            raise RuntimeError("Existing llama.cpp checkout has local changes. Commit/stash them before source fallback.")

    _run(["git", "fetch", "origin", LLAMA_COMMIT, "--depth", "1"], cwd=repo, timeout=300)
    _run(["git", "checkout", "--detach", LLAMA_COMMIT], cwd=repo, timeout=60)

    build = repo / "build"
    arch = _cuda_arch()
    nvcc = shutil.which("nvcc") or (str(Path("/usr/local/cuda/bin/nvcc")) if Path("/usr/local/cuda/bin/nvcc").is_file() else "")
    if arch and not nvcc:
        raise RuntimeError(
            f"A CUDA GPU (SM{arch}) is visible but nvcc/CUDA toolkit is missing. Refusing a silent CPU build."
        )
    cuda_available = bool(arch and nvcc)
    configure = [
        "cmake",
        "-S", str(repo),
        "-B", str(build),
        "-DCMAKE_BUILD_TYPE=Release",
        "-DLLAMA_CURL=OFF",
        "-DLLAMA_BUILD_TESTS=OFF",
        "-DLLAMA_BUILD_EXAMPLES=OFF",
        f"-DGGML_CUDA={'ON' if cuda_available else 'OFF'}",
    ]
    if cuda_available:
        configure.append(f"-DCMAKE_CUDA_ARCHITECTURES={arch}")
    _run(configure, timeout=300)
    jobs = str(max(2, min(16, os.cpu_count() or 4)))
    _run(
        [
            "cmake", "--build", str(build), "--config", "Release",
            "--target", "llama-server", "llama-mtmd-cli", "llama-cli", "-j", jobs,
        ],
        timeout=1800,
    )

    bindir = build / "bin"
    paths = {
        "H3STUDIO_LLAMA_SERVER": bindir / "llama-server",
        "H3STUDIO_LLAMA_MTMD_CLI": bindir / "llama-mtmd-cli",
        "H3STUDIO_LLAMA_CLI": bindir / "llama-cli",
    }
    for key, path in paths.items():
        if not path.is_file():
            raise RuntimeError(f"Source build completed but {path.name} is missing.")
        os.environ[key] = str(path)

    return {
        "ok": True,
        "root": str(repo),
        "provider": "ggml-org/llama.cpp",
        "install_mode": "source",
        "commit": LLAMA_COMMIT,
        "cuda": cuda_available,
        "cuda_arch": arch if cuda_available else "",
        "runtime": qwen35_gguf_status(),
        "restart_required": False,
    }


def dependency_status() -> dict[str, Any]:
    prefix = _activate_private_runtime(force=False)
    manifest = _read_manifest(prefix)
    runtime = qwen35_gguf_status()
    return {
        "ok": True,
        "platform": platform.system(),
        "machine": platform.machine(),
        "root": str(runtime_root()),
        "prebuilt_supported": _prebuilt_supported(),
        "prebuilt_version": PREBUILT_LLAMA_VERSION,
        "prebuilt_build": PREBUILT_LLAMA_BUILD,
        "prebuilt_cuda_version": PREBUILT_CUDA_VERSION,
        "private_runtime_present": bool(prefix),
        "private_prefix": str(prefix or ""),
        "manifest": manifest,
        "micromamba_present": _micromamba_path().is_file(),
        "source_fallback_available": bool(shutil.which("git") and shutil.which("cmake")),
        "source_root": str(_source_root()),
        "source_checkout_present": (_source_root() / ".git").is_dir(),
        "pinned_source_commit": LLAMA_COMMIT,
        "cuda_arch": _cuda_arch(),
        "runtime": runtime,
    }


def register_routes() -> None:
    global _REGISTERED
    if _REGISTERED:
        return
    _REGISTERED = True
    _activate_private_runtime(force=False)

    @PromptServer.instance.routes.get("/h3studio/dependencies/llama/status")
    async def llama_status(_request):
        return web.json_response(dependency_status(), headers={"Cache-Control": "no-store"})

    @PromptServer.instance.routes.post("/h3studio/dependencies/llama/install")
    async def llama_install(request):
        try:
            payload = await request.json() if request.can_read_body else {}
            mode = str((payload or {}).get("mode") or "prebuilt").strip().lower()
            if mode not in {"prebuilt", "source"}:
                raise ValueError("Unsupported llama.cpp install mode. Use 'prebuilt' or 'source'.")
            async with _INSTALL_LOCK:
                installer = _install_prebuilt_runtime if mode == "prebuilt" else _build_source_runtime
                result = await asyncio.to_thread(installer)
            return web.json_response(result, headers={"Cache-Control": "no-store"})
        except Exception as error:
            return web.json_response(
                {"ok": False, "error": f"{type(error).__name__}: {error}", "status": dependency_status()},
                status=500,
                headers={"Cache-Control": "no-store"},
            )


_activate_private_runtime(force=False)

__all__ = [
    "LLAMA_COMMIT",
    "LLAMA_REPO",
    "MICROMAMBA_VERSION",
    "PREBUILT_CUDA_VERSION",
    "PREBUILT_LLAMA_BUILD",
    "PREBUILT_LLAMA_VERSION",
    "dependency_root",
    "dependency_status",
    "register_routes",
    "runtime_root",
]
