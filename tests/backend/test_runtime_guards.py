from __future__ import annotations

from h3studio import runtime_guards
from h3studio.prompting import comfy_analyzer


def test_zero_image_t2i_runs_selected_writer_then_releases_helper(monkeypatch) -> None:
    class Bundle:
        analyzer_clip = None
        prompt_writer_clip = None
        writer_calls = 0

        def writer_for_enhancement(self):
            self.writer_calls += 1
            self.prompt_writer_clip = object()
            return self.prompt_writer_clip

    bundle = Bundle()

    def original(clip, prompt, references, images, **kwargs):
        assert kwargs["deep_enhancement"] is True
        assert images == ()
        kwargs["writer_loader"]()
        return tuple(references), "qwen enhanced prompt", "writer ran"

    monkeypatch.setattr(runtime_guards, "_ORIGINAL_ANALYZE_REFERENCES", original)
    references, prompt, note = runtime_guards._memory_safe_analyze_references(
        None,
        "a quiet cinematic frame",
        (),
        (),
        deep_enhancement=True,
        writer_loader=bundle.writer_for_enhancement,
        writer_name="qwen3vl_4b_fp8_scaled.safetensors",
    )

    assert bundle.writer_calls == 1
    assert references == ()
    assert prompt == "qwen enhanced prompt"
    assert note == "writer ran"
    assert bundle.analyzer_clip is None
    assert bundle.prompt_writer_clip is None


def test_runtime_guard_installation_is_idempotent() -> None:
    runtime_guards.install_runtime_guards()
    first = comfy_analyzer.analyze_references
    runtime_guards.install_runtime_guards()
    assert comfy_analyzer.analyze_references is first
    assert getattr(first, "__h3studio_helper_release_guard__", False) is True


def test_helper_release_targets_each_distinct_model_once(monkeypatch) -> None:
    analyzer = object()
    writer = object()
    bundle = type("Bundle", (), {"analyzer_clip": analyzer, "prompt_writer_clip": writer})()
    calls = []
    monkeypatch.setattr(runtime_guards, "release_stage_model", lambda value, transition: calls.append((value, transition)))
    monkeypatch.setattr(runtime_guards.gc, "collect", lambda: 0)

    runtime_guards._release_optional_helpers(bundle)

    assert [value for value, _transition in calls] == [analyzer, writer]
    assert bundle.analyzer_clip is None
    assert bundle.prompt_writer_clip is None
