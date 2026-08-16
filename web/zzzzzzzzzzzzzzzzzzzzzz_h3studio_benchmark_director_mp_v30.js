import { app } from "../../scripts/app.js";
import { rangeControl } from "./js/core/dom.js";
import {
  formatMegapixels,
  MAX_MEGAPIXELS,
  MEGAPIXEL_STEP,
  MIN_MEGAPIXELS,
  resolutionTier,
} from "./js/core/state.js";

const STYLE_ID = "h3studio-benchmark-director-mp-v31-style";
const ROOT_SELECTOR = ".h3b7.h3final-benchmark";
const PRESETS = [
  [0.4, "Draft"],
  [1, "Recommended"],
  [2, "2 MP"],
  [4, "4 MP"],
  [8.2944, "4K canvas"],
];
let observer = null;
let sweepQueued = false;

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    ${ROOT_SELECTOR}{
      --h3s-bg:var(--component-node-widget-background,var(--comfy-input-bg,#202226));
      --h3s-surface:color-mix(in srgb,var(--h3s-bg) 94%,white 6%);
      --h3s-raised:color-mix(in srgb,var(--h3s-bg) 86%,white 14%);
      --h3s-text:var(--component-node-foreground,var(--input-text,#eceef2));
      --h3s-muted:var(--component-node-foreground-secondary,var(--descrip-text,#9ca3af));
      --h3s-border:var(--border-default,var(--border-color,rgba(255,255,255,.13)));
      --h3s-accent:#34d3b5;
    }

    /* Benchmark's target field owns one Director Target size component. */
    ${ROOT_SELECTOR} .h3final-target-field>.h3final-mp:not([data-h3-director-mp="1"]){display:none!important}
    ${ROOT_SELECTOR} .h3final-target-field>.h3b7-input[type="number"]{display:none!important}
    ${ROOT_SELECTOR} .h3final-target-field>.h3final-mp[data-h3-director-mp="1"]{
      display:flex!important;
      flex-direction:column!important;
      grid-template-columns:none!important;
      align-items:stretch!important;
      gap:4px!important;
      width:100%!important;
      min-width:0!important;
      min-height:0!important;
      height:auto!important;
      padding:1px 0!important;
      margin:0!important;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
      background-image:none!important;
      box-shadow:none!important;
      overflow:visible!important;
    }

    /* These are copied from Director's core/theme.js Target size rules. */
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-megapixel-top{
      display:grid!important;
      grid-template-columns:1fr auto 1fr!important;
      align-items:center!important;
      gap:5px!important;
      width:100%!important;
      margin:0!important;
      padding:0!important;
      color:var(--h3s-muted)!important;
      font-size:8px!important;
      font-weight:400!important;
      line-height:1.4!important;
      font-variant-numeric:tabular-nums!important;
    }
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-megapixel-top span:first-child{text-align:left!important}
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-megapixel-top span:last-child{text-align:right!important}
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-megapixel-value{
      display:block!important;
      min-width:50px!important;
      margin:0!important;
      padding:0!important;
      border:0!important;
      background:transparent!important;
      color:var(--h3s-text)!important;
      font-size:10px!important;
      font-weight:700!important;
      line-height:1.4!important;
      text-align:center!important;
      font-variant-numeric:tabular-nums!important;
    }
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-range{
      --h3s-range-progress:0%;
      position:relative!important;
      display:block!important;
      width:100%!important;
      min-width:0!important;
      height:14px!important;
      min-height:14px!important;
      margin:0!important;
      padding:0!important;
      border:0!important;
      background:transparent!important;
      overflow:visible!important;
      touch-action:none!important;
    }
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-range-track{
      position:absolute!important;
      left:0!important;
      right:0!important;
      top:50%!important;
      display:block!important;
      width:auto!important;
      height:3px!important;
      overflow:hidden!important;
      border:0!important;
      border-radius:999px!important;
      background:var(--h3s-border)!important;
      transform:translateY(-50%)!important;
      pointer-events:none!important;
    }
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-range-track::before{
      content:""!important;
      display:block!important;
      width:var(--h3s-range-progress)!important;
      height:100%!important;
      border:0!important;
      border-radius:0!important;
      background:linear-gradient(90deg,#38d6af 0%,#68d391 18%,#e6ad55 48%,#ef7d52 72%,#ef5350 100%)!important;
    }
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-range-thumb{
      position:absolute!important;
      left:var(--h3s-range-progress)!important;
      top:50%!important;
      z-index:0!important;
      display:block!important;
      width:13px!important;
      height:13px!important;
      margin:0!important;
      padding:0!important;
      border:2px solid var(--h3s-raised)!important;
      border-radius:999px!important;
      background:var(--h3s-accent)!important;
      box-shadow:0 1px 3px rgba(0,0,0,.35)!important;
      transform:translate(-50%,-50%)!important;
      pointer-events:none!important;
    }
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-range[data-tier="experimental"] .h3s-range-thumb{background:#ef7d52!important}
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-range[data-tier="extreme"] .h3s-range-thumb{background:#ef5350!important}
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-range-native{
      appearance:auto!important;
      -webkit-appearance:auto!important;
      position:absolute!important;
      inset:0!important;
      z-index:1!important;
      display:block!important;
      width:100%!important;
      height:100%!important;
      min-height:0!important;
      margin:0!important;
      padding:0!important;
      border:0!important;
      border-radius:0!important;
      opacity:0!important;
      background:transparent!important;
      cursor:pointer!important;
      pointer-events:auto!important;
      touch-action:none!important;
    }
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-range:has(.h3s-range-native:focus-visible){
      outline:2px solid color-mix(in srgb,var(--h3s-accent) 70%,transparent)!important;
      outline-offset:1px!important;
      border-radius:5px!important;
    }

    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-resolution-presets{
      display:flex!important;
      flex-wrap:wrap!important;
      gap:3px!important;
      width:100%!important;
      margin:0!important;
      padding:0!important;
    }
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-resolution-preset{
      flex:1 1 72px!important;
      min-width:0!important;
      min-height:22px!important;
      height:auto!important;
      margin:0!important;
      padding:3px 6px!important;
      border:1px solid var(--h3s-border)!important;
      border-radius:5px!important;
      color:var(--h3s-muted)!important;
      background:var(--h3s-bg)!important;
      background-image:none!important;
      box-shadow:none!important;
      cursor:pointer!important;
      font:620 8px/1.2 ui-sans-serif,system-ui!important;
      white-space:nowrap!important;
    }
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-resolution-preset:hover{
      color:var(--h3s-text)!important;
      border-color:color-mix(in srgb,var(--h3s-accent) 45%,var(--h3s-border))!important;
    }
    ${ROOT_SELECTOR} .h3final-mp[data-h3-director-mp="1"] .h3s-resolution-preset.is-active{
      color:var(--h3s-text)!important;
      border-color:color-mix(in srgb,var(--h3s-accent) 65%,var(--h3s-border))!important;
      background:color-mix(in srgb,var(--h3s-accent) 12%,var(--h3s-bg))!important;
    }
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

function bounded(value) {
  const number = Number(value);
  return Math.max(MIN_MEGAPIXELS, Math.min(MAX_MEGAPIXELS, Number.isFinite(number) ? number : 1));
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

  const initial = bounded(original.value);
  const output = document.createElement("output");
  output.className = "h3s-megapixel-value";
  output.setAttribute("aria-live", "polite");
  output.textContent = formatMegapixels(initial);

  const presetButtons = [];
  const syncPresetState = (value) => {
    for (let index = 0; index < PRESETS.length; index += 1) {
      presetButtons[index]?.classList.toggle("is-active", Math.abs(value - PRESETS[index][0]) < 0.03);
    }
  };

  let slider = null;
  const preview = (value) => {
    output.textContent = formatMegapixels(value);
    slider.dataset.tier = resolutionTier(value).key;
    syncPresetState(value);
  };
  const commit = (value) => {
    preview(value);
    if (Number(original.value) === value) return;
    original.value = String(value);
    original.dispatchEvent(new Event("change", { bubbles: true }));
  };

  slider = rangeControl(
    initial,
    { min: MIN_MEGAPIXELS, max: MAX_MEGAPIXELS, step: MEGAPIXEL_STEP },
    `Target megapixels, minimum ${formatMegapixels(MIN_MEGAPIXELS)}, maximum ${formatMegapixels(MAX_MEGAPIXELS)}`,
    commit,
    preview,
  );
  slider.dataset.tier = resolutionTier(initial).key;

  const top = document.createElement("div");
  top.className = "h3s-megapixel-top";
  const min = document.createElement("span");
  min.textContent = formatMegapixels(MIN_MEGAPIXELS);
  const max = document.createElement("span");
  max.textContent = formatMegapixels(MAX_MEGAPIXELS);
  top.append(min, output, max);

  const presets = document.createElement("div");
  presets.className = "h3s-resolution-presets";
  for (const [value, label] of PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `h3s-resolution-preset${Math.abs(initial - value) < 0.03 ? " is-active" : ""}`;
    button.textContent = label;
    button.setAttribute("aria-label", `Set ${label}, ${formatMegapixels(value)}`);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const native = slider.querySelector(".h3s-range-native");
      if (native) {
        native.value = String(value);
        native.dispatchEvent(new Event("input", { bubbles: true }));
      }
      commit(value);
    });
    presetButtons.push(button);
    presets.append(button);
  }

  const control = document.createElement("div");
  control.className = "h3final-mp h3s-megapixel-control";
  control.dataset.h3DirectorMp = "1";
  control.append(top, slider, presets);

  const legacy = field.querySelector(":scope > .h3final-mp:not([data-h3-director-mp='1'])");
  if (legacy) legacy.replaceWith(control);
  else field.append(control);
}

function sweep() {
  return;
  return;
  sweepQueued = false;
  installStyles();
  document.querySelectorAll(`${ROOT_SELECTOR} .h3b7-field`).forEach(mountField);
}

function scheduleSweep() {
  if (sweepQueued) return;
  sweepQueued = true;
  requestAnimationFrame(sweep);
}

function observe(node) {
  return;
  return;
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
  name: "H3Studio.BenchmarkDirectorMPV31",
  setup() {
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