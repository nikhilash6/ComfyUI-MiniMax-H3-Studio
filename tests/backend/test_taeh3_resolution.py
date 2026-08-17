from __future__ import annotations

import sys
from pathlib import Path
from types import ModuleType

import h3studio.nodes.preview as preview_module
from h3studio.nodes.preview import H3StudioTAEH3Preview, _resolve_tiny_vae, _vae_approx_roots


class FakeFolderPaths:
    def __init__(self, roots: list[Path], *, direct: str | None = None, models_dir: Path | None = None):
        self._roots = roots
        self._direct = direct
        self.models_dir = str(models_dir) if models_dir is not None else None

    def get_full_path(self, category: str, name: str):
        assert category == "vae_approx"
        return self._direct

    def get_folder_paths(self, category: str):
        assert category == "vae_approx"
        return [str(root) for root in self._roots]


def test_resolver_prefers_comfy_registered_full_path(tmp_path: Path) -> None:
    checkpoint = tmp_path / "taeh3.safetensors"
    checkpoint.write_bytes(b"checkpoint")
    folder_paths = FakeFolderPaths([], direct=str(checkpoint))

    assert _resolve_tiny_vae(folder_paths, "taeh3.safetensors") == str(checkpoint)


def test_resolver_recovers_from_stale_lookup_and_case_mismatch(tmp_path: Path) -> None:
    vae_root = tmp_path / "models" / "vae_approx"
    nested = vae_root / "Kijai"
    nested.mkdir(parents=True)
    checkpoint = nested / "TAEH3.SAFETENSORS"
    checkpoint.write_bytes(b"checkpoint")
    folder_paths = FakeFolderPaths([vae_root], direct=None)

    assert _resolve_tiny_vae(folder_paths, "taeh3.safetensors") == str(checkpoint)


def test_resolver_checks_active_models_dir_when_registered_lookup_breaks(tmp_path: Path) -> None:
    active_models_dir = tmp_path / "custom-model-root"
    vae_root = active_models_dir / "vae_approx"
    vae_root.mkdir(parents=True)
    checkpoint = vae_root / "taeh3.safetensors"
    checkpoint.write_bytes(b"checkpoint")

    class BrokenFolderPaths:
        def get_full_path(self, *_args):
            return None

        def get_folder_paths(self, *_args):
            raise KeyError("vae_approx cache unavailable")

        folder_names_and_paths = {}

    folder_paths = BrokenFolderPaths()
    folder_paths.models_dir = str(active_models_dir)

    assert _resolve_tiny_vae(folder_paths, "taeh3.safetensors") == str(checkpoint)


def test_vae_approx_roots_are_deduplicated(tmp_path: Path) -> None:
    vae_root = tmp_path / "models" / "vae_approx"
    folder_paths = FakeFolderPaths([vae_root, vae_root], models_dir=tmp_path / "models")

    assert _vae_approx_roots(folder_paths) == [vae_root]


def test_missing_preview_checkpoint_skips_preview_instead_of_failing_generation(monkeypatch, tmp_path: Path) -> None:
    folder_module = ModuleType("folder_paths")
    folder_module.models_dir = str(tmp_path / "models")
    folder_module.get_folder_paths = lambda category: [str(tmp_path / "models" / category)]
    folder_module.get_full_path = lambda _category, _name: None
    monkeypatch.setitem(sys.modules, "folder_paths", folder_module)
    monkeypatch.setattr(preview_module, "_resolve_tiny_vae", lambda *_args: None)

    model = object()
    result = H3StudioTAEH3Preview.attach(model, True, "taeh3.safetensors", 768, 90, 1, "16")

    assert result == (model,)
