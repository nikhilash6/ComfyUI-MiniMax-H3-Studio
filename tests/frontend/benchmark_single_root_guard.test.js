import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const guard = readFileSync(new URL("../../web/zz_h3studio_smart_benchmark_root_guard.js", import.meta.url), "utf8");
const benchmark = readFileSync(new URL("../../web/h3studio_smart_benchmark.js", import.meta.url), "utf8");

test("Smart Benchmark preserves ComfyUI's original tracked DOM root across redraws", () => {
  assert.match(guard, /Object\.defineProperty\(node, "__h3bRoot"/);
  assert.match(guard, /absorbRenderedRoot\(stableRoot, value\)/);
  assert.match(guard, /value\.replaceWith\(stableRoot\)/);
  assert.match(guard, /SmartBenchmarkStableRootGuard/);
  assert.match(guard, /duplicate DOM widget/);
});

test("Smart Benchmark is bounded to one internal scroll surface without viewport-width overflow", () => {
  assert.match(guard, /max-height", "560px"/);
  assert.match(guard, /overflow-y", "auto"/);
  assert.match(guard, /overflow-x", "hidden"/);
  assert.match(guard, /container-type:inline-size/);
  assert.match(guard, /ComfyUI owns exact overlay width\/transform/);
  assert.match(guard, /root\.style\.removeProperty\("width"\)/);
  assert.match(benchmark, /const WIDGET_NAME = "h3studio_smart_benchmark"/);
});
