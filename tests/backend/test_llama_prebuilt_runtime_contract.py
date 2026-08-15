from pathlib import Path


SOURCE = (Path(__file__).resolve().parents[2] / "h3studio" / "llama_cpp_dependency.py").read_text(encoding="utf-8")
UI = (Path(__file__).resolve().parents[2] / "web" / "h3_model_setup_prompt_prep_fast.js").read_text(encoding="utf-8")


def test_prebuilt_runtime_supports_linux_and_windows_nvidia_without_default_source_build():
    assert '("linux", "x86_64")' in SOURCE
    assert '("windows", "amd64")' in SOURCE
    assert "micromamba-linux-64" in SOURCE
    assert "micromamba-win-64.exe" in SOURCE
    assert 'mode == "prebuilt"' in SOURCE
    assert 'mode == "source"' in SOURCE
    assert 'mode = str((payload or {}).get("mode") or "prebuilt")' in SOURCE


def test_private_runtime_is_checksum_pinned_atomic_and_does_not_require_windows_symlinks():
    assert "9689782d863c05a1bf5d2d371ba527104e7a4eb4310c1637d8653b751aed9c82" in SOURCE
    assert "8a51f88ec02600488ea20c3acd93fbd4da6c0f03fc499aa53fd234c6749b94b0" in SOURCE
    assert 'return runtime_root() / "current.json"' in SOURCE
    assert "os.replace(temp, _active_pointer())" in SOURCE
    assert "_smoke_test(prefix)" in SOURCE
    assert '"llama-server"' in SOURCE
    assert '"llama-mtmd-cli"' in SOURCE
    assert '"llama-cli"' in SOURCE


def test_model_setup_exposes_prebuilt_install_not_compile_as_normal_path():
    assert "Install fast runtime" in UI
    assert "Repair/update fast runtime" in UI
    assert 'mode: "prebuilt"' in UI
    assert "does not compile llama.cpp" in UI
    assert "Supported Linux/Windows NVIDIA machines use a private prebuilt llama.cpp CUDA runtime" in UI
