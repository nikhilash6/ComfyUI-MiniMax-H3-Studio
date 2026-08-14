import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../web/h3_release_ui_polish.js", import.meta.url), "utf8");

test("final workflow polish uses the official LightX 8-step download", () => {
  assert.ok(source.includes("https://huggingface.co/lightx2v/Minimax-h3-Turbo/resolve/main/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors?download=true"));
  assert.ok(source.includes("Official LightX 8-step v1.0"));
});

test("decode note warns about poor manual overlap", () => {
  assert.ok(source.includes("Quality warning"));
  assert.ok(source.includes("512 / 64"));
  assert.ok(source.includes("512 / 128"));
  assert.ok(source.includes("visible degradation"));
});

test("TAEH3 free-form numeric widgets are constrained to curated choices", () => {
  assert.ok(source.includes("values: [512, 768, 1024]"));
  assert.ok(source.includes("values: [70, 80, 90, 95]"));
  assert.ok(source.includes("values: [1, 2, 4, 8]"));
  assert.ok(source.includes('target.type = "combo"'));
});

test("maintained workflow groups use tighter guarded bounds", () => {
  assert.ok(source.includes("[6, [-1490, -240, 2220, 420]]"));
  assert.ok(source.includes("[2, [-600, 210, 680, 590]]"));
  assert.ok(source.includes("[4, [1020, 210, 540, 1260]]"));
});
