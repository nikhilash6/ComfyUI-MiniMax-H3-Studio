import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtime = readFileSync(new URL("../../web/h3studio_runtime.js", import.meta.url), "utf8");
const share = readFileSync(new URL("../../web/h3studio_share.js", import.meta.url), "utf8");
const benchmark = readFileSync(new URL("../../web/h3studio_smart_benchmark.js", import.meta.url), "utf8");
const extension = readFileSync(new URL("../../h3studio/extension.py", import.meta.url), "utf8");

test("Director runtime UI exposes explainable Auto and the unchanged OG preset", () => {
  assert.match(runtime, /Auto · recommended/);
  assert.match(runtime, /OG \/ Current · unchanged runtime/);
  assert.match(runtime, /Packed tokens/);
  assert.match(runtime, /Why:/);
  assert.match(runtime, /runtime_optimization/);
  assert.match(runtime, /FFN chunks · experimental/);
});

test("Discord preset sharing includes runtime assets and exact LoRA strengths without prompts", () => {
  assert.match(share, /const PREFIX = "H3S1:"/);
  assert.match(share, /const ZIP_PREFIX = "H3S1Z:"/);
  assert.match(share, /CompressionStream/);
  assert.match(share, /Copy Discord/);
  assert.match(share, /Copy effective run config/);
  assert.match(share, /strength: Number\(item\?\.strength/);
  assert.match(share, /loaderAssets/);
  assert.match(share, /widgetChoices/);
  assert.doesNotMatch(share, /prompt: state\.prompt/);
  assert.match(share, /Prompts and reference images are never included/);
});

test("Smart Benchmark replaces filename typing with searchable installed assets and exact LoRA strengths", () => {
  assert.match(benchmark, /Smart Benchmark Scenario Builder/);
  assert.match(benchmark, /Search .*installed LoRAs/);
  assert.match(benchmark, /Search \$\{items\.length\} installed models/);
  assert.match(benchmark, /Exact LoRA strength used by this benchmark scenario/);
  assert.match(benchmark, /LoRA not installed/);
  assert.match(benchmark, /\+ Current setup/);
  assert.match(benchmark, /Runtime A\/B/);
  assert.match(benchmark, /const SHARE_PREFIX = "H3B1:"/);
  assert.match(benchmark, /const SHARE_ZIP_PREFIX = "H3B1Z:"/);
  assert.match(benchmark, /Copy benchmark for Discord/);
});

test("Smart Benchmark backend is registered on the ComfyUI extension surface", () => {
  assert.match(extension, /SMART_BENCHMARK_NODE_CLASS_MAPPINGS/);
  assert.match(extension, /\*\*SMART_BENCHMARK_NODE_CLASS_MAPPINGS/);
  assert.match(extension, /SMART_BENCHMARK_NODE_DISPLAY_NAME_MAPPINGS/);
});
