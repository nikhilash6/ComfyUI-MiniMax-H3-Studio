import { app } from "../../scripts/app.js";

const TARGET = "H3StudioSmartBenchmark";
const WIDGET_NAME = "h3studio_smart_benchmark";

function isBenchmarkWidget(item) {
  return item?.name === WIDGET_NAME
    || item?.element?.dataset?.h3BenchmarkUi === "v4"
    || item?.element?.classList?.contains?.("h3b4");
}

function benchmarkWidgets(node) {
  return (node?.widgets || []).filter(isBenchmarkWidget);
}

function boundRoot(root, node) {
  if (!root) return;
  root.dataset.h3BenchmarkUi = "v4";
  root.dataset.h3BenchmarkNode = String(node.id ?? "");
  // The benchmark is deliberately one bounded scroll surface.  Never let DOM
  // content decide the LiteGraph node height or spill over neighbouring nodes.
  root.style.setProperty("width", "100%", "important");
  root.style.setProperty("max-width", "100%", "important");
  root.style.setProperty("max-height", "560px", "important");
  root.style.setProperty("overflow-y", "auto", "important");
  root.style.setProperty("overflow-x", "hidden", "important");
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
    // DOM widgets are transient and never serialized. Removing stale widget
    // records is safe; after a restart the node reconstructs exactly one root.
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

  // PR #48's v4 renderer replaces the DOM element when it redraws. ComfyUI's
  // DOM-widget object keeps its original `.element` reference, so a later
  // configure pass incorrectly thinks the widget is disconnected and adds a
  // second complete benchmark. Bind that reference to every new live root.
  let rootValue = node.__h3bRoot || null;
  try {
    Object.defineProperty(node, "__h3bRoot", {
      configurable: true,
      enumerable: true,
      get() { return rootValue; },
      set(value) {
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
