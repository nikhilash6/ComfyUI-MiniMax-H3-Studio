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
  name: "H3Studio.PerformanceV37",
  setup() {
    scheduleSweep();
  },
  nodeCreated(node) {
    if (node?.comfyClass === DIRECTOR) scheduleNode(node);
  },
  afterConfigureGraph() {
    scheduleSweep();
  },
});
