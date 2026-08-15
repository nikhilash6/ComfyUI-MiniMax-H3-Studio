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

function absorbRenderedRoot(stableRoot, renderedRoot) {
  if (!stableRoot || !renderedRoot || stableRoot === renderedRoot) return stableRoot;
  stableRoot.className = renderedRoot.className;
  for (const attribute of Array.from(renderedRoot.attributes || [])) {
    if (attribute.name === "style" || attribute.name === "class") continue;
    stableRoot.setAttribute(attribute.name, attribute.value);
  }
  stableRoot.replaceChildren(...Array.from(renderedRoot.childNodes || []));
  return stableRoot;
}

function boundRoot(root, node) {
  if (!root) return;
  installResponsiveStyles();
  root.dataset.h3BenchmarkUi = "v4";
  root.dataset.h3BenchmarkNode = String(node.id ?? "");

  // ComfyUI owns exact overlay width/transform for canvas zoom. Never replace
  // those values with viewport-relative sizing.
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

  // IMPORTANT: the renderer rebuilds with `oldRoot.replaceWith(newRoot)`. A
  // ComfyUI DOM widget is positioned/scaled by mutating the original HTMLElement.
  // Replacing that HTMLElement loses ComfyUI's live canvas transform at non-1x
  // zoom. Keep the first tracked element forever and absorb every redraw into it.
  let stableRoot = node.__h3bRoot || null;
  try {
    Object.defineProperty(node, "__h3bRoot", {
      configurable: true,
      enumerable: true,
      get() { return stableRoot; },
      set(value) {
        if (!value) {
          stableRoot = value;
          return;
        }
        if (!stableRoot) {
          stableRoot = value;
          boundRoot(stableRoot, node);
          return;
        }
        if (value === stableRoot) {
          boundRoot(stableRoot, node);
          return;
        }

        // `replaceWith(value)` has already happened when this setter runs. Move
        // the new renderer's children/listeners into the old tracked root, then
        // restore that old root exactly where the new one was inserted.
        copyComfyGeometry(stableRoot, value);
        absorbRenderedRoot(stableRoot, value);
        if (value.isConnected) value.replaceWith(stableRoot);
        boundRoot(stableRoot, node);

        const existing = benchmarkWidgets(node)[0];
        if (existing) existing.element = stableRoot;
        queueMicrotask(() => dedupe(node, stableRoot));
      },
    });
  } catch (error) {
    console.warn("[H3 Studio] Could not bind Smart Benchmark stable root", error);
  }

  const originalAdd = typeof node.addDOMWidget === "function" ? node.addDOMWidget.bind(node) : null;
  if (originalAdd) {
    node.addDOMWidget = function guardedAddDOMWidget(name, type, element, options = {}) {
      if (name === WIDGET_NAME) {
        const existing = dedupe(node, stableRoot);
        if (existing) {
          if (element && element !== stableRoot) {
            if (!stableRoot) stableRoot = element;
            else absorbRenderedRoot(stableRoot, element);
            boundRoot(stableRoot, node);
            existing.element = stableRoot;
          }
          existing.getMinHeight = () => 300;
          existing.getMaxHeight = () => 560;
          return existing;
        }
      }
      const created = originalAdd(name, type, element, options);
      if (name === WIDGET_NAME) {
        stableRoot = element || stableRoot;
        boundRoot(stableRoot, node);
        const target = created || benchmarkWidgets(node)[0];
        if (target) {
          target.element = stableRoot;
          target.getMinHeight = () => 300;
          target.getMaxHeight = () => 560;
        }
        dedupe(node, stableRoot);
      }
      return created;
    };
  }

  if (stableRoot) boundRoot(stableRoot, node);
  dedupe(node, stableRoot);
}

app.registerExtension({
  name: "H3Studio.SmartBenchmarkStableRootGuard",
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
