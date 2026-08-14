import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const setup = readFileSync(new URL("../../web/h3studio_prompt_models_setup.js", import.meta.url), "utf8");
const benchmark = readFileSync(new URL("../../web/h3studio_smart_benchmark_v3.js", import.meta.url), "utf8");
const runtimeWeb = readFileSync(new URL("../../h3studio/runtime_web.py", import.meta.url), "utf8");
const promptBenchmark = readFileSync(new URL("../../h3studio/nodes/prompt_prep_benchmark.py", import.meta.url), "utf8");

test("model setup recommends one shared Qwen3.5-4B and keeps modern speed profiles", () => {
  assert.match(setup, /Qwen3\.5-4B · shared/);
  assert.match(setup, /Auto · Qwen3\.5 4B/);
  assert.match(setup, /Same as image analyzer/);
  assert.match(setup, /Fast · Qwen3\.5 2B/);
  assert.match(setup, /Fastest Vision · MiniCPM-V 4\.6/);
  assert.match(setup, /models\/h3studio_vlm/);
});

test("MiniCPM download declares both GGUF and mmproj in the deliberate VLM folder", () => {
  assert.match(setup, /MiniCPM-V-4_6-Q4_K_M\.gguf/);
  assert.match(setup, /mmproj-model-f16\.gguf/);
  assert.match(setup, /destination: "h3studio_vlm"/);
  assert.match(setup, /UAD 2\.1\.4\+/);
});

test("old automatic Qwen3-VL default migrates but explicit legacy files remain visible as legacy", () => {
  assert.match(setup, /OLD_AUTO_ANALYZER/);
  assert.match(setup, /analyzer\.value = "Auto · Qwen3\.5 4B"/);
  assert.match(setup, /Legacy · Qwen3-VL 4B \/ 8B/);
  assert.match(setup, /not broken/);
});

test("asset catalog exposes prompt-model family and MiniCPM backend status", () => {
  assert.match(runtimeWeb, /prompt_models/);
  assert.match(runtimeWeb, /prompt_profiles/);
  assert.match(runtimeWeb, /minicpm_status/);
  assert.match(runtimeWeb, /h3_conditioner/);
});

test("prompt prep benchmark measures end-to-end latency instead of only tokens per second", () => {
  assert.match(promptBenchmark, /cold_model_load_s/);
  assert.match(promptBenchmark, /warm_analyzer_s/);
  assert.match(promptBenchmark, /writer_s/);
  assert.match(promptBenchmark, /model_switch_s/);
  assert.match(promptBenchmark, /peak_vram_bytes/);
  assert.match(promptBenchmark, /peak_system_ram_bytes/);
  assert.match(promptBenchmark, /cache_hit_s/);
  assert.match(promptBenchmark, /analyzer_retries/);
  assert.match(promptBenchmark, /writer_retries/);
  assert.match(promptBenchmark, /single portrait/);
  assert.match(promptBenchmark, /text \/ OCR/);
});

test("smart benchmark no longer clips scenarios and provides understandable presets", () => {
  assert.match(benchmark, /overflow-y:auto!important/);
  assert.match(benchmark, /Current only/);
  assert.match(benchmark, /Auto vs OG/);
  assert.match(benchmark, /Runtime sweep/);
  assert.match(benchmark, /Memory sweep/);
  assert.match(benchmark, /assets unavailable · retry/);
});
