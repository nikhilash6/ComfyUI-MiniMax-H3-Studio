import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  generationBadge,
  shortSamplingLabel,
  studioMetadataFromChunks,
} from "../../web/js/features/png_metadata.js";


test("embedded h3studio state restores the full prompt and exact generation settings", () => {
  const prompt = "summary:\nFULL PROMPT\n\ndetailed_description:\nNo truncation here.";
  const metadata = studioMetadataFromChunks({
    h3studio: JSON.stringify({
      width: 3040,
      height: 1312,
      seed: 123456789,
      sampling_profile: "lightx_v1_fl2v_8",
      resolved_route: "fl2va",
      state: {
        prompt,
        references: [],
        prompt_options: { enhance_mode: "off" },
        generation: {
          seed: 123456789,
          aspect_ratio: "21:9",
          megapixels: 4,
          sampling_profile: "lightx_v1_fl2v_8",
          route: "auto",
        },
        ui: {},
      },
    }),
  });

  assert.equal(metadata.state.prompt, prompt);
  assert.equal(metadata.state.generation.seed, 123456789);
  const badge = generationBadge(metadata);
  assert.equal(badge.resolution, "3040×1312");
  assert.equal(badge.seed, 123456789);
  assert.equal(shortSamplingLabel(badge.profile), "LightX 8");
});


test("demo manifest is catalog-only and cannot silently become a second prompt database", async () => {
  const raw = await readFile(new URL("../../web/demos/manifest.json", import.meta.url), "utf8");
  const manifest = JSON.parse(raw);
  assert.ok(manifest.length > 0);
  for (const entry of manifest) {
    assert.ok(entry.id);
    assert.ok(entry.thumbnail);
    assert.ok(entry.metadata_file);
    for (const forbidden of ["prompt", "summary", "detailed_description", "seed", "sampling", "route", "target_mp", "generation"]) {
      assert.equal(Object.hasOwn(entry, forbidden), false, `${entry.id} must not hardcode ${forbidden}`);
    }
  }
});
