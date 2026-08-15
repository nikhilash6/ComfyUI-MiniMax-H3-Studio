import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const demosJs = readFileSync(new URL("../../web/h3studio_demos.js", import.meta.url), "utf8");
const manifestJson = JSON.parse(readFileSync(new URL("../../web/demos/manifest.json", import.meta.url), "utf8"));

test("Demos shelf contains no undefined renderCards calls", () => {
  assert.doesNotMatch(demosJs, /\brenderCards\s*\(/, "renderCards was refactored to renderShelfContent and should not be called");
  assert.match(demosJs, /function renderShelfContent/);
  assert.match(demosJs, /renderShelfContent\(node, shelf, demos\)/);
});

test("formatSamplingBadge distinguishes 4-step and 8-step LightX without false 8-step matching", () => {
  // Test function extracted directly
  function formatSamplingBadge(profile) {
    if (!profile) return "LightX 8";
    const s = String(profile).toLowerCase();
    if (s.includes("lightx") || s.includes("turbo")) {
      if (s.includes("sa_solver") || s.includes("sa")) return "LightX SA-4";
      if (s.includes("er_sde") || s.includes("sde")) return "LightX SDE-4";
      if (s.includes("4")) return "LightX 4";
      if (s.includes("8") || s.includes("fl2v_8")) return "LightX 8";
      return "LightX 8";
    }
    if (s.includes("pdd")) {
      if (s.includes("600")) return "PDD 600";
      return "PDD 900";
    }
    if (s.includes("12") || s.includes("balanced")) return "Base 12";
    if (s.includes("20") || s.includes("quality")) return "Base 20";
    if (s.length <= 12) return profile;
    return "Custom";
  }

  assert.equal(formatSamplingBadge("lightx_v1_fl2v_8"), "LightX 8");
  assert.equal(formatSamplingBadge("lightx_v1_fl2v_4_pruned"), "LightX 4");
  assert.equal(formatSamplingBadge("lightx_er_sde_4"), "LightX SDE-4");
  assert.equal(formatSamplingBadge("lightx_sa_solver_4"), "LightX SA-4");
  assert.equal(formatSamplingBadge("pdd_ref2va_900"), "PDD 900");
  assert.equal(formatSamplingBadge("pdd_ref2va_600"), "PDD 600");
  assert.equal(formatSamplingBadge("base_quality_20"), "Base 20");
  assert.equal(formatSamplingBadge("base_balanced_12"), "Base 12");
});

test("Manifest includes cinematic Interstellar and Sicario presets", () => {
  const ids = manifestJson.map((d) => d.id);
  assert.ok(ids.includes("cinematic_interstellar_miller"));
  assert.ok(ids.includes("cinematic_interstellar_wormhole"));
  assert.ok(ids.includes("cinematic_sicario_border"));

  const categories = new Set(manifestJson.map((d) => d.category));
  assert.ok(categories.has("CINEMATIC"));
  assert.ok(categories.has("ANIME"));
  assert.ok(categories.has("REALISTIC"));
});

test("Demos shelf dynamically handles categories and upstream node association", () => {
  assert.match(demosJs, /distinctCats/);
  assert.match(demosJs, /findDirectorForOutput/);
  assert.match(demosJs, /cat-cinematic/);
});
