import { app } from "../../scripts/app.js";

const DIRECTOR = "H3StudioDirector";
const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-nodes2-natural-geometry-v25-style";

function widget(node, name) {
  return (node?.widgets || []).find((item) => item?.name === name) || null;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Nodes 2.0 owns the widget slot. H3 content should not paint/stretch to fill unused slot height. */
    .h3s-studio-panel,.h3b7{
      height:auto!important;
      min-height:0!important;
      align-self:flex-start!important;
    }
    .h3s-studio-panel{overflow:hidden!important}
    .h3b7{overflow-y:auto!important;overflow-x:hidden!important}

    /* Director keeps its two-column layout natural until the available node height actually constrains it. */
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
  `;
  document.head.append(style);
}

function slotHeight(root) {
  const parent = root?.parentElement;
  const value = Number(parent?.clientHeight || 0);
  return Number.isFinite(value) && value > 80 ? value : 0;
}

function releaseRoot(root, benchmark = false) {
  if (!root?.isConnected) return;
  const cap = slotHeight(root);
  root.style.setProperty("height", "auto", "important");
  root.style.setProperty("min-height", "0", "important");
  root.style.setProperty("align-self", "flex-start", "important");
  root.style.setProperty("max-height", cap ? `${Math.floor(cap)}px` : "100%", "important");
  root.style.setProperty("overflow-x", "hidden", "important");
  root.style.setProperty("overflow-y", benchmark ? "auto" : "hidden", "important");
}

function releaseDirector(node) {
  const root = node?.__h3studioPanel;
  if (!root?.isConnected) return;
  releaseRoot(root, false);

  const layout = root.querySelector(".h3s-v6-layout,.h3s-v7-layout");
  const main = layout?.querySelector(".h3s-v6-main,.h3s-v7-main");
  const inspector = layout?.querySelector(".h3s-v6-inspector,.h3s-v7-inspector");
  if (!layout || !main || !inspector) return;

  const header = root.querySelector(":scope > .h3s-studio-header");
  const rootCap = slotHeight(root);
  const available = rootCap ? Math.max(120, rootCap - Number(header?.offsetHeight || 46)) : 0;

  /* v14 used to write an explicit full-slot pixel height here. Remove that fill behavior. */
  layout.style.setProperty("height", "auto", "important");
  layout.style.setProperty("min-height", "0", "important");
  layout.style.setProperty("max-height", available ? `${Math.floor(available)}px` : "none", "important");

  for (const column of [main, inspector]) {
    column.style.setProperty("height", "auto", "important");
    column.style.setProperty("min-height", "0", "important");
    column.style.setProperty("max-height", available ? `${Math.floor(available)}px` : "none", "important");
    column.style.setProperty("overflow-y", "auto", "important");
    column.style.setProperty("overflow-x", "hidden", "important");
  }
}

function releaseBenchmark(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) return;
  releaseRoot(root, true);
}

function release(node) {
  if (node?.comfyClass === DIRECTOR) releaseDirector(node);
  else if (node?.comfyClass === BENCHMARK) releaseBenchmark(node);
}

function bind(node) {
  if (!node || ![DIRECTOR, BENCHMARK].includes(node.comfyClass)) return;
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
  observer.observe(root, { childList:true, subtree:true });
  root.__h3NaturalGeometryObserver = observer;

  /* Older compatibility observers may run one frame later; win deterministically without a loop. */
  requestAnimationFrame(() => requestAnimationFrame(() => release(node)));
  setTimeout(() => release(node), 90);
}

function sweep() {
  for (const node of app.graph?._nodes || []) bind(node);
}

app.registerExtension({
  name:"H3Studio.Nodes2NaturalGeometryV25",
  setup(){ installStyles(); setTimeout(sweep, 420); },
  nodeCreated(node){ if ([DIRECTOR, BENCHMARK].includes(node?.comfyClass)) setTimeout(() => bind(node), 420); },
  afterConfigureGraph(){ installStyles(); setTimeout(sweep, 480); },
});
