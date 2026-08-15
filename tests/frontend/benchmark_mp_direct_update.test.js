import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const benchmark = readFileSync(new URL("../../web/h3studio_smart_benchmark.js", import.meta.url), "utf8");
const finalV27 = readFileSync(new URL("../../web/zzzzzzzzzzzzzzzzzzzz_h3studio_benchmark_final_v27.js", import.meta.url), "utf8");

test("Smart Benchmark natively builds Director MP Target size control", () => {
  assert.match(benchmark, /import\s*\{\s*rangeControl\s*\}\s*from\s*"\.\/js\/core\/dom\.js"/);
  assert.match(benchmark, /formatMegapixels/);
  assert.match(benchmark, /RESOLUTION_PRESETS/);
  assert.match(benchmark, /dataset\.h3DirectorMp\s*=\s*"1"/);
  assert.match(benchmark, /h3s-megapixel-control/);
  assert.match(benchmark, /h3s-resolution-presets/);
});

test("Smart Benchmark performs in-place state updates without calling full render", () => {
  assert.match(benchmark, /function updateScenarioState\(node, index, patch\)/);
  assert.match(benchmark, /updateScenarioState\(node,\s*index,\s*\{\s*megapixels:\s*val\s*\}\)/);
  assert.match(benchmark, /const onMpPreview = \(val\) =>/);
  assert.match(benchmark, /const onMpCommit = \(val\) =>/);
  const onMpCommitBlock = benchmark.slice(benchmark.indexOf("const onMpCommit"), benchmark.indexOf("mpSlider = rangeControl"));
  assert.ok(!onMpCommitBlock.includes("render("), "onMpCommit should not call render");
  assert.ok(!onMpCommitBlock.includes("patchScenario("), "onMpCommit should not call patchScenario");
});

test("Smart Benchmark render preserves scrollTop, scrollLeft, and open details states", () => {
  assert.match(benchmark, /const prevScrollTop = Number\(root\.scrollTop \|\| 0\)/);
  assert.match(benchmark, /const prevOpen = \[\.\.\.root\.querySelectorAll\("\.h3b7-scenario"\)\]\.map/);
  assert.match(benchmark, /root\.scrollTop = prevScrollTop/);
});

test("Benchmark Final v27 guards ensureMp from overwriting Director MP control", () => {
  assert.match(finalV27, /if\s*\(field\.querySelector\("\[data-h3-director-mp='1'\],\s*\.h3s-megapixel-control"\)\)\s*return;/);
});
