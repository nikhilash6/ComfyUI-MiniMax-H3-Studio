"""Latency and contract fixes for H3 Studio's modern prompt-preparation stack.

The optional Qwen3.5 analyzer/writer is small enough to fit fully on common
22-24 GB GPUs.  ComfyUI's default dynamic text-encoder patcher is excellent for
huge encoders but can make autoregressive 2B/4B generation needlessly stream
weights every token.  H3 Studio therefore uses ComfyUI's supported non-dynamic
CLIP path for Qwen3.5 prompt preparation, while still allowing ComfyUI to unload
the model before MiniMax H3 conditioning when VRAM is needed.

This module also keeps factual analysis compact and makes prompt-writer retries
about machine-checkable contract failures only.  Subjective style-token checks
must never throw away a useful 30-40 second generation.
"""

from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import Sequence
from typing import Any

LOGGER = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = """You are the factual visual reference analyst for MiniMax H3 image generation.
Study every attached image carefully. The user's later creative request is not evidence and must never change what you claim is visible.
Return JSON only with this exact shape:
{"references":[{"ordinal":1,"role":"character","description":"dense factual source-pixel observation"}]}

Allowed roles: auto, identity, face, character, style, composition, pose, outfit, object, environment, layout, typography, color_palette, lighting, texture, reference.
Target roughly 35-60 information-dense factual words per image. Cover only visibly supported details that materially help generation: subject appearance; face and hair; pose, expression and gaze; clothing; important objects and physical contact; spatial relationships; composition, framing and camera angle; environment; lighting; palette; visual medium or style; and legible text. Omit invisible categories instead of padding. State uncertainty instead of inventing hidden identity, anatomy, text or context. Never import a requested new action, prop, pose, gaze, wardrobe change, style, environment or edit into the source description unless it is already visible. Avoid repetition and generic filler.
Choose role only as a conservative visible-content category. Do not emit prose outside JSON."""

WRITER_SYSTEM_INSTRUCTION = """You are H3 Studio's production prompt director for MiniMax H3.
You receive the user's exact request plus factual source-image records from a separate vision pass. You are not viewing pixels now.
Return compact JSON only: {"instruction":"..."}.

Write one connected 100-180 word production instruction. Preserve the user's actual intent instead of mechanically expanding every source field. Keep every explicit @Image assignment, requested action, direction, expression, object, environment, quoted text and negative constraint. Resolve pronouns when needed. References are source material, never extra panels, duplicate bodies, floating props or a collage.

Make physical interaction unambiguous: held, worn, carried, touched or eaten objects need believable contact, scale, overlap and occlusion. Describe framing, viewpoint, pose/gaze, lighting, materials, palette and rendering treatment only when they materially help the requested final image.

If the user names a style, franchise, work, artist or visual tradition, preserve that requested name and express useful visual traits naturally. Do not require a fixed vocabulary and do not invent unrelated named styles. If the user supplied an already detailed structured prompt, intelligently condense and edit it rather than restating every field.

Do not add audio, music, motion/video directions or facts absent from the source records. thinking=False. Output no prose outside the JSON object."""


def _validate_records(payload: dict[str, Any], expected_ordinals: set[int]) -> dict[int, dict[str, Any]]:
    if not isinstance(payload, dict) or not isinstance(payload.get("references"), list):
        raise ValueError("Analyzer JSON did not contain a references list.")
    records: dict[int, dict[str, Any]] = {}
    for item in payload["references"]:
        if not isinstance(item, dict) or not str(item.get("ordinal", "")).isdigit():
            continue
        ordinal = int(item["ordinal"])
        if ordinal in records:
            raise ValueError(f"Analyzer returned duplicate reference ordinal {ordinal}.")
        if ordinal not in expected_ordinals:
            continue
        description = " ".join(str(item.get("description") or "").split())
        words = len(description.split())
        # 35-60 is the normal target.  Keep modest headroom for dense OCR or
        # material-heavy scenes without accepting essay captions.
        if words < 30 or words > 90:
            raise ValueError(
                f"Analyzer reference {ordinal} description has {words} words; target 35-60, hard range 30-90."
            )
        records[ordinal] = {**item, "description": description}
    missing = sorted(expected_ordinals - records.keys())
    if missing:
        raise ValueError("Analyzer omitted reference records: " + ", ".join(map(str, missing)) + ".")
    return records


