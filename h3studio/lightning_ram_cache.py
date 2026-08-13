"""Safe Lightning startup cache for the required MiniMax H3 encoder.

The L4 workflow reads a 14.6 GiB text encoder. Lightning persistent storage is
the expensive first-materialization path, while a real file in ``/dev/shm``
has measured fast changed-prompt conditioning. This module stages only that
encoder into tmpfs and warms the selected H3 VAE through Linux's page cache.
It never stages transformers or creates a second model-loading authority.
"""

from __future__ import annotations

import os
import shutil
import sys
import time
from collections.abc import Callable
from contextlib import contextmanager
from dataclasses import dataclass
from hashlib import blake2b
from pathlib import Path

ENCODER = "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"
VAE_PREFERENCE = (
    "minimax_h3_video_vae_int8_convrot.safetensors",
    "minimax_h3_video_vae_fp16.safetensors",
)
GIB = 1024**3
MIB = 1024**2


def _enabled(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "off"}


def _human(value: int) -> str:
    return f"{value / GIB:.2f} GiB"


def _is_tmpfs(path: Path) -> bool:
    try:
        real = path.resolve()
        best_mount = Path("/")
        best_type = ""
        for line in Path("/proc/mounts").read_text(encoding="utf-8").splitlines():
            fields = line.split()
            if len(fields) < 3:
                continue
            mount = Path(fields[1].replace("\\040", " "))
            try:
                real.relative_to(mount)
            except ValueError:
                continue
            if len(mount.parts) >= len(best_mount.parts):
                best_mount, best_type = mount, fields[2]
        return best_type == "tmpfs"
    except OSError:
        return False


@dataclass(frozen=True)
class CacheLayout:
    comfy_root: Path
    ram_root: Path
    persistent_root: Path

    @property
    def visible_encoder(self) -> Path:
        return self.comfy_root / "models" / "text_encoders" / ENCODER

    @property
    def ram_encoder(self) -> Path:
        return self.ram_root / "text_encoders" / ENCODER

    @property
    def persistent_encoder(self) -> Path:
        return self.persistent_root / "text_encoders" / ENCODER


def detect_layout(custom_node_root: Path, environ: dict[str, str] | None = None) -> CacheLayout | None:
    env = os.environ if environ is None else environ
    if not _enabled(env.get("H3STUDIO_LIGHTNING_RAM_CACHE"), True):
        return None
    comfy_root = Path(env.get("H3STUDIO_COMFYUI_ROOT", custom_node_root.parent.parent))
    studio_root = Path(env.get("H3STUDIO_LIGHTNING_ROOT", "/teamspace/studios/this_studio"))
    ram_root = Path(env.get("H3STUDIO_LIGHTNING_RAM_ROOT", "/dev/shm/h3-models"))
    persistent_root = Path(env.get("H3STUDIO_LIGHTNING_PERSISTENT_ROOT", studio_root / "h3-models-persistent"))
    forced = _enabled(env.get("H3STUDIO_LIGHTNING_FORCE"), False)
    if sys.platform != "linux" or (not forced and not studio_root.is_dir()):
        return None
    if not ram_root.parent.is_dir() or (not forced and not _is_tmpfs(ram_root.parent)):
        return None
    return CacheLayout(comfy_root.resolve(), ram_root, persistent_root)


