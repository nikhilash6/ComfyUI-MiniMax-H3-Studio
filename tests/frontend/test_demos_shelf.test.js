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

test("Manifest includes cinematic and anime catalog entries from authentic generations", () => {
  const ids = manifestJson.map((demo) => demo.id);
  assert.ok(ids.includes("cinematic_shallow_ocean_horizon"));
  assert.ok(ids.includes("cinematic_orbital_spin_docking"));
  assert.ok(ids.includes("cinematic_saturn_spherical_wormhole"));
  assert.ok(ids.includes("cinematic_border_bridge_gridlock"));
  assert.ok(ids.includes("cinematic_gas_station_counter"));
  assert.ok(ids.includes("cinematic_texas_motel_room"));
  assert.ok(ids.includes("cinematic_burning_french_ruins"));
  assert.ok(ids.includes("cinematic_chemistry_classroom"));
  assert.ok(ids.includes("cinematic_trinity_observation_bunker"));
  assert.ok(ids.includes("cinematic_warehouse_bodycam_search"));
  assert.ok(ids.includes("anime_mist_timber_bridge"));
  assert.ok(ids.includes("anime_stone_temple_corridor"));
  assert.ok(ids.includes("anime_desert_highway_trip"));
  assert.ok(ids.includes("anime_redwood_canopy_patrol"));
  assert.ok(ids.includes("anime_rainy_neon_stakeout"));
  assert.ok(ids.includes("anime_cyberpunk_highway_overpass"));
  assert.ok(ids.includes("anime_coastal_town_market"));

  const categories = new Set(manifestJson.map((demo) => demo.category));
  assert.ok(categories.has("CINEMATIC"));
  assert.ok(categories.has("ANIME"));
});

test("Demos shelf derives categories, traces the real upstream Director, and requires embedded PNG metadata", () => {
  assert.match(demosJs, /new Set\(demos\.map/);
  assert.match(demosJs, /findDirectorForOutput/);
  assert.match(demosJs, /loadDemoMetadata/);
  assert.match(demosJs, /fetchStudioPngMetadata/);
  assert.match(demosJs, /Metadata required/);
  assert.doesNotMatch(demosJs, /demo\.prompt/);
});
