"""End-to-end benchmark for H3 Studio's optional analyzer + prompt writer."""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from dataclasses import dataclass
from typing import Any

import torch

from .. import analyzer_stack
from ..analyzer_stack import (
    AUTO_QWEN35_4B,
    AUTO_WRITER_QWEN35_4B,
    FASTEST_MINICPM_V46,
    FAST_QWEN35_2B,
    LEGACY_QWEN3VL_8B,
)
from ..context import H3StudioContext
from ..prompting import comfy_analyzer
from .loader import H3StudioBundle

LOGGER = logging.getLogger(__name__)
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
    analyzer: str
    writer: str


PROFILES = (
    Profile("A", "Qwen3.5-4B shared", AUTO_QWEN35_4B, SAME),
    Profile("B", "Qwen3.5-2B analyzer + Qwen3.5-4B writer", FAST_QWEN35_2B, AUTO_WRITER_QWEN35_4B),
    Profile("C", "MiniCPM-V 4.6 analyzer + Qwen3.5-4B writer", FASTEST_MINICPM_V46, AUTO_WRITER_QWEN35_4B),
    Profile("D", "Legacy Qwen3-VL-8B shared", LEGACY_QWEN3VL_8B, SAME),
)


def _rss() -> int:
    try:
        import psutil

        return int(psutil.Process(os.getpid()).memory_info().rss)
    except Exception:
        try:
            import resource

            value = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
            return value if os.name == "nt" else value * 1024
        except Exception:
            return 0


class _PeakMemory:
    def __init__(self):
        self.rss = _rss()
        self.stop = threading.Event()
        self.thread = threading.Thread(target=self._poll, daemon=True)

    def _poll(self):
        while not self.stop.wait(0.02):
            self.rss = max(self.rss, _rss())

    def __enter__(self):
        if torch.cuda.is_available():
            try:
                torch.cuda.reset_peak_memory_stats()
            except Exception:
                pass
        self.thread.start()
        return self

    def __exit__(self, *_args):
        self.stop.set()
        self.thread.join(timeout=1)
        self.rss = max(self.rss, _rss())

    def vram(self) -> int:
        if not torch.cuda.is_available():
            return 0
        try:
            return int(torch.cuda.max_memory_allocated())
        except Exception:
            return 0


def _token_count(value: Any) -> int:
    if isinstance(value, str):
        return len(value.split())
    if torch.is_tensor(value):
        return int(value.numel())
    if isinstance(value, (tuple, list)):
        if value and all(isinstance(item, int) for item in value):
            return len(value)
        return sum(_token_count(item) for item in value)
    return 0


class _Counter:
    def __init__(self, raw: Any):
        self.raw = raw
        self.calls = 0
        self.tokens = 0

    def reset(self):
        self.calls = self.tokens = 0

    def tokenize(self, *args, **kwargs):
        return self.raw.tokenize(*args, **kwargs)

    def generate(self, *args, **kwargs):
        self.calls += 1
        value = self.raw.generate(*args, **kwargs)
        self.tokens += _token_count(value)
        return value

    def decode(self, *args, **kwargs):
        return self.raw.decode(*args, **kwargs)

    def __getattr__(self, name):
        return getattr(self.raw, name)


def _clear(which: str = "all"):
    with comfy_analyzer._CACHE_LOCK:
        if which in {"all", "analysis"}:
            comfy_analyzer._ANALYSIS_CACHE.clear()
        if which in {"all", "writer"}:
            comfy_analyzer._WRITER_CACHE.clear()


def _release():
    analyzer_stack.stop_minicpm_server()
    try:
        import comfy.model_management

        comfy.model_management.soft_empty_cache()
    except Exception:
        pass


def _metadata(name: str) -> dict[str, Any]:
    spec = analyzer_stack.analyzer_spec(name)
    compact = "".join(ch for ch in name.lower() if ch.isalnum())
    quant = "Q4_K_M" if "q4km" in compact else "BF16" if "bf16" in compact else "FP8" if "fp8" in compact else ""
    return {
        "name": name,
        "family": spec.family if spec else "unknown",
        "backend": spec.backend if spec else "unknown",
        "file": spec.model_file if spec else name,
        "quantization": quant,
    }


def _analyze(backend: Any, context: H3StudioContext, name: str):
    return comfy_analyzer.analyze_references(
        backend,
        context.state.prompt,
        context.state.references,
        context.images,
        analyzer_name=name,
        max_image_edge=context.state.prompt_options.analyzer_resolution,
        deep_enhancement=False,
    )


def _write(backend: Any, context: H3StudioContext, references, name: str):
    return comfy_analyzer._run_prompt_writer(
        backend,
        context.state.prompt,
        references,
        writer_name=name,
        additional_instruction=context.state.prompt_options.system_instruction,
    )


