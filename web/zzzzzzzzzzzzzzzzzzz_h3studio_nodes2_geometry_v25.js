import { app } from "../../scripts/app.js";

const DIRECTOR = "H3StudioDirector";
const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-nodes2-natural-geometry-v27-style";
const DIRECTOR_VISIBLE = new Set(["prompt", "h3_prompt_mentions", "h3studio_controls"]);
const BENCHMARK_VISIBLE = new Set(["h3studio_smart_benchmark"]);

function widget(node, name) {
  return (node?.widgets || []).find((item) => item?.name === name) || null;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Nodes 2 WidgetDOM.vue applies *:flex-1 to custom DOM children. H3 owns its
       own internal layout, so the surface itself must stay intrinsic. */
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
      max-height:none!important;
      overflow:hidden!important;
    }
    .h3s-v6-main,.h3s-v6-inspector,.h3s-v7-main,.h3s-v7-inspector{
      height:auto!important;
      min-height:0!important;
      max-height:none!important;
      overflow-y:auto!important;
      overflow-x:hidden!important;
      overscroll-behavior:contain!important;
    }

    /* Keep the Benchmark visually part of the Comfy node rather than a nested app. */
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

function hideForNodes2(node) {
  if (!node) return;
  const visible = node.comfyClass === DIRECTOR
    ? DIRECTOR_VISIBLE
    : node.comfyClass === BENCHMARK
      ? BENCHMARK_VISIBLE
      : null;
  if (!visible) return;

  let changed = false;
  for (const item of node.widgets || []) {
    if (visible.has(item?.name)) continue;
    item.options ||= {};
    /* Nodes 2 visibility comes from widget.options.hidden. widget.hidden alone
       only covers the legacy LiteGraph path. Keep both so the workflow behaves
       correctly in either renderer. */
    if (item.options.hidden !== true || item.hidden !== true) changed = true;
    item.options.hidden = true;
    item.hidden = true;
  }

  /* Nodes 2 maps widgets through a shallow-reactive array. Deep option changes
     made after the initial extraction need an array mutation so Vue recomputes
     SafeWidgetData and actually removes the hidden rows. */
  if (changed && Array.isArray(node.widgets)) {
    try { node.widgets = [...node.widgets]; } catch (_) {}
  }
}

function nodes2Mount(root) {
  const parent = root?.parentElement;
  if (!parent) return null;
  /* Current WidgetDOM.vue mount is <div class="flex flex-col *:flex-1">. */
  if (!parent.classList?.contains("flex") || !parent.classList?.contains("flex-col")) return null;
  return parent;
}

function nodes2NodeElement(root) {
  const mount = nodes2Mount(root);
  if (!mount) return null;
  return mount.closest?.(".lg-node") || mount.closest?.("[data-node-id]") || null;
}

