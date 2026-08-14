import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtime = readFileSync(new URL("../../web/h3studio_runtime.js", import.meta.url), "utf8");
const share = readFileSync(new URL("../../web/h3studio_share.js", import.meta.url), "utf8");
const benchmark = readFileSync(new URL("../../web/h3studio_smart_benchmark.js", import.meta.url), "utf8");
const extension = readFileSync(new URL("../../h3studio/extension.py", import.meta.url), "utf8");

test("Director runtime UI exposes explainable Auto, unchanged OG and focused Expert overrides", () => {
  assert.match(runtime, /\["auto", "Auto", "Best default"/);
  assert.match(runtime, /\["og_current", "OG", "No override"/);
  assert.match(runtime, /Packed tokens/);
  assert.match(runtime, /Why:/);
  assert.match(runtime, /runtime_optimization/);
  assert.match(runtime, /Expert overrides/);
  assert.match(runtime, /FFN chunking is no longer exposed here/);
  assert.match(runtime, /Attention backend/);
  assert.match(runtime, /Head chunking/);
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

test("Smart Benchmark v4 uses installed-asset search, exact LoRA strengths and immediate preset state", () => {
  assert.match(benchmark, /Smart Benchmark/);
  assert.match(benchmark, /Search installed H3 LoRA/);
  assert.match(benchmark, /Search installed transformer/);
  assert.match(benchmark, /strength: Number\(strength\.value\)/);
  assert.match(benchmark, /modelChoices\(route\)/);
  assert.match(benchmark, /\+ Current setup/);
  assert.match(benchmark, /Auto vs OG/);
  assert.match(benchmark, /Runtime sweep/);
  assert.match(benchmark, /h3studio_benchmark_preset/);
  assert.match(benchmark, /const SHARE_PREFIX = "H3B1:"/);
  assert.match(benchmark, /const SHARE_ZIP_PREFIX = "H3B1Z:"/);
  assert.match(benchmark, /Copy for Discord/);
});

test("Smart Benchmark backend is registered on the ComfyUI extension surface", () => {
  assert.match(extension, /SMART_BENCHMARK_NODE_CLASS_MAPPINGS/);
  assert.match(extension, /\*\*SMART_BENCHMARK_NODE_CLASS_MAPPINGS/);
  assert.match(extension, /SMART_BENCHMARK_NODE_DISPLAY_NAME_MAPPINGS/);
});
