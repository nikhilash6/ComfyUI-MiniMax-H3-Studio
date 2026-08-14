"""Durable Lightning model backing for MiniMax H3.

The persistent encoder is always the recovery source. On constrained hosts the
Studio deliberately avoids copying the 32B encoder into tmpfs: /dev/shm is
swappable and can amplify host-memory pressure. Optional local-disk and tmpfs
caches are accelerators only; neither is allowed to become the sole copy.
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
DEFAULT_HOST_RESERVE = 8 * GIB
MIN_TMPFS_HOST_RAM = 48 * GIB
LOCAL_FS_TYPES = {"ext4", "xfs", "btrfs", "zfs", "f2fs"}


def _enabled(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "off"}


def _human(value: int) -> str:
    return f"{value / GIB:.2f} GiB"


def _read_key_values(path: Path) -> dict[str, int]:
    values: dict[str, int] = {}
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            key, _, rest = line.partition(":")
            if not rest:
                continue
            token = rest.strip().split()[0]
            values[key] = int(token) * 1024
    except (OSError, ValueError, IndexError):
        pass
    return values


@dataclass(frozen=True)
class HostMemory:
    total: int = 0
    available: int = 0
    swap_total: int = 0
    swap_free: int = 0
    shmem: int = 0
    swap_cached: int = 0
    pinned: int = 0

    @property
    def swap_used_ratio(self) -> float:
        if self.swap_total <= 0:
            return 0.0
        return max(0.0, min(1.0, (self.swap_total - self.swap_free) / self.swap_total))


def host_memory_snapshot() -> HostMemory:
    info = _read_key_values(Path("/proc/meminfo"))
    pinned = 0
    manager = sys.modules.get("comfy.model_management")
    if manager is not None:
        try:
            pinned = max(0, int(getattr(manager, "TOTAL_PINNED_MEMORY", 0)))
        except Exception:
            pinned = 0
    return HostMemory(
        total=info.get("MemTotal", 0),
        available=info.get("MemAvailable", 0),
        swap_total=info.get("SwapTotal", 0),
        swap_free=info.get("SwapFree", 0),
        shmem=info.get("Shmem", 0),
        swap_cached=info.get("SwapCached", 0),
        pinned=pinned,
    )


def _mount_info(path: Path) -> tuple[Path, str, str]:
    """Return the best matching mountpoint, fstype and source without subprocesses."""

    try:
        probe = path.resolve(strict=False)
    except OSError:
        probe = path.absolute()
    while not probe.exists() and probe != probe.parent:
        probe = probe.parent

    best_mount = Path("/")
    best_type = ""
    best_source = ""
    try:
        for line in Path("/proc/mounts").read_text(encoding="utf-8").splitlines():
            fields = line.split()
            if len(fields) < 3:
                continue
            source = fields[0].replace("\\040", " ")
            mount = Path(fields[1].replace("\\040", " "))
            try:
                probe.relative_to(mount)
            except ValueError:
                continue
            if len(mount.parts) >= len(best_mount.parts):
                best_mount, best_type, best_source = mount, fields[2], source
    except OSError:
        pass
    return best_mount, best_type, best_source


def _is_tmpfs(path: Path) -> bool:
    return _mount_info(path)[1] == "tmpfs"


def _verified_local_disk(path: Path, environ: dict[str, str]) -> tuple[bool, str]:
    mount, fstype, source = _mount_info(path)
    if _enabled(environ.get("H3STUDIO_LOCAL_MODEL_CACHE_TRUST"), False):
        return True, f"trusted override ({fstype or 'unknown'} at {mount})"
    local = fstype in LOCAL_FS_TYPES and source.startswith("/dev/")
    if local:
        return True, f"verified {fstype} block mount {source} at {mount}"
    return False, f"unverified backing {fstype or 'unknown'}:{source or '?'} at {mount}"


@dataclass(frozen=True)
class CacheLayout:
    comfy_root: Path
    ram_root: Path
    persistent_root: Path
    local_root: Path | None = None

    @property
    def visible_encoder(self) -> Path:
        return self.comfy_root / "models" / "text_encoders" / ENCODER

    @property
    def ram_encoder(self) -> Path:
        return self.ram_root / "text_encoders" / ENCODER

    @property
    def persistent_encoder(self) -> Path:
        return self.persistent_root / "text_encoders" / ENCODER

    @property
    def local_encoder(self) -> Path | None:
        if self.local_root is None:
            return None
        return self.local_root / "text_encoders" / ENCODER


@dataclass(frozen=True)
class CacheDecision:
    mode: str
    reason: str
    memory: HostMemory


def detect_layout(custom_node_root: Path, environ: dict[str, str] | None = None) -> CacheLayout | None:
    env = os.environ if environ is None else environ
    comfy_root = Path(env.get("H3STUDIO_COMFYUI_ROOT", custom_node_root.parent.parent))
    studio_root = Path(env.get("H3STUDIO_LIGHTNING_ROOT", "/teamspace/studios/this_studio"))
    ram_root = Path(env.get("H3STUDIO_LIGHTNING_RAM_ROOT", "/dev/shm/h3-models"))
    persistent_root = Path(
        env.get("H3STUDIO_LIGHTNING_PERSISTENT_ROOT", studio_root / "h3-models-persistent")
    )
    local_value = str(env.get("H3STUDIO_LOCAL_MODEL_CACHE_ROOT", "")).strip()
    local_root = Path(local_value) if local_value else None
    forced = _enabled(env.get("H3STUDIO_LIGHTNING_FORCE"), False)
    if sys.platform != "linux" or (not forced and not studio_root.is_dir()):
        return None
    return CacheLayout(comfy_root.resolve(), ram_root, persistent_root, local_root)


def _encoder_source(layout: CacheLayout, environ: dict[str, str]) -> Path | None:
    override = environ.get("H3STUDIO_LIGHTNING_ENCODER_SOURCE")
    if override:
        candidate = Path(override)
        if candidate.is_file() and not candidate.is_symlink():
            return candidate.resolve()

    visible = layout.visible_encoder
    if visible.is_file() and not visible.is_symlink():
        return visible

    candidates = [
        layout.persistent_encoder,
        visible.parent / ".h3studio-persistent" / ENCODER,
    ]
    if layout.local_encoder is not None:
        candidates.append(layout.local_encoder)

    ram_target = layout.ram_encoder.resolve(strict=False)
    for candidate in candidates:
        if candidate.is_file() and candidate.resolve() != ram_target:
            return candidate.resolve()

    if visible.is_symlink():
        target = visible.resolve(strict=False)
        if target.is_file() and target != ram_target and not _is_tmpfs(target):
            return target.resolve()

    excluded = {
        ".git",
        ".venv",
        "custom_nodes",
        "input",
        "logs",
        "node_modules",
        "output",
        "user",
    }
    studio_root = layout.persistent_root.parent
    if studio_root.is_dir():
        for directory, names, files in os.walk(studio_root):
            names[:] = [name for name in names if name not in excluded]
            if ENCODER not in files:
                continue
            candidate = Path(directory) / ENCODER
            if candidate.is_symlink() or candidate == visible or candidate.resolve() == ram_target:
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


def _atomic_copy(
    source: Path,
    target: Path,
    printer: Callable[[str], None],
    label: str,
    resume: bool = True,
) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    size = source.stat().st_size
    partial = target.with_name(target.name + ".h3studio-partial")
    copied = partial.stat().st_size if resume and partial.is_file() else 0
    if copied > size:
        partial.unlink(missing_ok=True)
        copied = 0
    if not resume:
        partial.unlink(missing_ok=True)

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
                printer(
                    f"[H3 Storage] {label} {copied * 100 / size:5.1f}% · "
                    f"{_human(copied)} / {_human(size)} · {rate / MIB:.0f} MiB/s"
                )
                last_print = now
        dst.flush()
        os.fsync(dst.fileno())

    if partial.stat().st_size != size:
        raise OSError(f"{label} size verification failed")
    if _edge_signature(source) != _edge_signature(partial):
        raise OSError(f"{label} edge-signature verification failed")
    os.replace(partial, target)


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


def _recover_ram_only_copy(
    layout: CacheLayout,
    printer: Callable[[str], None],
) -> Path | None:
    target = layout.ram_encoder
    if not target.is_file() or target.is_symlink():
        return None
    persistent = layout.persistent_encoder
    if persistent.is_file() and _edge_signature(target) == _edge_signature(persistent):
        return persistent
    if persistent.exists():
        persistent = persistent.with_name(f"{persistent.name}.recovered-{int(time.time())}")
    printer("[H3 Storage] RAM-only encoder detected; creating durable recovery copy before reuse.")
    _atomic_copy(target, persistent, printer, "persistent recovery", resume=True)
    printer(f"[H3 Storage] Persistent recovery verified → {persistent}")
    return persistent


def _ensure_persistent_source(
    layout: CacheLayout,
    env: dict[str, str],
    printer: Callable[[str], None],
) -> Path | None:
    source = _encoder_source(layout, env)
    if source is None:
        try:
            source = _recover_ram_only_copy(layout, printer)
        except Exception as error:
            printer(f"[H3 Storage] ERROR: could not persist RAM-only encoder: {error}")
            raise

    visible = layout.visible_encoder
    if source is None:
        if visible.is_symlink() and not visible.exists():
            broken_target = os.readlink(visible)
            visible.unlink(missing_ok=True)
            printer(
                "[H3 Storage] Removed broken encoder symlink before ComfyUI scan: "
                f"{visible} -> {broken_target}"
            )
        printer(
            "[H3 Storage] Encoder not found. Restore the persistent regular file at "
            f"{visible} before generating."
        )
        return None

    if layout.local_encoder is not None and source == layout.local_encoder.resolve(strict=False):
        _atomic_copy(source, layout.persistent_encoder, printer, "persistent recovery", resume=True)
        source = layout.persistent_encoder

    return source


def _requested_mode(env: dict[str, str]) -> str:
    explicit = str(env.get("H3STUDIO_LIGHTNING_CACHE_MODE", "")).strip().lower()
    if explicit:
        aliases = {
            "ram": "tmpfs",
            "shm": "tmpfs",
            "disk": "local_disk",
            "local": "local_disk",
            "off": "persistent",
            "none": "persistent",
        }
        explicit = aliases.get(explicit, explicit)
        if explicit not in {"auto", "persistent", "local_disk", "tmpfs"}:
            return "auto"
        return explicit

    legacy = env.get("H3STUDIO_LIGHTNING_RAM_CACHE")
    if legacy is not None:
        return "tmpfs" if _enabled(legacy, False) else "persistent"
    return "auto"


def _tmpfs_allowed(
    layout: CacheLayout,
    size: int,
    env: dict[str, str],
    memory: HostMemory,
) -> tuple[bool, str]:
    parent = layout.ram_root.parent
    if not parent.is_dir() or not _is_tmpfs(parent):
        return False, f"{parent} is not tmpfs"

    reserve = int(float(env.get("H3STUDIO_HOST_MEMORY_RESERVE_GIB", "8")) * GIB)
    logical_free = shutil.disk_usage(parent).free
    if logical_free < size + 512 * MIB:
        return False, f"tmpfs has only {_human(logical_free)} free"
    if memory.total and memory.total < MIN_TMPFS_HOST_RAM:
        return False, f"host RAM {_human(memory.total)} is below 48 GiB tmpfs floor"
    if memory.available and memory.available < size + reserve:
        return False, (
            f"MemAvailable {_human(memory.available)} cannot hold encoder {_human(size)} "
            f"plus {_human(reserve)} reserve"
        )
    if memory.swap_used_ratio >= 0.25:
        return False, f"swap already {memory.swap_used_ratio * 100:.0f}% used"
    if memory.pinned and memory.total and memory.pinned > memory.total * 0.50:
        return False, f"Comfy pinned memory already {_human(memory.pinned)}"
    return True, (
        f"headroom safe: MemAvailable {_human(memory.available)}, "
        f"SwapFree {_human(memory.swap_free)}, pinned {_human(memory.pinned)}"
    )


def choose_cache_mode(
    layout: CacheLayout,
    source: Path,
    environ: dict[str, str] | None = None,
) -> CacheDecision:
    env = os.environ if environ is None else environ
    memory = host_memory_snapshot()
    requested = _requested_mode(env)
    size = source.stat().st_size

    local_ok = False
    local_reason = "no local cache configured"
    if layout.local_root is not None:
        layout.local_root.mkdir(parents=True, exist_ok=True)
        local_ok, local_reason = _verified_local_disk(layout.local_root, env)
        if local_ok:
            local_free = shutil.disk_usage(layout.local_root).free
            if local_free < size + GIB:
                local_ok = False
                local_reason = f"local cache has only {_human(local_free)} free"

    tmpfs_ok, tmpfs_reason = _tmpfs_allowed(layout, size, env, memory)

    if requested == "persistent":
        return CacheDecision("persistent", "persistent mode requested", memory)
    if requested == "local_disk":
        if local_ok:
            return CacheDecision("local_disk", local_reason, memory)
        return CacheDecision("persistent", f"local-disk request refused: {local_reason}", memory)
    if requested == "tmpfs":
        if tmpfs_ok:
            return CacheDecision("tmpfs", tmpfs_reason, memory)
        return CacheDecision("persistent", f"tmpfs request refused: {tmpfs_reason}", memory)

    if local_ok:
        return CacheDecision("local_disk", local_reason, memory)
    if tmpfs_ok:
        return CacheDecision("tmpfs", tmpfs_reason, memory)
    return CacheDecision(
        "persistent",
        f"safe fallback; local={local_reason}; tmpfs={tmpfs_reason}",
        memory,
    )


def _activate_persistent(
    layout: CacheLayout,
    source: Path,
    printer: Callable[[str], None],
) -> Path:
    visible = layout.visible_encoder
    if source == visible and visible.is_file() and not visible.is_symlink():
        printer(f"[H3 Storage] Encoder canonical regular file → {visible}")
        return visible

    if source.is_file() and not _is_tmpfs(source):
        _atomic_symlink(visible, source)
        printer(f"[H3 Storage] ComfyUI encoder → persistent source {source}")
        return source
    raise OSError(f"Persistent encoder source is invalid: {source}")


def stage_encoder(
    layout: CacheLayout,
    environ: dict[str, str] | None = None,
    printer: Callable[[str], None] = print,
    safety_bytes: int = 512 * MIB,
) -> bool:
    """Explicitly stage the encoder in tmpfs, never without durable recovery."""

    env = os.environ if environ is None else environ
    target = layout.ram_encoder
    source = _encoder_source(layout, env)
    if source is None and target.is_file() and not target.is_symlink():
        source = _recover_ram_only_copy(layout, printer)
    if source is None:
        printer(f"[H3 Storage] Encoder source not found; tmpfs staging skipped ({ENCODER}).")
        return False

    size = source.stat().st_size
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_file() and target.stat().st_size == size and not target.is_symlink():
        if _edge_signature(target) != _edge_signature(source):
            target.unlink()
        else:
            printer(f"[H3 Storage] Encoder already verified in tmpfs · {_human(size)}")

    if not target.is_file():
        free = shutil.disk_usage(layout.ram_root.parent).free
        partial = target.with_name(target.name + ".h3studio-partial")
        reusable = partial.stat().st_size if partial.is_file() else 0
        needed = max(size - reusable, 0) + safety_bytes
        printer(
            f"[H3 Storage] tmpfs free {_human(free)} · encoder {_human(size)} · "
            f"required {_human(needed)}"
        )
        if free < needed:
            printer("[H3 Storage] tmpfs staging skipped: insufficient filesystem headroom.")
            if layout.visible_encoder.is_symlink() and not layout.visible_encoder.exists():
                _atomic_symlink(layout.visible_encoder, source)
            return False
        _atomic_copy(source, target, printer, "tmpfs encoder", resume=True)
        printer(f"[H3 Storage] Encoder copy verified · real tmpfs file · {_human(size)}")

    visible = layout.visible_encoder
    if visible.is_file() and not visible.is_symlink():
        preserved = _preserve_visible_encoder(layout)
        if source == visible:
            source = preserved

    persistent = _encoder_source(layout, env)
    if persistent is None or _is_tmpfs(persistent):
        persistent = _recover_ram_only_copy(layout, printer)
    if persistent is None or _is_tmpfs(persistent):
        raise OSError("Refusing to activate tmpfs encoder without a persistent recovery source")

    _atomic_symlink(visible, target)
    printer(f"[H3 Storage] ComfyUI encoder → {target}")
    printer(f"[H3 Storage] Persistent recovery source → {persistent}")
    return True


def stage_local_encoder(
    layout: CacheLayout,
    source: Path,
    environ: dict[str, str] | None = None,
    printer: Callable[[str], None] = print,
) -> bool:
    env = os.environ if environ is None else environ
    target = layout.local_encoder
    if target is None:
        return False
    ok, reason = _verified_local_disk(layout.local_root, env)
    if not ok:
        printer(f"[H3 Storage] Local cache refused: {reason}")
        return False

    visible = layout.visible_encoder
    canonical = source
    if visible.is_file() and not visible.is_symlink() and source == visible:
        canonical = _preserve_visible_encoder(layout)

    size = canonical.stat().st_size
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.is_file() or target.stat().st_size != size or _edge_signature(target) != _edge_signature(canonical):
        target.unlink(missing_ok=True)
        free = shutil.disk_usage(layout.local_root).free
        if free < size + GIB:
            printer(f"[H3 Storage] Local cache skipped: only {_human(free)} free.")
            _activate_persistent(layout, canonical, printer)
            return False
        _atomic_copy(canonical, target, printer, "local-disk encoder", resume=True)

    _atomic_symlink(visible, target)
    printer(f"[H3 Storage] ComfyUI encoder → verified local cache {target}")
    printer(f"[H3 Storage] Persistent recovery source → {canonical}")
    return True


def warm_vae(
    layout: CacheLayout,
    environ: dict[str, str] | None = None,
    printer: Callable[[str], None] = print,
) -> bool:
    env = os.environ if environ is None else environ
    if not _enabled(env.get("H3STUDIO_LIGHTNING_WARM_VAE"), True):
        return False
    vae_dir = layout.comfy_root / "models" / "vae"
    override = env.get("H3STUDIO_LIGHTNING_VAE")
    candidates = (override,) if override else VAE_PREFERENCE
    source = next((vae_dir / name for name in candidates if name and (vae_dir / name).is_file()), None)
    if source is None:
        printer("[H3 Storage] H3 VAE not found; skipping Linux page-cache warmup.")
        return False
    size = source.stat().st_size
    printer(f"[H3 Storage] Warming VAE page cache · {source.name} · {_human(size)}")
    started = time.monotonic()
    read = 0
    with source.open("rb", buffering=0) as handle:
        while block := handle.read(64 * MIB):
            read += len(block)
    elapsed = max(time.monotonic() - started, 0.001)
    printer(f"[H3 Storage] VAE warmup complete · {elapsed:.1f}s · {read / MIB / elapsed:.0f} MiB/s")
    return True


def _auto_warm_vae(env: dict[str, str], memory: HostMemory) -> bool:
    if "H3STUDIO_LIGHTNING_WARM_VAE" in env:
        return _enabled(env.get("H3STUDIO_LIGHTNING_WARM_VAE"), False)
    return (
        memory.total >= MIN_TMPFS_HOST_RAM
        and memory.available >= 8 * GIB
        and memory.swap_used_ratio < 0.25
    )


def _status_lines(decision: CacheDecision, source: Path) -> tuple[str, ...]:
    memory = decision.memory
    return (
        "[H3 Storage]",
        f"  encoder canonical: {source}",
        f"  active policy: {decision.mode}",
        f"  reason: {decision.reason}",
        f"  MemAvailable: {_human(memory.available)} / {_human(memory.total)}",
        f"  SwapFree: {_human(memory.swap_free)} / {_human(memory.swap_total)}",
        f"  Shmem: {_human(memory.shmem)} · SwapCached: {_human(memory.swap_cached)}",
        f"  Comfy pinned at decision: {_human(memory.pinned)}",
    )


def run_startup(
    custom_node_root: Path,
    environ: dict[str, str] | None = None,
    printer: Callable[[str], None] = print,
) -> bool:
    env = os.environ if environ is None else environ
    layout = detect_layout(custom_node_root, env)
    if layout is None:
        return False

    printer("\n=== H3 Studio · durable model backing ===")
    try:
        with _startup_lock(layout.persistent_root):
            source = _ensure_persistent_source(layout, env, printer)
            if source is None:
                printer("=== H3 Studio · encoder recovery required ===\n")
                return False

            decision = choose_cache_mode(layout, source, env)
            for line in _status_lines(decision, source):
                printer(line)

            active = False
            if decision.mode == "tmpfs":
                active = stage_encoder(layout, env, printer)
                if not active:
                    _activate_persistent(layout, _encoder_source(layout, env) or source, printer)
            elif decision.mode == "local_disk":
                active = stage_local_encoder(layout, source, env, printer)
                if not active:
                    _activate_persistent(layout, _encoder_source(layout, env) or source, printer)
            else:
                _activate_persistent(layout, source, printer)
                active = True

            if _auto_warm_vae(env, decision.memory):
                warm_vae(layout, env, printer)
            else:
                printer("[H3 Storage] Startup VAE warmup: disabled by low-RAM/swap-aware policy.")

        printer("[H3 Storage] ComfyUI DynamicVRAM remains the only model-residency authority.")
        printer("=== H3 Studio · storage policy ready ===\n")
        return active
    except Exception as error:
        printer(f"[H3 Storage] Safe fallback after {type(error).__name__}: {error}")
        source = _encoder_source(layout, env)
        if source is not None and not _is_tmpfs(source):
            try:
                _activate_persistent(layout, source, printer)
            except Exception as recovery_error:
                printer(f"[H3 Storage] Persistent-path recovery also failed: {recovery_error}")
        printer("[H3 Storage] ComfyUI will continue without activating an unsafe RAM-only cache.")
        return False


__all__ = [
    "CacheDecision",
    "CacheLayout",
    "ENCODER",
    "HostMemory",
    "choose_cache_mode",
    "detect_layout",
    "host_memory_snapshot",
    "run_startup",
    "stage_encoder",
    "stage_local_encoder",
    "warm_vae",
]
