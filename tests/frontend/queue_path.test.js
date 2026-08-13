import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../web/js/studio_extension.js", import.meta.url), "utf8");

test("queue serialization does not reapply the complete Director UI", () => {
  const body = source.match(/node\.__h3studioBeforeSerialize = function[\s\S]+?\n  };/)?.[0] || "";
  assert.ok(body.includes("STATE_PROPERTY"));
  assert.equal(body.includes("stateFromNode(this)"), false);
  assert.equal(body.includes("serializeState(state)"), false);
  assert.equal(body.includes("applyState("), false);
});

test("queue validation stays synchronous before ComfyUI serializes", () => {
  const body = source.match(/stateWidget\.beforeQueued = function[\s\S]+?\n    };/)?.[0] || "";
  assert.ok(body.includes("validateGenerationContract(state)"));
  assert.equal(body.includes("async function"), false);
  assert.equal(body.includes("await "), false);
});

test("post-queue seed rendering yields before rebuilding the Director", () => {
  const body = source.match(/seedWidget\.afterQueued = function[\s\S]+?\n    };/)?.[0] || "";
  assert.ok(body.includes("setTimeout(() => renderPanel(node), 0)"));
  assert.ok(body.includes('queueTiming(node, "afterQueued")'));
});

test("queue path reports serialization timing and immediate acknowledgement", () => {
  assert.ok(source.includes('queueTiming(this, "serialize.begin")'));
  assert.ok(source.includes('queueTiming(this, "serialize.end"'));
  assert.ok(source.includes('summary: "H3 Studio queued"'));
});
