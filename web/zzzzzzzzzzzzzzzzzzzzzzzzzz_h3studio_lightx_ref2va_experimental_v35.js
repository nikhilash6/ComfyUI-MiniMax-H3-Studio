import { app } from "../../scripts/app.js";
import {
  missingReferenceOrdinals,
  normalizeState,
  validateGenerationContract,
} from "./js/core/state.js";

const TARGET = "H3StudioDirector";
const STATE_PROPERTY = "h3studio_state";
const WARNING = "Experimental LightX cross-route: this FL2V/FL2VA adapter is being used with REF2VA reference mixing. This unofficial combination is allowed, but reference adherence, fine detail, hands, and overall stability may be less consistent than with a dedicated REF2VA adapter.";
const LEGACY_BLOCKERS = new Set([
  "The selected LightX profile is FL2V/FL2VA-only and cannot run on a forced REF2VA route.",
  "The selected LightX profile uses an FL2V adapter. Use text-to-image or a single-source FL2VA edit, or choose a REF2VA profile for reference mixing.",
]);

function widget(node, name) {
  return node?.widgets?.find((candidate) => candidate?.name === name) || null;
}

function stateFromNode(node) {
  const stateWidget = widget(node, "studio_state");
  const candidates = [stateWidget?.value, node?.properties?.[STATE_PROPERTY]];
  for (const candidate of candidates) {
    if (candidate == null || String(candidate).trim() === "") continue;
    try {
      return normalizeState(typeof candidate === "string" ? JSON.parse(candidate) : candidate);
    } catch {
      // Let the canonical Studio recovery path report corrupt state.
    }
  }
  return normalizeState({});
}

function isExperimentalLightxBlock(message) {
  return LEGACY_BLOCKERS.has(String(message || "").trim());
}

function relabelWarning(node) {
  const root = node?.__h3studioPanel;
  if (!root) return;
  for (const element of root.querySelectorAll?.(".h3s-validation-error") || []) {
    if (!isExperimentalLightxBlock(element.textContent)) continue;
    element.classList.remove("h3s-validation-error");
    element.classList.add("h3s-validation-notice");
    element.textContent = WARNING;
    element.setAttribute("role", "status");
    element.setAttribute("aria-live", "polite");
  }
}

function installQueueOverride(node) {
  if (!node || node.comfyClass !== TARGET) return;
  const stateWidget = widget(node, "studio_state");
  if (!stateWidget || stateWidget.__h3studioLightxRef2vaWarningV35) return;

  const originalBeforeQueued = stateWidget.beforeQueued;
  stateWidget.__h3studioLightxRef2vaWarningV35 = true;
  stateWidget.beforeQueued = function h3studioLightxRef2vaExperimentalBeforeQueued() {
    const state = stateFromNode(node);
    const missing = missingReferenceOrdinals(state);
    if (!missing.length) {
      const message = validateGenerationContract(state);
      if (isExperimentalLightxBlock(message)) {
        app.extensionManager?.toast?.add?.({
          severity: "warn",
          summary: "H3 Studio experimental LightX route",
          detail: WARNING,
          life: 7000,
        });
        // Intentionally skip the older blocking wrapper for this one known
        // experimental combination. Backend validation independently allows it.
        return undefined;
      }
    }
    return originalBeforeQueued?.apply(this, arguments);
  };
}

function patchNode(node) {
  if (!node || node.comfyClass !== TARGET) return;
  installQueueOverride(node);
  relabelWarning(node);
}

function patchAll() {
  for (const node of app.graph?._nodes || []) patchNode(node);
}

function schedulePatch(node) {
  queueMicrotask(() => patchNode(node));
  requestAnimationFrame(() => patchNode(node));
}

app.registerExtension({
  name: "H3Studio.ExperimentalLightxRef2vaV35",

  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TARGET) return;

    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function h3studioLightxRef2vaCreated() {
      const result = created?.apply(this, arguments);
      schedulePatch(this);
      return result;
    };

    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function h3studioLightxRef2vaConfigured() {
      const result = configured?.apply(this, arguments);
      schedulePatch(this);
      return result;
    };
  },

  setup() {
    const observer = new MutationObserver(() => queueMicrotask(patchAll));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    queueMicrotask(patchAll);
  },
});
