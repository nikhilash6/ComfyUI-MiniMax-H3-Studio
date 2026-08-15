import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

import { panelHeightForNode } from "./js/core/layout.js";
import { isNodeDownstream } from "./js/core/final_output.js";
import {
  formatMegapixels,
  planResolution,
  resolutionTier,
} from "./js/core/state.js";
import { stateFromNode } from "./js/studio_extension.js";

const DIRECTOR = "H3StudioDirector";
const STYLE_ID = "h3studio-interaction-v8-style";
const TIMINGS = new Map();
let activePromptId = "";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* v8 is interaction + geometry only. It does not create duplicate Studio sections. */
    .h3s-studio-panel{overflow:hidden!important;transition:border-color .14s ease,background-color .14s ease!important}
    .h3s-v6-layout{height:calc(100% - 46px)!important;min-height:0!important;align-items:stretch!important;overflow:hidden!important}
    .h3s-v6-main,.h3s-v6-inspector{height:100%!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scrollbar-gutter:stable!important}
    .h3s-v6-main::-webkit-scrollbar,.h3s-v6-inspector::-webkit-scrollbar{width:7px}
    .h3s-v6-main::-webkit-scrollbar-thumb,.h3s-v6-inspector::-webkit-scrollbar-thumb{background:#353b41;border:2px solid transparent;background-clip:padding-box;border-radius:999px}
    .h3s-v6-inspector{scrollbar-color:#353b41 transparent}

    .h3s-choice-trigger,.h3s-control,.h3s-resolution-mode,.h3s-resolution-preset,.h3s-final-action,.h3s-icon-button,.h3s-add-image,.h3s-lora-button{
      transition:background-color .12s ease,border-color .12s ease,color .12s ease,transform .12s ease!important;
    }
    .h3s-choice-trigger:active,.h3s-final-action:active,.h3s-add-image:active,.h3s-lora-button:active{transform:translateY(1px)!important}
    .h3s-choice-menu{animation:h3sMenuIn .11s cubic-bezier(.2,.8,.2,1) both!important;transform-origin:top left!important}
    @keyframes h3sMenuIn{from{opacity:0;transform:translateY(-3px) scale(.985)}to{opacity:1;transform:none}}
    @media(prefers-reduced-motion:reduce){.h3s-choice-menu{animation:none!important}.h3s-choice-trigger,.h3s-control,.h3s-resolution-mode,.h3s-resolution-preset,.h3s-final-action,.h3s-icon-button,.h3s-add-image,.h3s-lora-button{transition:none!important}}

    .h3s-choice-current,.h3s-choice-option{display:flex!important;align-items:center!important;gap:7px!important;min-width:0!important}
    .h3s-choice-current{overflow:hidden!important}.h3s-choice-option{min-height:27px!important;padding:5px 7px!important}
    .h3s-choice-option.is-active::before{display:none!important}
    .h3s-choice-option.is-active::after{content:'✓';margin-left:auto;color:#aeb9c4;font-size:9px}
    .h3s-choice-ratio-icon{position:relative;display:inline-grid!important;place-items:center!important;flex:0 0 18px;width:18px;height:16px}
    .h3s-choice-ratio-icon::after{content:'';display:block;width:var(--ratio-w,12px);height:var(--ratio-h,12px);max-width:16px;max-height:14px;border:1px solid #8d99a5;border-radius:2px;background:#22272c;box-shadow:inset 0 0 0 1px rgba(255,255,255,.025)}
    .h3s-choice-menu[aria-label='Aspect ratio']{min-width:148px!important;max-width:190px!important}

    .h3s-range{transition:filter .12s ease}.h3s-range:hover{filter:brightness(1.08)}
    .h3s-megapixel-control .h3s-range-track::before{
      background:linear-gradient(90deg,#71889e 0%,#8d8f82 45%,#c58b62 72%,#d75f5f 100%)!important;
      transform-origin:left center!important;transition:width .06s linear!important;
    }
    .h3s-megapixel-control .h3s-range-thumb{transition:left .06s linear,transform .1s ease,background-color .12s ease!important}
    .h3s-megapixel-control .h3s-range:hover .h3s-range-thumb{transform:translate(-50%,-50%) scale(1.12)!important}
    .h3s-megapixel-value{transition:color .1s ease,transform .1s ease!important;font-variant-numeric:tabular-nums}
    .h3s-megapixel-control:has(.h3s-range[data-tier='high']) .h3s-megapixel-value{color:#e6b07d!important}
    .h3s-megapixel-control:has(.h3s-range[data-tier='extreme']) .h3s-megapixel-value{color:#ef7777!important;font-weight:720!important}

    .h3s-run-stats{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:7px 9px;border-top:1px solid #24292e;color:#7f8891;font-size:8.5px;font-variant-numeric:tabular-nums;background:#121518}
    .h3s-run-stats strong{color:#dce2e6;font-size:9px;font-weight:700}.h3s-run-dot{width:3px;height:3px;border-radius:50%;background:#535b63}

    /* Cleaner custom-LoRA editor: one compact identity row + one strength row. */
    .h3s-lora-stack{gap:6px!important}.h3s-lora-row{grid-template-columns:22px minmax(0,1fr) auto!important;grid-template-areas:'enable select actions' '. strength strength'!important;gap:6px 8px!important;padding:7px 8px!important;border:1px solid #2b3136!important;border-radius:7px!important;background:#15191c!important}
    .h3s-lora-enable{grid-area:enable}.h3s-lora-select{grid-area:select;height:29px!important;border:1px solid #30363c!important;border-radius:5px!important;background:#191d21!important;color:#e8ecef!important;padding:4px 6px!important;font-size:9px!important}
    .h3s-lora-strength{grid-area:strength!important;grid-template-columns:minmax(90px,1fr) 54px!important;gap:8px!important}.h3s-lora-strength input[type='range']{accent-color:#8797a8!important}.h3s-lora-strength input[type='number']{width:54px!important;height:27px!important;border:1px solid #30363c!important;border-radius:5px!important;background:#191d21!important;color:#e8ecef!important;font-size:9px!important;text-align:center}
    .h3s-lora-actions{grid-area:actions!important}.h3s-lora-icon{min-width:24px!important;width:24px!important;height:26px!important;padding:0!important;background:transparent!important;border:0!important;color:#808890!important}.h3s-lora-icon:hover{background:#24292e!important;color:#e6eaed!important}
    .h3s-lora-toolbar{padding-top:2px!important}.h3s-lora-button{padding:5px 8px!important;border-radius:6px!important;background:#191d21!important;border-color:#30363c!important;font-size:8.5px!important}.h3s-lora-empty{padding:9px!important;border-color:#30363c!important;border-radius:7px!important;background:#13171a!important;font-size:9px!important}.h3s-custom-loras .h3s-context-help{display:none!important}.h3s-lora-warning{margin:0!important;padding:7px 8px!important;border-left:2px solid #8d704d!important;background:#1b1916!important;color:#c7aa82!important;border-radius:0 5px 5px 0!important;font-size:8.5px!important;line-height:1.4!important}
  `;
  document.head.append(style);
}

function promptId(detail) {
  return String(detail?.prompt_id || detail?.promptId || activePromptId || "");
}

function ratioIcon(ratio) {
  const [w, h] = String(ratio || "").trim().split(":").map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  const scale = 14 / Math.max(w, h);
  const icon = document.createElement("span");
  icon.className = "h3s-choice-ratio-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.style.setProperty("--ratio-w", `${Math.max(5, w * scale)}px`);
  icon.style.setProperty("--ratio-h", `${Math.max(5, h * scale)}px`);
  return icon;
}

function decorateRatioRow(row) {
  if (!row || row.querySelector(":scope > .h3s-choice-ratio-icon")) return;
  const label = row.querySelector(".h3s-choice-value,.h3s-choice-option-label")?.textContent || row.textContent || "";
  const ratio = String(label).trim().match(/\b\d+(?:\.\d+)?:\d+(?:\.\d+)?\b/)?.[0];
  const icon = ratioIcon(ratio);
  if (icon) row.prepend(icon);
}

function decorateAspectControls(root = document) {
  for (const field of root.querySelectorAll?.(".h3s-field") || []) {
    if (String(field.querySelector(".h3s-field-label")?.textContent || "").trim() !== "Aspect") continue;
    decorateRatioRow(field.querySelector(".h3s-choice-current"));
  }
  for (const menu of document.querySelectorAll(".h3s-choice-menu[aria-label='Aspect ratio']")) {
    for (const row of menu.querySelectorAll(".h3s-choice-option")) decorateRatioRow(row);
  }
}

function previewMegapixels(node, value) {
  const root = node?.__h3studioPanel;
  if (!root) return;
  const state = stateFromNode(node);
  const generation = state.generation;
  const next = planResolution(
    generation.aspect_ratio,
    value,
    generation.custom_width,
    generation.custom_height,
    generation.cap_native_resolution,
  );
  const control = root.querySelector(".h3s-megapixel-control");
  if (!control) return;
  const output = control.querySelector(".h3s-megapixel-value");
  const strong = root.querySelector(".h3s-resolution-result strong");
  const detail = root.querySelector(".h3s-resolution-result span");
  const badge = root.querySelector(".h3s-resolution-tier");
  const note = root.querySelector(".h3s-resolution-note");
  const range = control.querySelector(".h3s-range");
  if (output) output.textContent = formatMegapixels(value);
  if (strong) strong.textContent = `${next.width} × ${next.height}`;
  if (detail) detail.textContent = `${next.actualMegapixels.toFixed(2)} MP actual · ${next.capped ? "conservative" : "direct"}`;
  const tier = resolutionTier(value, generation.cap_native_resolution);
  if (badge) { badge.className = `h3s-resolution-tier is-${tier.key}`; badge.textContent = tier.label; }
  if (note) note.textContent = tier.note;
  if (range) range.dataset.tier = tier.key;
}

function bindMegapixelSlider(node) {
  const input = node?.__h3studioPanel?.querySelector(".h3s-megapixel-control .h3s-range-native");
  if (!input || input.dataset.h3LiveBound === "1") return;
  input.dataset.h3LiveBound = "1";
  input.addEventListener("input", () => previewMegapixels(node, Number(input.value)));
  previewMegapixels(node, Number(input.value));
}

function syncDirectorGeometry(node) {
  if (!node || node.comfyClass !== DIRECTOR) return;
  const root = node.__h3studioPanel;
  const widget = (node.widgets || []).find((item) => item?.name === "h3studio_controls");
  if (!root || !widget) return;
  const preferred = node.__h3studioPreferredSize || node.size;
  const height = panelHeightForNode(preferred);
  widget.computeSize = (width) => [Math.max(0, Number(width) || Number(node.size?.[0]) || 680), height];
  widget.computedHeight = height;
  root.style.setProperty("width", "100%", "important");
  root.style.setProperty("height", `${height}px`, "important");
  root.style.setProperty("min-width", "0", "important");
  if (root.parentElement) {
    root.parentElement.style.setProperty("min-width", "0", "important");
    root.parentElement.style.setProperty("max-width", "100%", "important");
  }
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
  const row = document.createElement("div");
  row.className = "h3s-run-stats";
  const total = document.createElement("strong");
  total.textContent = `Generated in ${formatDuration(timing.totalMs)}`;
  row.append(total);
  if (Number.isFinite(timing.samplingMs) && timing.samplingMs > 0) {
    const dot = document.createElement("span"); dot.className = "h3s-run-dot";
    const sampling = document.createElement("span"); sampling.textContent = `Sampling ${formatDuration(timing.samplingMs)}`;
    row.append(dot, sampling);
  }
  result.append(row);
}

function refreshNode(node) {
  syncDirectorGeometry(node);
  decorateAspectControls(node.__h3studioPanel);
  bindMegapixelSlider(node);
  injectRunStats(node);
}

function attach(node) {
  if (!node || node.comfyClass !== DIRECTOR) return;
  refreshNode(node);
  if (node.__h3studioInteractionV8) return;
  node.__h3studioInteractionV8 = true;
  const originalResize = node.onResize;
  node.onResize = function h3InteractionResize() {
    const result = originalResize?.apply(this, arguments);
    requestAnimationFrame(() => refreshNode(this));
    return result;
  };
  const root = node.__h3studioPanel;
  if (root && !root.__h3InteractionObserver) {
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; refreshNode(node); });
    });
    observer.observe(root, { childList: true, subtree: true });
    root.__h3InteractionObserver = observer;
  }
}

function expectedSamplingMax() {
  const directors = (app.graph?._nodes || []).filter((node) => node?.comfyClass === DIRECTOR);
  const values = new Set();
  for (const node of directors) {
    const profile = String(stateFromNode(node)?.generation?.sampling_profile || "");
    if (profile === "base_quality_20") values.add(20);
    else if (profile === "base_balanced_12") values.add(12);
    else if (profile.includes("8")) values.add(8);
    else if (profile.includes("4") || profile.startsWith("pdd_")) values.add(4);
  }
  return values;
}

api.addEventListener("execution_start", ({ detail }) => {
  activePromptId = promptId(detail);
  if (!activePromptId) return;
  TIMINGS.set(activePromptId, { startedAt: performance.now(), samplingStartedAt: 0, samplingEndedAt: 0 });
});

api.addEventListener("progress", ({ detail }) => {
  const id = promptId(detail);
  const timing = TIMINGS.get(id);
  if (!timing) return;
  const max = Number(detail?.max);
  const value = Number(detail?.value);
  if (!Number.isFinite(max) || !expectedSamplingMax().has(max)) return;
  if (!timing.samplingStartedAt) timing.samplingStartedAt = performance.now();
  if (Number.isFinite(value) && value >= max) timing.samplingEndedAt = performance.now();
});

api.addEventListener("executed", ({ detail }) => {
  const targetId = detail?.node;
  const outputNode = app.graph?.getNodeById?.(Number(targetId));
  if (!outputNode || !["PreviewImage", "H3StudioSaveImage", "H3StudioComparisonView"].includes(outputNode.comfyClass)) return;
  const id = promptId(detail);
  const timing = TIMINGS.get(id);
  if (!timing?.startedAt) return;
  const totalMs = performance.now() - timing.startedAt;
  const samplingMs = timing.samplingStartedAt
    ? (timing.samplingEndedAt || performance.now()) - timing.samplingStartedAt
    : NaN;
  for (const node of app.graph?._nodes || []) {
    if (node?.comfyClass !== DIRECTOR || !isNodeDownstream(app.graph?.links, node.id, targetId)) continue;
    node.__h3studioRunTiming = { totalMs, samplingMs };
    requestAnimationFrame(() => injectRunStats(node));
  }
});

for (const eventName of ["execution_success", "execution_error", "execution_interrupted"]) {
  api.addEventListener(eventName, ({ detail }) => {
    const id = promptId(detail);
    if (id) setTimeout(() => TIMINGS.delete(id), 2500);
    if (id === activePromptId) activePromptId = "";
  });
}

document.addEventListener("click", (event) => {
  if (event.target?.closest?.(".h3s-choice-trigger")) requestAnimationFrame(() => decorateAspectControls(document));
}, true);
document.addEventListener("keydown", (event) => {
  if (["Enter", " ", "ArrowDown"].includes(event.key) && event.target?.closest?.(".h3s-choice-trigger")) requestAnimationFrame(() => decorateAspectControls(document));
}, true);

app.registerExtension({
  name: "H3Studio.InteractionV8",
  setup() { installStyles(); },
  nodeCreated(node) {
    installStyles();
    if (node?.comfyClass === DIRECTOR) setTimeout(() => attach(node), 30);
  },
  afterConfigureGraph() {
    installStyles();
    setTimeout(() => {
      for (const node of app.graph?._nodes || []) if (node?.comfyClass === DIRECTOR) attach(node);
    }, 100);
  },
});