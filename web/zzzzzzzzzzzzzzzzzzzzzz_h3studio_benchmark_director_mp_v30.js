import { app } from "../../scripts/app.js";
import { rangeControl } from "./js/core/dom.js";
import {
  formatMegapixels,
  MAX_MEGAPIXELS,
  MEGAPIXEL_STEP,
  MIN_MEGAPIXELS,
  resolutionTier,
} from "./js/core/state.js";
import { installTheme } from "./js/core/theme.js";

const STYLE_ID = "h3studio-benchmark-director-mp-v30-style";
const ROOT_SELECTOR = ".h3b7.h3final-benchmark";
let observer = null;
let sweepQueued = false;

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    ${ROOT_SELECTOR}{
      --h3s-bg:var(--comfy-input-bg,#202226);
      --h3s-surface:color-mix(in srgb,var(--h3s-bg) 94%,white 6%);
      --h3s-raised:color-mix(in srgb,var(--h3s-bg) 86%,white 14%);
      --h3s-text:var(--input-text,#eceef2);
      --h3s-muted:var(--descrip-text,#9ca3af);
      --h3s-border:var(--border-color,rgba(255,255,255,.13));
      --h3s-accent:#34d3b5;
    }
    ${ROOT_SELECTOR} .h3final-target-field>.h3final-mp[data-h3-director-mp="1"]{
      display:flex!important;
      flex-direction:column!important;
      grid-template-columns:none!important;
      gap:4px!important;
      width:100%!important;
      min-height:0!important;
      padding:1px 0!important;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
      box-shadow:none!important;
    }
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-megapixel-top{
      display:grid!important;
      grid-template-columns:1fr auto 1fr!important;
      align-items:center!important;
      gap:5px!important;
      margin:0!important;
      color:var(--h3s-muted)!important;
      font-size:8px!important;
      font-variant-numeric:tabular-nums!important;
    }
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-megapixel-top span:last-child{text-align:right!important}
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-megapixel-value{
      min-width:50px!important;
      padding:0!important;
      color:var(--h3s-text)!important;
      font-size:10px!important;
      font-weight:700!important;
      text-align:center!important;
      font-variant-numeric:tabular-nums!important;
    }
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-range{
      position:relative!important;
      display:block!important;
      width:100%!important;
      height:14px!important;
      margin:0!important;
    }
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-range-track{height:3px!important}
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-range-track::before{
      background:linear-gradient(90deg,#38d6af 0%,#68d391 18%,#e6ad55 48%,#ef7d52 72%,#ef5350 100%)!important;
    }
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-range-thumb{width:13px!important;height:13px!important}
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-range[data-tier="experimental"] .h3s-range-thumb{background:#ef7d52!important}
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-range[data-tier="extreme"] .h3s-range-thumb{background:#ef5350!important}
  `;
  document.head.append(style);
}

function labelFor(field) {
  return String(field?.querySelector(":scope > .h3b7-label")?.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isTargetField(field) {
  const label = labelFor(field);
  return field.classList.contains("h3final-target-field") || label === "mp" || label.includes("target size");
}

function mountField(field) {
  if (!(field instanceof Element) || !isTargetField(field)) return;
  const original = field.querySelector(":scope > input[type='number'], :scope > .h3b7-input[type='number']");
  if (!original) return;

  const existing = field.querySelector(":scope > .h3final-mp[data-h3-director-mp='1']");
  if (existing) return;

  const caption = field.querySelector(":scope > .h3b7-label");
  if (caption) caption.textContent = "Target size";
  field.classList.add("h3final-target-field");

  const initial = Math.max(MIN_MEGAPIXELS, Math.min(MAX_MEGAPIXELS, Number(original.value) || 1));
  const output = document.createElement("output");
  output.className = "h3s-megapixel-value";
  output.setAttribute("aria-live", "polite");
  output.textContent = formatMegapixels(initial);

  let slider = null;
  slider = rangeControl(
    initial,
    { min: MIN_MEGAPIXELS, max: MAX_MEGAPIXELS, step: MEGAPIXEL_STEP },
    `Target megapixels, minimum ${formatMegapixels(MIN_MEGAPIXELS)}, maximum ${formatMegapixels(MAX_MEGAPIXELS)}`,
    (value) => {
      output.textContent = formatMegapixels(value);
      slider.dataset.tier = resolutionTier(value).key;
      if (Number(original.value) === value) return;
      original.value = String(value);
      original.dispatchEvent(new Event("change", { bubbles: true }));
    },
    (value) => {
      output.textContent = formatMegapixels(value);
      slider.dataset.tier = resolutionTier(value).key;
    },
  );
  slider.dataset.tier = resolutionTier(initial).key;

  const top = document.createElement("div");
  top.className = "h3s-megapixel-top";
  const min = document.createElement("span");
  min.textContent = formatMegapixels(MIN_MEGAPIXELS);
  const max = document.createElement("span");
  max.textContent = formatMegapixels(MAX_MEGAPIXELS);
  top.append(min, output, max);

  const control = document.createElement("div");
  control.className = "h3final-mp h3s-megapixel-control";
  control.dataset.h3DirectorMp = "1";
  control.append(top, slider);

  const legacy = field.querySelector(":scope > .h3final-mp:not([data-h3-director-mp='1'])");
  if (legacy) legacy.replaceWith(control);
  else field.append(control);
}

function sweep() {
  sweepQueued = false;
  installTheme();
  installStyles();
  document.querySelectorAll(`${ROOT_SELECTOR} .h3b7-field`).forEach(mountField);
}

function scheduleSweep() {
  if (sweepQueued) return;
  sweepQueued = true;
  requestAnimationFrame(sweep);
}

function observe() {
  if (observer || !document.body) return;
  observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type !== "childList" || (!record.addedNodes.length && !record.removedNodes.length)) continue;
      scheduleSweep();
      break;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

app.registerExtension({
  name: "H3Studio.BenchmarkDirectorMPV30",
  setup() {
    installTheme();
    installStyles();
    observe();
    for (const delay of [0, 80, 220, 500, 1000]) setTimeout(scheduleSweep, delay);
  },
  nodeCreated(node) {
    if (node?.comfyClass !== "H3StudioSmartBenchmark") return;
    for (const delay of [60, 180, 420]) setTimeout(scheduleSweep, delay);
  },
  afterConfigureGraph() {
    observe();
    for (const delay of [0, 160, 480]) setTimeout(scheduleSweep, delay);
  },
});
