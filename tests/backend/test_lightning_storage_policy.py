from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import h3studio.lightning_ram_cache as cache
from h3studio.lightning_ram_cache import ENCODER, CacheLayout, HostMemory


def _layout(tmp_path: Path) -> CacheLayout:
    return CacheLayout(
        comfy_root=tmp_path / "ComfyUI",
        ram_root=tmp_path / "shm" / "h3-models",
        persistent_root=tmp_path / "persistent",
        local_root=tmp_path / "local-cache",
    )


def test_ram_only_encoder_is_persisted_before_tmpfs_can_remain_active(tmp_path: Path) -> None:
    layout = _layout(tmp_path)
    payload = b"ram-only-encoder" * 2048
    layout.ram_encoder.parent.mkdir(parents=True)
    layout.ram_encoder.write_bytes(payload)
    layout.visible_encoder.parent.mkdir(parents=True)
    layout.visible_encoder.symlink_to(layout.ram_encoder)

    output = []
    assert cache.stage_encoder(layout, {}, output.append, safety_bytes=0) is True

    assert layout.persistent_encoder.read_bytes() == payload
    assert layout.visible_encoder.is_symlink()
    assert layout.visible_encoder.resolve() == layout.ram_encoder.resolve()
    assert any("durable recovery copy" in line for line in output)


def test_auto_policy_refuses_32_gib_tmpfs_even_when_tmpfs_has_logical_space(
    tmp_path: Path,
    monkeypatch,
) -> None:
    layout = _layout(tmp_path)
    source = layout.visible_encoder
    source.parent.mkdir(parents=True)
    source.write_bytes(b"x" * 4096)
    layout.ram_root.parent.mkdir(parents=True)

    monkeypatch.setattr(cache, "_is_tmpfs", lambda _path: True)
    monkeypatch.setattr(cache.shutil, "disk_usage", lambda _path: SimpleNamespace(free=64 * cache.GIB))
    monkeypatch.setattr(
        cache,
        "host_memory_snapshot",
        lambda: HostMemory(
            total=32 * cache.GIB,
            available=24 * cache.GIB,
            swap_total=16 * cache.GIB,
            swap_free=16 * cache.GIB,
            shmem=0,
            swap_cached=0,
            pinned=0,
        ),
    )
    monkeypatch.setattr(cache, "_verified_local_disk", lambda _path, _env: (False, "not local"))

    decision = cache.choose_cache_mode(layout, source, {})
    assert decision.mode == "persistent"
    assert "below 48 GiB tmpfs floor" in decision.reason


def test_explicit_legacy_ram_cache_request_is_still_safety_gated(tmp_path: Path, monkeypatch) -> None:
    layout = _layout(tmp_path)
    source = layout.visible_encoder
    source.parent.mkdir(parents=True)
    source.write_bytes(b"x" * 4096)
    layout.ram_root.parent.mkdir(parents=True)

    monkeypatch.setattr(cache, "_is_tmpfs", lambda _path: True)
    monkeypatch.setattr(cache.shutil, "disk_usage", lambda _path: SimpleNamespace(free=64 * cache.GIB))
    monkeypatch.setattr(
        cache,
        "host_memory_snapshot",
        lambda: HostMemory(
            total=31 * cache.GIB,
            available=20 * cache.GIB,
            swap_total=16 * cache.GIB,
            swap_free=16 * cache.GIB,
            shmem=0,
            swap_cached=0,
            pinned=0,
        ),
    )
    monkeypatch.setattr(cache, "_verified_local_disk", lambda _path, _env: (False, "not local"))

    decision = cache.choose_cache_mode(layout, source, {"H3STUDIO_LIGHTNING_RAM_CACHE": "1"})
    assert decision.mode == "persistent"
    assert "tmpfs request refused" in decision.reason


def test_persistent_mode_repairs_broken_visible_symlink(tmp_path: Path) -> None:
    layout = _layout(tmp_path)
    layout.persistent_encoder.parent.mkdir(parents=True)
    layout.persistent_encoder.write_bytes(b"persistent")
    layout.visible_encoder.parent.mkdir(parents=True)
    layout.visible_encoder.symlink_to(layout.ram_encoder)

    active = cache._activate_persistent(layout, layout.persistent_encoder, lambda _line: None)

    assert active == layout.persistent_encoder
    assert layout.visible_encoder.resolve() == layout.persistent_encoder.resolve()


def test_missing_encoder_removes_broken_symlink_before_comfy_scan(tmp_path: Path) -> None:
    layout = _layout(tmp_path)
    layout.visible_encoder.parent.mkdir(parents=True)
    layout.visible_encoder.symlink_to(layout.ram_encoder)
    output = []

    source = cache._ensure_persistent_source(layout, {}, output.append)

    assert source is None
    assert not layout.visible_encoder.exists()
    assert not layout.visible_encoder.is_symlink()
    assert any("Removed broken encoder symlink" in line for line in output)


def test_auto_startup_vae_warmup_is_disabled_on_32_gib_host() -> None:
    state = HostMemory(
        total=32 * cache.GIB,
        available=20 * cache.GIB,
        swap_total=16 * cache.GIB,
        swap_free=16 * cache.GIB,
        shmem=0,
        swap_cached=0,
        pinned=0,
    )
    assert cache._auto_warm_vae({}, state) is False


def test_required_encoder_name_does_not_change() -> None:
    assert ENCODER == "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"
