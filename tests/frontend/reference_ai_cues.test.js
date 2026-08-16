import assert from "node:assert/strict";
import test from "node:test";

import {
  guidedT2IModeHelp,
  referenceAiCues,
} from "../../web/js/core/reference_ai_cues.js";

test("AI retention-only changes remain visibly attributed", () => {
  const cues = referenceAiCues({
    role: "auto",
    role_auto: true,
    retention: "reference_only",
    retention_auto: true,
    description: "",
    description_auto: true,
  });

  assert.deepEqual(cues, [
    { key: "retention", label: "AI retention · reference_only" },
  ]);
});

test("manual settings do not receive AI badges", () => {
  const cues = referenceAiCues({
    role: "identity",
    role_auto: false,
    retention: "fully_preserved",
    retention_auto: false,
    description: "Manual description",
    description_auto: false,
  });

  assert.deepEqual(cues, []);
});

test("fresh analyzer feedback still shows when values resolve to defaults", () => {
  const cues = referenceAiCues({
    role: "auto",
    role_auto: true,
    retention: "attribute_transfer",
    retention_auto: true,
  }, { role: "auto", retention: "attribute_transfer", analyzed: true });

  assert.deepEqual(cues, [{ key: "updated", label: "AI analyzed" }]);
});

test("T2I mode help no longer claims connected references are ignored", () => {
  const oldText = "Text to image · FL2VA: creates a new image from text. Uploaded references are intentionally ignored.";
  const next = guidedT2IModeHelp(oldText);

  assert.match(next, /real FL2VA visual guides/);
  assert.doesNotMatch(next, /intentionally ignored/);
});
