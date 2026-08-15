"""Restore the full legacy A/B benchmark surface inside Smart Benchmark.

The scenario lab is useful for comparing arbitrary model/runtime/LoRA setups,
but the older benchmark node also had a rigorous matrix workflow: seed strategy,
repeats, resolution sweeps, generation guards, context rendering, live previews
and same-latent VAE A/B.  Keep both instead of making users choose one design.
"""

from __future__ import annotations

from typing import Any

from .benchmark import SEED_STRATEGIES
from .nodes.benchmark import COMPARISON_KINDS, H3StudioABComparison
from .nodes.smart_benchmark import H3StudioSmartBenchmark

SCENARIO_MODE = "Scenario lab"
MATRIX_MODE = "Matrix A/B"
VAE_MODE = "VAE decode A/B"
BENCHMARK_MODES = (SCENARIO_MODE, MATRIX_MODE, VAE_MODE)

_ORIGINAL_INPUT_TYPES = H3StudioSmartBenchmark.INPUT_TYPES.__func__
_ORIGINAL_RUN = H3StudioSmartBenchmark.run
_INSTALLED = False


def _input_types(cls) -> dict[str, Any]:
    base = _ORIGINAL_INPUT_TYPES(cls)
    required = dict(base.get("required", {}))
    required.update(
        {
            "benchmark_mode": (
                list(BENCHMARK_MODES),
                {
                    "default": SCENARIO_MODE,
                    "tooltip": "Scenario lab compares arbitrary setups. Matrix A/B restores the full same-seed profile/resolution benchmark. VAE A/B decodes one identical sampled latent with both H3 decoders.",
                },
            ),
            "profiles": (
                "STRING",
                {
                    "default": "Director selected profile, base_quality_20",
                    "tooltip": "Matrix mode: comma/newline-separated profile IDs or labels.",
                },
            ),
            "matrix_megapixels": (
                "STRING",
                {
                    "default": "0.40, 1.00, 2.00",
                    "tooltip": "Matrix mode: comma/newline-separated direct resolutions from 0.20 to 8.50 MP.",
                },
            ),
            "repeats": ("INT", {"default": 1, "min": 1, "max": 16, "step": 1}),
            "seed_strategy": (
                list(SEED_STRATEGIES),
                {
                    "default": SEED_STRATEGIES[0],
                    "tooltip": "Same seed is the fairest A/B; row/image strategies are useful for robustness and diversity sweeps.",
                },
            ),
            "seed_step": ("INT", {"default": 1, "min": 1, "max": 1000000, "step": 1}),
            "max_generations": ("INT", {"default": 24, "min": 1, "max": 128, "step": 1}),
            "allow_large_matrix": ("BOOLEAN", {"default": False}),
            "include_reference_context": ("BOOLEAN", {"default": True}),
            "include_original_prompt": ("BOOLEAN", {"default": True}),
            "live_cell_previews": ("BOOLEAN", {"default": True}),
        }
    )
    hidden = dict(base.get("hidden", {}))
    hidden["unique_id"] = "UNIQUE_ID"
    return {**base, "required": required, "hidden": hidden}


def _run(
    self,
    h3_bundle,
    studio_context,
    scenarios_json: str,
    max_scenarios: int,
    grid_cell_size: int,
    benchmark_mode: str = SCENARIO_MODE,
    profiles: str = "Director selected profile, base_quality_20",
    matrix_megapixels: str = "0.40, 1.00, 2.00",
    repeats: int = 1,
    seed_strategy: str = SEED_STRATEGIES[0],
    seed_step: int = 1,
    max_generations: int = 24,
    allow_large_matrix: bool = False,
    include_reference_context: bool = True,
    include_original_prompt: bool = True,
    live_cell_previews: bool = True,
    unique_id=None,
):
    mode = str(benchmark_mode or SCENARIO_MODE)
    if mode == SCENARIO_MODE:
        return _ORIGINAL_RUN(self, h3_bundle, studio_context, scenarios_json, max_scenarios, grid_cell_size)

    comparison_kind = COMPARISON_KINDS[1] if mode == VAE_MODE else COMPARISON_KINDS[0]
    return H3StudioABComparison().compare(
        h3_bundle,
        studio_context,
        comparison_kind,
        profiles,
        matrix_megapixels,
        int(repeats),
        seed_strategy,
        int(seed_step),
        int(grid_cell_size),
        int(max_generations),
        bool(allow_large_matrix),
        bool(include_reference_context),
        bool(include_original_prompt),
        bool(live_cell_previews),
        unique_id,
    )


def install() -> None:
    global _INSTALLED
    if _INSTALLED:
        return
    _INSTALLED = True
    H3StudioSmartBenchmark.INPUT_TYPES = classmethod(_input_types)
    H3StudioSmartBenchmark.run = _run
