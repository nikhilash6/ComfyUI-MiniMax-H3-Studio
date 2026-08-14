import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../web/h3_release_ui_polish.js", import.meta.url), "utf8");

test("maintained workflow repairs a missing comparison output node", () => {
  assert.ok(source.includes('const COMPARISON_CLASS = "H3StudioComparisonView"'));
  assert.ok(source.includes("function ensureComparisonNode(graphData)"));
  assert.ok(source.includes('type: COMPARISON_CLASS'));
  assert.ok(source.includes('"H3_STUDIO_CONTEXT"'));
  assert.ok(source.includes('"IMAGE"'));
});

test("model download note documents every first-class LightX artifact and route", () => {
  for (const filename of [
    "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors",
    "minimax_h3_fl2v_lightx2v_turbo_8step_v1.0_resized_avg_rank_24_bf16.safetensors",
    "minimax_h3_fl2v_lightx2v_turbo_4step_v1.0_768p_resized_avg_rank_31_bf16.safetensors",
    "minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy_resized_avg_rank_21_bf16.safetensors",
    "minimax_h3_ref2v_lightx2v_turbo_4step_v0.1_resized_avg_rank_20_bf16.safetensors",
  ]) {
    assert.ok(source.includes(filename));
  }
  assert.ok(source.includes("FL2VA only"));
  assert.ok(source.includes("REF2VA · LightX v0.1 · 4-step"));
  assert.ok(source.includes("rejected on FL2VA routes"));
});
