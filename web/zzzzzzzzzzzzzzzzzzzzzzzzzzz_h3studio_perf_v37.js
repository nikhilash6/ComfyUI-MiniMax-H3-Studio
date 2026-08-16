import { app } from "../../scripts/app.js";

const DIRECTOR = "H3StudioDirector";

// These legacy layers are still part of the verified visual baseline. Their
// callbacks are intentionally preserved; only the observation scope is reduced.
// The canonical Director rebuild replaces children of __h3studioPanel, while
// live controls already own their own input/change listeners. Watching every
// nested text-node replacement made all of these decorators wake together.
const ROOT_ONLY_OBSERVERS = [
  "__h3studioV6Observer",
  "__h3InteractionRestoreObserver",
  "__h3b14DirectorObserver",
  "__h3b15Observer",
  "__h3V16Observer",
  "__h3V17Observer",
  "__h3V20Observer",
];

const tuned = new WeakSet();

function tuneObserver(observer, root) {
  if (!observer || tuned.has(observer)) return false;
  try {
    observer.disconnect();
    observer.observe(root, { childList: true });
    tuned.add(observer);
    return true;
  } catch {
    return false;
  }
}

function optimizeDirector(node) {
  if (node?.comfyClass !== DIRECTOR) return;
  const root = node.__h3studioPanel;
  if (!root?.isConnected) return;

  for (const key of ROOT_ONLY_OBSERVERS) tuneObserver(root[key], root);
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
