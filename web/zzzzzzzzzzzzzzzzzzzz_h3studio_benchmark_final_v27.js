import { app } from "../../scripts/app.js";

const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-benchmark-final-v27-style";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* v14 is the only visible per-scenario MP control. */
    .h3b7 .h3b14-mp{
      display:grid!important;
      width:100%!important;
      max-width:100%!important;
      grid-template-columns:minmax(0,1fr) auto!important;
      gap:7px 10px!important;
      padding:7px 8px!important;
      border:1px solid color-mix(in srgb,var(--border-color,#3d444b) 88%,white 4%)!important;
      border-radius:6px!important;
      background:var(--comfy-input-bg,#181c20)!important;
      box-shadow:none!important;
    }
    .h3b7 .h3b14-mp-field>.h3b7-input{display:none!important}

    /* Keep the native Benchmark surface even if older decorators rerun. */
    .h3b7.h3b23,
    .h3b7.h3b21.h3b23{
      background:transparent!important;
      background-image:none!important;
      box-shadow:none!important;
    }
    .h3b7.h3b23 .h3b7-top,
    .h3b7.h3b23 .h3b7-body,
    .h3b7.h3b23 .h3b15-plan,
    .h3b7.h3b23 .h3b7-summary,
    .h3b7.h3b23 .h3b7-list,
    .h3b7.h3b23 .h3b7-scenario,
    .h3b7.h3b23 .h3b7-scenario>summary,
    .h3b7.h3b23 .h3b7-fields{
      background:transparent!important;
      background-image:none!important;
      box-shadow:none!important;
    }
  `;
  document.head.append(style);
}

function forceHide(element) {
  if (!element) return;
  element.hidden = true;
  element.setAttribute("aria-hidden", "true");
  element.tabIndex = -1;
  element.style.setProperty("display", "none", "important");
  element.style.setProperty("visibility", "hidden", "important");
  element.style.setProperty("width", "0", "important");
  element.style.setProperty("height", "0", "important");
  element.style.setProperty("min-width", "0", "important");
  element.style.setProperty("min-height", "0", "important");
  element.style.setProperty("margin", "0", "important");
  element.style.setProperty("padding", "0", "important");
  element.style.setProperty("border", "0", "important");
  element.style.setProperty("overflow", "hidden", "important");
}

function directChildContaining(field, element) {
  let current = element;
  while (current?.parentElement && current.parentElement !== field) current = current.parentElement;
  return current?.parentElement === field ? current : element;
}

function enforceSingleMpSlider(field) {
  const primary = field.querySelector(":scope > .h3b14-mp");
  if (!primary) return;

  /* Several retired Benchmark decorators can still append their own range
     controls to this exact field. Do not depend on their versioned class names:
     keep v14 and collapse every other direct child that owns a range input. */
  for (const range of field.querySelectorAll("input[type='range']")) {
    if (primary.contains(range)) continue;
    const wrapper = directChildContaining(field, range);
    if (wrapper !== primary) forceHide(wrapper);
  }

  /* Known legacy controls are also hidden before/after their range exists. */
  field.querySelectorAll(":scope > .h3b21-mp,:scope > .h3b21-mp-help,:scope > .h3b22-mp,:scope > .h3b24-mp").forEach(forceHide);

  primary.hidden = false;
  primary.removeAttribute("aria-hidden");
  primary.style.setProperty("display", "grid", "important");
  primary.style.removeProperty("visibility");
  primary.style.removeProperty("width");
  primary.style.removeProperty("height");
  primary.style.removeProperty("min-width");
  primary.style.removeProperty("min-height");
  primary.style.removeProperty("margin");
  primary.style.removeProperty("padding");
  primary.style.removeProperty("border");
  primary.style.removeProperty("overflow");
}

function clean(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) return;
  root.classList.add("h3b23");

  /* Hide already-known retired controls anywhere in the Benchmark without
     removing them; their old observers therefore have nothing to recreate. */
  root.querySelectorAll(".h3b21-mp,.h3b21-mp-help,.h3b22-mp,.h3b24-mp").forEach(forceHide);

  for (const field of root.querySelectorAll(".h3b14-mp-field")) enforceSingleMpSlider(field);
}

function observe(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) {
    setTimeout(() => observe(node), 100);
    return;
  }
  clean(node);
  if (root.__h3BenchmarkFinalV27Observer) return;

  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (root.isConnected) clean(node);
    });
  });
  observer.observe(root, { childList: true, subtree: true });
  root.__h3BenchmarkFinalV27Observer = observer;
}

function sweep() {
  for (const node of app.graph?._nodes || []) {
    if (node?.comfyClass === BENCHMARK) observe(node);
  }
}

function scheduleSweep() {
  for (const delay of [0, 120, 360, 800, 1500]) setTimeout(sweep, delay);
}

app.registerExtension({
  name: "H3Studio.BenchmarkFinalV27",
  setup() {
    installStyles();
    scheduleSweep();
  },
  nodeCreated(node) {
    if (node?.comfyClass === BENCHMARK) {
      for (const delay of [80, 300, 700, 1400]) setTimeout(() => observe(node), delay);
    }
  },
  afterConfigureGraph() {
    installStyles();
    scheduleSweep();
  },
});
