import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../web/h3studio_loras.js", import.meta.url), "utf8");

test("Director custom LoRA extension persists a bounded ordered stack", () => {
  assert.match(source, /const MAX_CUSTOM_LORAS = 6/);
  assert.match(source, /custom_loras/);
  assert.match(source, /Move LoRA earlier/);
  assert.match(source, /Move LoRA later/);
  assert.match(source, /strength/);
  assert.match(source, /enabled/);
});

test("custom LoRA extension discovers installed ComfyUI LoRAs and survives panel rerenders", () => {
  assert.match(source, /\/h3studio\/loras/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /setTimeout\(wait/);
  assert.doesNotMatch(source, /queueMicrotask\(wait\)/);
});

test("custom LoRA UI explains acceleration ownership", () => {
  assert.match(source, /Speed already applies LightX\/PDD acceleration/);
  assert.match(source, /Add only compatible custom H3 LoRAs here/);
});
