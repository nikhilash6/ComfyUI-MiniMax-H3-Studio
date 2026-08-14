import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../web/h3_uad_metadata_cache.js", import.meta.url), "utf8");

test("UAD fast metadata requests are cached and deduplicated", () => {
  assert.match(source, /\/uad\/analyze-fast/);
  assert.match(source, /const cache = new Map\(\)/);
  assert.match(source, /const inflight = new Map\(\)/);
  assert.match(source, /CACHE_TTL_MS/);
});

test("manual Refresh sizes invalidates metadata cache", () => {
  assert.match(source, /data-action=\\"metadata\\"/);
  assert.match(source, /cache\.clear\(\)/);
});
