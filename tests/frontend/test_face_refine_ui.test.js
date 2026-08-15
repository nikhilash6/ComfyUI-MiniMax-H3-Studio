import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const faceRefineJs = readFileSync(new URL("../../web/h3studio_face_refine.js", import.meta.url), "utf8");

test("Face Refine UI defines robust mounting, observer lifecycle and visual controls", () => {
  assert.match(faceRefineJs, /function buildFaceRefineSection/);
  assert.match(faceRefineJs, /function installFaceRefineSection/);
  assert.match(faceRefineJs, /function watchDirector/);
  assert.match(faceRefineJs, /MutationObserver/);
  assert.match(faceRefineJs, /h3s-face-refine-section/);
  assert.match(faceRefineJs, /face_refine_mode/);
  assert.match(faceRefineJs, /face_refine_crop_factor/);
  assert.match(faceRefineJs, /face_refine_denoise/);
});
