import { app } from "../../scripts/app.js";

const DIRECTOR = "H3StudioDirector";
const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-nodes2-natural-geometry-v25-style";
const BENCHMARK_PLUMBING = new Set([
  "scenarios_json", "max_scenarios", "grid_cell_size", "benchmark_mode", "profiles",
  "matrix_megapixels", "repeats", "seed_strategy", "seed_step", "max_generations",
  "allow_large_matrix", "include_reference_context", "include_original_prompt",
  "live_cell_previews", "compare_vae",
]);

function widget(node, name) {
  return (node?.widgets || []).find((item) => item?.name === name) || null;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Nodes 2.0 WidgetDOM uses *:flex-1. Explicitly opt H3 DOM roots out. */
    .h3s-studio-panel,.h3b7{
      flex:0 0 auto!important;
      flex-grow:0!important;
      flex-shrink:0!important;
      height:auto!important;
      min-height:0!important;
      align-self:flex-start!important;
    }
    .h3s-studio-panel{overflow:hidden!important}
    .h3b7{overflow-y:auto!important;overflow-x:hidden!important}

    .h3s-v6-layout,.h3s-v7-layout{
      height:auto!important;
      min-height:0!important;
      overflow:hidden!important;
    }
    .h3s-v6-main,.h3s-v6-inspector,.h3s-v7-main,.h3s-v7-inspector{
      height:auto!important;
      min-height:0!important;
      overflow-y:auto!important;
      overflow-x:hidden!important;
      overscroll-behavior:contain!important;
    }

    /* Native Benchmark surface: inherit the node instead of painting a second app. */
    .h3b7.h3b23,
    .h3b7.h3b23>.h3b7-top,
    .h3b7.h3b23>.h3b7-body,
    .h3b7.h3b23 .h3b15-plan,
    .h3b7.h3b23 .h3b7-summary,
    .h3b7.h3b23 .h3b7-list,
    .h3b7.h3b23 .h3b7-scenario,
    .h3b7.h3b23 .h3b7-scenario[open],
    .h3b7.h3b23 .h3b7-scenario>summary,
    .h3b7.h3b23 .h3b7-scenario[open]>summary,
    .h3b7.h3b23 .h3b7-fields{
      background:transparent!important;
      background-image:none!important;
      box-shadow:none!important;
    }
  `;
  document.head.append(style);
}

function hideBenchmarkPlumbing(node) {
  if (node?.comfyClass !== BENCHMARK) return;
  for (const item of node.widgets || []) {
    if (!BENCHMARK_PLUMBING.has(item?.name)) continue;
    item.options ||= {};
    item.options.hidden = true;
    item.hidden = true;
  }
}

function slotHeight(root) {
  const parent = root?.parentElement;
  const value = Number(parent?.clientHeight || 0);
  return Number.isFinite(value) && value > 80 ? value : 0;
}

function releaseRoot(root, benchmark = false) {
  if (!root?.isConnected) return;
  const cap = slotHeight(root);
  root.style.setProperty("flex", "0 0 auto", "important");
  root.style.setProperty("flex-grow", "0", "important");
  root.style.setProperty("flex-shrink", "0", "important");
  root.style.setProperty("height", "auto", "important");
  root.style.setProperty("min-height", "0", "important");
  root.style.setProperty("align-self", "flex-start", "important");
  root.style.setProperty("max-height", cap ? `${Math.floor(cap)}px` : "100%", "important");
  root.style.setProperty("overflow-x", "hidden", "important");
  root.style.setProperty("overflow-y", benchmark ? "auto" : "hidden", "important");
}

function nativeBenchmarkSurface(root) {
  if (!root?.isConnected) return;
  root.classList.add("h3b23");
  const surfaces = [
    root,
    root.querySelector(":scope > .h3b7-top"),
    root.querySelector(":scope > .h3b7-body"),
    ...root.querySelectorAll(".h3b15-plan,.h3b7-summary,.h3b7-list,.h3b7-scenario,.h3b7-scenario>summary,.h3b7-fields"),
  ];
  for (const surface of surfaces) {
    if (!surface) continue;
    surface.style.setProperty("background", "transparent", "important");
    surface.style.setProperty("background-image", "none", "important");
    surface.style.setProperty("box-shadow", "none", "important");
  }
}

function releaseDirector(node) {
  const root = node?.__h3studioPanel;
  if (!root?.isConnected) return;
  releaseRoot(root, false);

  const layout = root.querySelector(".h3s-v6-layout,.h3s-v7-layout");
  const main = layout?.querySelector(".h3s-v6-main,.h3s-v7-main");
  const inspector = layout?.querySelector(".h3s-v6-inspector,.h3s-v7-inspector");
  if (!layout || !main || !inspector) return;

  /* v14 writes a full-slot pixel height. Nodes 2.0 already owns the slot. */
  layout.style.setProperty("height", "auto", "important");
  layout.style.setProperty("min-height", "0", "important");
  layout.style.setProperty("max-height", "none", "important");

  for (const column of [main, inspector]) {
    column.style.setProperty("height", "auto", "important");
    column.style.setProperty("min-height", "0", "important");
    column.style.setProperty("max-height", "none", "important");
    column.style.setProperty("overflow-y", "auto", "important");
    column.style.setProperty("overflow-x", "hidden", "important");
  }
}

function releaseBenchmark(node) {
  hideBenchmarkPlumbing(node);
  const root = node?.__h3bRoot;
  if (!root?.isConnected) return;
  releaseRoot(root, true);
  nativeBenchmarkSurface(root);
}

function release(node) {
  if (node?.comfyClass === DIRECTOR) releaseDirector(node);
  else if (node?.comfyClass === BENCHMARK) releaseBenchmark(node);
}

function bind(node) {
  if (!node || ![DIRECTOR, BENCHMARK].includes(node.comfyClass)) return;
  if (node.comfyClass === BENCHMARK) hideBenchmarkPlumbing(node);
  const root = node.comfyClass === DIRECTOR ? node.__h3studioPanel : node.__h3bRoot;
  if (!root?.isConnected) {
    setTimeout(() => bind(node), 100);
    return;
  }

  release(node);

  const dom = widget(node, node.comfyClass === DIRECTOR ? "h3studio_controls" : "h3studio_smart_benchmark");
  if (dom?.options && !dom.options.__h3NaturalGeometryV25) {
    dom.options.__h3NaturalGeometryV25 = true;
    const previous = dom.options.afterResize;
    dom.options.afterResize = (...args) => {
      previous?.apply(dom, args);
      requestAnimationFrame(() => release(node));
      setTimeout(() => release(node), 32);
    };
  }

  if (root.__h3NaturalGeometryObserver) return;
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      release(node);
    });
  });
  observer.observe(root, { childList:true, subtree:true, attributes:true, attributeFilter:["class"] });
  root.__h3NaturalGeometryObserver = observer;

  requestAnimationFrame(() => requestAnimationFrame(() => release(node)));
  setTimeout(() => release(node), 90);
}

function sweep() {
  for (const node of app.graph?._nodes || []) bind(node);
}

app.registerExtension({
  name:"H3Studio.Nodes2NaturalGeometryV25",
  setup(){ installStyles(); setTimeout(sweep, 420); },
  nodeCreated(node){
    if (node?.comfyClass === BENCHMARK) hideBenchmarkPlumbing(node);
    if ([DIRECTOR, BENCHMARK].includes(node?.comfyClass)) setTimeout(() => bind(node), 120);
  },
  afterConfigureGraph(){ installStyles(); setTimeout(sweep, 180); },
});
