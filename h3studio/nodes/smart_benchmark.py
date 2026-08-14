"""Scenario-driven benchmark lab for H3 Studio models, LoRAs and runtime presets."""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, replace
from textwrap import shorten
from typing import Any

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont, ImageOps

from ..constants import MAX_MEGAPIXELS, MIN_MEGAPIXELS, SAMPLING_PROFILES
from ..context import H3StudioContext
from .loader import H3StudioBundle
from .runtime import H3StudioRuntimeCondition, H3StudioRuntimeSamplingPreset

LOGGER = logging.getLogger(__name__)


@dataclass(slots=True)
class SmartScenario:
    index: int
    name: str
    model_name: str
    sampling_profile: str
    runtime_preset: str
    megapixels: float
    custom_loras: list[dict[str, Any]]
    runtime_advanced: dict[str, Any]


@dataclass(slots=True)
class SmartResult:
    scenario: SmartScenario
    image: torch.Tensor | None = None
    sampling_seconds: float | None = None
    total_seconds: float | None = None
    info: str = ""
    error: str = ""


def _outputs(value: Any) -> tuple[Any, ...]:
    if hasattr(value, "args"):
        return tuple(value.args)
    if isinstance(value, dict) and "result" in value:
        result = value["result"]
        return tuple(result) if isinstance(result, (tuple, list)) else (result,)
    if isinstance(value, (tuple, list)):
        return tuple(value)
    return (value,)


def _sync() -> None:
    if torch.cuda.is_available():
        torch.cuda.synchronize()


def _sample(model, conditioning, latent, vae, context: H3StudioContext):
    from comfy_extras.nodes_custom_sampler import BasicGuider, RandomNoise, SamplerCustomAdvanced
    from .benchmark import _decode_single

    shifted_model, sampler, sigmas, sampling_info = H3StudioRuntimeSamplingPreset().build(model, context)
    guider = _outputs(BasicGuider.get_guider(shifted_model, conditioning))[0]
    noise = _outputs(RandomNoise.get_noise(context.seed))[0]
    _sync()
    started = time.perf_counter()
    sampled = _outputs(SamplerCustomAdvanced.sample(noise, guider, sampler, sigmas, latent))[0]
    _sync()
    sampling_seconds = time.perf_counter() - started
    image, decode_info, decode_seconds = _decode_single(sampled, vae)
    del sampled
    return image, sampling_seconds, decode_seconds, f"{sampling_info} | {decode_info}"


def _scenario_context(context: H3StudioContext, scenario: SmartScenario) -> H3StudioContext:
    generation = replace(
        context.state.generation,
        megapixels=scenario.megapixels,
        sampling_profile=scenario.sampling_profile,
        seed=context.seed,
    )
    ui = {
        **dict(context.state.ui),
        "runtime_optimization": scenario.runtime_preset,
        "runtime_advanced": scenario.runtime_advanced,
        "custom_loras": scenario.custom_loras,
        "director_node_id": "",
    }
    state = replace(context.state, generation=generation, ui=ui)
    resolution = generation.resolution()
    return replace(context, state=state, resolution=resolution)


