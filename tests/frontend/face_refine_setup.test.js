import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../web/h3studio_face_setup.js", import.meta.url), "utf8");

test("Face Refine setup installs the recommended YOLO model into the Impact bbox folder", () => {
  assert.match(source, /face_yolov8m\.pt/);
  assert.match(source, /Bingsu\/adetailer/);
  assert.match(source, /destination:\s*"ultralytics\/bbox"/);
  assert.match(source, /Install YOLO model/);
  assert.match(source, /ComfyUI-Impact-Subpack\.git/);
});

test("SAM is explicitly optional and uses Meta's official checkpoint", () => {
  assert.match(source, /sam_vit_b_01ec64\.pth/);
  assert.match(source, /dl\.fbaipublicfiles\.com\/segment_anything/);
  assert.match(source, /destination:\s*"sams"/);
  assert.match(source, /SAM is optional/);
  assert.match(source, /Install SAM model · optional/);
  assert.match(source, /ComfyUI-Impact-Pack\.git/);
});

test("Face Refine setup delegates model writes to UAD and verifies installed assets", () => {
  assert.match(source, /\/uad\/verify-fast/);
  assert.match(source, /\/uad\/install/);
  assert.match(source, /UAD is required for one-click model installs/);
});
