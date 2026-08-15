import { app } from "../../scripts/app.js";

const DIRECTOR = "H3StudioDirector";
const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-nodes2-geometry-v29-style";

/* Nodes 2 has an upstream layout bug around expandable DOM widget rows. Keep
   exactly one visible DOM surface on each H3 node and let that surface own the
   product UI. The legacy prompt/mention widgets remain in node state but do not
   participate in Vue layout. */
const DIRECTOR_VISIBLE = new Set(["h3studio_controls"]);
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
    .h3s-nodes2-grid{
      min-height:0!important;
      overflow:hidden!important;
      align-content:start!important;
    }
    .h3s-nodes2-row{
      min-height:0!important;
      overflow:hidden!important;
      align-self:start!important;
    }
    .h3s-nodes2-mount{
      min-height:0!important;
      overflow:hidden!important;
      align-self:start!important;
      flex:0 0 auto!important;
    }
    .h3s-nodes2-active{
      width:100%!important;
      max-width:100%!important;
      min-width:0!important;
      min-height:0!important;
      flex:0 0 auto!important;
      align-self:flex-start!important;
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

    /* Probe mode exists only while removing stale serialized node heights. */
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
  let changed = false;

  for (const item of node.widgets || []) {
    if (!item?.name) continue;
    item.options ||= {};
    const shouldHide = !visible.has(item.name);
    if (item.options.hidden !== shouldHide || item.hidden !== shouldHide) changed = true;
    item.options.hidden = shouldHide;
    item.hidden = shouldHide;
  }

  /* Nodes 2 stores a shallow reactive widgets array. Reassign only when a
     visibility bit changed so Vue immediately rebuilds its processed widget list. */
  if (changed) {
    try { node.widgets = [...(node.widgets || [])]; } catch {}
  }
}

function mountFor(root) {
  const mount = root?.parentElement;
  if (!mount) return null;
  const nodeEl = mount.closest?.(".lg-node");
  if (!nodeEl) return null;
  return mount;
}

function viewportParts(root) {
  const mount = mountFor(root);
  if (!mount) return null;
  const row = mount.closest?.('[data-testid="node-widget"]');
  const grid = mount.closest?.('[data-testid="node-widgets"]');
  const nodeEl = mount.closest?.(".lg-node");
  if (!row || !grid || !nodeEl) return null;
  return { mount, row, grid, nodeEl };
}

function nodeElement(root) {
  return viewportParts(root)?.nodeEl || null;
}

