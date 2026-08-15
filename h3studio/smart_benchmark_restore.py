"""Unify the legacy benchmark controls with Smart Benchmark scenarios.

The modern scenario editor remains the single benchmark surface.  The useful
parts of the older A/B node (seed strategy, repeats, resolution sweeps,
generation guard, context header, live cell previews and optional identical-
latent VAE isolation) are global plan controls applied to those scenarios.
There are no separate Scenario/Matrix/VAE execution modes anymore.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import replace
from typing import Any

import numpy as np
import torch

from .benchmark import SEED_STRATEGIES, _seed_for_cell, parse_megapixel_list
from .context import H3StudioContext
from .nodes.benchmark import (
    COMPARISON_KINDS,
    H3StudioABComparison,
    _context_header,
    _preview_data_url,
    _send_benchmark_event,
)
from .nodes.loader import H3StudioBundle
from .nodes.runtime import H3StudioRuntimeCondition
from .nodes.smart_benchmark import (
    H3StudioSmartBenchmark,
    SmartResult,
    _grid,
    _normalize_scenarios,
    _sample,
    _scenario_bundle,
    _scenario_context,
)

LOGGER = logging.getLogger(__name__)
MAX_SCENARIOS = 4
MAX_GENERATIONS = 128
_ORIGINAL_INPUT_TYPES = H3StudioSmartBenchmark.INPUT_TYPES.__func__
_INSTALLED = False


def _input_types(cls) -> dict[str, Any]:
    base = _ORIGINAL_INPUT_TYPES(cls)
    required = dict(base.get("required", {}))
    required["max_scenarios"] = ("INT", {"default": MAX_SCENARIOS, "min": 1, "max": MAX_SCENARIOS, "step": 1})
    required["grid_cell_size"] = ("INT", {"default": 576, "min": 320, "max": 1024, "step": 64})
    # benchmark_mode/profiles are retained as hidden compatibility values so
    # workflows created during the short v14 tabbed experiment still load.
    required.update(
        {
            "benchmark_mode": (["Unified"], {"default": "Unified"}),
            "profiles": ("STRING", {"default": ""}),
            "matrix_megapixels": (
                "STRING",
                {
                    "default": "",
                    "tooltip": "Optional global MP sweep. Empty means each scenario uses its own MP value.",
                },
            ),
            "repeats": ("INT", {"default": 1, "min": 1, "max": 16, "step": 1}),
            "seed_strategy": (list(SEED_STRATEGIES), {"default": SEED_STRATEGIES[0]}),
            "seed_step": ("INT", {"default": 1, "min": 1, "max": 1_000_000, "step": 1}),
            "max_generations": ("INT", {"default": 24, "min": 1, "max": MAX_GENERATIONS, "step": 1}),
            "allow_large_matrix": ("BOOLEAN", {"default": False}),
            "include_reference_context": ("BOOLEAN", {"default": True}),
            "include_original_prompt": ("BOOLEAN", {"default": True}),
            "live_cell_previews": ("BOOLEAN", {"default": True}),
            "compare_vae": (
                "BOOLEAN",
                {
                    "default": False,
                    "tooltip": "Append the old identical-latent original-vs-image-VAE isolation test after the scenario plan.",
                },
            ),
        }
    )
    hidden = dict(base.get("hidden", {}))
    hidden["unique_id"] = "UNIQUE_ID"
    return {**base, "required": required, "hidden": hidden}


def _default_scenarios_json(context: H3StudioContext, bundle: H3StudioBundle, raw: str) -> str:
    try:
        decoded = json.loads(str(raw or "[]"))
    except Exception:
        return raw
    if decoded:
        return raw
    current_model = bundle.selected_name(context.route.selected)
    runtime = dict(context.state.ui).get("runtime_optimization", "auto")
    mp = float(context.state.generation.megapixels)
    if context.route.selected == "fl2va":
        # The useful default requested for Smart Benchmark: true Base 20 versus
        # the official full LightX v1 8-step profile, same model/runtime/seed.
        return json.dumps(
            [
                {
                    "name": "Base 20",
                    "model_name": current_model,
                    "sampling_profile": "base_quality_20",
                    "runtime_preset": runtime,
                    "megapixels": mp,
                    "custom_loras": [],
                },
                {
                    "name": "LightX 8 · full",
                    "model_name": current_model,
                    "sampling_profile": "lightx_v1_fl2v_8",
                    "runtime_preset": runtime,
                    "megapixels": mp,
                    "custom_loras": [],
                },
            ]
        )
    return raw


def _resolution_points(raw: str) -> tuple[float | None, ...]:
    text = str(raw or "").strip()
    if not text:
        return (None,)
    return tuple(parse_megapixel_list(text))


def _seed_context(context: H3StudioContext, seed: int) -> H3StudioContext:
    generation = replace(context.state.generation, seed=int(seed))
    return replace(context, state=replace(context.state, generation=generation))


def _with_context_header(grid: torch.Tensor, context: H3StudioContext, include_refs: bool, include_prompt: bool) -> torch.Tensor:
    if not include_refs and not include_prompt:
        return grid
    width = int(grid.shape[2])
    header = _context_header(context, width, bool(include_refs), bool(include_prompt))
    array = np.asarray(header, dtype=np.uint8).copy()
    tensor = torch.from_numpy(array).float().div_(255.0).unsqueeze(0)
    return torch.cat((tensor, grid), dim=1)


def _stack_vertical(first: torch.Tensor, second: torch.Tensor) -> torch.Tensor:
    width = max(int(first.shape[2]), int(second.shape[2]))
    def pad(value: torch.Tensor) -> torch.Tensor:
        missing = width - int(value.shape[2])
        if missing <= 0:
            return value
        left = missing // 2
        right = missing - left
        # NHWC tensor; pad width only.
        return torch.nn.functional.pad(value, (0, 0, left, right, 0, 0, 0, 0), value=0.035)
    return torch.cat((pad(first), pad(second)), dim=1)


def _run(
    self,
    h3_bundle,
    studio_context,
    scenarios_json: str,
    max_scenarios: int,
    grid_cell_size: int,
    benchmark_mode: str = "Unified",
    profiles: str = "",
    matrix_megapixels: str = "",
    repeats: int = 1,
    seed_strategy: str = SEED_STRATEGIES[0],
    seed_step: int = 1,
    max_generations: int = 24,
    allow_large_matrix: bool = False,
    include_reference_context: bool = True,
    include_original_prompt: bool = True,
    live_cell_previews: bool = True,
    compare_vae: bool = False,
    unique_id=None,
):
    del benchmark_mode, profiles
    if not isinstance(h3_bundle, H3StudioBundle):
        raise ValueError("Connect H3 Studio Loader's h3_bundle output.")
    if not isinstance(studio_context, H3StudioContext):
        raise ValueError("Connect H3 Studio Director's studio_context output.")

    scenarios_json = _default_scenarios_json(studio_context, h3_bundle, scenarios_json)
    scenarios = _normalize_scenarios(
        scenarios_json,
        studio_context,
        h3_bundle,
        min(MAX_SCENARIOS, max(1, int(max_scenarios))),
    )
    points = _resolution_points(matrix_megapixels)
    repeats = max(1, min(16, int(repeats)))
    seed_step = max(1, min(1_000_000, int(seed_step)))
    total = len(scenarios) * len(points) * repeats
    if total > MAX_GENERATIONS:
        raise ValueError(f"This benchmark requests {total} generations; the hard safety limit is {MAX_GENERATIONS}.")
    guard = max(1, min(MAX_GENERATIONS, int(max_generations)))
    if total > guard and not bool(allow_large_matrix):
        raise ValueError(
            f"This benchmark will run {total} generations, above your {guard}-generation guard. "
            "Reduce scenarios/resolutions/repeats or explicitly allow the larger run."
        )

    expanded: list[tuple[int, Any, H3StudioContext]] = []
    cell = 0
    for repeat_index in range(repeats):
        for point_index, point in enumerate(points):
            row = repeat_index * len(points) + point_index
            for scenario in scenarios:
                seed = _seed_for_cell(studio_context.seed, seed_strategy, seed_step, row, cell)
                effective = replace(
                    scenario,
                    index=cell,
                    megapixels=float(scenario.megapixels if point is None else point),
                    name=(
                        scenario.name
                        + (f" · {float(point):.2f} MP" if point is not None else "")
                        + (f" · r{repeat_index + 1}" if repeats > 1 else "")
                    )[:80],
                )
                seeded = _seed_context(studio_context, seed)
                expanded.append((cell, effective, _scenario_context(seeded, effective)))
                cell += 1

    started_all = time.perf_counter()
    _send_benchmark_event(
        unique_id,
        {
            "phase": "preparing",
            "finished": 0,
            "total": total,
            "remaining": total,
            "elapsed_seconds": 0.0,
            "live_previews": bool(live_cell_previews),
        },
    )

    indexed: dict[int, SmartResult] = {}
    order = sorted(range(len(expanded)), key=lambda i: (expanded[i][1].model_name.casefold(), expanded[i][1].sampling_profile, i))
    active_alt_bundle: H3StudioBundle | None = None
    active_model_name = ""
    durations: list[float] = []

    for execution_index, expanded_index in enumerate(order, start=1):
        logical_index, scenario, context = expanded[expanded_index]
        bundle = _scenario_bundle(h3_bundle, context.route.selected, scenario.model_name)
        if bundle is not h3_bundle:
            if active_alt_bundle is not None and active_model_name != scenario.model_name:
                active_alt_bundle.release_model()
            active_alt_bundle = bundle
            active_model_name = scenario.model_name
        result = SmartResult(scenario=scenario)
        cell_started = time.perf_counter()
        _send_benchmark_event(
            unique_id,
            {
                "phase": "running",
                "current": execution_index,
                "finished": execution_index - 1,
                "total": total,
                "remaining": total - execution_index + 1,
                "profile": scenario.name,
                "profile_id": scenario.sampling_profile,
                "requested_megapixels": scenario.megapixels,
                "width": context.width,
                "height": context.height,
                "seed": context.seed,
                "elapsed_seconds": time.perf_counter() - started_all,
            },
        )
        LOGGER.info(
            "\n[H3 Studio Smart Benchmark] [%d/%d] %s | seed=%d | model=%s | sampling=%s | runtime=%s | %.2f MP",
            execution_index, total, scenario.name, context.seed, scenario.model_name,
            scenario.sampling_profile, scenario.runtime_preset, scenario.megapixels,
        )
        try:
            model, _generation, conditioning, latent, vae, _frames, condition_info = H3StudioRuntimeCondition().condition(bundle, context)
            image, sampling_seconds, decode_seconds, sample_info = _sample(model, conditioning, latent, vae, context)
            result.image = image
            result.sampling_seconds = sampling_seconds
            result.total_seconds = time.perf_counter() - cell_started
            result.info = f"{condition_info} | {sample_info} | decode={decode_seconds:.3f}s | seed={context.seed}"
        except Exception as exc:
            result.total_seconds = time.perf_counter() - cell_started
            result.error = f"{type(exc).__name__}: {exc}"
            LOGGER.exception("[H3 Studio Smart Benchmark] Scenario failed · %s", scenario.name)
        indexed[logical_index] = result
        durations.append(time.perf_counter() - cell_started)
        remaining = total - execution_index
        eta = (sum(durations) / len(durations) * remaining) if remaining and len(durations) >= 2 else None
        _send_benchmark_event(
            unique_id,
            {
                "phase": "complete" if not remaining else "running",
                "current": execution_index,
                "finished": execution_index,
                "total": total,
                "remaining": remaining,
                "profile": scenario.name,
                "profile_id": scenario.sampling_profile,
                "requested_megapixels": scenario.megapixels,
                "width": context.width,
                "height": context.height,
                "seed": context.seed,
                "elapsed_seconds": time.perf_counter() - started_all,
                "eta_seconds": eta,
                "error": result.error,
                "preview": _preview_data_url(result.image) if live_cell_previews else "",
            },
        )

    if active_alt_bundle is not None:
        active_alt_bundle.release_model()
    results = [indexed[index] for index in range(total)]
    lines = [
        f"H3 Studio Smart Benchmark · {total} generations · {len(scenarios)} scenarios · "
        f"{len(points)} resolution point(s) · repeats={repeats} · seed strategy={seed_strategy} · base seed={studio_context.seed}"
    ]
    for index, result in enumerate(results):
        scenario = result.scenario
        seed = expanded[index][2].seed
        if result.error:
            lines.append(f"FAIL | {scenario.name} | seed={seed} | {result.error}")
        else:
            lines.append(
                f"OK | {scenario.name} | seed={seed} | model={scenario.model_name} | sampling={scenario.sampling_profile} | "
                f"runtime={scenario.runtime_preset} | mp={scenario.megapixels:.2f} | "
                f"sampling={result.sampling_seconds:.3f}s | total={result.total_seconds:.3f}s"
            )
    report = "\n".join(lines)
    grid = _grid(results, max(320, min(1024, int(grid_cell_size))))
    grid = _with_context_header(grid, studio_context, include_reference_context, include_original_prompt)

    if compare_vae:
        try:
            vae_grid, vae_report = H3StudioABComparison().compare(
                h3_bundle,
                studio_context,
                COMPARISON_KINDS[1],
                "Director selected profile",
                f"{studio_context.state.generation.megapixels:.2f}",
                1,
                SEED_STRATEGIES[0],
                1,
                int(grid_cell_size),
                2,
                False,
                False,
                False,
                False,
                unique_id,
            )
            grid = _stack_vertical(grid, vae_grid)
            report += "\n\n" + vae_report
        except Exception as exc:
            report += f"\n\nVAE isolation skipped: {type(exc).__name__}: {exc}"
            LOGGER.warning("H3 Studio Smart Benchmark VAE isolation skipped: %s", exc)

    LOGGER.info("\n%s", report)
    return grid, report


def install() -> None:
    global _INSTALLED
    if _INSTALLED:
        return
    _INSTALLED = True
    H3StudioSmartBenchmark.INPUT_TYPES = classmethod(_input_types)
    H3StudioSmartBenchmark.run = _run
