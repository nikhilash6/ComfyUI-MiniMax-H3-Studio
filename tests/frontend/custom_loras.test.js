import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../web/h3studio_loras.js", import.meta.url), "utf8");

test("Director custom LoRA extension persists a bounded ordered stack", () => {
  assert.match(source, /const MAX_CUSTOM_LORAS = 6/);
  assert.match(source, /custom_loras/);
  assert.match(source, /Move LoRA earlier/);
  assert.match(source, /Move LoRA later/);
  assert.match(source, /Strength/);
  assert.match(source, /strength/);
  assert.match(source, /enabled/);
});

test("custom LoRA extension discovers installed ComfyUI LoRAs and survives panel rerenders", () => {
  assert.match(source, /\/h3studio\/loras/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /setTimeout\(wait/);
  assert.doesNotMatch(source, /queueMicrotask\(wait\)/);
  assert.match(source, /const UI_VERSION = "native-v2"/);
  assert.match(source, /authoritativeSection/);
  assert.match(source, /data-h3studio-lora-ui/);
  assert.match(source, /if \(!authoritativeSection\(panel\)\) installLoraSection\(node, true\)/);
});

test("strength updates live without replacing the LoRA section on slider release", () => {
  assert.match(source, /range\.addEventListener\("input"/);
  assert.match(source, /number\.addEventListener\("input"/);
  assert.match(source, /number\.value = formatStrength\(value\)/);
  assert.match(source, /patch\(\{ strength: value \}, false\)/);
  assert.match(source, /slider\.setValue\(value\)/);
});

test("custom LoRA picker is searchable, contained, scrollable and supports local favorites", () => {
  assert.match(source, /Search installed LoRAs/);
  assert.match(source, /FAVORITES_KEY/);
  assert.match(source, /localStorage/);
  assert.match(source, /Favorites/);
  assert.match(source, /visualViewport/);
  assert.match(source, /h3lp-list::\-webkit-scrollbar/);
  assert.match(source, /overscroll-behavior:contain/);
  assert.match(source, /aria-pressed/);
  assert.match(source, /grid-template-columns:minmax\(0,1fr\) 38px/);
});

test("custom LoRA UI explains acceleration ownership and stack order", () => {
  assert.match(source, /Speed already applies LightX\/PDD acceleration/);
  assert.match(source, /Add only compatible custom H3 LoRAs here/);
  assert.match(source, /stack order is applied top to bottom/);
});
