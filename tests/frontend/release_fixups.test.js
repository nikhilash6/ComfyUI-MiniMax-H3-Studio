import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const legacyPresetUrl = new URL("../../web/h3studio_release_fixups.js", import.meta.url);
const benchmark = readFileSync(new URL("../../web/h3studio_smart_benchmark.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../web/h3studio_smart_benchmark_legacy_migration.js", import.meta.url), "utf8");
const ui = readFileSync(new URL("../../web/zz_h3studio_ui_v4.js", import.meta.url), "utf8");
const pdd = readFileSync(new URL("../../web/h3studio_pdd_dependency.js", import.meta.url), "utf8");

test("obsolete release fixup remount layer stays removed", () => {
  assert.equal(existsSync(legacyPresetUrl), false);
});

test("legacy benchmark absorbs into an existing Smart Benchmark instead of duplicating it", () => {
  assert.match(migration, /H3StudioABComparison/);
  assert.match(migration, /H3StudioSmartBenchmark/);
  assert.match(migration, /Existing Smart Benchmark found/);
  assert.match(migration, /instead of creating a duplicate/);
  assert.match(migration, /app\.graph\.remove\(oldNode\)/);
});

test("Smart Benchmark base renderer remains stable and bounded", () => {
  assert.match(benchmark, /max-height:560px/);
  assert.match(benchmark, /dedupeDomWidgets/);
  assert.match(benchmark, /h3studio_benchmark_preset/);
  assert.match(benchmark, /root\.replaceChildren/);
  assert.match(benchmark, /render\(node\)/);
  assert.match(benchmark, /Auto vs OG/);
  assert.match(benchmark, /\["runtime", "Runtime"\]/);
  assert.match(benchmark, /\["memory", "Memory"\]/);
  assert.match(benchmark, /Assets unavailable/);
  assert.match(benchmark, /\/h3studio\/assets/);
  assert.match(benchmark, /w\?\.name === WIDGET_NAME/);
  assert.match(benchmark, /target\.type = "hidden"/);
});

test("Director v6 keeps native widgets hidden behind the product UI", () => {
  assert.match(ui, /VISIBLE_NATIVE/);
  assert.match(ui, /widget\.type = "hidden"/);
  assert.match(ui, /widget\.computeSize = \(\) => \[0, -4\]/);
  assert.match(ui, /onDrawForeground/);
  assert.match(ui, /h3s-choice-menu/);
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
