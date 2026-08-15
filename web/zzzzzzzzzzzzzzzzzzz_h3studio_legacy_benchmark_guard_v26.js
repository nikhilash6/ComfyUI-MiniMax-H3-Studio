import { app } from "../../scripts/app.js";

const BENCHMARK = "H3StudioSmartBenchmark";
const WIDGET_NAME = "h3studio_smart_benchmark";
const STYLE_ID = "h3studio-legacy-benchmark-guard-v26-style";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Classic Nodes only: one native surface and one scenario MP control. */
    .h3b7.h3b21.h3b23{
      border-color:color-mix(in srgb,var(--border-color,#3a4046) 78%,transparent)!important;
      box-shadow:none!important;
    }
    .h3b7.h3b23 .h3b21-mp{
      display:grid!important;
    }
    .h3b7.h3b23 .h3b21-mp-help{
      display:none!important;
    }
    .h3b7.h3b23 .h3b7-field.h3b24-mp-field > .h3b24-mp{
      display:none!important;
    }
  `;
  document.head.append(style);
}

function widget(node, name) {
  return (node?.widgets || []).find((item) => item?.name === name) || null;
}

function nativeSurface(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) return;

  root.classList.add("h3b23");
  root.style.setProperty("background", String(node.bgcolor || "#272a2f"), "important");
  root.style.setProperty("background-image", "none", "important");
  root.style.setProperty("box-shadow", "none", "important");
  root.style.setProperty("height", "100%", "important");
  root.style.setProperty("max-height", "100%", "important");
  root.style.setProperty("min-height", "0", "important");
  root.style.setProperty("overflow-y", "auto", "important");
  root.style.setProperty("overflow-x", "hidden", "important");

  const surfaces = [
    root.querySelector(":scope > .h3b7-top"),
    root.querySelector(":scope > .h3b7-body"),
    ...root.querySelectorAll(
      ".h3b15-plan,.h3b7-summary,.h3b7-list,.h3b7-scenario,.h3b7-scenario>summary,.h3b7-fields"
    ),
  ];
  for (const surface of surfaces) {
    if (!surface) continue;
    surface.style.setProperty("background", "transparent", "important");
    surface.style.setProperty("background-image", "none", "important");
    surface.style.setProperty("box-shadow", "none", "important");
  }

  const parent = root.parentElement;
  if (parent) {
    parent.style.setProperty("max-width", "100%", "important");
    parent.style.setProperty("max-height", "100%", "important");
    parent.style.setProperty("min-height", "0", "important");
    parent.style.setProperty("overflow", "hidden", "important");
  }
}

function boundClassicWidget(node) {
  const dom = widget(node, WIDGET_NAME);
  if (!dom) return;
  dom.options ||= {};

  /* Restore the original Benchmark Lab height contract. The UI scrolls inside
     this allocation instead of asking LiteGraph for an ever taller DOM widget. */
  dom.computedHeight = undefined;
  dom.options.getMinHeight = () => 330;
  dom.options.getMaxHeight = () => 560;

  if (!dom.options.__h3ClassicBoundV26) {
    dom.options.__h3ClassicBoundV26 = true;
    const previous = dom.options.afterResize;
    dom.options.afterResize = function h3ClassicBenchmarkResize(...args) {
      const result = previous?.apply(this, args);
      requestAnimationFrame(() => nativeSurface(node));
      return result;
    };
  }
}

function apply(node) {
  if (!node || node.comfyClass !== BENCHMARK) return;
  const root = node.__h3bRoot;
  if (!root?.isConnected) {
    setTimeout(() => apply(node), 100);
    return;
  }

  boundClassicWidget(node);
  nativeSurface(node);

  if (!root.__h3ClassicBenchmarkObserverV26) {
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (node.__h3bRoot?.isConnected) {
          boundClassicWidget(node);
          nativeSurface(node);
        }
      });
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    root.__h3ClassicBenchmarkObserverV26 = observer;
  }

  const size = Array.isArray(node.size) ? [Number(node.size[0]), Number(node.size[1])] : null;
  if (size && !node.__h3ClassicBenchmarkRelayoutV26) {
    node.__h3ClassicBenchmarkRelayoutV26 = true;
    requestAnimationFrame(() => {
      if (!node.graph) return;
      node.setSize?.(size);
      node.setDirtyCanvas?.(true, true);
    });
  }
}

function sweep() {
  for (const node of app.graph?._nodes || []) if (node?.comfyClass === BENCHMARK) apply(node);
}

app.registerExtension({
  name: "H3Studio.LegacyBenchmarkGuardV26",
  setup() {
    installStyles();
    setTimeout(sweep, 460);
  },
  nodeCreated(node) {
    if (node?.comfyClass === BENCHMARK) setTimeout(() => apply(node), 460);
  },
  afterConfigureGraph() {
    installStyles();
    setTimeout(sweep, 520);
  },
});