def _encoder_source(layout: CacheLayout, environ: dict[str, str]) -> Path | None:
    override = environ.get("H3STUDIO_LIGHTNING_ENCODER_SOURCE")
    if override:
        candidate = Path(override)
        if candidate.is_file():
            return candidate.resolve()
    visible = layout.visible_encoder
    if visible.is_file() and not visible.is_symlink():
        return visible
    for candidate in (
        layout.persistent_encoder,
        visible.parent / ".h3studio-persistent" / ENCODER,
    ):
        if candidate.is_file() and candidate.resolve() != layout.ram_encoder:
            return candidate.resolve()
    if visible.is_symlink():
        target = visible.resolve(strict=False)
        if target.is_file() and not str(target).startswith(("/dev/shm/", "/run/shm/")):
            return target
    # Recover user-created RAM links whose persistent source predates Studio's
    # managed directory. This runs only when every cheap, deterministic path
    # above failed and stops at the first exact regular-file match.
    excluded = {".git", ".venv", "custom_nodes", "input", "logs", "node_modules", "output", "user"}
    studio_root = layout.persistent_root.parent
    if studio_root.is_dir():
        for directory, names, files in os.walk(studio_root):
            names[:] = [name for name in names if name not in excluded]
            if ENCODER not in files:
                continue
            candidate = Path(directory) / ENCODER
            if candidate.is_symlink() or candidate == visible or candidate == layout.ram_encoder:
                continue
            if candidate.is_file():
                return candidate.resolve()
    return None


def _edge_signature(path: Path) -> tuple[int, bytes]:
    size = path.stat().st_size
    digest = blake2b(digest_size=16)
    with path.open("rb", buffering=0) as handle:
        digest.update(handle.read(min(MIB, size)))
        if size > MIB:
            handle.seek(max(size - MIB, 0))
            digest.update(handle.read(MIB))
    return size, digest.digest()


@contextmanager
def _startup_lock(root: Path):
    root.mkdir(parents=True, exist_ok=True)
    handle = (root / ".h3studio-cache.lock").open("a+")
    try:
        import fcntl

        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        handle.close()


def _atomic_symlink(link: Path, target: Path) -> None:
    link.parent.mkdir(parents=True, exist_ok=True)
    temporary = link.with_name(f".{link.name}.h3studio-link-{os.getpid()}")
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(target)
    os.replace(temporary, link)


def _preserve_visible_encoder(layout: CacheLayout) -> Path:
    visible = layout.visible_encoder
    persistent = layout.persistent_encoder
    persistent.parent.mkdir(parents=True, exist_ok=True)
    if persistent.exists() and _edge_signature(visible) == _edge_signature(persistent):
        visible.unlink()
        return persistent
    if persistent.exists():
        persistent = persistent.with_name(f"{persistent.name}.preserved-{int(time.time())}")
    os.replace(visible, persistent)
    return persistent


def _copy_with_progress(source: Path, target: Path, printer: Callable[[str], None]) -> None:
    size = source.stat().st_size
    partial = target.with_name(target.name + ".h3studio-partial")
    copied = partial.stat().st_size if partial.is_file() else 0
    if copied > size:
        partial.unlink()
        copied = 0
    resume_at = copied
    started = time.monotonic()
    last_print = started
    with source.open("rb", buffering=0) as src, partial.open("ab", buffering=0) as dst:
        src.seek(copied)
        while copied < size:
            block = src.read(min(64 * MIB, size - copied))
            if not block:
                raise OSError(f"Unexpected end of file after {_human(copied)}")
            dst.write(block)
            copied += len(block)
            now = time.monotonic()
            if now - last_print >= 2 or copied == size:
                elapsed = max(now - started, 0.001)
                rate = max((copied - resume_at) / elapsed, 0.0)
                percent = copied * 100 / size
                printer(f"[H3 RAM] Encoder {percent:5.1f}% · {_human(copied)} / {_human(size)} · {rate / MIB:.0f} MiB/s")
                last_print = now
    if partial.stat().st_size != size:
        raise OSError("RAM copy size verification failed")
    os.replace(partial, target)


