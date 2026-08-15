import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ui = readFileSync(new URL("../../web/zzzzzzzz_h3studio_benchmark_lab_v14.js", import.meta.url), "utf8");
const backend = readFileSync(new URL("../../h3studio/smart_benchmark_restore.py", import.meta.url), "utf8");
const extension = readFileSync(new URL("../../h3studio/extension.py", import.meta.url), "utf8");

test("Smart Benchmark restores unified comparison mode and global plan controls", () => {
  assert.match(backend, /benchmark_mode/);
  assert.match(backend, /seed_strategy/);
  assert.match(backend, /repeats/);
  assert.match(backend, /allow_large_matrix/);
  assert.match(backend, /include_reference_context/);
  assert.match(backend, /live_cell_previews/);
  assert.match(extension, /install_smart_benchmark_restore\(\)/);
});

test("Benchmark and Director share the progressive custom MP slider", () => {
  assert.match(ui, /createMpSlider/);
  assert.match(ui, /h3b14-mp-field/);
  assert.match(ui, /h3s-v14-mp-spectrum/);
  assert.match(ui, /#66b1a1/);
  assert.match(ui, /#d84b58/);
  assert.match(ui, /clip-path:inset/);
  assert.match(ui, /directorResolution/);
});

test("Director scroll containment covers both product layout generations", () => {
  assert.match(ui, /h3s-v6-layout,.h3s-v7-layout/);
  assert.match(ui, /h3s-v6-inspector,.h3s-v7-inspector/);
  assert.match(ui, /fixDirectorScroll/);
  assert.match(ui, /h3s-v14-scroll-end/);
});

test("custom LoRA pickers hide managed speed adapters", () => {
  assert.match(ui, /function managed/);
  assert.match(ui, /pdd_/);
  assert.match(ui, /lightx/);
  assert.match(ui, /filterDirectorPicker/);
  assert.match(ui, /filterBenchmarkLoras/);
});
