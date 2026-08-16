import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const faceRefineJs = readFileSync(new URL("../../web/h3studio_face_refine.js", import.meta.url), "utf8");
const studioExtensionJs = readFileSync(new URL("../../web/js/studio_extension.js", import.meta.url), "utf8");

test("Face Refine UI is integrated into Director and exposes the selected-still controls", () => {
  assert.match(faceRefineJs, /export\s*\{[^}]*createFaceRefineSection[^}]*\}/);
  assert.match(studioExtensionJs, /import\s*\{\s*createFaceRefineSection\s*\}\s*from\s*"\.\.\/h3studio_face_refine\.js"/);
  assert.match(studioExtensionJs, /createFaceRefineSection\(node,\s*state/);
  assert.match(faceRefineJs, /h3s-fr/);
  assert.match(faceRefineJs, /selected-still post-process/);
  assert.match(faceRefineJs, /face_refine_mode/);
  assert.match(faceRefineJs, /face_refine_crop_factor/);
  assert.match(faceRefineJs, /face_refine_denoise/);
});

test("Face Refine UI shows detector, mask and before-after telemetry", () => {
  assert.match(faceRefineJs, /h3studio-face-refine/);
  assert.match(faceRefineJs, /Visual inspection/);
  assert.match(faceRefineJs, /Face Refine before and after inspection/);
  assert.match(faceRefineJs, /data\.detector/);
  assert.match(faceRefineJs, /data\.mask/);
  assert.match(faceRefineJs, /data\.selected/);
  assert.match(faceRefineJs, /data\.refined/);
  assert.match(faceRefineJs, /SAM if installed/);
});