def stage_encoder(
    layout: CacheLayout,
    environ: dict[str, str] | None = None,
    printer: Callable[[str], None] = print,
    safety_bytes: int = 512 * MIB,
) -> bool:
    env = os.environ if environ is None else environ
    target = layout.ram_encoder
    source = _encoder_source(layout, env)
    if source is None:
        if target.is_file() and not target.is_symlink():
            _atomic_symlink(layout.visible_encoder, target)
            printer(f"[H3 RAM] Encoder already resident in tmpfs · {_human(target.stat().st_size)}")
            printer("[H3 RAM] Current run is RAM-accelerated; persistent recovery source was not discovered.")
            return True
        printer(f"[H3 RAM] Encoder source not found; leaving ComfyUI model paths unchanged ({ENCODER}).")
        return False
    size = source.stat().st_size
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_file() and target.stat().st_size == size and not target.is_symlink():
        printer(f"[H3 RAM] Encoder already resident in tmpfs · {_human(size)}")
    else:
        target.unlink(missing_ok=True)
        free = shutil.disk_usage(layout.ram_root.parent).free
        partial = target.with_name(target.name + ".h3studio-partial")
        reusable = partial.stat().st_size if partial.is_file() else 0
        needed = max(size - reusable, 0) + safety_bytes
        printer(f"[H3 RAM] Lightning detected · tmpfs free {_human(free)} · encoder {_human(size)}")
        if free < needed:
            printer(f"[H3 RAM] Skipped: need {_human(needed)} including safety margin; native persistent path remains usable.")
            if layout.visible_encoder.is_symlink() and not layout.visible_encoder.exists():
                _atomic_symlink(layout.visible_encoder, source)
            return False
        _copy_with_progress(source, target, printer)
        printer(f"[H3 RAM] Encoder copy verified · real tmpfs file · {_human(size)}")

    visible = layout.visible_encoder
    if visible.is_file() and not visible.is_symlink():
        preserved = _preserve_visible_encoder(layout)
        if source == visible:
            source = preserved
    _atomic_symlink(visible, target)
    printer(f"[H3 RAM] ComfyUI encoder → {target}")
    printer(f"[H3 RAM] Persistent recovery source → {source}")
    return True


def warm_vae(layout: CacheLayout, environ: dict[str, str] | None = None, printer: Callable[[str], None] = print) -> bool:
    env = os.environ if environ is None else environ
    if not _enabled(env.get("H3STUDIO_LIGHTNING_WARM_VAE"), True):
        return False
    vae_dir = layout.comfy_root / "models" / "vae"
    override = env.get("H3STUDIO_LIGHTNING_VAE")
    candidates = (override,) if override else VAE_PREFERENCE
    source = next((vae_dir / name for name in candidates if name and (vae_dir / name).is_file()), None)
    if source is None:
        printer("[H3 RAM] H3 VAE not found; skipping Linux page-cache warmup.")
        return False
    size = source.stat().st_size
    printer(f"[H3 RAM] Warming VAE page cache · {source.name} · {_human(size)}")
    started = time.monotonic()
    read = 0
    with source.open("rb", buffering=0) as handle:
        while block := handle.read(64 * MIB):
            read += len(block)
    elapsed = max(time.monotonic() - started, 0.001)
    printer(f"[H3 RAM] VAE warmup complete · {elapsed:.1f}s · {read / MIB / elapsed:.0f} MiB/s")
    return True


def run_startup(custom_node_root: Path, environ: dict[str, str] | None = None, printer: Callable[[str], None] = print) -> bool:
    env = os.environ if environ is None else environ
    layout = detect_layout(custom_node_root, env)
    if layout is None:
        return False
    printer("\n=== H3 Studio · Lightning RAM cache ===")
    try:
        with _startup_lock(layout.ram_root):
            staged = stage_encoder(layout, env, printer)
            if staged:
                warm_vae(layout, env, printer)
        printer("[H3 RAM] Transformers stay on persistent storage; ComfyUI DynamicVRAM owns GPU staging.")
        printer("=== H3 Studio · RAM cache ready ===\n")
        return staged
    except Exception as error:  # startup acceleration must never prevent ComfyUI from opening
        printer(f"[H3 RAM] Safe fallback after {type(error).__name__}: {error}")
        printer("[H3 RAM] ComfyUI will continue with its existing model paths.")
        return False


__all__ = ["CacheLayout", "detect_layout", "run_startup", "stage_encoder", "warm_vae"]
