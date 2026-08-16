import { app } from "../../scripts/app.js";

const TARGET = "H3StudioDirector";
const MAX_SAFE_COMFY_SEED = 1125899906842623; // 2^50 - 1
const STATE_PROPERTY = "h3studio_state";

function clampSeed(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(MAX_SAFE_COMFY_SEED, Math.trunc(numeric)));
}

function widget(node, name) {
  return node.widgets?.find((item) => item?.name === name) || null;
}

function synchronizeVisibleControl(node, seed) {
  const root = node.__h3studioPanel;
  if (!root) return;
  for (const input of root.querySelectorAll('input[aria-label="Seed"], input[title="Seed"]')) {
    input.min = "0";
    input.max = String(MAX_SAFE_COMFY_SEED);
    input.step = "1";
    if (clampSeed(input.value) !== Number(input.value)) input.value = String(seed);
  }
}

function synchronizeSeed(node, { notify = false } = {}) {
  const seedWidget = widget(node, "seed");
  if (!seedWidget) return 0;
  seedWidget.options ||= {};
  seedWidget.options.min = 0;
  seedWidget.options.max = MAX_SAFE_COMFY_SEED;
  seedWidget.options.step = 1;

  const before = Number(seedWidget.value);
  const seed = clampSeed(before);
  seedWidget.value = seed;

  const stateWidget = widget(node, "studio_state");
  const raw = String(node.properties?.[STATE_PROPERTY] || stateWidget?.value || "").trim();
  if (raw) {
    try {
      const state = JSON.parse(raw);
      state.generation ||= {};
      state.generation.seed = seed;
      const serialized = JSON.stringify(state);
      if (stateWidget) stateWidget.value = serialized;
      node.properties ||= {};
      node.properties[STATE_PROPERTY] = serialized;
      if (node.__h3studioState?.generation) node.__h3studioState.generation.seed = seed;
    } catch {
      // The Director's own recovery/validation path owns malformed state handling.
    }
  }
  synchronizeVisibleControl(node, seed);

  if (notify && Number.isFinite(before) && Math.trunc(before) !== seed) {
    app.extensionManager?.toast?.add?.({
      severity: "warning",
      summary: "H3 Studio seed normalized",
      detail: `Seed was clamped to ${seed}. H3 Studio keeps seeds below 2^50 so ComfyUI cannot collapse different values to the same ceiling.`,
      life: 5500,
    });
  }
  return seed;
}

function install(node) {
  if (!node || node.__h3studioSeedSafetyV36) return;
  node.__h3studioSeedSafetyV36 = true;
  const seedWidget = widget(node, "seed");
  if (!seedWidget) {
    queueMicrotask(() => {
      node.__h3studioSeedSafetyV36 = false;
      install(node);
    });
    return;
  }

  synchronizeSeed(node, { notify: true });

  if (!seedWidget.__h3studioSafeBeforeQueued) {
    seedWidget.__h3studioSafeBeforeQueued = true;
    const original = seedWidget.beforeQueued;
    seedWidget.beforeQueued = function h3studioSafeSeedBeforeQueued() {
      const seed = synchronizeSeed(node, { notify: true });
      console.info(`[H3 Studio] Queueing exact seed=${seed}`);
      return original?.apply(this, arguments);
    };
  }

  const panel = node.__h3studioPanel;
  if (panel && !node.__h3studioSeedObserver) {
    const observer = new MutationObserver(() => synchronizeVisibleControl(node, clampSeed(seedWidget.value)));
    observer.observe(panel, { childList: true, subtree: true });
    node.__h3studioSeedObserver = observer;
    panel.addEventListener("change", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.getAttribute("aria-label") !== "Seed") return;
      const clamped = clampSeed(input.value);
      if (Number(input.value) !== clamped) {
        input.value = String(clamped);
        seedWidget.value = clamped;
        synchronizeSeed(node, { notify: true });
      }
    }, true);
  }
}

app.registerExtension({
  name: "H3Studio.SeedSafetyV36",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== TARGET) return;
    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function h3studioSeedSafetyCreated() {
      const result = created?.apply(this, arguments);
      queueMicrotask(() => install(this));
      return result;
    };
    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function h3studioSeedSafetyConfigured() {
      const result = configured?.apply(this, arguments);
      queueMicrotask(() => install(this));
      return result;
    };
  },
});

export { MAX_SAFE_COMFY_SEED, clampSeed, synchronizeSeed };
