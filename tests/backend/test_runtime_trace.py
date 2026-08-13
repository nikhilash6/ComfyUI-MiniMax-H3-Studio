from __future__ import annotations

import logging
import sys
from types import ModuleType

import h3studio.runtime_trace as runtime_trace


def test_patcher_fields_reports_identity_without_walking_weights() -> None:
    class Model:
        pass

    class Patcher:
        model = Model()
        parent = object()
        size = 3 * runtime_trace.GIB
        is_dynamic = True

        @staticmethod
        def loaded_size():
            return 2 * runtime_trace.GIB

        @staticmethod
        def pinned_memory_size():
            return runtime_trace.GIB

    patcher = Patcher()
    fields = runtime_trace.patcher_fields(patcher)

    assert fields["patcher_id"] == id(patcher)
    assert fields["patcher_model_id"] == id(patcher.model)
    assert fields["patcher_parent_id"] == id(patcher.parent)
    assert fields["patcher_dynamic"] is True
    assert fields["patcher_size_gib"] == 3
    assert fields["patcher_loaded_gib"] == 2
    assert fields["patcher_pinned_gib"] == 1


def test_model_source_falls_back_to_legacy_unet_category(monkeypatch, tmp_path) -> None:
    model_path = tmp_path / "model.safetensors"
    model_path.write_bytes(b"test")
    calls = []
    folder_paths = ModuleType("folder_paths")

    def get_full_path(category, name):
        calls.append((category, name))
        return str(model_path) if category == "unet" else None

    folder_paths.get_full_path = get_full_path
    monkeypatch.setitem(sys.modules, "folder_paths", folder_paths)

    fields = runtime_trace.model_source_fields("diffusion_models", model_path.name, "transformer")

    assert calls == [("diffusion_models", model_path.name), ("unet", model_path.name)]
    assert fields["transformer_realpath"] == str(model_path.resolve())


def test_emit_is_read_only_for_cuda_runtime(monkeypatch, caplog) -> None:
    calls = []
    torch = ModuleType("torch")

    class Cuda:
        @staticmethod
        def is_available():
            return True

        @staticmethod
        def current_device():
            return 0

        @staticmethod
        def mem_get_info(_device):
            calls.append("mem_get_info")
            return 4 * runtime_trace.GIB, 8 * runtime_trace.GIB

        @staticmethod
        def memory_allocated(_device):
            calls.append("memory_allocated")
            return runtime_trace.GIB

        @staticmethod
        def memory_reserved(_device):
            calls.append("memory_reserved")
            return 2 * runtime_trace.GIB

        @staticmethod
        def synchronize():
            raise AssertionError("passive trace must not synchronize CUDA")

        @staticmethod
        def empty_cache():
            raise AssertionError("passive trace must not clear CUDA")

    torch.cuda = Cuda()
    monkeypatch.setitem(sys.modules, "torch", torch)
    monkeypatch.setattr(runtime_trace, "_process_fields", lambda: {})
    monkeypatch.setattr(runtime_trace, "_manager_fields", lambda: {})
    monkeypatch.setenv("H3STUDIO_RUNTIME_TRACE", "1")

    with caplog.at_level(logging.INFO, logger=runtime_trace.__name__):
        runtime_trace.emit("test.state", state=True)

    assert calls == ["mem_get_info", "memory_allocated", "memory_reserved"]
    assert "event=test.state" in caplog.text
    assert "vram_free_gib=4.0000" in caplog.text


def test_runtime_trace_is_opt_in(monkeypatch) -> None:
    monkeypatch.delenv("H3STUDIO_RUNTIME_TRACE", raising=False)
    assert runtime_trace.enabled() is False


def test_manager_summary_does_not_probe_every_loaded_patcher_by_default(monkeypatch) -> None:
    manager = ModuleType("comfy.model_management")
    patcher = type("Patcher", (), {"model": object()})()
    manager.TOTAL_PINNED_MEMORY = 0
    manager.MAX_PINNED_MEMORY = 0
    manager.args = type("Args", (), {"fast_disk": False})()
    manager.loaded_models = lambda: [patcher]
    comfy = ModuleType("comfy")
    comfy.model_management = manager
    monkeypatch.setitem(sys.modules, "comfy", comfy)
    monkeypatch.setitem(sys.modules, "comfy.model_management", manager)
    monkeypatch.delenv("H3STUDIO_RUNTIME_TRACE_MODELS", raising=False)
    monkeypatch.setattr(
        runtime_trace,
        "patcher_fields",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("unexpected patcher probe")),
    )

    fields = runtime_trace._manager_fields()

    assert fields["loaded_model_count"] == 1
    assert fields["loaded_patchers"].endswith(f":{id(patcher)}")
