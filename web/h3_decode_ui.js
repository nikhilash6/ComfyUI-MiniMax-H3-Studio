import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_CLASS = "H3StudioDecode";
const SUBGRAPH_CLASS = "5930b00d-9f8e-4b87-9cb5-ff5f7cf3b30a";
const DECODE_NODE_ID = 105;
const PROMOTED_WIDGETS = ["tiling_mode", "tile_size", "tile_overlap", "tile_batch"];
const MODE_VALUES = ["Auto", "Manual"];
const TILE_SIZE_VALUES = [256, 320, 384, 512];
const TILE_OVERLAP_VALUES = [64, 96, 128];
const BATCH_VALUES = ["Auto", "1", "2", "4"];
const PROMOTED_DEFAULTS = ["Auto", 256, 64, "Auto"];
const CONTROL_LABELS = {
    tiling_mode: "Tiling mode",
    tile_size: "Tile size",
    tile_overlap: "Tile overlap",
    tile_batch: "Tile batch",
};
const EVENT = "h3studio.decode_status";

function graphNodeById(value) {
    if (value == null) return null;
    const numeric = Number(value);
    const id = Number.isFinite(numeric) ? numeric : value;
    return app.graph?.getNodeById?.(id) || app.graph?._nodes_by_id?.[id] || null;
}

function nodeClass(node) {
    return String(node?.comfyClass || node?.type || "");
}

function widget(node, name) {
    return (node?.widgets || []).find((candidate) => candidate?.name === name) || null;
}

function setStatus(node, text) {
    const status = node?.__h3NativeDecodeStatus;
    if (!status) return;
    status.value = text;
    node.setDirtyCanvas?.(true, true);
}

function normalizeStringChoice(value, allowed, fallback) {
    const raw = String(value ?? "");
    return allowed.includes(raw) ? raw : fallback;
}

function normalizeNumericChoice(value, allowed, fallback) {
    const numeric = Number(value);
    return allowed.includes(numeric) ? numeric : fallback;
}

function constrainChoiceWidget(node, name, values, fallback, numeric = false) {
    try {
        const target = widget(node, name);
        if (!target) return;
        target.label = CONTROL_LABELS[name] || target.label;
        const next = numeric
            ? normalizeNumericChoice(target.value, values, fallback)
            : normalizeStringChoice(target.value, values, fallback);
        target.value = next;
        if (target._state) target._state.value = next;
        if (target.type !== "combo") target.type = "combo";
        target.options ||= {};
        target.options.values = [...values];
    } catch {
        // ignore safely
    }
}

function sanitizeControlWidgets(node) {
    const kind = nodeClass(node);
    if (kind !== NODE_CLASS && kind !== SUBGRAPH_CLASS) return;
    constrainChoiceWidget(node, "tiling_mode", MODE_VALUES, "Auto");
    constrainChoiceWidget(node, "tile_size", TILE_SIZE_VALUES, 256, true);
    constrainChoiceWidget(node, "tile_overlap", TILE_OVERLAP_VALUES, 64, true);
    constrainChoiceWidget(node, "tile_batch", BATCH_VALUES, "Auto");
}

function idleText(node) {
    const mode = String(widget(node, "tiling_mode")?.value || "Auto");
    const tile = Number(widget(node, "tile_size")?.value || 256);
    const overlap = Number(widget(node, "tile_overlap")?.value || 64);
    const batch = String(widget(node, "tile_batch")?.value || "Auto");
    if (mode === "Auto") {
        return `Native H3 VAE · Auto · compatibility 256/64 · batch ${batch}`;
    }
    return `Native H3 VAE · Manual · tile ${tile} · overlap ${overlap} · batch ${batch}`;
}

function refreshModeUI(node) {
    sanitizeControlWidgets(node);
    const mode = String(widget(node, "tiling_mode")?.value || "Auto");
    const manual = mode === "Manual";
    for (const name of ["tile_size", "tile_overlap"]) {
        const target = widget(node, name);
        if (!target) continue;
        target.disabled = !manual;
        target.options ||= {};
        target.options.disabled = !manual;
    }
    setStatus(node, idleText(node));
    node.setDirtyCanvas?.(true, true);
}

function wrapWidgetCallback(node, name) {
    const target = widget(node, name);
    if (!target || target.__h3DecodeWrapped) return;
    const original = target.callback;
    target.callback = function (...args) {
        const result = original?.apply(this, args);
        refreshModeUI(node);
        return result;
    };
    target.__h3DecodeWrapped = true;
}


function ensureDecodeNodeSize(node) {
    const kind = nodeClass(node);
    const minimumWidth = kind === SUBGRAPH_CLASS ? 700 : 440;
    const minimumHeight = kind === SUBGRAPH_CLASS ? 480 : 260;
    const width = Math.max(Number(node?.size?.[0]) || 0, minimumWidth);
    const height = Math.max(Number(node?.size?.[1]) || 0, minimumHeight);
    if (!Array.isArray(node.size)) node.size = [width, height];
    else {
        node.size[0] = width;
        node.size[1] = height;
    }
}

function sanitizeRuntimeNode(node) {
    const kind = nodeClass(node);
    if (kind !== NODE_CLASS && kind !== SUBGRAPH_CLASS) return;
    ensureDecodeNodeSize(node);
    sanitizeControlWidgets(node);
    for (const name of PROMOTED_WIDGETS) wrapWidgetCallback(node, name);
    refreshModeUI(node);
}