function prepareNodes2Mount(root) {
  const mount = nodes2Mount(root);
  if (!mount) return null;
  mount.style.setProperty("flex", "0 0 auto", "important");
  mount.style.setProperty("height", "auto", "important");
  mount.style.setProperty("min-height", "0", "important");
  mount.style.setProperty("align-self", "start", "important");
  mount.style.setProperty("overflow", "hidden", "important");
  return mount;
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

function releaseRoot(root, benchmark = false) {
  if (!root?.isConnected) return;
  prepareNodes2Mount(root);
  root.style.setProperty("flex", "0 0 auto", "important");
  root.style.setProperty("flex-grow", "0", "important");
  root.style.setProperty("flex-shrink", "0", "important");
  root.style.setProperty("height", "auto", "important");
  root.style.setProperty("min-height", "0", "important");
  root.style.setProperty("align-self", "flex-start", "important");
  root.style.setProperty("max-height", benchmark ? "560px" : "none", "important");
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
  const root = node?.__h3bRoot;
  if (!root?.isConnected) return;
  releaseRoot(root, true);
  nativeBenchmarkSurface(root);
}

function release(node) {
  hideForNodes2(node);
  if (node?.comfyClass === DIRECTOR) releaseDirector(node);
  else if (node?.comfyClass === BENCHMARK) releaseBenchmark(node);
}

function fitNodes2Intrinsic(node, root) {
  if (!node?.graph || !root?.isConnected || !Array.isArray(node?.size)) return;
  const mount = prepareNodes2Mount(root);
  const nodeEl = nodes2NodeElement(root);
  if (!mount || !nodeEl) return;

  hideForNodes2(node);
  release(node);

  const width = Number(node.size[0]);
  const currentHeight = Number(node.size[1]);
  const rectBefore = nodeEl.getBoundingClientRect();
  if (!(width > 0) || !(currentHeight > 0) || !(rectBefore.width > 0)) return;

  /* Width is stable while we probe height, so it gives us the canvas zoom scale
     without depending on the already-broken node height. */
  const scale = rectBefore.width / width;
  if (!(scale > 0)) return;

  const previousHeightVar = nodeEl.style.getPropertyValue("--node-height");
  const previousHeightPriority = nodeEl.style.getPropertyPriority("--node-height");

  /* LGraphNode.vue uses --node-height only as a min-height. Drop that floor for
     one frame; the Vue node is then free to collapse to its actual DOM content. */
  nodeEl.style.setProperty("--node-height", "1px", "important");

  requestAnimationFrame(() => {
    if (!node?.graph || !root?.isConnected || !nodeEl.isConnected) return;
    hideForNodes2(node);
    release(node);

    const naturalFullPx = Math.ceil(nodeEl.getBoundingClientRect().height);
    const titleHeight = Number(globalThis.LiteGraph?.NODE_TITLE_HEIGHT || 30);
    const desiredHeight = Math.max(120, Math.ceil(naturalFullPx / scale - titleHeight + 2));
    const now = Number(node.size?.[1] || currentHeight);

    if (now > desiredHeight + 8) {
      node.setSize?.([Number(node.size[0]), desiredHeight]);
      /* Do not wait for the external-layout bridge to repaint the CSS variable. */
      nodeEl.style.setProperty("--node-height", `${desiredHeight + titleHeight}px`);
      node.setDirtyCanvas?.(true, true);
      node.graph?.setDirtyCanvas?.(true, true);
    } else if (previousHeightVar) {
      nodeEl.style.setProperty("--node-height", previousHeightVar, previousHeightPriority || "");
    } else {
      nodeEl.style.removeProperty("--node-height");
    }

    requestAnimationFrame(() => release(node));
  });
}

function scheduleBootFits(node, root) {
  if (!nodes2Mount(root)) return;
  node.__h3Nodes2BootFitStarted ??= performance.now();
  const started = node.__h3Nodes2BootFitStarted;
  for (const delay of [0, 90, 240, 520, 900]) {
    setTimeout(() => {
      /* Boot-only normalization: catch onConfigure/afterConfigureGraph size writes,
         then stop. Manual resizing after load remains completely user-controlled. */
      if (performance.now() - started > 1400) return;
      fitNodes2Intrinsic(node, root);
    }, delay);
  }
}

function bind(node) {
  if (!node || ![DIRECTOR, BENCHMARK].includes(node.comfyClass)) return;
  hideForNodes2(node);
  const root = node.comfyClass === DIRECTOR ? node.__h3studioPanel : node.__h3bRoot;
  if (!root?.isConnected) {
    setTimeout(() => bind(node), 100);
    return;
  }

  release(node);
  scheduleBootFits(node, root);

  const dom = widget(node, node.comfyClass === DIRECTOR ? "h3studio_controls" : "h3studio_smart_benchmark");
  if (dom?.options && !dom.options.__h3NaturalGeometryV27) {
    dom.options.__h3NaturalGeometryV27 = true;
    const previous = dom.options.afterResize;
    dom.options.afterResize = (...args) => {
      previous?.apply(dom, args);
      requestAnimationFrame(() => release(node));
      setTimeout(() => release(node), 32);
    };
  }

  if (root.__h3NaturalGeometryObserverV27) return;
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      hideForNodes2(node);
      release(node);
    });
  });
  observer.observe(root, { childList:true, subtree:true, attributes:true, attributeFilter:["class"] });
  root.__h3NaturalGeometryObserverV27 = observer;
}

function sweep() {
  for (const node of app.graph?._nodes || []) bind(node);
}

app.registerExtension({
  name:"H3Studio.Nodes2NaturalGeometryV27",
  setup(){ installStyles(); setTimeout(sweep, 280); },
  nodeCreated(node){
    if ([DIRECTOR, BENCHMARK].includes(node?.comfyClass)) {
      hideForNodes2(node);
      setTimeout(() => bind(node), 80);
    }
  },
  afterConfigureGraph(){
    installStyles();
    setTimeout(sweep, 100);
    setTimeout(sweep, 360);
  },
});
