import assert from "node:assert/strict";
import test from "node:test";

import { SAMPLING_PROFILES, defaultState, validateGenerationContract } from "../../web/js/core/state.js";

function withReference(state) {
  state.references = [{
    id: "ref_1",
    filename: "one.png",
    storage_name: "",
    ordinal: 1,
    role: "auto",
    retention: "attribute_transfer",
    role_auto: true,
    retention_auto: true,
    description: "",
    description_auto: true,
    enabled: true,
    width: 1024,
    height: 1024,
    fingerprint: null,
    thumbnail: "",
    tags: [],
    source_node_id: null,
    source_slot: 0,
  }];
  return state;
}

test("sampling picker exposes all new pruned LightX profiles with route labels", () => {
  const byKey = new Map(SAMPLING_PROFILES.map((entry) => [entry[0], entry]));
  assert.deepEqual(byKey.get("lightx_v1_fl2v_4_pruned"), [
    "lightx_v1_fl2v_4_pruned",
    "LightX v1.0 · FL2VA 4-step 768p · Kijai pruned rank-31",
    "fl2va",
  ]);
  assert.equal(byKey.get("lightx_v1_fl2v_8_pruned")?.[2], "fl2va");
  assert.equal(byKey.get("lightx_v01_ref2v_er_sde_4_pruned")?.[2], "ref2va");
  assert.equal(byKey.get("lightx_v01_ref2v_sa_solver_4_pruned")?.[2], "ref2va");
});

test("frontend rejects LightX adapter route mismatches before queue", () => {
  const fl = defaultState();
  fl.generation.sampling_profile = "lightx_v1_fl2v_8_pruned";
  fl.generation.route = "ref2va";
  assert.match(validateGenerationContract(fl), /FL2V\/FL2VA-only/);

  const ref = withReference(defaultState());
  ref.generation.mode = "reference_edit";
  ref.generation.route = "fl2va";
  ref.generation.sampling_profile = "lightx_v01_ref2v_er_sde_4_pruned";
  assert.match(validateGenerationContract(ref), /REF2V\/REF2VA-only/);
});