def _compact_generate(self, tokens, *args, **kwargs):
    image_count = max(1, int(getattr(self, "_image_count", 1)))
    # Enough for ~35-60 factual words/image + JSON, rather than the historical
    # 1.5K/2K-token ceilings.  A second attempt remains available for malformed
    # structured output, not for stylistic preferences.
    ceiling = min(704, 88 + image_count * 80)
    requested = int(kwargs.get("max_length") or ceiling)
    kwargs["max_length"] = min(requested, ceiling)
    kwargs["do_sample"] = False
    return self.raw_clip.generate(tokens, *args, **kwargs)


def _minicpm_decode(generated, *_args, **_kwargs) -> str:
    return str(generated)


def _load_native_qwen35_resident(name: str):
    """Load Qwen3.5 through ComfyUI's native non-dynamic CLIP path.

    This is not a private loader or Transformers side pipeline.  It uses the
    same current ComfyUI Qwen3.5 model detection/vision/generation classes, but
    requests ``disable_dynamic=True`` so a 2B/4B autoregressive model that fits
    in VRAM is not streamed layer-by-layer on every generated token.
    """

    import folder_paths
    import comfy.sd
    import comfy.utils

    path = folder_paths.get_full_path_or_raise("text_encoders", name)
    state_dict = comfy.utils.load_torch_file(path, safe_load=True)
    clip = comfy.sd.load_text_encoder_state_dicts(
        state_dicts=[state_dict],
        embedding_directory=folder_paths.get_folder_paths("embeddings"),
        clip_type=comfy.sd.CLIPType.STABLE_DIFFUSION,
        disable_dynamic=True,
    )
    LOGGER.info(
        "[H3 Studio] Qwen3.5 prompt model=%s | ComfyUI native | full-resident patcher=%s",
        name,
        not bool(getattr(clip, "is_dynamic", lambda: True)()),
    )
    return clip


def _hard_writer_failures(candidate: str, original_prompt: str) -> list[str]:
    """Validate only things H3 Studio can check without pretending to judge art."""

    from .references import mention_ordinals

    failures: list[str] = []
    words = len(str(candidate).split())
    if words < 55:
        failures.append(f"instruction has only {words} words")
    if words > 240:
        failures.append(f"instruction has {words} words; compact maximum is 240")
    required = set(mention_ordinals(original_prompt))
    present = set(mention_ordinals(candidate))
    if not required.issubset(present):
        missing = ", ".join(f"@Image{n}" for n in sorted(required - present))
        failures.append(f"missing reference assignment(s): {missing}")
    return failures


def _mention_clause(prompt: str, ordinal: int) -> str:
    """Recover the local user clause around a dropped @Image assignment."""

    text = " ".join(str(prompt or "").split())
    token = f"@Image{ordinal}"
    pos = text.lower().find(token.lower())
    if pos < 0:
        return f"Preserve the user's assignment for {token}."
    left = max(text.rfind(".", 0, pos), text.rfind(";", 0, pos), text.rfind("\n", 0, pos))
    right_candidates = [value for value in (text.find(".", pos), text.find(";", pos)) if value >= 0]
    right = min(right_candidates) + 1 if right_candidates else min(len(text), pos + 220)
    clause = text[left + 1:right].strip()
    if len(clause) > 240:
        clause = clause[:237].rstrip() + "…"
    return clause or f"Preserve the user's assignment for {token}."


def _repair_missing_mentions(candidate: str, original_prompt: str) -> tuple[str, list[int]]:
    from .references import mention_ordinals

    required = set(mention_ordinals(original_prompt))
    present = set(mention_ordinals(candidate))
    missing = sorted(required - present)
    if not missing:
        return candidate, []
    clauses = " ".join(_mention_clause(original_prompt, ordinal) for ordinal in missing)
    return " ".join(f"{candidate} {clauses}".split()), missing


