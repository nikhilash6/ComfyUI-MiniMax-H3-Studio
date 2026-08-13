import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { forEachQueueNode } from "../../web/js/core/queue_graph.js";

const source = readFileSync(new URL("../../web/js/studio_extension.js", import.meta.url), "utf8");
const richEditorSource = readFileSync(new URL("../../web/h3studio_ui.js", import.meta.url), "utf8");

test("image-only Studio never starts hidden video decoders", () => {
  const body = richEditorSource.match(/function sourcePreviewUrl[\s\S]+?\n}/)?.[0] || "";
  assert.ok(body.includes('if (mediaType === "video") return ""'));
  assert.equal(body.includes("getVideoFrameThumbnail("), false);
});

test("legacy non-image virtual links are pruned instead of watched", () => {
  const normalizeBody = richEditorSource.match(/function normalizeLinks[\s\S]+?\n}/)?.[0] || "";
  const installBody = richEditorSource.match(/function installMediaSourceNode[\s\S]+?\n}/)?.[0] || "";
  assert.ok(normalizeBody.includes('mediaType !== "image"'));
  assert.equal(installBody.includes('name.includes("loadvideo")'), false);
  assert.equal(installBody.includes('name.includes("loadaudio")'), false);
  assert.ok(richEditorSource.includes('const allowed = ["image"]'));
});

test("queue serialization performs no custom Director pre-pass", () => {
  assert.equal(source.includes("node.__h3studioBeforeSerialize"), false);
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
});

test("H3 Studio leaves Run submission entirely to native ComfyUI", () => {
  assert.equal(source.includes("Run received. Preparing one prompt for ComfyUI."), false);
  assert.equal(source.includes('summary: "H3 Studio submitting"'), false);
  assert.equal(source.includes('summary: "H3 Studio is submitting"'), false);
  assert.equal(source.includes('summary: "H3 Studio queued"'), false);
  assert.equal(source.includes("Prompt submitted to ComfyUI."), false);
  assert.equal(source.includes("app.queuePrompt ="), false);
  assert.equal(source.includes("app.graphToPrompt ="), false);
  assert.equal(source.includes("api.fetchApi ="), false);
  assert.equal(source.includes("activeQueueSubmission"), false);
  assert.equal(source.includes("queueTiming("), false);
});

test("queue graph traversal terminates when subgraphs refer back to an ancestor", () => {
  const root = { _nodes: [], subgraphs: new Map() };
  const child = { _nodes: [], subgraphs: new Map() };
  const rootNode = { subgraph: child };
  const childNode = { subgraph: root };
  root._nodes.push(rootNode);
  child._nodes.push(childNode);
  root.subgraphs.set("child", child);
  child.subgraphs.set("root", root);

  const visited = [];
  forEachQueueNode(root, (node) => visited.push(node));

  assert.deepEqual(visited, [rootNode, childNode]);
});

test("graph-to-prompt does not rewalk the synchronized rich-editor DOM", () => {
  const body = richEditorSource.match(/app\.graphToPrompt = async function graphToPromptWithOrderedMedia[\s\S]+?return promptData;\r?\n    };/)?.[0] || "";
  assert.ok(body.includes("buildRuntimePrompt(node, runtimeLinks)"));
  assert.equal(body.includes("syncPromptFromEditor(node"), false);
});
