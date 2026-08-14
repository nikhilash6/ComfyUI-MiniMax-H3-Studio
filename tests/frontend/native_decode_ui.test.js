import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../../web/h3_decode_ui.js", import.meta.url), "utf8");

test("native H3 decode UI listens for real tile progress", () => {
    assert.ok(source.includes('const EVENT = "h3studio.decode_status"'));
    assert.ok(source.includes("completed"));
    assert.ok(source.includes("total"));
    assert.ok(source.includes("tile_size"));
    assert.ok(source.includes("batch"));
    assert.ok(source.includes("elapsed"));
});

test("auto decode UI keeps compatibility geometry visible", () => {
    assert.ok(source.includes("compatibility 256/64"));
    assert.ok(source.includes('["tiling_mode", "tile_size", "tile_overlap", "tile_batch"]'));
    assert.ok(source.includes("target.disabled = !manual"));
});

test("decode status widget is transient and not serialized", () => {
    assert.ok(source.includes('"native_decode_status"'));
    assert.ok(source.includes("serialize: false"));
    assert.ok(source.includes("status.options.serialize = false"));
});

test("native decode controls are promoted onto the outer sampling subgraph", () => {
    assert.ok(source.includes("beforeConfigureGraph(graphData)"));
    assert.ok(source.includes("promoteDecodeControls(graphData)"));
    assert.ok(source.includes("proxyWidgets"));
    assert.ok(source.includes("DECODE_NODE_ID = 105"));
    assert.ok(source.includes('const SUBGRAPH_CLASS = "5930b00d-9f8e-4b87-9cb5-ff5f7cf3b30a"'));
});