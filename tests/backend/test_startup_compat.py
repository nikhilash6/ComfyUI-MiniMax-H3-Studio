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


def test_quarantine_can_be_disabled_for_non_studio_workflows(tmp_path: Path) -> None:
    current = tmp_path / "custom_nodes" / "ComfyUI-MiniMax-H3-Studio"
    current.mkdir(parents=True)
    legacy = tmp_path / "custom_nodes" / "legacy" / "minimax_h3_easy_ui.js"
    legacy.parent.mkdir(parents=True)
    legacy.write_text("keep", encoding="utf-8")

    assert quarantine_conflicting_frontends(
        current,
        {"H3STUDIO_QUARANTINE_LEGACY_EASY_UI": "0"},
        lambda _line: None,
    ) == ()
    assert legacy.exists()
