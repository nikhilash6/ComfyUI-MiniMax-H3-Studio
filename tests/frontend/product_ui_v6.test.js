import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ui = readFileSync(new URL("../../web/zz_h3studio_ui_v4.js", import.meta.url), "utf8");
const layout = readFileSync(new URL("../../web/js/core/layout.js", import.meta.url), "utf8");

test("Director v6 uses a stable primary workspace plus compact inspector", () => {
  assert.match(ui, /h3s-v6-layout/);
  assert.match(ui, /h3s-v6-main/);
  assert.match(ui, /h3s-v6-inspector/);
  assert.match(ui, /h3s-studio-panel/);
});

test("Director v7 mutation observer cannot retrigger itself while reparenting sections", () => {
  assert.match(ui, /MutationObserver/);
  assert.match(ui, /let queued = false;/);
  assert.match(ui, /observer\.observe\(root, \{ childList: true/);
});

test("Director node height is bounded instead of ratcheting upward forever", () => {
  assert.match(layout, /STUDIO_NODE_MAX_HEIGHT = 980/);
  assert.match(layout, /Math\.min\(STUDIO_NODE_MAX_HEIGHT/);
});

test("Director DOM widget remains zoom-aware and foreground work is throttled", () => {
  assert.match(ui, /widget\.options\.hideOnZoom = true/);
  assert.match(ui, /now - lastDrawAt < DRAW_INTERVAL_MS/);
  assert.match(ui, /MutationObserver/);
});
