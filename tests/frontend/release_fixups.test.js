import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const preset = readFileSync(new URL("../../web/h3studio_release_fixups.js", import.meta.url), "utf8");
const benchmark = readFileSync(new URL("../../web/h3studio_smart_benchmark_v3.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../web/h3studio_smart_benchmark_legacy_migration.js", import.meta.url), "utf8");
const pdd = readFileSync(new URL("../../web/h3studio_pdd_dependency.js", import.meta.url), "utf8");

test("shared presets resolve the Loader through the actual Director graph", () => {
  assert.match(preset, /inputComesFrom\(candidate, "studio_context", director\)/);
  assert.match(preset, /sourceForInput\(candidate, "h3_bundle"\)/);
  assert.match(preset, /fl2va_model/);
  assert.match(preset, /ref2va_model/);
  assert.match(preset, /custom_loras/);
  assert.match(preset, /runtime_optimization/);
  assert.match(preset, /__h3studioConfigured/);
});

test("Director add-ons remount after the core panel is rebuilt", () => {
  assert.match(preset, /MutationObserver/);
  assert.match(preset, /h3s-runtime-section/);
  assert.match(preset, /onConfigure/);
  assert.match(preset, /h3s-share-section/);
});

test("legacy benchmark still migrates without the old overflow-clipping overlay", () => {
  assert.match(migration, /H3StudioABComparison/);
  assert.match(migration, /H3StudioSmartBenchmark/);
  assert.match(migration, /inputSource\(oldNode, "h3_bundle"\)/);
  assert.match(migration, /inputSource\(oldNode, "studio_context"\)/);
  assert.match(migration, /outputTargets\(oldNode, 0\)/);
  assert.match(migration, /Migrated legacy Benchmark Lab to Smart Benchmark Lab/);
});

test("Smart Benchmark v3 is scrollable, has quick presets and exposes asset failures", () => {
  assert.match(benchmark, /overflow-y:auto!important/);
  assert.doesNotMatch(benchmark, /\.h3b-root[^`]*overflow:hidden!important/);
  assert.match(benchmark, /Quick benchmark presets/);
  assert.match(benchmark, /Auto vs OG/);
  assert.match(benchmark, /Runtime sweep/);
  assert.match(benchmark, /Memory sweep/);
  assert.match(benchmark, /assets unavailable · retry/);
  assert.match(benchmark, /\/h3studio\/assets/);
});

test("PDD dependency plus pair install/repair is one non-reentrant flow", () => {
  assert.match(pdd, /\/h3studio\/dependencies\/pdd\/install/);
  assert.match(pdd, /\/uad\/install/);
  assert.match(pdd, /\/uad\/verify-fast/);
  assert.match(pdd, /\[data-pdd-install\],\[data-pdd-repair\]/);
  assert.match(pdd, /stopImmediatePropagation/);
  assert.match(pdd, /node\.__h3PddPairFlowBusy/);
  assert.doesNotMatch(pdd, /button\.click\(\)/);
  assert.doesNotMatch(pdd, /window\.confirm/);
});
