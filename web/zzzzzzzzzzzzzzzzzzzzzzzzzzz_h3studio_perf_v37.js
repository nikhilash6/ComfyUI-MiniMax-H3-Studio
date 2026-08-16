import { app } from "../../scripts/app.js";

const DIRECTOR = "H3StudioDirector";

// These legacy layers are still part of the verified visual baseline. Their
// callbacks are intentionally preserved; only the observation scope is reduced.
// The canonical Director rebuild replaces children of __h3studioPanel, while
// live controls already own their own input/change listeners. Watching every
// nested text-node replacement made all of these decorators wake together.
const ROOT_ONLY_OBSERVERS = [
  "__h3studioV6Observer",
  "__h3GeometryObserver",
  "__h3InteractionRestoreObserver",
  "__h3BenchmarkControlsV12Observer",
  "__h3b14Observer",
  "__h3b14DirectorObserver",
  "__h3b15Observer",
  "__h3V16Observer",
  "__h3V17Observer",
  "__h3V18Observer",
  "__h3V20Observer",
  "__h3V21Observer",
  "__h3studioSeedObserver",
  "__h3studioBenchmarkV8Observer",
  "__h3sMpScrollObserver",
];

// Intercept MutationObserver.prototype.observe to globally prevent subtree observation storms
// on the Studio panel and benchmark roots without altering any visual decoration code.
if (typeof MutationObserver !== "undefined" && !MutationObserver.prototype.__h3PerfPatched) {
  MutationObserver.prototype.__h3PerfPatched = true;
  const originalObserve = MutationObserver.prototype.observe;
  MutationObserver.prototype.observe = function (target, options) {
    if (
      target?.classList?.contains?.("h3s-studio-panel") ||
      target?.classList?.contains?.("h3b7") ||
      target?.closest?.(".h3s-studio-panel") ||
      target?.closest?.(".h3b7")
    ) {
      if (options && options.subtree) {
        options = { ...options, subtree: false };
      }
    }
    return originalObserve.call(this, target, options);
  };
}

function injectPerfStyles() {
  const PERF_STYLE_ID = "h3studio-perf-v38-styles";
  if (document.getElementById(PERF_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PERF_STYLE_ID;
  style.textContent = `
    .h3s-studio-panel,
    .h3b7,
    .h3s-prompt-mentions-wrap {
      contain: layout style !important;
      will-change: transform !important;
      transform-style: preserve-3d !important;
      backface-visibility: hidden !important;
    }
    body.h3s-canvas-navigating .h3s-studio-panel,
    body.h3s-canvas-navigating .h3b7,
    body.h3s-canvas-navigating .h3s-prompt-mentions-wrap {
      pointer-events: none !important;
      user-select: none !important;
    }
  `;
  document.head.appendChild(style);
}

let navTimer = null;
function setNavigating(active) {
  if (active) {
    if (!document.body.classList.contains("h3s-canvas-navigating")) {
      document.body.classList.add("h3s-canvas-navigating");
    }
    clearTimeout(navTimer);
    navTimer = setTimeout(() => {
      document.body.classList.remove("h3s-canvas-navigating");
      navTimer = null;
    }, 120);
  } else {
    clearTimeout(navTimer);
    navTimer = null;
    document.body.classList.remove("h3s-canvas-navigating");
  }
}

function installCanvasNavGuard() {
  if (window.__h3CanvasNavGuardInstalled) return;
  window.__h3CanvasNavGuardInstalled = true;

  // 1. Hook LiteGraph zoom/scale methods so ANY zoom method activates navigation mode
  const proto = globalThis.LGraphCanvas?.prototype;
  if (proto) {
    const origSetZoom = proto.setZoom;
    if (typeof origSetZoom === "function") {
      proto.setZoom = function () {
        setNavigating(true);
        return origSetZoom.apply(this, arguments);
      };
    }

    const origChangeDeltaScale = proto.changeDeltaScale;
    if (typeof origChangeDeltaScale === "function") {
      proto.changeDeltaScale = function () {
        setNavigating(true);
        return origChangeDeltaScale.apply(this, arguments);
      };
    }
  }

  // 2. Global event listeners for wheel and drag
  window.addEventListener(
    "wheel",
    (e) => {
      // Zooming with modifier key or outside Director DOM widget activates navigation mode
      const insideWidget = e.target?.closest?.(".h3s-studio-panel, .h3b7, .h3s-prompt-mentions-wrap");
      if (e.ctrlKey || e.metaKey || !insideWidget) {
        setNavigating(true);
      }
    },
    { capture: true, passive: true }
  );

  window.addEventListener(
    "pointerdown",
    (e) => {
      const onWidget = e.target?.closest?.(".h3s-studio-panel, .h3b7, .h3s-prompt-mentions-wrap");
      if (!onWidget) {
        setNavigating(true);
      }
    },
    { capture: true, passive: true }
  );

  window.addEventListener("pointerup", () => setNavigating(false), { capture: true, passive: true });
  window.addEventListener("pointercancel", () => setNavigating(false), { capture: true, passive: true });
}

function tuneObserver(observer, root) {
  if (!observer) return false;
  try {
    observer.disconnect();
    observer.observe(root, { childList: true });
    return true;
  } catch {
    return false;
  }
}

function optimizeDirector(node) {
  if (node?.comfyClass !== DIRECTOR && node?.comfyClass !== "H3StudioSmartBenchmark") return;
  const root = node.__h3studioPanel || node.__h3bRoot;
  if (!root?.isConnected) return;

  // Clean up content-visibility which causes Chromium layer reallocation during canvas zoom
  root.style.removeProperty("content-visibility");
  root.style.removeProperty("contain-intrinsic-size");

  for (const key of ROOT_ONLY_OBSERVERS) {
    if (root[key]) tuneObserver(root[key], root);
    if (node[key]) tuneObserver(node[key], root);
  }
}

function sweep() {
  for (const node of app.graph?._nodes || []) optimizeDirector(node);
}

function scheduleNode(node) {
  for (const delay of [0, 160, 360, 760, 1500, 2600]) {
    setTimeout(() => optimizeDirector(node), delay);
  }
}

function scheduleSweep() {
  for (const delay of [320, 700, 1400, 2800]) setTimeout(sweep, delay);
}

app.registerExtension({
  name: "H3Studio.PerformanceV38",
  setup() {
    injectPerfStyles();
    installCanvasNavGuard();
    scheduleSweep();
  },
  nodeCreated(node) {
    if (node?.comfyClass === DIRECTOR) scheduleNode(node);
  },
  afterConfigureGraph() {
    scheduleSweep();
  },
});
