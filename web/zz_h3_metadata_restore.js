import { app } from "../../scripts/app.js";

const TARGET = "H3StudioDirector";
const STATE_PROPERTY = "h3studio_state";

function widget(node, name) {
    return (node?.widgets || []).find((candidate) => candidate?.name === name) || null;
}

function nodeClass(node) {
    return String(node?.comfyClass || node?.type || node?.constructor?.nodeData?.name || "");
}

function stateTextFromInfo(node, info) {
    const candidates = [
        info?.properties?.[STATE_PROPERTY],
        node?.properties?.[STATE_PROPERTY],
        widget(node, "studio_state")?.value,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) return candidate;
        if (candidate && typeof candidate === "object") {
            try {
                return JSON.stringify(candidate);
            } catch {
                // Ignore malformed legacy state and preserve normal Comfy loading.
            }
        }
    }
    return "";
}

function seedFromStateText(stateText) {
    if (!stateText) return null;
    try {
        const decoded = JSON.parse(stateText);
        const seed = Number(decoded?.generation?.seed);
        return Number.isSafeInteger(seed) && seed >= 0 ? seed : null;
    } catch {
        return null;
    }
}

function restoreSavedSeed(node, stateText) {
    if (!node || nodeClass(node) !== TARGET) return;
    const seed = seedFromStateText(stateText);
    if (seed == null) return;

    const seedWidget = widget(node, "seed");
    if (seedWidget) {
        seedWidget.value = seed;
        if (seedWidget._state) seedWidget._state.value = seed;
    }

    const stateWidget = widget(node, "studio_state");
    if (stateWidget && stateText) {
        stateWidget.value = stateText;
        if (stateWidget._state) stateWidget._state.value = stateText;
    }

    node.properties ||= {};
    if (stateText) node.properties[STATE_PROPERTY] = stateText;
    node.setDirtyCanvas?.(true, true);
}

app.registerExtension({
    name: "H3Studio.RestoreExactMetadata",

    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== TARGET || nodeType.prototype.__h3RestoreExactMetadata) return;
        nodeType.prototype.__h3RestoreExactMetadata = true;

        const originalConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function onConfigureH3ExactMetadata(info) {
            // Capture the completed-generation state before other compatibility
            // layers normalize positional widget arrays. Saved H3 PNGs always
            // carry this property even when an older workflow kept a stale
            // native seed widget such as 0, 1, or 42.
            const stateText = stateTextFromInfo(this, info);
            const result = originalConfigure?.apply(this, arguments);
            restoreSavedSeed(this, stateText);
            return result;
        };
    },

    loadedGraphNode(node) {
        if (nodeClass(node) !== TARGET) return;
        queueMicrotask(() => restoreSavedSeed(node, stateTextFromInfo(node, null)));
    },

    afterConfigureGraph() {
        for (const node of app.graph?._nodes || []) {
            if (nodeClass(node) !== TARGET) continue;
            restoreSavedSeed(node, stateTextFromInfo(node, null));
        }
    },
});