def _normalize_scenarios(raw: str, context: H3StudioContext, bundle: H3StudioBundle, max_scenarios: int) -> list[SmartScenario]:
    try:
        decoded = json.loads(str(raw or "[]"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Benchmark scenarios are not valid JSON: {exc}") from exc
    if not isinstance(decoded, list):
        raise ValueError("Benchmark scenarios must be a JSON array.")
    if not decoded:
        decoded = [{
            "name": "Current Director setup",
            "model_name": bundle.selected_name(context.route.selected),
            "sampling_profile": context.state.generation.sampling_profile,
            "runtime_preset": dict(context.state.ui).get("runtime_optimization", "auto"),
            "megapixels": context.state.generation.megapixels,
            "custom_loras": dict(context.state.ui).get("custom_loras", []),
        }]
    if len(decoded) > max_scenarios:
        raise ValueError(f"Benchmark has {len(decoded)} scenarios but max_scenarios is {max_scenarios}.")

    current_model = bundle.selected_name(context.route.selected)
    scenarios: list[SmartScenario] = []
    for index, item in enumerate(decoded):
        if not isinstance(item, dict):
            continue
        profile = str(item.get("sampling_profile") or context.state.generation.sampling_profile)
        if profile not in SAMPLING_PROFILES:
            raise ValueError(f"Scenario {index + 1}: unknown Sampling Profile {profile!r}.")
        profile_route = SAMPLING_PROFILES[profile].get("route")
        if profile_route and profile_route != context.route.selected:
            raise ValueError(
                f"Scenario {index + 1}: {profile} requires {str(profile_route).upper()}, but the connected Director context is {context.route.selected.upper()}."
            )
        try:
            megapixels = float(item.get("megapixels", context.state.generation.megapixels))
        except (TypeError, ValueError):
            megapixels = float(context.state.generation.megapixels)
        megapixels = max(MIN_MEGAPIXELS, min(MAX_MEGAPIXELS, megapixels))
        loras = item.get("custom_loras") if isinstance(item.get("custom_loras"), list) else []
        normalized_loras = []
        for lora in loras[:12]:
            if not isinstance(lora, dict) or not str(lora.get("name") or "").strip():
                continue
            normalized_loras.append({
                "name": str(lora["name"]).replace("\\", "/").strip(),
                "strength": float(lora.get("strength", 1.0)),
                "enabled": lora.get("enabled") is not False,
            })
        scenarios.append(SmartScenario(
            index=index,
            name=str(item.get("name") or f"Scenario {index + 1}")[:80],
            model_name=str(item.get("model_name") or current_model).replace("\\", "/").strip(),
            sampling_profile=profile,
            runtime_preset=str(item.get("runtime_preset") or "auto"),
            megapixels=megapixels,
            custom_loras=normalized_loras,
            runtime_advanced=item.get("runtime_advanced") if isinstance(item.get("runtime_advanced"), dict) else {},
        ))
    if not scenarios:
        raise ValueError("Benchmark contains no valid scenarios.")
    return scenarios


def _scenario_bundle(base: H3StudioBundle, route: str, model_name: str) -> H3StudioBundle:
    if model_name == base.selected_name(route):
        return base
    if route == "ref2va":
        return replace(base, ref2va_name=model_name)
    return replace(base, fl2va_name=model_name)


def _font(size: int, bold: bool = False):
    try:
        return ImageFont.truetype("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", size=size)
    except OSError:
        return ImageFont.load_default()


def _pil(image: torch.Tensor | None, size: int, error: str = "") -> Image.Image:
    canvas = Image.new("RGB", (size, size), "#0b0f14")
    if image is None:
        draw = ImageDraw.Draw(canvas)
        draw.multiline_text((18, 18), shorten(error or "No output", width=150, placeholder="…"), fill="#fca5a5", font=_font(15, True), spacing=5)
        return canvas
    array = (image[0].detach().cpu().float().clamp(0, 1).numpy() * 255.0).round().astype(np.uint8)
    source = Image.fromarray(array)
    fitted = ImageOps.contain(source, (size, size), Image.Resampling.LANCZOS)
    canvas.paste(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
    return canvas


def _grid(results: list[SmartResult], cell_size: int) -> torch.Tensor:
    gap = 10
    label_h = 112
    columns = min(3, max(1, len(results)))
    rows = (len(results) + columns - 1) // columns
    width = columns * cell_size + (columns + 1) * gap
    height = 58 + rows * (cell_size + label_h + gap) + gap
    grid = Image.new("RGB", (width, height), "#080b10")
    draw = ImageDraw.Draw(grid)
    draw.text((gap, 14), f"H3 Studio Smart Benchmark · {len(results)} scenario{'s' if len(results) != 1 else ''}", fill="#e5e7eb", font=_font(22, True))
    for index, result in enumerate(results):
        row, column = divmod(index, columns)
        x = gap + column * (cell_size + gap)
        y = 58 + gap + row * (cell_size + label_h + gap)
        grid.paste(_pil(result.image, cell_size, result.error), (x, y))
        ly = y + cell_size
        draw.rectangle((x, ly, x + cell_size, ly + label_h), fill="#171c24")
        scenario = result.scenario
        total = "failed" if result.total_seconds is None else f"{result.total_seconds:.2f}s total"
        sample = "" if result.sampling_seconds is None else f" · {result.sampling_seconds:.2f}s sample"
        lines = [
            scenario.name,
            f"{scenario.megapixels:.2f} MP · {scenario.sampling_profile}",
            f"runtime {scenario.runtime_preset} · {total}{sample}",
            shorten(scenario.model_name.split("/")[-1], width=58, placeholder="…"),
        ]
        draw.text((x + 9, ly + 7), lines[0], fill="#f3f4f6", font=_font(15, True))
        draw.text((x + 9, ly + 33), lines[1], fill="#67e8d0", font=_font(13))
        draw.text((x + 9, ly + 55), lines[2], fill="#cbd5e1", font=_font(12))
        draw.text((x + 9, ly + 78), lines[3], fill="#94a3b8", font=_font(11))
    array = np.asarray(grid, dtype=np.uint8).copy()
    return torch.from_numpy(array).float().div_(255.0).unsqueeze(0)


class H3StudioSmartBenchmark:
    CATEGORY = "H3 Studio/Benchmark"
    FUNCTION = "run"
    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("comparison_grid", "benchmark_report")
    DESCRIPTION = (
        "Build named H3 benchmark scenarios with installed-model and LoRA pickers in the frontend. "
        "Each scenario can vary transformer, Sampling Profile, runtime preset, resolution and ordered custom LoRAs."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "h3_bundle": ("H3_STUDIO_BUNDLE",),
                "studio_context": ("H3_STUDIO_CONTEXT",),
                "scenarios_json": ("STRING", {"default": "[]", "multiline": True}),
                "max_scenarios": ("INT", {"default": 12, "min": 1, "max": 24, "step": 1}),
                "grid_cell_size": ("INT", {"default": 576, "min": 320, "max": 896, "step": 64}),
            }
        }

    def run(self, h3_bundle, studio_context, scenarios_json: str, max_scenarios: int, grid_cell_size: int):
        if not isinstance(h3_bundle, H3StudioBundle):
            raise ValueError("Connect H3 Studio Loader's h3_bundle output.")
        if not isinstance(studio_context, H3StudioContext):
            raise ValueError("Connect H3 Studio Director's studio_context output.")

        scenarios = _normalize_scenarios(scenarios_json, studio_context, h3_bundle, int(max_scenarios))
        LOGGER.info("\n[H3 Studio Smart Benchmark] %d scenario(s) · same Director seed=%d", len(scenarios), studio_context.seed)
        indexed: dict[int, SmartResult] = {}
        order = sorted(range(len(scenarios)), key=lambda idx: (scenarios[idx].model_name.casefold(), scenarios[idx].index))
        active_alt_bundle: H3StudioBundle | None = None
        active_model_name = ""

        for execution_index, scenario_index in enumerate(order, start=1):
            scenario = scenarios[scenario_index]
            context = _scenario_context(studio_context, scenario)
            bundle = _scenario_bundle(h3_bundle, context.route.selected, scenario.model_name)
            if bundle is not h3_bundle:
                if active_alt_bundle is not None and active_model_name != scenario.model_name:
                    active_alt_bundle.release_model()
                active_alt_bundle = bundle
                active_model_name = scenario.model_name
            result = SmartResult(scenario=scenario)
            started = time.perf_counter()
            LOGGER.info(
                "\n[H3 Studio Smart Benchmark] [%d/%d] %s | model=%s | sampling=%s | runtime=%s | %.2f MP | LoRAs=%s",
                execution_index,
                len(scenarios),
                scenario.name,
                scenario.model_name,
                scenario.sampling_profile,
                scenario.runtime_preset,
                scenario.megapixels,
                ", ".join(f"{item['name']}@{item['strength']:g}" for item in scenario.custom_loras if item.get("enabled")) or "none",
            )
            try:
                model, _generation, conditioning, latent, vae, _frames, condition_info = H3StudioRuntimeCondition().condition(bundle, context)
                image, sampling_seconds, decode_seconds, sample_info = _sample(model, conditioning, latent, vae, context)
                result.image = image
                result.sampling_seconds = sampling_seconds
                result.total_seconds = time.perf_counter() - started
                result.info = f"{condition_info} | {sample_info} | decode={decode_seconds:.3f}s"
                LOGGER.info("[H3 Studio Smart Benchmark] Complete · %s · %.2fs total", scenario.name, result.total_seconds)
            except Exception as exc:
                result.total_seconds = time.perf_counter() - started
                result.error = f"{type(exc).__name__}: {exc}"
                LOGGER.exception("[H3 Studio Smart Benchmark] Scenario failed · %s", scenario.name)
            indexed[scenario_index] = result

        if active_alt_bundle is not None:
            active_alt_bundle.release_model()
        results = [indexed[index] for index in range(len(scenarios))]
        lines = [f"H3 Studio Smart Benchmark · seed={studio_context.seed} · {len(results)} scenarios"]
        for result in results:
            scenario = result.scenario
            loras = ", ".join(f"{item['name']}@{item['strength']:g}" for item in scenario.custom_loras if item.get("enabled")) or "none"
            if result.error:
                lines.append(f"FAIL | {scenario.name} | {result.error}")
            else:
                lines.append(
                    f"OK | {scenario.name} | model={scenario.model_name} | sampling={scenario.sampling_profile} | "
                    f"runtime={scenario.runtime_preset} | mp={scenario.megapixels:.2f} | loras={loras} | "
                    f"sampling={result.sampling_seconds:.3f}s | total={result.total_seconds:.3f}s"
                )
        report = "\n".join(lines)
        LOGGER.info("\n%s", report)
        return _grid(results, max(320, min(896, int(grid_cell_size)))), report


NODE_CLASS_MAPPINGS = {"H3StudioSmartBenchmark": H3StudioSmartBenchmark}
NODE_DISPLAY_NAME_MAPPINGS = {"H3StudioSmartBenchmark": "H3 Studio · Smart Benchmark Lab"}
