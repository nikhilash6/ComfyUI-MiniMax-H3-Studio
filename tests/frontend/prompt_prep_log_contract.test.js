import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../h3studio/prompt_prep_hotfix_v2.py", import.meta.url), "utf8");

test("verbose factual analysis is compacted locally instead of triggering a second multimodal pass", () => {
  assert.match(source, /Compacting verbose factual record locally/);
  assert.match(source, /no retry/);
  assert.match(source, /_trim_words\(description, 90\)/);
});

test("cold visual analysis establishes a Comfy-owned residency barrier only on cache misses", () => {
  assert.match(source, /_cache_miss_requires_visual_model/);
  assert.match(source, /manager\.unload_all_models\(\)/);
  assert.match(source, /12\.0/);
});
