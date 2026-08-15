import { app } from "../../scripts/app.js";

const DIRECTOR = "H3StudioDirector";
const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-nodes2-geometry-v28-style";
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
    /* Nodes 2 only. Legacy Director/Benchmark geometry remains owned by v10/v14. */
    .h3s-nodes2-mount{
      min-height:0!important;
      height:100%!important;
      overflow:hidden!important;
      align-self:stretch!important;
    }
    .h3s-nodes2-row,.h3s-nodes2-grid{
      min-height:0!important;
      overflow:hidden!important;
    }
    .h3s-nodes2-active{
      width:100%!important;
      max-width:100%!important;
      height:100%!important;
      max-height:100%!important;
      min-width:0!important;
      min-height:0!important;
      flex:1 1 auto!important;
      align-self:stretch!important;
      box-sizing:border-box!important;
    }
    .h3s-studio-panel.h3s-nodes2-active{overflow:hidden!important}
    .h3b7.h3s-nodes2-active{overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important}
    .h3s-studio-panel.h3s-nodes2-active .h3s-v6-layout,
    .h3s-studio-panel.h3s-nodes2-active .h3s-v7-layout{
      min-height:0!important;
      overflow:hidden!important;
    }
    .h3s-studio-panel.h3s-nodes2-active .h3s-v6-main,
    .h3s-studio-panel.h3s-nodes2-active .h3s-v6-inspector,
    .h3s-studio-panel.h3s-nodes2-active .h3s-v7-main,
    .h3s-studio-panel.h3s-nodes2-active .h3s-v7-inspector{
      min-height:0!important;
      overflow-y:auto!important;
      overflow-x:hidden!important;
      overscroll-behavior:contain!important;
      scrollbar-gutter:stable!important;
    }

    /* Probe mode exists for one frame while removing stale serialized heights. */
    .h3s-nodes2-probe{
      height:auto!important;
      max-height:none!important;
      flex:0 0 auto!important;
      align-self:flex-start!important;
      overflow:visible!important;
    }
  `;
  document.head.append(style);
}

function visibleSet(node) {
  if (node?.comfyClass === DIRECTOR) return DIRECTOR_VISIBLE;
  if (node?.comfyClass === BENCHMARK) return BENCHMARK_VISIBLE;
  return null;
}

function hideNodes2Plumbing(node) {
  const visible = visibleSet(node);
  if (!visible) return;
  for (const item of node.widgets || []) {
    if (visible.has(item?.name)) continue;
    item.options ||= {};
    item.options.hidden = true;
    item.hidden = true;
  }
}

function mountFor(root) {
  const mount = root?.parentElement;
  if (!mount) return null;
  const nodeEl = mount.closest?.(".lg-node");
  if (!nodeEl) return null;
  return mount;
}

function nodeElement(root) {
  return mountFor(root)?.closest?.(".lg-node") || null;
}

function markViewportChain(root) {
  const mount = mountFor(root);
  if (!mount) return null;
  mount.classList.add("h3s-nodes2-mount");
  const row = mount.closest?.('[data-testid="node-widget"]');
  const grid = mount.closest?.('[data-testid="node-widgets"]');
  row?.classList?.add("h3s-nodes2-row");
  grid?.classList?.add("h3s-nodes2-grid");
  root.classList.add("h3s-nodes2-active");
  root.classList.remove("h3s-nodes2-probe");
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

function applyNodes2Viewport(node) {
  hideNodes2Plumbing(node);
  const root = node?.comfyClass === DIRECTOR ? node.__h3studioPanel : node?.__h3bRoot;
  if (!root?.isConnected || !mountFor(root)) return false;

  markViewportChain(root);
  root.style.removeProperty("height");
  root.style.removeProperty("max-height");
  root.style.removeProperty("min-height");
  root.style.removeProperty("flex");
  root.style.removeProperty("align-self");

  if (node.comfyClass === DIRECTOR) {
    const layout = root.querySelector(".h3s-v6-layout,.h3s-v7-layout");
    const header = root.querySelector(":scope > .h3s-studio-header");
    const main = layout?.querySelector(".h3s-v6-main,.h3s-v7-main");
    const inspector = layout?.querySelector(".h3s-v6-inspector,.h3s-v7-inspector");
    if (layout) {
      const headerPx = Math.max(0, Number(header?.offsetHeight || 46));
      const available = Math.max(120, Number(root.clientHeight || 0) - headerPx);
      layout.style.setProperty("height", `${Math.floor(available)}px`, "important");
      layout.style.setProperty("max-height", `${Math.floor(available)}px`, "important");
      layout.style.setProperty("min-height", "0", "important");
      layout.style.setProperty("overflow", "hidden", "important");
    }
    for (const column of [main, inspector]) {
      if (!column) continue;
      column.style.setProperty("height", "100%", "important");
      column.style.setProperty("min-height", "0", "important");
      column.style.setProperty("overflow-y", "auto", "important");
      column.style.setProperty("overflow-x", "hidden", "important");
    }
  } else {
    nativeBenchmarkSurface(root);
  }
  return true;
}

function enterProbe(root) {
  const mount = mountFor(root);
  if (!mount) return null;
  const row = mount.closest?.('[data-testid="node-widget"]');
  const grid = mount.closest?.('[data-testid="node-widgets"]');
  root.classList.remove("h3s-nodes2-active");
  root.classList.add("h3s-nodes2-probe");
  mount.classList.remove("h3s-nodes2-mount");
  row?.classList?.remove("h3s-nodes2-row");
  grid?.classList?.remove("h3s-nodes2-grid");

  mount.style.setProperty("height", "auto", "important");
  mount.style.setProperty("min-height", "0", "important");
  mount.style.setProperty("overflow", "visible", "important");
  root.style.setProperty("height", "auto", "important");
  root.style.setProperty("max-height", "none", "important");
  root.style.setProperty("min-height", "0", "important");
  root.style.setProperty("overflow", "visible", "important");

  if (root.classList.contains("h3s-studio-panel")) {
    const layout = root.querySelector(".h3s-v6-layout,.h3s-v7-layout");
    const main = layout?.querySelector(".h3s-v6-main,.h3s-v7-main");
    const inspector = layout?.querySelector(".h3s-v6-inspector,.h3s-v7-inspector");
    if (layout) {
      layout.style.setProperty("height", "auto", "important");
      layout.style.setProperty("max-height", "none", "important");
    }
    for (const column of [main, inspector]) {
      column?.style?.setProperty("height", "auto", "important");
      column?.style?.setProperty("max-height", "none", "important");
      column?.style?.setProperty("overflow", "visible", "important");
    }
  }
  return mount;
}

function fitIntrinsicOnce(node) {
  if (!node?.graph || !Array.isArray(node?.size)) return;
  const root = node.comfyClass === DIRECTOR ? node.__h3studioPanel : node.__h3bRoot;
  const nodeEl = nodeElement(root);
  if (!root?.isConnected || !nodeEl) return;

  const fitKey = `__h3Nodes2FitV28_${String(node.id)}`;
  if (node[fitKey]) return;
  node[fitKey] = true;

  hideNodes2Plumbing(node);
  enterProbe(root);

  const width = Number(node.size[0]);
  const rect = nodeEl.getBoundingClientRect();
  const scale = width > 0 && rect.width > 0 ? rect.width / width : Number(app.canvas?.ds?.scale || 1);
  if (!(scale > 0)) { applyNodes2Viewport(node); return; }

  const oldHeight = nodeEl.style.getPropertyValue("--node-height");
  const oldPriority = nodeEl.style.getPropertyPriority("--node-height");
  nodeEl.style.setProperty("--node-height", "1px", "important");

  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!node?.graph || !root.isConnected || !nodeEl.isConnected) return;
    hideNodes2Plumbing(node);
    enterProbe(root);

    const naturalFullPx = Math.ceil(nodeEl.getBoundingClientRect().height);
    const titleHeight = Number(globalThis.LiteGraph?.NODE_TITLE_HEIGHT || 30);
    const desired = Math.max(180, Math.ceil(naturalFullPx / scale - titleHeight + 2));
    const current = Number(node.size?.[1] || 0);

    if (current > desired + 6) {
      node.setSize?.([Number(node.size[0]), desired]);
      nodeEl.style.setProperty("--node-height", `${desired + titleHeight}px`);
    } else if (oldHeight) {
      nodeEl.style.setProperty("--node-height", oldHeight, oldPriority || "");
    } else {
      nodeEl.style.removeProperty("--node-height");
    }

    requestAnimationFrame(() => {
      applyNodes2Viewport(node);
      node.setDirtyCanvas?.(true, true);
      node.graph?.setDirtyCanvas?.(true, true);
    });
  }));
}

function bind(node, fit = false) {
  if (!node || ![DIRECTOR, BENCHMARK].includes(node.comfyClass)) return;
  const root = node.comfyClass === DIRECTOR ? node.__h3studioPanel : node.__h3bRoot;
  if (!root?.isConnected) {
    setTimeout(() => bind(node, fit), 90);
    return;
  }

  /* Critical: do absolutely nothing to legacy DOM widgets. */
  if (!mountFor(root)) return;

  hideNodes2Plumbing(node);
  node.resizable = true;
  applyNodes2Viewport(node);
  if (fit) fitIntrinsicOnce(node);

  const dom = widget(node, node.comfyClass === DIRECTOR ? "h3studio_controls" : "h3studio_smart_benchmark");
  if (dom?.options && !dom.options.__h3Nodes2ResizeV28) {
    dom.options.__h3Nodes2ResizeV28 = true;
    const previous = dom.options.afterResize;
    dom.options.afterResize = function h3Nodes2AfterResize(...args) {
      const result = previous?.apply(this, args);
      requestAnimationFrame(() => applyNodes2Viewport(node));
      setTimeout(() => applyNodes2Viewport(node), 32);
      return result;
    };
  }

  if (!root.__h3Nodes2ViewportObserverV28) {
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        applyNodes2Viewport(node);
      });
    });
    observer.observe(root, { childList:true, subtree:true, attributes:true, attributeFilter:["class"] });
    root.__h3Nodes2ViewportObserverV28 = observer;
  }
}

function sweep(fit = false) {
  for (const node of app.graph?._nodes || []) bind(node, fit);
}

app.registerExtension({
  name:"H3Studio.Nodes2GeometryV28",
  setup(){
    installStyles();
    setTimeout(() => sweep(true), 320);
  },
  nodeCreated(node){
    if (![DIRECTOR, BENCHMARK].includes(node?.comfyClass)) return;
    setTimeout(() => bind(node, !app.configuringGraph), 120);
  },
  afterConfigureGraph(){
    installStyles();
    for (const node of app.graph?._nodes || []) {
      if (![DIRECTOR, BENCHMARK].includes(node?.comfyClass)) continue;
      delete node[`__h3Nodes2FitV28_${String(node.id)}`];
    }
    setTimeout(() => sweep(true), 120);
  },
});
