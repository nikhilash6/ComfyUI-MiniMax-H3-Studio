import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const faceRefineJs = readFileSync(new URL("../../web/h3studio_face_refine.js", import.meta.url), "utf8");
const studioExtensionJs = readFileSync(new URL("../../web/js/studio_extension.js", import.meta.url), "utf8");

test("Face Refine UI provides createFaceRefineSection exported and integrated in studio_extension.js", () => {
  assert.match(faceRefineJs, /export\s*\{\s*createFaceRefineSection\s*\}/);
  assert.match(studioExtensionJs, /import\s*\{\s*createFaceRefineSection\s*\}\s*from\s*"\.\.\/h3studio_face_refine\.js"/);
  assert.match(studioExtensionJs, /createFaceRefineSection\(node,\s*state/);
  assert.match(faceRefineJs, /h3s-face-refine-panel/);
  assert.match(faceRefineJs, /face_refine_mode/);
  assert.match(faceRefineJs, /face_refine_crop_factor/);
  assert.match(faceRefineJs, /face_refine_denoise/);
});
