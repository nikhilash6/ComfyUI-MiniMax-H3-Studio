import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const guard = readFileSync(new URL("../../web/zz_h3studio_smart_benchmark_root_guard.js", import.meta.url), "utf8");
const benchmark = readFileSync(new URL("../../web/h3studio_smart_benchmark.js", import.meta.url), "utf8");

test("Smart Benchmark keeps ComfyUI's DOM widget handle bound to the live renderer root", () => {
  assert.match(guard, /Object\.defineProperty\(node, "__h3bRoot"/);
  assert.match(guard, /existing\.element = value/);
  assert.match(guard, /SmartBenchmarkSingleRootGuard/);
  assert.match(guard, /duplicate DOM widget/);
});

test("Smart Benchmark is bounded to one internal scroll surface", () => {
  assert.match(guard, /max-height", "560px"/);
  assert.match(guard, /overflow-y", "auto"/);
  assert.match(guard, /overflow-x", "hidden"/);
  assert.match(benchmark, /const WIDGET_NAME = "h3studio_smart_benchmark"/);
});
