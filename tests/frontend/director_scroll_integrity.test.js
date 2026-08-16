import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const scrollFix = readFileSync(
  new URL("../../web/zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_h3studio_scroll_integrity_v36.js", import.meta.url),
  "utf8",
);
const studio = readFileSync(new URL("../../web/js/studio_extension.js", import.meta.url), "utf8");

test("Director sidebars keep finite native scroll containers", () => {
  assert.match(scrollFix, /max-height:\s*385px\s*!important/);
  assert.match(scrollFix, /overflow-y:\s*auto\s*!important/);
  assert.match(scrollFix, /scrollbar-gutter:\s*stable\s*!important/);
  assert.match(scrollFix, /padding-bottom:\s*56px\s*!important/);
});

test("Director scroll fix never hijacks wheel default behavior", () => {
  assert.ok(!scrollFix.includes("event.preventDefault("), "scroll compatibility must not prevent native wheel scrolling");
  assert.ok(!scrollFix.includes("scrollTop + event.deltaY"), "scroll compatibility must not synthesize scrollTop");
  assert.ok(!scrollFix.includes('addEventListener("wheel"'), "scroll compatibility must stay CSS-only");
});

test("Studio boundary only blocks LiteGraph wheel propagation", () => {
  assert.match(studio, /root\.addEventListener\("wheel",\s*\(event\)\s*=>\s*\{\s*event\.stopPropagation\(\);/s);
  assert.ok(!studio.match(/root\.addEventListener\("wheel"[\s\S]{0,180}event\.preventDefault/));
});
