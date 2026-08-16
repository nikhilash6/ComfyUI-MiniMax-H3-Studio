import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

import { applyState, stateFromNode } from "./js/studio_extension.js";
import { isNodeDownstream } from "./js/core/final_output.js";
import {
  capNativeForTarget,
  formatMegapixels,
  planResolution,
  resolutionTier,
} from "./js/core/state.js";

const DIRECTOR = "H3StudioDirector";
const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-ui-hotfix-v10-style";
const TIMINGS = new Map();
let activePromptId = "";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Compact stable chevron. */
    .h3s-choice-chevron{position:relative!important;width:12px!important;height:12px!important;flex:0 0 12px!important;font-size:0!important;color:#89929b!important;transform:none!important}
    .h3s-choice-chevron::before{content:'';position:absolute;left:3px;top:2px;width:5px;height:5px;border-right:1.4px solid currentColor;border-bottom:1.4px solid currentColor;transform:rotate(45deg);transition:transform .12s ease,top .12s ease}
    .h3s-choice.is-open .h3s-choice-chevron::before{top:5px;transform:rotate(225deg)}

    /* Reveal genuinely truncated select text on hover/focus. */
    .h3s-choice-current,.h3s-choice-option{overflow:hidden!important}
    .h3s-choice-value,.h3s-choice-option-label{display:block!important;flex:1 1 auto!important;min-width:0!important;max-width:100%!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;transform:translateX(0)}
    .h3s-choice-value.is-h3-marquee,.h3s-choice-option-label.is-h3-marquee{overflow:visible!important;text-overflow:clip!important}
    .h3s-choice-trigger:hover .is-h3-marquee,.h3s-choice-trigger:focus-visible .is-h3-marquee,.h3s-choice-option:hover .is-h3-marquee,.h3s-choice-option:focus-visible .is-h3-marquee{animation:h3sTextReveal var(--h3s-marquee-duration,4s) ease-in-out .35s infinite}
    @keyframes h3sTextReveal{0%,12%,100%{transform:translateX(0)}45%,67%{transform:translateX(var(--h3s-marquee-shift,0px))}}

    /* The DOM widget is sized by ComfyUI; content only fills that box. */
    .h3s-studio-panel,.h3b7{width:100%!important;max-width:100%!important;height:100%!important;max-height:100%!important;min-width:0!important;min-height:0!important;box-sizing:border-box!important;overflow:hidden!important}
    .h3s-v6-layout{height:calc(100% - 46px)!important;min-height:0!important;overflow:hidden!important}
    .h3s-v6-main,.h3s-v6-inspector{height:100%!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scrollbar-gutter:stable!important}
    .h3s-v6-main::-webkit-scrollbar,.h3s-v6-inspector::-webkit-scrollbar,.h3b7::-webkit-scrollbar{width:7px}
    .h3s-v6-main::-webkit-scrollbar-thumb,.h3s-v6-inspector::-webkit-scrollbar-thumb,.h3b7::-webkit-scrollbar-thumb{background:#414850;border:2px solid transparent;background-clip:padding-box;border-radius:999px}
    .h3b7{overflow-y:auto!important;overscroll-behavior:contain!important}
    .h3b7-body,.h3b7-fields,.h3b7-toolbar,.h3b7-list,.h3b7-scenario{max-width:100%!important;min-width:0!important}

    /* Custom aspect stays inside the inspector and scrolls with it. */
    .h3s-custom-aspect-editor{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:end;gap:5px;margin-top:5px;padding:6px;border:1px solid #2c3238;border-radius:6px;background:#15191c;max-width:100%;overflow:hidden}
    .h3s-custom-aspect-box{display:flex;flex-direction:column;gap:3px;min-width:0}.h3s-custom-aspect-box span{color:#838c95;font-size:8px;font-weight:650}.h3s-custom-aspect-editor input{display:block;width:100%;min-width:0;height:27px;border:1px solid #333a41;border-radius:5px;background:#191d21;color:#edf0f2;padding:3px 6px;font:9px/1.2 Inter,system-ui}.h3s-custom-aspect-x{align-self:center;color:#68717a;font-size:9px}

    /* Native range feedback is immediate; state commits only on release/change. */
    .h3s-megapixel-control .h3s-range-track::before,.h3s-megapixel-control .h3s-range-thumb{transition:none!important;will-change:width,left!important}

    .h3s-run-stats{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:7px 9px;border-top:1px solid #24292e;color:#7f8891;font-size:8.5px;font-variant-numeric:tabular-nums;background:#121518}
    .h3s-run-stats strong{color:#dce2e6;font-size:9px;font-weight:700}.h3s-run-dot{width:3px;height:3px;border-radius:50%;background:#535b63}

    @media(prefers-reduced-motion:reduce){.h3s-choice-trigger:hover .is-h3-marquee,.h3s-choice-trigger:focus-visible .is-h3-marquee,.h3s-choice-option:hover .is-h3-marquee,.h3s-choice-option:focus-visible .is-h3-marquee{animation:none!important}}
  `;
  document.head.append(style);
}

function widget(node, name) {
  return (node?.widgets || []).find((item) => item?.name === name) || null;
}

function releaseLegacyGeometry(target, minHeight, maxHeight) {
  if (!target) return;
  // ComfyUI's current DOMWidget layout uses computeLayoutSize() and its
  // getMinHeight/getMaxHeight contract. Old H3 layers forced computeSize and
  // computedHeight manually, which prevented LiteGraph from reallocating height.
  try { delete target.computeSize; } catch { target.computeSize = undefined; }
  target.computedHeight = undefined;
  target.options ||= {};
  target.options.getMinHeight = () => minHeight;
  target.options.getMaxHeight = () => maxHeight;
}

function constrainRoot(root) {
  if (!root) return;
  root.style.setProperty("width", "100%", "important");
  root.style.setProperty("max-width", "100%", "important");
  root.style.setProperty("height", "100%", "important");
  root.style.setProperty("max-height", "100%", "important");
  root.style.setProperty("min-width", "0", "important");
  root.style.setProperty("min-height", "0", "important");
  root.style.setProperty("overflow", "hidden", "important");
  const parent = root.parentElement;
  if (parent) {
    parent.style.setProperty("max-width", "100%", "important");
    parent.style.setProperty("max-height", "100%", "important");
    parent.style.setProperty("min-width", "0", "important");
    parent.style.setProperty("min-height", "0", "important");
    parent.style.setProperty("overflow", "hidden", "important");
  }
}

function forceLayout(node) {
  if (!node?.graph || !Array.isArray(node.size)) return;
  // Trigger the upstream LiteGraph arrangement once without changing the user's
  // chosen size. Do not auto-fit or clamp after this point.
  const size = [Number(node.size[0]), Number(node.size[1])];
  requestAnimationFrame(() => {
    if (!node.graph) return;
    node.setSize?.(size);
    node.setDirtyCanvas?.(true, true);
  });
}

function markMarquee(label) {
  if (!label?.isConnected) return;
  label.classList.remove("is-h3-marquee");
  label.style.removeProperty("--h3s-marquee-shift");
  label.style.removeProperty("--h3s-marquee-duration");
  requestAnimationFrame(() => {
    if (!label?.isConnected) return;
    const overflow = Math.ceil(label.scrollWidth - label.clientWidth);
    if (overflow <= 4) return;
    label.classList.add("is-h3-marquee");
    label.style.setProperty("--h3s-marquee-shift", `${-overflow}px`);
    label.style.setProperty("--h3s-marquee-duration", `${Math.min(7, Math.max(3.4, 3.2 + overflow / 38)).toFixed(2)}s`);
  });
}

function markChoice(choice) {
  const label = choice?.querySelector?.(".h3s-choice-value,.h3s-choice-option-label");
  if (label) markMarquee(label);
}

document.addEventListener("pointerover", (event) => {
  const choice = event.target?.closest?.(".h3s-choice-trigger,.h3s-choice-option");
  if (choice) markChoice(choice);
}, true);
document.addEventListener("focusin", (event) => {
  const choice = event.target?.closest?.(".h3s-choice-trigger,.h3s-choice-option");
  if (choice) markChoice(choice);
}, true);

function customAspectEditor(node) {
  const root = node?.__h3studioPanel;
  if (!root) return;
  const state = stateFromNode(node);
  const aspectField = Array.from(root.querySelectorAll(".h3s-field")).find(
    (field) => String(field.querySelector(".h3s-field-label")?.textContent || "").trim() === "Aspect",
  );
  if (!aspectField) return;
  aspectField.querySelector(":scope > .h3s-custom-aspect-editor")?.remove();
  if (state.generation.aspect_ratio !== "custom") return;

  const editor = document.createElement("div");
  editor.className = "h3s-custom-aspect-editor";
  const make = (labelText, value, key) => {
    const box = document.createElement("label"); box.className = "h3s-custom-aspect-box";
    const label = document.createElement("span"); label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "number"; input.min = "32"; input.max = "16384"; input.step = "32"; input.value = String(value);
    input.addEventListener("change", () => {
      const current = stateFromNode(node);
      current.generation.aspect_ratio = "custom";
      current.generation[key] = Math.max(32, Math.min(16384, Math.round((Number(input.value) || 1024) / 32) * 32));
      applyState(node, current);
      node.__h3studioConfigured?.();
    });
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") input.blur(); });
    box.append(label, input); return box;
  };
  const cross = document.createElement("span"); cross.className = "h3s-custom-aspect-x"; cross.textContent = "×";
  editor.append(make("Width", state.generation.custom_width, "custom_width"), cross, make("Height", state.generation.custom_height, "custom_height"));
  aspectField.append(editor);
}

function previewMegapixels(node, input) {
  const control = input.closest(".h3s-megapixel-control");
  const range = input.closest(".h3s-range");
  if (!control || !range) return;
  const min = Number(input.min) || 0.2;
  const max = Number(input.max) || 8.5;
  const value = Math.max(min, Math.min(max, Number(input.value) || min));
  range.style.setProperty("--h3s-range-progress", `${((value - min) / (max - min)) * 100}%`);

  const state = stateFromNode(node);
  const cap = capNativeForTarget(value, state.generation.cap_native_resolution);
  const plan = planResolution(state.generation.aspect_ratio, value, state.generation.custom_width, state.generation.custom_height, cap);
  const tier = resolutionTier(value, cap);
  const output = control.querySelector(".h3s-megapixel-value");
  const strong = node.__h3studioPanel?.querySelector(".h3s-resolution-result strong");
  const detail = node.__h3studioPanel?.querySelector(".h3s-resolution-result span");
  const badge = node.__h3studioPanel?.querySelector(".h3s-resolution-tier");
  const note = node.__h3studioPanel?.querySelector(".h3s-resolution-note");
  if (output) output.textContent = formatMegapixels(value);
  if (strong) strong.textContent = `${plan.width} × ${plan.height}`;
  if (detail) detail.textContent = `${plan.actualMegapixels.toFixed(2)} MP actual · ${plan.capped ? "conservative" : "direct"}`;
  if (badge) { badge.className = `h3s-resolution-tier is-${tier.key}`; badge.textContent = tier.label; }
  if (note) note.textContent = tier.note;
  range.dataset.tier = tier.key;
}

function bindSmoothMegapixel(node) {
  const oldInput = node?.__h3studioPanel?.querySelector(".h3s-megapixel-control .h3s-range-native");
  if (!oldInput || oldInput.dataset.h3NativeSmooth === "1") return;
  const input = oldInput.cloneNode(true);
  input.dataset.h3NativeSmooth = "1";
  input.dataset.h3LiveBound = "1";
  oldInput.replaceWith(input);
  const live = () => previewMegapixels(node, input);
  const commit = () => {
    const state = stateFromNode(node);
    const value = Math.max(Number(input.min) || 0.2, Math.min(Number(input.max) || 8.5, Number(input.value) || 1));
    state.generation.megapixels = value;
    state.generation.cap_native_resolution = capNativeForTarget(value, state.generation.cap_native_resolution);
    applyState(node, state);
    node.__h3studioConfigured?.();
  };
  input.addEventListener("input", live, { passive: true });
  input.addEventListener("change", commit);
  live();
}

function promptId(detail) {
  return String(detail?.prompt_id || detail?.promptId || activePromptId || "");
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const seconds = ms / 1000;
  return seconds < 10 ? `${seconds.toFixed(2)}s` : `${seconds.toFixed(1)}s`;
}

function injectRunStats(node) {
  const result = node?.__h3studioPanel?.querySelector(".h3s-final-result");
  if (!result) return;
  result.querySelector(":scope > .h3s-run-stats")?.remove();
  const timing = node.__h3studioRunTiming;
  if (!timing?.totalMs) return;
  const row = document.createElement("div"); row.className = "h3s-run-stats";
  const total = document.createElement("strong"); total.textContent = `Generated in ${formatDuration(timing.totalMs)}`; row.append(total);
  if (Number.isFinite(timing.samplingMs) && timing.samplingMs > 0) {
    const dot = document.createElement("span"); dot.className = "h3s-run-dot";
    const sampling = document.createElement("span"); sampling.textContent = `Sampling ${formatDuration(timing.samplingMs)}`;
    row.append(dot, sampling);
  }
  result.append(row);
}

function decorateDirector(node) {
  return;
  constrainRoot(node?.__h3studioPanel);
  customAspectEditor(node);
  bindSmoothMegapixel(node);
  injectRunStats(node);
}

function attachDirector(node) {
  if (node?.__h3studioPanel || true) return;
  if (node?.__h3studioPanel || true) return;
  if (!node || node.comfyClass !== DIRECTOR) return;
  node.resizable = true;
  const root = node.__h3studioPanel;
  const domWidget = widget(node, "h3studio_controls");
  if (!root || !domWidget) return;
  node.__h3studioPanel?.__h3InteractionObserver?.disconnect?.();
  node.__h3studioPanel?.__h3studioV9Observer?.disconnect?.();
  releaseLegacyGeometry(domWidget, 300, 1400);
  constrainRoot(root);
  domWidget.options.afterResize = () => decorateDirector(node);
  decorateDirector(node);
  if (!root.__h3GeometryObserver) {
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; decorateDirector(node); });
    });
    observer.observe(root, { childList: true, subtree: true });
    root.__h3GeometryObserver = observer;
  }
  if (!node.__h3ComfyGeometryReleased) {
    node.__h3ComfyGeometryReleased = true;
    forceLayout(node);
  }
}

function attachBenchmark(node) {
  if (!node || node.comfyClass !== BENCHMARK) return;
  node.resizable = true;
  const root = node.__h3bRoot;
  const domWidget = widget(node, "h3studio_smart_benchmark");
  if (!root || !domWidget) return;
  root.__h3studioBenchmarkV9Observer?.disconnect?.();
  releaseLegacyGeometry(domWidget, 260, 1200);
  constrainRoot(root);
  root.style.setProperty("overflow-y", "auto", "important");
  domWidget.options.afterResize = () => constrainRoot(root);
  if (!node.__h3ComfyBenchmarkGeometryReleased) {
    node.__h3ComfyBenchmarkGeometryReleased = true;
    forceLayout(node);
  }
}

function sweep() {
  return;
  return;
  for (const node of app.graph?._nodes || []) {
    if (node?.comfyClass === DIRECTOR) attachDirector(node);
    else if (node?.comfyClass === BENCHMARK) attachBenchmark(node);
  }
}

api.addEventListener("execution_start", ({ detail }) => {
  activePromptId = promptId(detail);
  if (activePromptId) TIMINGS.set(activePromptId, { startedAt: performance.now(), samplingStartedAt: 0, samplingEndedAt: 0 });
});
api.addEventListener("progress", ({ detail }) => {
  const timing = TIMINGS.get(promptId(detail));
  if (!timing) return;
  const max = Number(detail?.max); const value = Number(detail?.value);
  if (![4, 8, 12, 20].includes(max)) return;
  if (!timing.samplingStartedAt) timing.samplingStartedAt = performance.now();
  if (Number.isFinite(value) && value >= max) timing.samplingEndedAt = performance.now();
});
api.addEventListener("executed", ({ detail }) => {
  const targetId = detail?.node;
  const outputNode = app.graph?.getNodeById?.(Number(targetId));
  if (!outputNode || !["PreviewImage", "H3StudioSaveImage", "H3StudioComparisonView"].includes(outputNode.comfyClass)) return;
  const timing = TIMINGS.get(promptId(detail));
  if (!timing?.startedAt) return;
  const totalMs = performance.now() - timing.startedAt;
  const samplingMs = timing.samplingStartedAt ? (timing.samplingEndedAt || performance.now()) - timing.samplingStartedAt : NaN;
  for (const node of app.graph?._nodes || []) {
    if (node?.comfyClass !== DIRECTOR || !isNodeDownstream(app.graph?.links, node.id, targetId)) continue;
    node.__h3studioRunTiming = { totalMs, samplingMs };
    requestAnimationFrame(() => injectRunStats(node));
  }
});
for (const eventName of ["execution_success", "execution_error", "execution_interrupted"]) {
  api.addEventListener(eventName, ({ detail }) => {
    const id = promptId(detail); if (id) setTimeout(() => TIMINGS.delete(id), 2500); if (id === activePromptId) activePromptId = "";
  });
}

app.registerExtension({
  name: "H3Studio.ComfyGeometryV10",
  setup() { installStyles(); },
  nodeCreated(node) {
    installStyles();
    if (node?.comfyClass === DIRECTOR || node?.comfyClass === BENCHMARK) setTimeout(() => sweep(), 120);
  },
  afterConfigureGraph() { installStyles(); setTimeout(sweep, 220); },
});
