import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const patch = readFileSync(
  new URL("../../web/zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_h3studio_director_mount_cues_v32.js", import.meta.url),
  "utf8",
);

test("legacy AI analysis cue is visibly green again", () => {
  assert.match(patch, /\.h3s-studio-panel \.h3s-auto-role/);
  assert.match(patch, /#34d3b5/);
  assert.match(patch, /color-mix\(in srgb, #34d3b5 10%, transparent\)/);
  assert.match(patch, /\.h3s-reference-card-auto/);
  assert.match(patch, /box-shadow: inset 2px 0 0/);
});

test("runtime LoRA and preset sections survive two-column rerenders", () => {
  assert.match(patch, /\.h3s-runtime-section/);
  assert.match(patch, /\.h3s-custom-loras/);
  assert.match(patch, /\.h3s-share-section/);
  assert.match(patch, /\.h3s-col-right/);
  assert.match(patch, /record\.removedNodes/);
  assert.match(patch, /stash\.set/);
});
