from __future__ import annotations

from pathlib import Path

from h3studio.startup_compat import quarantine_conflicting_frontends


def test_conflicting_legacy_easy_frontend_is_quarantined_recoverably(tmp_path: Path) -> None:
    current = tmp_path / "custom_nodes" / "ComfyUI-MiniMax-H3-Studio"
    current.mkdir(parents=True)
    legacy = tmp_path / "custom_nodes" / "ComfyUI-MiniMaxH3-Easy" / "web" / "minimax_h3_easy_ui.js"
    legacy.parent.mkdir(parents=True)
    legacy.write_text("legacy global queue wrapper", encoding="utf-8")

    result = quarantine_conflicting_frontends(current, {}, lambda _line: None)

    assert not legacy.exists()
    assert len(result) == 1
    assert result[0].read_text(encoding="utf-8") == "legacy global queue wrapper"


def test_h3_hub_frontend_is_quarantined_without_disabling_backend(tmp_path: Path) -> None:
    current = tmp_path / "custom_nodes" / "ComfyUI-MiniMax-H3-Studio"
    current.mkdir(parents=True)

    hub = tmp_path / "custom_nodes" / "H3-Studio-Hub-v5_41"
    backend = hub / "__init__.py"
    frontend = hub / "web" / "h3_studio_hub_v5_40.js"
    frontend.parent.mkdir(parents=True)
    backend.write_text("NODE_CLASS_MAPPINGS = {'H3StudioMultiRefStillRef2VA': object}", encoding="utf-8")
    frontend.write_text("legacy hub browser poller", encoding="utf-8")

    result = quarantine_conflicting_frontends(current, {}, lambda _line: None)

    assert hub.exists()
    assert backend.exists()
    assert "H3StudioMultiRefStillRef2VA" in backend.read_text(encoding="utf-8")
    assert not frontend.exists()
    assert len(result) == 1
    assert result[0].name.startswith("h3_studio_hub_v5_40.js.h3studio-disabled")
    assert result[0].read_text(encoding="utf-8") == "legacy hub browser poller"


def test_quarantine_can_be_disabled_for_non_studio_workflows(tmp_path: Path) -> None:
    current = tmp_path / "custom_nodes" / "ComfyUI-MiniMax-H3-Studio"
    current.mkdir(parents=True)
    legacy = tmp_path / "custom_nodes" / "legacy" / "minimax_h3_easy_ui.js"
    hub_frontend = tmp_path / "custom_nodes" / "H3-Studio-Hub-v5_41" / "web" / "h3_studio_hub_v5_40.js"
    legacy.parent.mkdir(parents=True)
    hub_frontend.parent.mkdir(parents=True)
    legacy.write_text("keep", encoding="utf-8")
    hub_frontend.write_text("keep hub", encoding="utf-8")

    assert quarantine_conflicting_frontends(
        current,
        {"H3STUDIO_QUARANTINE_LEGACY_EASY_UI": "0"},
        lambda _line: None,
    ) == ()
    assert legacy.exists()
    assert hub_frontend.exists()
