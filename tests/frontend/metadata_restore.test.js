import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../web/zz_h3_metadata_restore.js", import.meta.url), "utf8");

test("saved H3 state wins over stale native seed widgets on workflow load", () => {
    assert.ok(source.includes('const STATE_PROPERTY = "h3studio_state"'));
    assert.ok(source.includes("decoded?.generation?.seed"));
    assert.ok(source.includes('widget(node, "seed")'));
    assert.ok(source.includes("restoreSavedSeed(this, stateText)"));
});

test("metadata restore runs for reloaded workflows as well as direct configure", () => {
    assert.ok(source.includes("loadedGraphNode(node)"));
    assert.ok(source.includes("afterConfigureGraph()"));
    assert.ok(source.includes("queueMicrotask"));
});