def _compact_fallback_prompt(prompt: str, references: Sequence[Any], additional_instruction: str = "") -> str:
    """Bound the emergency fallback instead of inflating a huge source JSON."""

    source_words = " ".join(str(prompt or "").split()).split()
    if len(source_words) <= 150:
        source = " ".join(source_words)
    else:
        # Keep both the opening request and tail, where negative constraints and
        # output/style instructions commonly live.  The generative writer is the
        # normal path; this is only the last-resort fail-soft path.
        source = " ".join(source_words[:118] + ["[…]"] + source_words[-36:])

    assignments = []
    for item in references:
        ordinal = getattr(item, "ordinal", 0)
        role = getattr(item, "effective_role", getattr(item, "role", "reference"))
        retention = getattr(item, "retention", "attribute_transfer")
        if ordinal:
            assignments.append(f"@Image{ordinal} supplies {role} ({retention.replace('_', ' ')}).")

    custom = " ".join(str(additional_instruction or "").split())
    if len(custom.split()) > 28:
        custom = " ".join(custom.split()[:28])

    pieces = [
        "Create one coherent finished still image.",
        source,
        " ".join(assignments),
        f"Additional direction: {custom}." if custom else "",
        "Keep explicit reference ownership, actions, pose and gaze, object contact, framing, lighting, style, quoted text and negative constraints. References are source material, not extra panels or duplicate subjects. Do not add audio, motion or unrelated content.",
    ]
    words = " ".join(" ".join(pieces).split()).split()
    if len(words) > 220:
        words = words[:220]
    return " ".join(words)


