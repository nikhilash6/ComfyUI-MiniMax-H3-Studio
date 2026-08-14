import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../web/h3_model_setup_prompt_prep_fast.js", import.meta.url), "utf8");

test("prompt-prep speed pack exposes exact native and GGUF assets", () => {
  assert.match(source, /qwen3\.5_4b_bf16\.safetensors/);
  assert.match(source, /Qwen3\.5-4B-UD-Q4_K_XL\.gguf/);
  assert.match(source, /mmproj-BF16\.gguf/);
  assert.match(source, /qwen3\.5_4b_mmproj_bf16\.gguf/);
  assert.match(source, /destination: "h3studio_vlm"/);
});

test("speed-pack setup uses UAD verification and safe install routes", () => {
  assert.match(source, /\/uad\/analyze-fast/);
  assert.match(source, /\/uad\/verify-fast/);
  assert.match(source, /\/uad\/install/);
  assert.match(source, /\/h3studio\/dependencies\/llama\/install/);
});

test("speed-pack card survives base Model Setup rerenders", () => {
  assert.match(source, /MutationObserver/);
  assert.match(source, /if \(!root\.querySelector\(`\.\$\{CARD_CLASS\}`\)\)/);
  assert.match(source, /GGUF Auto ready/);
});
