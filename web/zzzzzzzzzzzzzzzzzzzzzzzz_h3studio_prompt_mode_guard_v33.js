import { app } from "../../scripts/app.js";

const TARGET = "H3StudioDirector";
const STATE_PROPERTY = "h3studio_state";

function widget(node, name) {
  return node?.widgets?.find((candidate) => candidate?.name === name) || null;
}

function repairedState(value) {
  if (!value) return null;
  let state;
  try {
    state = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
  if (!state || typeof state !== "object") return null;
  const options = state.prompt_options;
  if (!options || typeof options !== "object") return null;
  if (String(options.enhance_mode || "") !== "off" || options.deep_enhancement !== true) return null;
  return {
    ...state,
    prompt_options: {
      ...options,
      deep_enhancement: false,
    },
  };
}

function repairNode(node) {
  if (!node || node.comfyClass !== TARGET) return false;
  let changed = false;
  const stateWidget = widget(node, "studio_state");
  const candidates = [stateWidget?.value, node.properties?.[STATE_PROPERTY]];
  let repaired = null;
  for (const candidate of candidates) {
    repaired = repairedState(candidate);
    if (repaired) break;
  }
  if (!repaired) {
    const live = node.__h3studioState;
    if (
      live?.prompt_options
      && String(live.prompt_options.enhance_mode || "") === "off"
      && live.prompt_options.deep_enhancement === true
    ) {
      live.prompt_options = { ...live.prompt_options, deep_enhancement: false };
      changed = true;
    }
  } else {
    const serialized = JSON.stringify(repaired);
    if (stateWidget && stateWidget.value !== serialized) {
      stateWidget.value = serialized;
      changed = true;
    }
    node.properties ||= {};
    if (node.properties[STATE_PROPERTY] !== serialized) {
      node.properties[STATE_PROPERTY] = serialized;
      changed = true;
    }
    if (node.__h3studioState?.prompt_options) {
      node.__h3studioState.prompt_options = {
        ...node.__h3studioState.prompt_options,
        deep_enhancement: false,
      };
    }
  }

  if (changed) {
    const toggle = node.__h3studioPanel?.querySelector?.(
      'input[aria-label="Enhance the prompt with the selected Qwen3-VL writer"]',
    );
    if (toggle) {
      toggle.checked = false;
      toggle.disabled = true;
    }
    node.setDirtyCanvas?.(true, true);
  }
  return changed;
}

function repairAll() {
  for (const node of app.graph?._nodes || []) repairNode(node);
}

app.registerExtension({
  name: "H3Studio.KeepPromptGuardV33",

  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TARGET) return;

    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function h3studioKeepPromptCreated() {
      const result = created?.apply(this, arguments);
      queueMicrotask(() => repairNode(this));
      return result;
    };

    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function h3studioKeepPromptConfigure() {
      const result = configured?.apply(this, arguments);
      queueMicrotask(() => repairNode(this));
      return result;
    };

    const serialized = nodeType.prototype.onSerialize;
    nodeType.prototype.onSerialize = function h3studioKeepPromptSerialize() {
      repairNode(this);
      return serialized?.apply(this, arguments);
    };
  },

  setup() {
    // The Director UI writes its full state synchronously from select/toggle
    // handlers. Repair immediately after any such interaction so choosing
    // "Keep my prompt" also clears a stale deep-enhancement bit in the saved
    // workflow instead of relying only on the backend safety guard.
    document.addEventListener("change", () => queueMicrotask(repairAll), true);
    queueMicrotask(repairAll);
  },
});