def _run_prompt_writer_fast(
    clip: Any,
    prompt: str,
    references: Sequence[Any],
    *,
    writer_name: str,
    clip_loader: Any = None,
    additional_instruction: str = "",
) -> tuple[str, str]:
    """One normal generation; retry only malformed JSON, never style opinions."""

    from .prompting import comfy_analyzer

    facts = tuple(
        (item.ordinal, item.effective_role, item.retention, item.description)
        for item in references
    )
    identity = writer_name or (type(clip).__name__ if clip is not None else "default")
    additional_instruction = str(additional_instruction or "").strip()[:4000]
    key = (str(identity), str(prompt), facts, additional_instruction)
    with comfy_analyzer._CACHE_LOCK:
        cached = comfy_analyzer._WRITER_CACHE.get(key)
        if cached is not None:
            comfy_analyzer._WRITER_CACHE.move_to_end(key)
            LOGGER.info("[H3 Studio - Prompt Director] Cache HIT | text generation skipped")
            return cached[0], cached[1] + " Cache: HIT."

    if clip is None and callable(clip_loader):
        LOGGER.info("[H3 Studio - Prompt Director] Loading writer: %s", writer_name or "selected model")
        clip = clip_loader()
    if clip is None:
        candidate = _compact_fallback_prompt(prompt, references, additional_instruction)
        note = "Prompt director: no generative writer selected; used compact deterministic fallback."
        with comfy_analyzer._CACHE_LOCK:
            comfy_analyzer._store_writer_result(key, candidate, note)
        return candidate, note

    records = "\n".join(
        f"@Image{item.ordinal}: role={item.effective_role}; retention={item.retention}; source={item.description or 'no factual description'}"
        for item in references
    )
    custom = f"\n\nEXTRA WRITER DIRECTION:\n{additional_instruction}" if additional_instruction else ""
    base = f"{WRITER_SYSTEM_INSTRUCTION}{custom}\n\nUSER REQUEST:\n{prompt}\n\nFACTUAL REFERENCE RECORDS:\n{records}"

    started = time.perf_counter()
    last_error = ""
    # Attempt two exists only for malformed JSON.  A valid model answer is never
    # discarded because it failed a hand-written aesthetic keyword checklist.
    for attempt, ceiling in enumerate((224, 160), start=1):
        repair = ""
        if attempt == 2:
            repair = (
                "\n\nYour previous response could not be parsed as the required JSON object. "
                "Return only {\"instruction\":\"...\"}; keep it concise and preserve every @Image assignment."
            )
        LOGGER.info(
            "[H3 Studio - Prompt Director] Writing brief | attempt %d/2 | text-only | deterministic | max tokens=%d",
            attempt,
            ceiling,
        )
        tokens = clip.tokenize(base + repair, images=[], thinking=False)
        generated = clip.generate(
            tokens,
            do_sample=False,
            max_length=ceiling,
            temperature=1.0,
            top_k=0,
            top_p=1.0,
            min_p=0.0,
            repetition_penalty=1.03,
            seed=41,
            presence_penalty=0.0,
        )
        decoded = clip.decode(generated, skip_special_tokens=True)
        if isinstance(decoded, (tuple, list)):
            decoded = decoded[0] if decoded else ""
        try:
            candidate = comfy_analyzer._extract_writer_instruction(str(decoded))
        except (ValueError, json.JSONDecodeError) as exc:
            last_error = str(exc)
            LOGGER.warning(
                "[H3 Studio - Prompt Director] JSON contract failed | attempt %d/2 | %s",
                attempt,
                last_error,
            )
            continue

        candidate, repaired_mentions = _repair_missing_mentions(candidate, prompt)
        failures = _hard_writer_failures(candidate, prompt)
        # Missing mentions have already been restored from the exact local user
        # clauses.  Do not spend another full autoregressive pass for that.
        failures = [item for item in failures if not item.startswith("missing reference assignment")]
        if failures:
            # A parseable instruction is still more useful than throwing away a
            # full generation.  Clamp only extreme verbosity; log the soft issue.
            LOGGER.warning("[H3 Studio - Prompt Director] Soft contract note | %s", "; ".join(failures))
            words = candidate.split()
            if len(words) > 240:
                candidate = " ".join(words[:240])

        elapsed = time.perf_counter() - started
        note = (
            f"Prompt director: {identity} produced a {len(candidate.split())}-word brief in {elapsed:.2f}s "
            f"with {attempt} generation attempt(s)."
        )
        if repaired_mentions:
            note += " Restored dropped reference mention(s) from the exact user clauses: " + ", ".join(
                f"@Image{n}" for n in repaired_mentions
            ) + "."
        with comfy_analyzer._CACHE_LOCK:
            comfy_analyzer._store_writer_result(key, candidate, note)
        LOGGER.info(
            "[H3 Studio - Prompt Director] Complete | %d words | %.2fs | attempts=%d%s",
            len(candidate.split()),
            elapsed,
            attempt,
            f" | repaired mentions={repaired_mentions}" if repaired_mentions else "",
        )
        return candidate, note

    candidate = _compact_fallback_prompt(prompt, references, additional_instruction)
    elapsed = time.perf_counter() - started
    note = (
        f"Prompt director: writer JSON remained invalid after one repair retry ({last_error}); "
        f"used a bounded {len(candidate.split())}-word deterministic fallback in {elapsed:.2f}s."
    )
    with comfy_analyzer._CACHE_LOCK:
        comfy_analyzer._store_writer_result(key, candidate, note)
    LOGGER.warning("[H3 Studio - Prompt Director] Compact fallback | %d words | %.2fs", len(candidate.split()), elapsed)
    return candidate, note


def install() -> None:
    from . import analyzer_stack
    from .prompting import comfy_analyzer

    comfy_analyzer._ANALYSIS_SCHEMA_VERSION = 4
    comfy_analyzer.SYSTEM_INSTRUCTION = SYSTEM_INSTRUCTION
    comfy_analyzer.WRITER_SYSTEM_INSTRUCTION = WRITER_SYSTEM_INSTRUCTION
    comfy_analyzer._validated_analysis_records = _validate_records
    comfy_analyzer._writer_failures = _hard_writer_failures
    comfy_analyzer._deterministic_writer_fallback = _compact_fallback_prompt
    comfy_analyzer._run_prompt_writer = _run_prompt_writer_fast

    analyzer_stack._AnalyzerBudgetProxy.generate = _compact_generate
    analyzer_stack.MiniCPMV46ClipProxy.decode = staticmethod(_minicpm_decode)
    analyzer_stack._load_native_qwen35 = _load_native_qwen35_resident
