"""End-to-end analyzer + prompt-director benchmark for H3 Studio.

This benchmark never samples MiniMax H3. It measures only optional prompt
preparation so the 32B H3 conditioning encoder and generation path are untouched.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from dataclasses import dataclass
from typing import Any

import torch

from ..analyzer_stack import (
    AUTO_QWEN35_4B,
    AUTO_WRITER_QWEN35_4B,
    FASTEST_MINICPM_V46,
    FAST_QWEN35_2B,
    LEGACY_QWEN3VL_8B,
    SAME_AS_ANALYZER if False else None,
)
from .. import analyzer_stack
from ..context import H3StudioContext
from ..prompting import comfy_analyzer
from .loader import H3StudioBundle

LOGGER = logging.getLogger(__name__)

# Keep the literal here instead of importing nodes.loader so analyzer_stack can
# continue patching that legacy module without an import cycle.
SAME = "Same as image analyzer"

TEST_CASES = [
    "single portrait",
    "full-body character",
    "object interaction",
    "complex environment",
    "multiple reference images",
    "text / OCR",
    "style reference",
    "lighting / materials",
]


@dataclass(frozen=True, slots=True)
class Profile:
    key: str
    label: str
    analyzer_choice: str
    writer_choice: str


PROFILES = (
    Profile("A", "Qwen3.5-4B shared", AUTO_QWEN35_4B, SAME),
    Profile("B", "Qwen3.5-2B analyzer + Qwen3.5-4B writer", FAST_QWEN35_2B, AUTO_WRITER_QWEN35_4B),
    Profile("C", "MiniCPM-V 4.6 analyzer + Qwen3.5-4B writer", FASTEST_MINICPM_V46, AUTO_WRITER_QWEN35_4B),
    Profile("D", "Legacy Qwen3-VL-8B shared", LEGACY_QWEN3VL_8B, SAME),
)


def _rss_bytes() -> int:
    try:
        import psutil

        return int(psutil.Process(os.getpid()).memory_info().rss)
    except Exception:
        pass
    try:
        import resource

        value = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
        return value if os.name == "nt" else value * 1024
    except Exception:
        return 0


class _MemorySampler:
    def __init__(self):
        self.peak_rss = _rss_bytes()
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="h3studio-prompt-benchmark-memory", daemon=True)

    def _run(self):
        while not self._stop.wait(0.02):
            self.peak_rss = max(self.peak_rss, _rss_bytes())

    def __enter__(self):
        if torch.cuda.is_available():
            try:
                torch.cuda.reset_peak_memory_stats()
            except Exception:
                pass
        self._thread.start()
        return self

    def __exit__(self, *_exc):
        self._stop.set()
        self._thread.join(timeout=1.0)
        self.peak_rss = max(self.peak_rss, _rss_bytes())

    @property
    def peak_vram(self) -> int:
        if not torch.cuda.is_available():
            return 0
        try:
            return int(torch.cuda.max_memory_allocated())
        except Exception:
            return 0


def _generated_token_count(value: Any) -> int:
    if isinstance(value, str):
        return max(1, len(value.split()))
    if torch.is_tensor(value):
        return int(value.numel())
    if isinstance(value, (tuple, list)):
        if not value:
            return 0
        if all(isinstance(item, int) for item in value):
            return len(value)
        return sum(_generated_token_count(item) for item in value)
    return 0


class _CountingBackend:
    def __init__(self, raw: Any):
        self.raw = raw
        self.generate_calls = 0
        self.output_tokens = 0

    def reset(self):
        self.generate_calls = 0
        self.output_tokens = 0

    def tokenize(self, *args, **kwargs):
        return self.raw.tokenize(*args, **kwargs)

    def generate(self, *args, **kwargs):
        self.generate_calls += 1
        value = self.raw.generate(*args, **kwargs)
        self.output_tokens += _generated_token_count(value)
        return value

    def decode(self, *args, **kwargs):
        return self.raw.decode(*args, **kwargs)

    def __getattr__(self, name: str):
        return getattr(self.raw, name)


def _clear_prompt_caches() -> None:
    with comfy_analyzer._CACHE_LOCK:
        comfy_analyzer._ANALYSIS_CACHE.clear()
        comfy_analyzer._WRITER_CACHE.clear()


def _clear_analysis_cache() -> None:
    with comfy_analyzer._CACHE_LOCK:
        comfy_analyzer._ANALYSIS_CACHE.clear()


def _clear_writer_cache() -> None:
    with comfy_analyzer._CACHE_LOCK:
        comfy_analyzer._WRITER_CACHE.clear()


def _release_external() -> None:
    analyzer_stack.stop_minicpm_server()
    try:
        import comfy.model_management

        comfy.model_management.soft_empty_cache()
    except Exception:
        pass


def _profile_names(profile: Profile) -> tuple[str, str]:
    analyzer_name = analyzer_stack.resolve_analyzer(profile.analyzer_choice)
    if not analyzer_name:
        raise RuntimeError(f"{profile.label}: analyzer is unavailable.")
    writer_name = analyzer_stack.resolve_writer(profile.writer_choice, analyzer_name)
    if not writer_name:
        raise RuntimeError(f"{profile.label}: prompt writer is unavailable.")
    return analyzer_name, writer_name


def _backend_metadata(name: str) -> dict[str, Any]:
    spec = analyzer_stack.analyzer_spec(name)
    return {
        "name": name,
        "family": spec.family if spec else "unknown",
        "backend": spec.backend if spec else "unknown",
        "file": spec.model_file if spec else name,
        "quantization": (
            "Q4_K_M" if "q4_k_m" in name.lower() or "q4km" in "".join(ch for ch in name.lower() if ch.isalnum())
            else "BF16" if "bf16" in name.lower()
            else "FP8" if "fp8" in name.lower()
            else ""
        ),
    }


def _analyze(
    backend: Any,
    studio_context: H3StudioContext,
    analyzer_name: str,
) -> tuple[tuple[Any, ...], str, str]:
    return comfy_analyzer.analyze_references(
        backend,
        studio_context.state.prompt,
        studio_context.state.references,
        studio_context.images,
        analyzer_name=analyzer_name,
        max_image_edge=studio_context.state.prompt_options.analyzer_resolution,
        deep_enhancement=False,
    )


def _write(backend: Any, studio_context: H3StudioContext, references: tuple[Any, ...], writer_name: str):
    return comfy_analyzer._run_prompt_writer(
        backend,
        studio_context.state.prompt,
        references,
        writer_name=writer_name,
        additional_instruction=studio_context.state.prompt_options.system_instruction,
    )


def _benchmark_profile(profile: Profile, studio_context: H3StudioContext) -> dict[str, Any]:
    analyzer_name, writer_name = _profile_names(profile)
    shared = (
        analyzer_stack.model_family(analyzer_name) in {"qwen35", "qwen3vl"}
        and analyzer_stack._compact(analyzer_name) == analyzer_stack._compact(writer_name)
    )
    result: dict[str, Any] = {
        "profile": profile.key,
        "label": profile.label,
        "analyzer": _backend_metadata(analyzer_name),
        "writer": _backend_metadata(writer_name),
        "shared_model": shared,
    }
    _clear_prompt_caches()
    _release_external()

    with _MemorySampler() as memory:
        load_started = time.perf_counter()
        analyzer_raw = analyzer_stack.load_analysis_backend(analyzer_name)
        analyzer = _CountingBackend(analyzer_raw)
        result["cold_model_load_s"] = time.perf_counter() - load_started

        # Prime the loaded model once. This includes first-run residency/kernel
        # costs and is retained as cold analyzer latency rather than pretending it
        # is representative warm speed.
        analyzer.reset()
        cold_started = time.perf_counter()
        cold_refs, _cold_prompt, cold_note = _analyze(analyzer, studio_context, analyzer_name)
        result["cold_analyzer_s"] = time.perf_counter() - cold_started
        result["cold_analyzer_generate_calls"] = analyzer.generate_calls

        _clear_analysis_cache()
        analyzer.reset()
        warm_started = time.perf_counter()
        analyzed_refs, _prompt, analysis_note = _analyze(analyzer, studio_context, analyzer_name)
        result["warm_analyzer_s"] = time.perf_counter() - warm_started
        result["analyzer_output_tokens"] = analyzer.output_tokens
        result["analyzer_retries"] = max(0, analyzer.generate_calls - 1)
        result["analyzer_json_success"] = "malformed" not in analysis_note.lower()

        switch_started = time.perf_counter()
        if shared:
            writer_raw = getattr(analyzer_raw, "raw_clip", analyzer_raw)
        else:
            writer_raw = analyzer_stack.load_writer_backend(writer_name)
        result["model_switch_s"] = time.perf_counter() - switch_started if not shared else 0.0

        writer = _CountingBackend(writer_raw)
        _clear_writer_cache()
        writer.reset()
        writer_started = time.perf_counter()
        enhanced, writer_note = _write(writer, studio_context, analyzed_refs, writer_name)
        result["writer_s"] = time.perf_counter() - writer_started
        result["writer_output_tokens"] = writer.output_tokens
        result["writer_retries"] = max(0, writer.generate_calls - 1)
        result["writer_json_success"] = "fallback" not in writer_note.lower()
        result["enhanced_prompt_words"] = len(str(enhanced).split())
        result["total_prompt_prep_s"] = result["warm_analyzer_s"] + result["model_switch_s"] + result["writer_s"]
        result["cold_total_prompt_prep_s"] = (
            result["cold_model_load_s"] + result["cold_analyzer_s"] + result["model_switch_s"] + result["writer_s"]
        )

        # Real cache-hit latency: both factual descriptions and writer result are
        # hot and the exact same connected Director input is used.
        cache_started = time.perf_counter()
        comfy_analyzer.analyze_references(
            analyzer,
            studio_context.state.prompt,
            studio_context.state.references,
            studio_context.images,
            analyzer_name=analyzer_name,
            max_image_edge=studio_context.state.prompt_options.analyzer_resolution,
            deep_enhancement=True,
            writer_clip=writer,
            writer_name=writer_name,
        )
        result["cache_hit_s"] = time.perf_counter() - cache_started
        result["peak_vram_bytes"] = memory.peak_vram
        result["peak_system_ram_bytes"] = memory.peak_rss
        result["analysis_note"] = analysis_note
        result["writer_note"] = writer_note
        result["cold_analysis_note"] = cold_note
        result["reference_count"] = len(cold_refs)

    del analyzer, analyzer_raw, writer, writer_raw
    _release_external()
    return result


def _format_seconds(value: Any) -> str:
    try:
        return f"{float(value):.3f}s"
    except Exception:
        return "n/a"


def _human_bytes(value: int) -> str:
    size = float(value or 0)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024 or unit == "TB":
            return f"{size:.2f} {unit}" if unit in {"GB", "TB"} else f"{size:.1f} {unit}"
        size /= 1024
    return "n/a"


class H3StudioPromptPrepBenchmark:
    CATEGORY = "H3 Studio/Benchmark"
    FUNCTION = "run"
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("benchmark_report", "benchmark_json")
    DESCRIPTION = (
        "Benchmarks analyzer + prompt-director configurations A-D without sampling MiniMax H3. "
        "Use representative Director inputs and label the qualitative test case; compare cold load, warm vision, writer, model switch, cache, retries and memory."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "h3_bundle": ("H3_STUDIO_BUNDLE",),
                "studio_context": ("H3_STUDIO_CONTEXT",),
                "test_case": (TEST_CASES, {"default": TEST_CASES[0]}),
                "profiles": (["A+B+C+D", "A only", "A+B", "A+B+C", "D only"], {"default": "A+B+C+D"}),
            }
        }

    def run(self, h3_bundle, studio_context, test_case: str, profiles: str):
        if not isinstance(h3_bundle, H3StudioBundle):
            raise ValueError("Connect H3 Studio Loader's h3_bundle output.")
        if not isinstance(studio_context, H3StudioContext):
            raise ValueError("Connect H3 Studio Director's studio_context output.")
        if not studio_context.images or not studio_context.state.references:
            raise ValueError("Prompt Prep Benchmark needs at least one reference image so analyzer latency is measurable.")

        keys = {
            "A only": {"A"},
            "A+B": {"A", "B"},
            "A+B+C": {"A", "B", "C"},
            "D only": {"D"},
        }.get(str(profiles), {"A", "B", "C", "D"})
        records = []
        LOGGER.info("\n[H3 Studio Prompt Prep Benchmark] case=%s | profiles=%s", test_case, ",".join(sorted(keys)))
        for profile in PROFILES:
            if profile.key not in keys:
                continue
            LOGGER.info("[H3 Studio Prompt Prep Benchmark] %s · %s", profile.key, profile.label)
            try:
                record = _benchmark_profile(profile, studio_context)
                record["ok"] = True
            except Exception as exc:
                LOGGER.exception("[H3 Studio Prompt Prep Benchmark] %s failed", profile.key)
                record = {"profile": profile.key, "label": profile.label, "ok": False, "error": f"{type(exc).__name__}: {exc}"}
            record["test_case"] = str(test_case)
            record["analyzer_resolution"] = int(studio_context.state.prompt_options.analyzer_resolution)
            records.append(record)

        successful = [item for item in records if item.get("ok")]
        fastest = min(successful, key=lambda item: item["total_prompt_prep_s"])["profile"] if successful else "none"
        payload = {
            "schema": "H3PB1",
            "test_case": str(test_case),
            "reference_count": len(studio_context.images),
            "fastest_warm_end_to_end": fastest,
            "records": records,
        }
        lines = [
            f"H3 Studio Prompt Prep Benchmark · {test_case} · refs={len(studio_context.images)}",
            "Metrics are prompt preparation only; MiniMax H3 sampling/32B conditioning is untouched.",
        ]
        for item in records:
            if not item.get("ok"):
                lines.append(f"{item['profile']} FAIL · {item['label']} · {item['error']}")
                continue
            lines.append(
                f"{item['profile']} · {item['label']} · warm total={_format_seconds(item['total_prompt_prep_s'])} · "
                f"vision={_format_seconds(item['warm_analyzer_s'])} · writer={_format_seconds(item['writer_s'])} · "
                f"switch={_format_seconds(item['model_switch_s'])} · cold load={_format_seconds(item['cold_model_load_s'])} · "
                f"cache={_format_seconds(item['cache_hit_s'])} · VRAM peak={_human_bytes(item['peak_vram_bytes'])} · "
                f"RAM peak={_human_bytes(item['peak_system_ram_bytes'])} · analyzer retries={item['analyzer_retries']} · "
                f"writer retries={item['writer_retries']}"
            )
        lines.append(f"Fastest warm end-to-end in this run: {fastest}")
        report = "\n".join(lines)
        LOGGER.info("\n%s", report)
        return report, json.dumps(payload, ensure_ascii=False, indent=2)


NODE_CLASS_MAPPINGS = {"H3StudioPromptPrepBenchmark": H3StudioPromptPrepBenchmark}
NODE_DISPLAY_NAME_MAPPINGS = {"H3StudioPromptPrepBenchmark": "H3 Studio · Prompt Prep Benchmark"}
