import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../web/js/studio_extension.js", import.meta.url), "utf8");

test("queue serialization does not reapply the complete Director UI", () => {
  const body = source.match(/node\.__h3studioBeforeSerialize = function[\s\S]+?\n  };/)?.[0] || "";
  assert.ok(body.includes("stateFromNode(this)"));
  assert.ok(body.includes("serializeState(state)"));
  assert.equal(body.includes("applyState("), false);
});

test("post-queue seed rendering yields before rebuilding the Director", () => {
  const body = source.match(/seedWidget\.afterQueued = function[\s\S]+?\n    };/)?.[0] || "";
  assert.ok(body.includes("setTimeout(() => renderPanel(node), 0)"));
});
