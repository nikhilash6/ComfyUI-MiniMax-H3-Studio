from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from h3studio.lightning_ram_cache import ENCODER, CacheLayout, detect_layout, stage_encoder, warm_vae


def _layout(tmp_path: Path) -> CacheLayout:
    return CacheLayout(
        comfy_root=tmp_path / "ComfyUI",
        ram_root=tmp_path / "shm" / "h3-models",
        persistent_root=tmp_path / "persistent",
    )


def test_encoder_is_preserved_persistently_and_linked_to_verified_ram_copy(tmp_path: Path) -> None:
    layout = _layout(tmp_path)
    visible = layout.visible_encoder
    visible.parent.mkdir(parents=True)
    payload = b"encoder-weights" * 1024
    visible.write_bytes(payload)

    output = []
    assert stage_encoder(layout, {}, output.append, safety_bytes=0) is True

    assert layout.persistent_encoder.read_bytes() == payload
    assert layout.ram_encoder.read_bytes() == payload
    assert visible.is_symlink()
    assert visible.resolve() == layout.ram_encoder.resolve()
    assert any("copy verified" in line for line in output)


def test_existing_persistent_source_repairs_broken_tmpfs_link(tmp_path: Path) -> None:
    layout = _layout(tmp_path)
    layout.persistent_encoder.parent.mkdir(parents=True)
    layout.persistent_encoder.write_bytes(b"cached-encoder")
    layout.visible_encoder.parent.mkdir(parents=True)
    layout.visible_encoder.symlink_to(layout.ram_encoder)

    assert stage_encoder(layout, {}, lambda _line: None, safety_bytes=0) is True
    assert layout.ram_encoder.read_bytes() == b"cached-encoder"
    assert layout.visible_encoder.resolve() == layout.ram_encoder.resolve()


def test_explicit_source_never_discards_an_existing_visible_encoder(tmp_path: Path) -> None:
    layout = _layout(tmp_path)
    layout.visible_encoder.parent.mkdir(parents=True)
    layout.visible_encoder.write_bytes(b"visible-copy")
    override = tmp_path / "override.safetensors"
    override.write_bytes(b"override-copy")

    assert stage_encoder(
        layout,
        {"H3STUDIO_LIGHTNING_ENCODER_SOURCE": str(override)},
        lambda _line: None,
        safety_bytes=0,
    )
    assert layout.persistent_encoder.read_bytes() == b"visible-copy"
    assert layout.ram_encoder.read_bytes() == b"override-copy"
    assert layout.visible_encoder.resolve() == layout.ram_encoder.resolve()


def test_insufficient_tmpfs_leaves_regular_model_untouched(tmp_path: Path, monkeypatch) -> None:
    layout = _layout(tmp_path)
    layout.visible_encoder.parent.mkdir(parents=True)
    layout.visible_encoder.write_bytes(b"encoder")
    monkeypatch.setattr("h3studio.lightning_ram_cache.shutil.disk_usage", lambda _path: SimpleNamespace(free=1))

    assert stage_encoder(layout, {}, lambda _line: None, safety_bytes=8) is False
    assert layout.visible_encoder.is_file()
    assert not layout.visible_encoder.is_symlink()
    assert not layout.persistent_encoder.exists()


def test_vae_warmup_reads_preferred_existing_model(tmp_path: Path) -> None:
    layout = _layout(tmp_path)
    vae = layout.comfy_root / "models" / "vae" / "minimax_h3_video_vae_int8_convrot.safetensors"
    vae.parent.mkdir(parents=True)
    vae.write_bytes(b"vae" * 1024)

    output = []
    assert warm_vae(layout, {}, output.append) is True
    assert any("VAE warmup complete" in line for line in output)


def test_required_encoder_name_remains_32b_nvfp4() -> None:
    assert ENCODER == "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"


def test_non_lightning_host_keeps_standard_comfyui_paths(tmp_path: Path) -> None:
    custom_node = tmp_path / "ComfyUI" / "custom_nodes" / "H3Studio"
    custom_node.mkdir(parents=True)
    env = {
        "H3STUDIO_LIGHTNING_ROOT": str(tmp_path / "not-lightning"),
        "H3STUDIO_LIGHTNING_RAM_ROOT": str(tmp_path / "not-tmpfs" / "h3-models"),
    }

    assert detect_layout(custom_node, env) is None
