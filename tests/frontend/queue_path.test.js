import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../web/js/studio_extension.js", import.meta.url), "utf8");
const richEditorSource = readFileSync(new URL("../../web/h3studio_ui.js", import.meta.url), "utf8");

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
  assert.ok(source.includes('summary: "H3 Studio submitting"'));
  assert.ok(source.includes('queueStage("command.received"'));
  assert.ok(source.includes('queueStage("workflow_serialize.begin")'));
  assert.ok(source.includes('queueStage("graph_to_prompt.begin")'));
  assert.ok(source.includes('queueStage("fetch.invoked")'));
});

test("rapid Run clicks are coalesced before ComfyUI can append duplicate queue items", () => {
  const body = source.match(/app\.queuePrompt = function h3studioQueuePrompt[\s\S]+?\n  };/)?.[0] || "";
  assert.ok(body.includes("if (activeQueueSubmission)"));
  assert.ok(body.includes('queueStage("command.coalesced"'));
  assert.ok(body.includes("return Promise.resolve(false)"));
});

test("single local-model prompts on Lightning bypass the unrelated cloud auth wait", () => {
  assert.ok(source.includes('host.endsWith(".cloudspaces.litng.ai")'));
  assert.ok(source.includes("!hasCloudApiNode()"));
  assert.ok(source.includes('queueStage("native_auth.bypassed"'));
  assert.ok(source.includes("result = submitLightningPrompt(number)"));
  assert.ok(source.includes('executeQueueCallbacks("beforeQueued", false)'));
  assert.ok(source.includes('executeQueueCallbacks("afterQueued", false)'));
});

test("graph-to-prompt does not rewalk the synchronized rich-editor DOM", () => {
  const body = richEditorSource.match(/app\.graphToPrompt = async function graphToPromptWithOrderedMedia[\s\S]+?return promptData;\r?\n    };/)?.[0] || "";
  assert.ok(body.includes("buildRuntimePrompt(node, runtimeLinks)"));
  assert.equal(body.includes("syncPromptFromEditor(node"), false);
});
