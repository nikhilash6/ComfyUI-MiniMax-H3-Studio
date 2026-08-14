import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../web/h3_manager_onboarding.js", import.meta.url), "utf8");

test("Manager onboarding uses ComfyUI api.fetchApi and registry queue when exposed", () => {
  assert.match(source, /const response = await api\.fetchApi\(path, options\)/);
  assert.match(source, /fetchJson\("\/customnode\/installed"\)/);
  assert.match(source, /\/customnode\/getlist\?mode=default&skip_update=true/);
  assert.match(source, /api\.fetchApi\("\/manager\/queue\/install"/);
  assert.match(source, /api\.fetchApi\("\/manager\/queue\/start"/);
  assert.match(source, /\/manager\/queue\/status/);
});

test("current Extensions UI prevents a false Manager-not-detected state", () => {
  assert.match(source, /function findExtensionsButton\(\)/);
  assert.match(source, /label === "extensions"/);
  assert.match(source, /source: uiAvailable \? "extensions-ui" : "unavailable"/);
  assert.match(source, /apiAvailable: false/);
  assert.match(source, /ComfyUI Extensions is available/);
  assert.match(source, /Open Extensions/);
});

test("automatic UAD install is only offered when Manager queue API is reachable", () => {
  assert.match(source, /if \(snapshot\.apiAvailable\)/);
  assert.match(source, /snapshot\.apiAvailable && !snapshot\.hasUad/);
  assert.match(source, /Install UAD now/);
  assert.match(source, /h3ms-open-extensions/);
});

test("missing UAD gets native install confirmation when queue API is available", () => {
  assert.match(source, /title: "H3 Studio setup"/);
  assert.match(source, /Install it now with ComfyUI-Manager/);
  assert.match(source, /Manager is opened from the Extensions button/);
});

test("onboarding preserves intentionally added UAD graph nodes", () => {
  assert.doesNotMatch(source, /removeLegacyUadNodes/);
  assert.doesNotMatch(source, /LEGACY_UAD_NODE/);
  assert.doesNotMatch(source, /beforeConfigureGraph/);
});

test("onboarding retries Manager startup instead of trusting the first probe", () => {
  assert.match(source, /attempt < 12/);
  assert.match(source, /await sleep\(750\)/);
  assert.match(source, /managerSnapshot\(\)/);
});
