import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../web/h3studio_loras.js", import.meta.url), "utf8");

test("Director custom LoRA extension persists a bounded stack with explicit positive strength controls", () => {
  assert.match(source, /const MAX_CUSTOM_LORAS = 6/);
  assert.match(source, /const MIN_STRENGTH = 0/);
  assert.match(source, /const MAX_STRENGTH = 3/);
  assert.match(source, /custom_loras/);
  assert.match(source, /Strength/);
  assert.match(source, /strength/);
  assert.match(source, /enabled/);
  assert.doesNotMatch(source, /Move LoRA earlier/);
  assert.doesNotMatch(source, /Move LoRA later/);
  assert.doesNotMatch(source, /h3s-lora-order/);
});

test("custom LoRA extension discovers installed ComfyUI LoRAs and survives panel rerenders", () => {
  assert.match(source, /\/h3studio\/loras/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /setTimeout\(wait/);
  assert.doesNotMatch(source, /queueMicrotask\(wait\)/);
  assert.match(source, /const UI_VERSION = "native-v4"/);
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

test("per-LoRA strengths are remembered locally and restored when selected", () => {
  assert.match(source, /STRENGTHS_KEY/);
  assert.match(source, /MAX_SAVED_STRENGTHS = 256/);
  assert.match(source, /loadSavedStrengths/);
  assert.match(source, /rememberStrength/);
  assert.match(source, /savedStrengthFor/);
  assert.match(source, /onSelect\(entry\.name, savedStrengthFor\(entry\.name, 1\)\)/);
  assert.match(source, /savedStrengths\.size > MAX_SAVED_STRENGTHS/);
  assert.match(source, /updated_at/);
  assert.match(source, /pagehide/);
});

test("saved strength is visible in the LoRA picker", () => {
  assert.match(source, /h3lp-saved-strength/);
  assert.match(source, /Saved strength:/);
  assert.match(source, /saved strength/);
  assert.match(source, /hasSavedStrength\(entry\.name\)/);
});

test("favorites exist only inside the searchable contained picker", () => {
  assert.match(source, /Search installed LoRAs/);
  assert.match(source, /FAVORITES_KEY/);
  assert.match(source, /localStorage/);
  assert.match(source, /Favorites/);
  assert.match(source, /visualViewport/);
  assert.match(source, /h3lp-list::\-webkit-scrollbar/);
  assert.match(source, /overscroll-behavior:contain/);
  assert.match(source, /aria-pressed/);
  assert.match(source, /grid-template-columns:minmax\(0,1fr\) 40px/);
  assert.doesNotMatch(source, /h3s-lora-favorite/);
});

test("picker copies the Director theme instead of using an unrelated Comfy menu surface", () => {
  assert.match(source, /copyDirectorTheme/);
  assert.match(source, /--h3s-bg/);
  assert.match(source, /--h3s-surface/);
  assert.match(source, /--h3s-border/);
  assert.match(source, /--h3s-accent/);
  assert.doesNotMatch(source, /--comfy-menu-bg/);
});

test("custom LoRA UI explains acceleration ownership without exposing order controls", () => {
  assert.match(source, /Speed already applies LightX\/PDD acceleration/);
  assert.match(source, /Add only compatible custom H3 LoRAs here/);
  assert.doesNotMatch(source, /stack order is applied top to bottom/);
});
