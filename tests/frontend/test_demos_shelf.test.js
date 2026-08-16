import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { shortSamplingLabel } from "../../web/js/features/png_metadata.js";

const demosEntryJs = readFileSync(new URL("../../web/h3studio_demos.js", import.meta.url), "utf8");
const demosJs = readFileSync(new URL("../../web/h3studio_demos_metadata.js", import.meta.url), "utf8");
const manifestJson = JSON.parse(readFileSync(new URL("../../web/demos/manifest.json", import.meta.url), "utf8"));

test("legacy shelf entrypoint delegates to the metadata-first implementation", () => {
  assert.match(demosEntryJs, /h3studio_demos_metadata\.js/);
  assert.doesNotMatch(demosEntryJs, /\bprompt\s*:/);
  assert.doesNotMatch(demosEntryJs, /\bseed\s*:/);
});

test("Demos shelf contains no undefined renderCards calls", () => {
  assert.doesNotMatch(demosJs, /\brenderCards\s*\(/, "renderCards must not return");
  assert.match(demosJs, /function renderShelfContent/);
  assert.match(demosJs, /renderShelfContent\(node, shelf, demos\)/);
});

test("Demos shelf mounts the body before its first content render", () => {
  const appendIndex = demosJs.indexOf("shelf.append(header, body);");
  const renderIndex = demosJs.indexOf("renderShelfContent(node, shelf, demos);", appendIndex);
  assert.ok(appendIndex !== -1 && renderIndex !== -1, "Both statements should exist");
  assert.ok(appendIndex < renderIndex, "shelf body must exist before renderShelfContent queries it");
});

test("sampling badges distinguish LightX 4/8 and PDD profiles", () => {
  assert.equal(shortSamplingLabel("lightx_v1_fl2v_8"), "LightX 8");
  assert.equal(shortSamplingLabel("lightx_v1_fl2v_4_pruned"), "LightX 4");
  assert.equal(shortSamplingLabel("lightx_er_sde_4"), "LightX 4");
  assert.equal(shortSamplingLabel("lightx_sa_solver_4"), "LightX 4");
  assert.equal(shortSamplingLabel("pdd_ref2va_4_900"), "PDD 900");
  assert.equal(shortSamplingLabel("pdd_ref2va_4_600"), "PDD 600");
  assert.equal(shortSamplingLabel("base_quality_20"), "Base 20");
  assert.equal(shortSamplingLabel("base_balanced_12"), "Base 12");
});

test("Manifest includes cinematic, anime and realistic catalog entries", () => {
  const ids = manifestJson.map((demo) => demo.id);
  assert.ok(ids.includes("cinematic_interstellar_miller"));
  assert.ok(ids.includes("cinematic_interstellar_wormhole"));
  assert.ok(ids.includes("cinematic_sicario_border"));
  assert.ok(ids.includes("cinematic_nocountry_cointoss"));
  assert.ok(ids.includes("cinematic_nocountry_motel"));
  assert.ok(ids.includes("cinematic_1917_ruins_flare"));
  assert.ok(ids.includes("anime_gits_rainy_overpass"));

  const categories = new Set(manifestJson.map((demo) => demo.category));
  assert.ok(categories.has("CINEMATIC"));
  assert.ok(categories.has("ANIME"));
  assert.ok(categories.has("REALISTIC"));
});

test("Demos shelf derives categories, traces the real upstream Director, and requires embedded PNG metadata", () => {
  assert.match(demosJs, /new Set\(demos\.map/);
  assert.match(demosJs, /findDirectorForOutput/);
  assert.match(demosJs, /loadDemoMetadata/);
  assert.match(demosJs, /fetchStudioPngMetadata/);
  assert.match(demosJs, /Metadata required/);
  assert.doesNotMatch(demosJs, /demo\.prompt/);
});
