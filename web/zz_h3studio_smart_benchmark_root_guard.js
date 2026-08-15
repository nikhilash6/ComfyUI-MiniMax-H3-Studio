import { app } from "../../scripts/app.js";

const TARGET = "H3StudioSmartBenchmark";
const WIDGET_NAME = "h3studio_smart_benchmark";
const STYLE_ID = "h3studio-smart-benchmark-container-fix";

function installResponsiveStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3b4{container-type:inline-size;min-width:0;box-sizing:border-box}
    @container (max-width:680px){
      .h3b4-presets{grid-template-columns:1fr 1fr}
      .h3b4-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
      .h3b4-grid>.h3b4-field:last-child{grid-column:1/-1}
    }
    @container (max-width:500px){
      .h3b4-head{align-items:flex-start;flex-direction:column}
      .h3b4-presets,.h3b4-grid{grid-template-columns:1fr}
      .h3b4-grid>.h3b4-field:last-child{grid-column:auto}
      .h3b4-summary{flex-direction:column}
    }
  `;
  document.head.append(style);
}

function isBenchmarkWidget(item) {
  return item?.name === WIDGET_NAME
    || item?.element?.dataset?.h3BenchmarkUi === "v4"
    || item?.element?.classList?.contains?.("h3b4");
}

function benchmarkWidgets(node) {
  return (node?.widgets || []).filter(isBenchmarkWidget);
}

function copyComfyGeometry(from, to) {
  if (!from || !to || from === to) return;
  // addDOMWidget owns these inline values. The v4 renderer replaces its root,
  // so carry the canvas-overlay geometry forward immediately instead of letting
  // a fresh `width:100%` root size itself against the browser viewport.
  for (const property of [
    "position", "left", "top", "right", "bottom", "width", "height",
    "transform", "transform-origin", "z-index", "display", "visibility",
    "pointer-events", "opacity",
  ]) {
    const value = from.style?.getPropertyValue?.(property);
    if (!value) continue;
    to.style.setProperty(property, value, from.style.getPropertyPriority(property));
  }
}

function boundRoot(root, node) {
  if (!root) return;
  installResponsiveStyles();
  root.dataset.h3BenchmarkUi = "v4";
  root.dataset.h3BenchmarkNode = String(node.id ?? "");

  // IMPORTANT: never force width/max-width here. ComfyUI positions DOM widgets
  // in a canvas overlay and writes the exact pixel width onto the widget element.
  // PR #49's old `width:100%!important` made 100% mean the overlay/viewport,
  // which is exactly the giant right-side overflow seen in real workflows.
  if (root.style.getPropertyPriority("width") === "important" && root.style.getPropertyValue("width") === "100%") {
    root.style.removeProperty("width");
  }
  if (root.style.getPropertyPriority("max-width") === "important" && root.style.getPropertyValue("max-width") === "100%") {
    root.style.removeProperty("max-width");
  }
  root.style.setProperty("min-width", "0", "important");
  root.style.setProperty("box-sizing", "border-box", "important");
  root.style.setProperty("max-height", "560px", "important");
  root.style.setProperty("overflow-y", "auto", "important");
  root.style.setProperty("overflow-x", "hidden", "important");
  root.style.setProperty("overscroll-behavior", "contain", "important");
  root.style.setProperty("contain", "layout paint", "important");
}

function dedupe(node, preferred = null) {
  const matches = benchmarkWidgets(node);
  if (!matches.length) return null;
  const liveRoot = preferred || node.__h3bRoot || null;
  const keep = matches.find((item) => liveRoot && item.element === liveRoot)
    || matches.find((item) => item.element?.isConnected)
    || matches[0];

  if (liveRoot) {
    boundRoot(liveRoot, node);
    keep.element = liveRoot;
  } else if (keep.element) {
    boundRoot(keep.element, node);
  }

  for (const extra of matches) {
    if (extra === keep) continue;
    extra.element?.remove?.();
    extra.inputEl?.remove?.();
    const index = node.widgets.indexOf(extra);
    if (index >= 0) node.widgets.splice(index, 1);
  }
  if (matches.length > 1) {
    console.warn(`[H3 Studio] Smart Benchmark root guard removed ${matches.length - 1} duplicate DOM widget(s).`);
  }
  return keep;
}

function install(node) {
  if (!node || node.comfyClass !== TARGET || node.__h3bRootGuardInstalled) {
    if (node?.comfyClass === TARGET) dedupe(node);
    return;
  }
  node.__h3bRootGuardInstalled = true;
  installResponsiveStyles();

  // The benchmark renderer redraws by replacing its root. Preserve ComfyUI's
  // overlay geometry from the previous root and rebind the DOM-widget handle to
  // the new root immediately. This fixes both duplicate roots and viewport-width
  // overflow without fighting ComfyUI's own node-layout system.
  let rootValue = node.__h3bRoot || null;
  try {
    Object.defineProperty(node, "__h3bRoot", {
      configurable: true,
      enumerable: true,
      get() { return rootValue; },
      set(value) {
        const previous = rootValue;
        if (previous && value && previous !== value) copyComfyGeometry(previous, value);
        rootValue = value;
        boundRoot(value, node);
        const existing = benchmarkWidgets(node)[0];
        if (existing && value) existing.element = value;
        queueMicrotask(() => dedupe(node, value));
      },
    });
  } catch (error) {
    console.warn("[H3 Studio] Could not bind Smart Benchmark root", error);
  }

  const originalAdd = typeof node.addDOMWidget === "function" ? node.addDOMWidget.bind(node) : null;
  if (originalAdd) {
    node.addDOMWidget = function guardedAddDOMWidget(name, type, element, options = {}) {
      if (name === WIDGET_NAME) {
        const existing = dedupe(node, rootValue);
        if (existing) {
          if (element && element !== existing.element) {
            copyComfyGeometry(existing.element, element);
            boundRoot(element, node);
            if (existing.element?.isConnected && !element.isConnected) existing.element.replaceWith(element);
            existing.element = element;
            rootValue = element;
          }
          existing.getMinHeight = () => 300;
          existing.getMaxHeight = () => 560;
          return existing;
        }
      }
      const created = originalAdd(name, type, element, options);
      if (name === WIDGET_NAME) {
        rootValue = element || rootValue;
        boundRoot(rootValue, node);
        const target = created || benchmarkWidgets(node)[0];
        if (target) {
          target.element = rootValue;
          target.getMinHeight = () => 300;
          target.getMaxHeight = () => 560;
        }
        dedupe(node, rootValue);
      }
      return created;
    };
  }

  if (rootValue) boundRoot(rootValue, node);
  dedupe(node, rootValue);
}

app.registerExtension({
  name: "H3Studio.SmartBenchmarkSingleRootGuard",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TARGET) return;
    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function h3BenchmarkRootGuardCreated() {
      const result = created?.apply(this, arguments);
      install(this);
      return result;
    };
    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function h3BenchmarkRootGuardConfigured() {
      const result = configured?.apply(this, arguments);
      install(this);
      queueMicrotask(() => dedupe(this, this.__h3bRoot));
      return result;
    };
  },
  nodeCreated(node) {
    if (node?.comfyClass === TARGET) install(node);
  },
  afterConfigureGraph() {
    setTimeout(() => {
      for (const node of app.graph?._nodes || []) {
        if (node?.comfyClass === TARGET) {
          install(node);
          dedupe(node, node.__h3bRoot);
        }
      }
    }, 120);
  },
});