function sanitizeSerializedDecodeValues(node) {
    const kind = String(node?.type || "");
    if (kind !== NODE_CLASS && kind !== SUBGRAPH_CLASS) return;
    const values = Array.isArray(node.widgets_values) ? [...node.widgets_values] : [];
    while (values.length < PROMOTED_DEFAULTS.length) values.push(PROMOTED_DEFAULTS[values.length]);
    values[0] = normalizeStringChoice(values[0], MODE_VALUES, "Auto");
    values[1] = normalizeNumericChoice(values[1], TILE_SIZE_VALUES, 256);
    values[2] = normalizeNumericChoice(values[2], TILE_OVERLAP_VALUES, 64);
    values[3] = normalizeStringChoice(values[3], BATCH_VALUES, "Auto");
    node.widgets_values = values;
}

function mergeProxyWidgets(node) {
    if (!node || String(node.type || "") !== SUBGRAPH_CLASS) return;
    node.properties ||= {};
    const current = Array.isArray(node.properties.proxyWidgets) ? node.properties.proxyWidgets : [];
    for (const name of PROMOTED_WIDGETS) {
        const exists = current.some((entry) => Array.isArray(entry)
            && String(entry[0]) === String(DECODE_NODE_ID)
            && String(entry[1]) === name);
        if (!exists) current.push([String(DECODE_NODE_ID), name]);
    }
    node.properties.proxyWidgets = current;
}

function promoteDecodeControls(graphData) {
    const definitions = graphData?.definitions?.subgraphs;
    if (!Array.isArray(definitions)) return;

    const target = definitions.find((definition) => String(definition?.id || "") === SUBGRAPH_CLASS);
    if (target) {
        const current = Array.isArray(target.widgets) ? target.widgets : [];
        for (const name of PROMOTED_WIDGETS) {
            const exists = current.some((entry) => Number(entry?.id) === DECODE_NODE_ID && String(entry?.name) === name);
            if (!exists) current.push({ id: DECODE_NODE_ID, name });
        }
        target.widgets = current;
    }

    const patchNodes = (nodes) => {
        if (!Array.isArray(nodes)) return;
        for (const node of nodes) {
            sanitizeSerializedDecodeValues(node);
            mergeProxyWidgets(node);
        }
    };

    patchNodes(graphData.nodes);
    for (const definition of definitions) patchNodes(definition?.nodes);
}

function formatProgress(data) {
    const status = String(data.status || "decoding");
    const completed = Number(data.completed || 0);
    const total = Math.max(1, Number(data.total || 1));
    const percent = Number.isFinite(Number(data.percent)) ? Number(data.percent).toFixed(1) : ((completed / total) * 100).toFixed(1);
    const grid = String(data.grid || "?");
    const tile = Number(data.tile_size || 256);
    const overlap = Number(data.overlap || 64);
    const batch = Number(data.batch || 1);
    const elapsed = Number(data.elapsed || 0).toFixed(1);
    if (status === "error") {
        return `VAE Decode · ERROR · ${String(data.error || "decode failed")}`;
    }
    if (status === "done") {
        return `VAE Decode · ${total} / ${total} tiles · 100% · grid ${grid} · tile ${tile}/${overlap} · batch ${batch} · ${elapsed}s`;
    }
    return `VAE Decode · ${completed} / ${total} tiles · ${percent}% · grid ${grid} · tile ${tile}/${overlap} · batch ${batch} · ${elapsed}s`;
}

api.addEventListener(EVENT, (event) => {
    const data = event?.detail || event;
    const node = graphNodeById(data?.node);
    if (!node || nodeClass(node) !== NODE_CLASS) return;
    setStatus(node, formatProgress(data));
});

app.registerExtension({
    name: "H3Studio.NativeH3VAEDecodeUI",

    beforeConfigureGraph(graphData) {
        promoteDecodeControls(graphData);
    },

    nodeCreated(node) {
        queueMicrotask(() => sanitizeRuntimeNode(node));
    },

    loadedGraphNode(node) {
        queueMicrotask(() => sanitizeRuntimeNode(node));
    },

    afterConfigureGraph() {
        for (const node of app.graph?._nodes || []) sanitizeRuntimeNode(node);
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== NODE_CLASS) return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function (...args) {
            const result = originalCreated?.apply(this, args);
            const status = this.addWidget?.("text", "native_decode_status", "Native H3 VAE · ready", () => {}, {
                serialize: false,
            });
            if (status) {
                status.disabled = true;
                status.options ||= {};
                status.options.serialize = false;
                this.__h3NativeDecodeStatus = status;
            }
            sanitizeRuntimeNode(this);
            const minimumWidth = 440;
            const minimumHeight = 260;
            if (Array.isArray(this.size)) {
                this.size[0] = Math.max(Number(this.size[0]) || 0, minimumWidth);
                this.size[1] = Math.max(Number(this.size[1]) || 0, minimumHeight);
            }
            return result;
        };

        const originalConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (...args) {
            const result = originalConfigure?.apply(this, args);
            sanitizeRuntimeNode(this);
            return result;
        };
    },
});