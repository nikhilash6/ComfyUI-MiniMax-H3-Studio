import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { STUDIO_NODE_HEIGHT, STUDIO_NODE_WIDTH } from "../../web/js/core/layout.js";

const workflow = JSON.parse(
  readFileSync(new URL("../../example_workflows/H3_Studio_Unified_Image.json", import.meta.url), "utf8"),
);
const decodeSource = readFileSync(new URL("../../web/h3_decode_ui.js", import.meta.url), "utf8");

function byId(items, id) {
  return items.find((item) => Number(item.id) === Number(id));
}

test("release columns have real gutters instead of overlapping group bounds", () => {
  const groups = [1, 2, 3, 4, 5].map((id) => byId(workflow.groups, id));
  for (let index = 0; index < groups.length - 1; index += 1) {
    const current = groups[index].bounding;
    const next = groups[index + 1].bounding;
    assert.ok(current[0] + current[2] <= next[0], `${groups[index].title} overlaps ${groups[index + 1].title}`);
  }
});

test("sampling wrapper has enough room for promoted native decode controls", () => {
  const wrapper = byId(workflow.nodes, 13);
  assert.ok(wrapper.size[0] >= 700);
  assert.ok(wrapper.size[1] >= 480);
  assert.ok(decodeSource.includes("ensureDecodeNodeSize(node)"));
  assert.ok(decodeSource.includes("kind === SUBGRAPH_CLASS ? 700 : 440"));
  assert.ok(decodeSource.includes("kind === SUBGRAPH_CLASS ? 480 : 260"));
});

test("decode controls use readable labels and the Director has a release-safe minimum", () => {
  assert.ok(decodeSource.includes('tiling_mode: "Tiling mode"'));
  assert.ok(decodeSource.includes('tile_overlap: "Tile overlap"'));
  assert.ok(STUDIO_NODE_WIDTH >= 680);
  assert.ok(STUDIO_NODE_HEIGHT >= 820);
});

test("workflow documentation uses structured markdown and includes decode guidance", () => {
  const noteIds = [20, 21, 22, 24, 25, 26, 27, 28, 29, 31];
  for (const id of noteIds) {
    const note = byId(workflow.nodes, id);
    assert.ok(note, `missing note ${id}`);
    const markdown = String(note.widgets_values?.[1] || "");
    assert.ok(markdown.includes("#"), `note ${id} has no heading`);
    assert.ok(markdown.includes("**"), `note ${id} has no bold emphasis`);
    assert.ok(markdown.includes(">"), `note ${id} has no quote/callout`);
  }
  const decodeNote = byId(workflow.nodes, 31);
  assert.equal(decodeNote.title, "Native H3 VAE decode");
  assert.ok(decodeNote.widgets_values[1].includes("**Start with Auto.**"));
  assert.ok(decodeNote.widgets_values[1].includes("`256 / 64`"));
});