function markViewportChain(root) {
  const parts = viewportParts(root);
  if (!parts) return null;
  parts.mount.classList.add("h3s-nodes2-mount");
  parts.row.classList.add("h3s-nodes2-row");
  parts.grid.classList.add("h3s-nodes2-grid");
  root.classList.add("h3s-nodes2-active");
  root.classList.remove("h3s-nodes2-probe");
  return parts;
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

function viewportHeight(node, parts) {
  const width = Number(node?.size?.[0] || 0);
  const nodeRect = parts.nodeEl.getBoundingClientRect();
  const gridRect = parts.grid.getBoundingClientRect();
  const scale = width > 0 && nodeRect.width > 0
    ? nodeRect.width / width
    : Number(app.canvas?.ds?.scale || 1);
  if (!(scale > 0)) return 0;

  /* Measure from the actual top of the Vue widget grid to the inside bottom of
     the node. This automatically accounts for title, slots and any node chrome. */
  const availableScreenPx = Math.max(0, nodeRect.bottom - gridRect.top);
  const availableLocalPx = availableScreenPx / scale - 8;
  return Math.max(120, Math.floor(availableLocalPx));
}

function setViewportHeight(node, root, parts) {
  const height = viewportHeight(node, parts);
  if (!(height > 0)) return;
  const px = `${height}px`;

  /* NodeWidgets.vue sets flex:1 whenever it contains an auto/DOM row. Override
     that distribution and give the single H3 row an explicit top-anchored
     viewport instead. This avoids the upstream bottom-anchor/gap behavior. */
  parts.grid.style.setProperty("flex", "0 0 auto", "important");
  parts.grid.style.setProperty("height", px, "important");
  parts.grid.style.setProperty("min-height", "0", "important");
  parts.grid.style.setProperty("align-content", "start", "important");

  for (const element of [parts.row, parts.mount, root]) {
    element.style.setProperty("height", px, "important");
    element.style.setProperty("max-height", px, "important");
    element.style.setProperty("min-height", "0", "important");
  }
  parts.row.style.setProperty("align-self", "start", "important");
  parts.mount.style.setProperty("align-self", "start", "important");
}

function applyNodes2Viewport(node) {
  hideNodes2Plumbing(node);
  const root = node?.comfyClass === DIRECTOR ? node.__h3studioPanel : node?.__h3bRoot;
  if (!root?.isConnected) return false;
  const parts = markViewportChain(root);
  if (!parts) return false;

  setViewportHeight(node, root, parts);

  if (node.comfyClass === DIRECTOR) {
    const layout = root.querySelector(".h3s-v6-layout,.h3s-v7-layout");
    const header = root.querySelector(":scope > .h3s-studio-header");
    const main = layout?.querySelector(".h3s-v6-main,.h3s-v7-main");
    const inspector = layout?.querySelector(".h3s-v6-inspector,.h3s-v7-inspector");
    if (layout) {
      const headerPx = Math.max(0, Number(header?.offsetHeight || 46));
      const available = Math.max(80, Number(root.clientHeight || 0) - headerPx);
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
    root.style.setProperty("overflow-y", "auto", "important");
    root.style.setProperty("overflow-x", "hidden", "important");
    nativeBenchmarkSurface(root);
  }
  return true;
}

function enterProbe(root) {
  const parts = viewportParts(root);
  if (!parts) return null;
  root.classList.remove("h3s-nodes2-active");
  root.classList.add("h3s-nodes2-probe");
  parts.mount.classList.remove("h3s-nodes2-mount");
  parts.row.classList.remove("h3s-nodes2-row");
  parts.grid.classList.remove("h3s-nodes2-grid");

  for (const element of [parts.grid, parts.row, parts.mount, root]) {
    element.style.removeProperty("height");
    element.style.removeProperty("max-height");
    element.style.setProperty("min-height", "0", "important");
  }
  parts.grid.style.removeProperty("flex");
  parts.grid.style.removeProperty("align-content");
  parts.mount.style.setProperty("overflow", "visible", "important");
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
  return parts;
}

function fitIntrinsicOnce(node) {
  if (!node?.graph || !Array.isArray(node?.size)) return;
  const root = node.comfyClass === DIRECTOR ? node.__h3studioPanel : node.__h3bRoot;
  const nodeEl = nodeElement(root);
  if (!root?.isConnected || !nodeEl) return;

  const fitKey = `__h3Nodes2FitV29_${String(node.id)}`;
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

function bindNodeResizeObserver(node, root) {
  const parts = viewportParts(root);
  if (!parts || parts.nodeEl.__h3Nodes2ResizeObserverV29) return;
  let queued = false;
  const observer = new ResizeObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      applyNodes2Viewport(node);
    });
  });
  observer.observe(parts.nodeEl);
  parts.nodeEl.__h3Nodes2ResizeObserverV29 = observer;
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
  bindNodeResizeObserver(node, root);
  if (fit) fitIntrinsicOnce(node);

  const dom = widget(node, node.comfyClass === DIRECTOR ? "h3studio_controls" : "h3studio_smart_benchmark");
  if (dom?.options && !dom.options.__h3Nodes2ResizeV29) {
    dom.options.__h3Nodes2ResizeV29 = true;
    const previous = dom.options.afterResize;
    dom.options.afterResize = function h3Nodes2AfterResize(...args) {
      const result = previous?.apply(this, args);
      requestAnimationFrame(() => applyNodes2Viewport(node));
      setTimeout(() => applyNodes2Viewport(node), 32);
      return result;
    };
  }

  if (!root.__h3Nodes2ViewportObserverV29) {
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        hideNodes2Plumbing(node);
        applyNodes2Viewport(node);
      });
    });
    observer.observe(root, { childList:true, subtree:true, attributes:true, attributeFilter:["class"] });
    root.__h3Nodes2ViewportObserverV29 = observer;
  }

  /* The legacy prompt DOM editor can be created slightly after the main panel.
     Re-run visibility a few times during hydration so it never enters Vue layout. */
  for (const delay of [0, 120, 320, 700]) {
    setTimeout(() => {
      hideNodes2Plumbing(node);
      applyNodes2Viewport(node);
    }, delay);
  }
}

function sweep(fit = false) {
  for (const node of app.graph?._nodes || []) bind(node, fit);
}

app.registerExtension({
  name:"H3Studio.Nodes2GeometryV29",
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
      delete node[`__h3Nodes2FitV29_${String(node.id)}`];
    }
    setTimeout(() => sweep(true), 120);
    setTimeout(() => sweep(false), 520);
  },
});
