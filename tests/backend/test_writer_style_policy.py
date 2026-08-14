from h3studio.prompting.comfy_analyzer import WRITER_SYSTEM_INSTRUCTION, _deterministic_writer_fallback


def test_writer_system_prompt_has_no_permanent_jojo_bias() -> None:
    system = WRITER_SYSTEM_INSTRUCTION.lower()
    assert "jojo" not in system
    assert "generic style" in system
    assert "never choose a franchise" in system


def test_explicit_jojo_request_is_still_supported_conditionally() -> None:
    prompt = _deterministic_writer_fallback("Render this in JoJo anime style", ())
    assert "JoJo's Bizarre Adventure-inspired anime" in prompt
    assert "cross-hatched" in prompt
