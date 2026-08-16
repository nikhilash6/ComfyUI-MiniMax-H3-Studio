import { app } from "../../scripts/app.js";
import { guidedT2IModeHelp } from "./js/core/reference_ai_cues.js";

const TARGET = "H3StudioDirector";
let observer = null;
let queued = false;

function widget(node, name) {
  return (node?.widgets || []).find((item) => item?.name === name) || null;
}

function studioState(node) {
  if (node?.__h3studioState && typeof node.__h3studioState === "object") {
    return node.__h3studioState;
  }
  const raw = node?.properties?.h3studio_state || widget(node, "studio_state")?.value || "{}";
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function legacyAutoChange(node, reference, index) {
  const changedNow = node.__h3studioAutoChanges?.[index] || null;
  if (changedNow) {
    return {
      analyzed: Boolean(changedNow.analyzed),
      fresh: true,
      role: String(changedNow.role || reference.role || "auto"),
      retention: String(changedNow.retention || reference.retention || "attribute_transfer"),
    };
  }

  // The original green cue was meant to communicate that these settings came
  // from H3 Studio rather than the user. Preserve that cue for every persisted
  // auto-managed field, including the retention-only case where role remains
  // "auto" and for an AI-written factual description.
  const autoManaged = reference.role_auto === true
    || reference.retention_auto === true
    || (reference.description_auto === true && String(reference.description || "").trim());
  const nonDefault = String(reference.role || "auto") !== "auto"
    || String(reference.retention || "attribute_transfer") !== "attribute_transfer"
    || (reference.description_auto === true && String(reference.description || "").trim());
  if (!autoManaged || !nonDefault) return null;

  return {
    analyzed: Boolean(reference.description_auto && String(reference.description || "").trim()),
    fresh: false,
    role: String(reference.role || "auto"),
    retention: String(reference.retention || "attribute_transfer"),
  };
}

function restoreLegacyCue(node, card, index, reference) {
  // Remove the newer split-pill experiment completely. The base Director still
  // owns the exact old h3s-auto-role / h3s-reference-card-auto styling.
  card.querySelector(".h3s-ai-cues")?.remove();
  card.classList.remove("h3s-ai-managed");
  for (const control of card.querySelectorAll(".h3s-ai-selected")) {
    control.classList.remove("h3s-ai-selected");
  }

  const autoChange = legacyAutoChange(node, reference, index);
  card.classList.toggle("h3s-reference-card-auto", Boolean(autoChange));

  let label = card.querySelector(".h3s-auto-role");
  if (!autoChange) {
    label?.remove();
    return;
  }

  if (!label) {
    label = document.createElement("div");
    label.className = "h3s-auto-role";
    const controls = card.querySelector(".h3s-reference-controls");
    if (controls?.parentElement) controls.insertAdjacentElement("afterend", label);
    else card.querySelector(".h3s-reference-body")?.append(label);
  }
  label.hidden = false;
  const prefix = autoChange.analyzed
    ? "Image analyzed"
    : autoChange.fresh ? "Prompt updated" : "Prompt-managed";
  label.textContent = `${prefix} · ${autoChange.role} · ${autoChange.retention}`;
}

function fixModeHelp(root) {
  for (const help of root.querySelectorAll(".h3s-context-help")) {
    const next = guidedT2IModeHelp(help.textContent);
    if (next !== help.textContent) help.textContent = next;
  }
}

function applyNode(node) {
  const root = node?.__h3studioPanel;
  if (!root?.isConnected) return;
  const references = studioState(node)?.references || [];
  const cards = root.querySelectorAll(".h3s-reference-card");
  cards.forEach((card, index) => restoreLegacyCue(node, card, index, references[index] || {}));
  fixModeHelp(root);
}

function sweep() {
  queued = false;
  for (const node of app.graph?._nodes || []) {
    if (node?.comfyClass === TARGET) applyNode(node);
  }
}

function queueSweep() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(sweep);
}

app.registerExtension({
  name: "H3Studio.ReferenceAICuesV35",
  setup() {
    // Clean up the CSS from the short-lived split-pill experiment if a hard
    // refresh has not yet discarded it.
    document.getElementById("h3studio-reference-ai-cues-v35-style")?.remove();
    queueSweep();
    globalThis.addEventListener?.("h3studio:references-changed", queueSweep);
    if (!observer && document.body) {
      observer = new MutationObserver(queueSweep);
      observer.observe(document.body, { childList: true, subtree: true });
    }
  },
});