def _one(profile: Profile, context: H3StudioContext) -> dict[str, Any]:
    analyzer_name = analyzer_stack.resolve_analyzer(profile.analyzer)
    if not analyzer_name:
        raise RuntimeError("analyzer unavailable")
    writer_name = analyzer_stack.resolve_writer(profile.writer, analyzer_name)
    if not writer_name:
        raise RuntimeError("writer unavailable")
    shared = (
        analyzer_stack.model_family(analyzer_name) in {"qwen35", "qwen3vl"}
        and analyzer_stack._compact(analyzer_name) == analyzer_stack._compact(writer_name)
    )
    out: dict[str, Any] = {
        "profile": profile.key,
        "label": profile.label,
        "analyzer": _metadata(analyzer_name),
        "writer": _metadata(writer_name),
        "shared_model": shared,
    }
    _clear()
    _release()
    with _PeakMemory() as memory:
        started = time.perf_counter()
        analyzer_raw = analyzer_stack.load_analysis_backend(analyzer_name)
        analyzer = _Counter(analyzer_raw)
        out["cold_model_load_s"] = time.perf_counter() - started

        analyzer.reset()
        started = time.perf_counter()
        _cold_refs, _cold_prompt, _cold_note = _analyze(analyzer, context, analyzer_name)
        out["cold_analyzer_s"] = time.perf_counter() - started

        _clear("analysis")
        analyzer.reset()
        started = time.perf_counter()
        refs, _prompt, analysis_note = _analyze(analyzer, context, analyzer_name)
        out["warm_analyzer_s"] = time.perf_counter() - started
        out["analyzer_output_tokens"] = analyzer.tokens
        out["analyzer_retries"] = max(0, analyzer.calls - 1)
        out["analyzer_json_success"] = "malformed" not in analysis_note.lower()

        started = time.perf_counter()
        writer_raw = getattr(analyzer_raw, "raw_clip", analyzer_raw) if shared else analyzer_stack.load_writer_backend(writer_name)
        out["model_switch_s"] = 0.0 if shared else time.perf_counter() - started
        writer = _Counter(writer_raw)

        _clear("writer")
        writer.reset()
        started = time.perf_counter()
        enhanced, writer_note = _write(writer, context, refs, writer_name)
        out["writer_s"] = time.perf_counter() - started
        out["writer_output_tokens"] = writer.tokens
        out["writer_retries"] = max(0, writer.calls - 1)
        out["writer_json_success"] = "fallback" not in writer_note.lower()
        out["enhanced_prompt_words"] = len(str(enhanced).split())
        out["total_prompt_prep_s"] = out["warm_analyzer_s"] + out["model_switch_s"] + out["writer_s"]
        out["cold_total_prompt_prep_s"] = out["cold_model_load_s"] + out["cold_analyzer_s"] + out["model_switch_s"] + out["writer_s"]

        started = time.perf_counter()
        comfy_analyzer.analyze_references(
            analyzer,
            context.state.prompt,
            context.state.references,
            context.images,
            analyzer_name=analyzer_name,
            max_image_edge=context.state.prompt_options.analyzer_resolution,
            deep_enhancement=True,
            writer_clip=writer,
            writer_name=writer_name,
        )
        out["cache_hit_s"] = time.perf_counter() - started
        out["peak_vram_bytes"] = memory.vram()
        out["peak_system_ram_bytes"] = memory.rss
        out["analysis_note"] = analysis_note
        out["writer_note"] = writer_note

    del analyzer, analyzer_raw, writer, writer_raw
    _release()
    return out


def _seconds(value: Any) -> str:
    return f"{float(value):.3f}s"


def _bytes(value: int) -> str:
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
        "Benchmarks only H3 Studio prompt preparation: cold model load, warm analyzer, prompt writer, model switching, "
        "cache hit, retries, output tokens and peak memory. MiniMax H3 generation is not sampled or modified."
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
            raise ValueError("Prompt Prep Benchmark needs at least one reference image.")

        keys = {
            "A only": {"A"},
            "A+B": {"A", "B"},
            "A+B+C": {"A", "B", "C"},
            "D only": {"D"},
        }.get(str(profiles), {"A", "B", "C", "D"})
        records = []
        for profile in PROFILES:
            if profile.key not in keys:
                continue
            LOGGER.info("[H3 Studio Prompt Prep Benchmark] %s · %s", profile.key, profile.label)
            try:
                record = _one(profile, studio_context)
                record["ok"] = True
            except Exception as exc:
                LOGGER.exception("[H3 Studio Prompt Prep Benchmark] %s failed", profile.key)
                record = {"profile": profile.key, "label": profile.label, "ok": False, "error": f"{type(exc).__name__}: {exc}"}
            record["test_case"] = str(test_case)
            record["analyzer_resolution"] = int(studio_context.state.prompt_options.analyzer_resolution)
            records.append(record)

        good = [record for record in records if record.get("ok")]
        fastest = min(good, key=lambda record: record["total_prompt_prep_s"])["profile"] if good else "none"
        payload = {
            "schema": "H3PB1",
            "test_case": str(test_case),
            "reference_count": len(studio_context.images),
            "fastest_warm_end_to_end": fastest,
            "records": records,
        }
        lines = [
            f"H3 Studio Prompt Prep Benchmark · {test_case} · refs={len(studio_context.images)}",
            "Prompt preparation only; H3 32B conditioning and sampling are untouched.",
        ]
        for record in records:
            if not record.get("ok"):
                lines.append(f"{record['profile']} FAIL · {record['label']} · {record['error']}")
                continue
            lines.append(
                f"{record['profile']} · {record['label']} · warm total={_seconds(record['total_prompt_prep_s'])} · "
                f"vision={_seconds(record['warm_analyzer_s'])} · writer={_seconds(record['writer_s'])} · "
                f"switch={_seconds(record['model_switch_s'])} · cold load={_seconds(record['cold_model_load_s'])} · "
                f"cache={_seconds(record['cache_hit_s'])} · VRAM={_bytes(record['peak_vram_bytes'])} · "
                f"RAM={_bytes(record['peak_system_ram_bytes'])} · retries={record['analyzer_retries']}/{record['writer_retries']}"
            )
        lines.append(f"Fastest warm end-to-end in this run: {fastest}")
        report = "\n".join(lines)
        LOGGER.info("\n%s", report)
        return report, json.dumps(payload, ensure_ascii=False, indent=2)


NODE_CLASS_MAPPINGS = {"H3StudioPromptPrepBenchmark": H3StudioPromptPrepBenchmark}
NODE_DISPLAY_NAME_MAPPINGS = {"H3StudioPromptPrepBenchmark": "H3 Studio · Prompt Prep Benchmark"}
