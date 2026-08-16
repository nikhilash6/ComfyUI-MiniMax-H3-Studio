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

test("UAD is presented as an optional helper instead of a runtime requirement", () => {
  assert.match(source, /UAD optional · not installed/);
  assert.match(source, /H3 Studio does not need UAD to generate images/);
  assert.match(source, /Install optional UAD helper/);
  assert.match(source, /Download missing · UAD/);
  assert.match(source, /existing or manually installed models work without it/);
});

test("missing UAD never triggers an automatic install prompt", () => {
  assert.doesNotMatch(source, /nativeConfirm/);
  assert.doesNotMatch(source, /__h3UadPrompted/);
  assert.doesNotMatch(source, /Install it now with ComfyUI-Manager/);
  assert.match(source, /await runInstall\(node\)/);
});

test("onboarding preserves intentionally added UAD graph nodes", () => {
  assert.doesNotMatch(source, /removeLegacyUadNodes/);
  assert.doesNotMatch(source, /LEGACY_UAD_NODE/);
  assert.doesNotMatch(source, /beforeConfigureGraph/);
});

test("onboarding retries Manager startup while keeping manual use available", () => {
  assert.match(source, /attempt < 12/);
  assert.match(source, /await sleep\(750\)/);
  assert.match(source, /managerSnapshot\(\)/);
  assert.match(source, /enhanceMissingPanel\(node, snapshot\)/);
});
