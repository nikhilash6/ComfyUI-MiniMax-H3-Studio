import { app } from "../../scripts/app.js";

const TARGET = "H3StudioSmartBenchmark";
const BACKUP_KEY = "h3studio_benchmark_scenarios_backup";
const MAX_SCENARIOS = 4;

function widget(node, name) {
  return (node?.widgets || []).find((item) => item?.name === name) || null;
}

function parse(raw) {
  try {
    const value = JSON.parse(String(raw || "[]"));
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function rawScenarios(node) {
  return String(widget(node, "scenarios_json")?.value || "[]");
}

function writeScenarios(node, raw) {
  const target = widget(node, "scenarios_json");
  if (!target) return;
  target.value = raw;
  target.callback?.(raw, app.canvas, node, [0, 0], {});
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

function normalizeCompatibility(node) {
  const mode = widget(node, "benchmark_mode");
  if (mode && mode.value !== "Unified") mode.value = "Unified";
  const max = widget(node, "max_scenarios");
  if (max && Number(max.value) !== MAX_SCENARIOS) max.value = MAX_SCENARIOS;
}

function allowEmpty(node) {
  node.__h3ScenarioEmptyUntil = Date.now() + 1500;
  node.properties ||= {};
  node.properties[BACKUP_KEY] = "[]";
}

function sync(node) {
  normalizeCompatibility(node);
  node.properties ||= {};

  const raw = rawScenarios(node);
  const current = parse(raw);
  const backupRaw = String(node.properties[BACKUP_KEY] || "[]");
  const backup = parse(backupRaw);

  if (current && current.length) {
    if (backupRaw !== raw) node.properties[BACKUP_KEY] = raw;
    return;
  }

  if (Date.now() < Number(node.__h3ScenarioEmptyUntil || 0)) return;

  // Recover only a known-good non-empty state. Brand-new intentionally empty
  // Benchmark nodes stay empty until the user adds a scenario/preset.
  if (current && current.length === 0 && backup && backup.length) {
    writeScenarios(node, backupRaw);
    console.warn(`[H3 Studio] Recovered ${backup.length} Smart Benchmark scenario(s) after an unexpected empty-state reset.`);
  }
}

function bindIntent(node, root) {
  if (root.__h3ScenarioStateIntent) return;
  root.__h3ScenarioStateIntent = true;
  root.addEventListener("click", (event) => {
    const button = event.target?.closest?.("button");
    if (!button) return;
    const text = String(button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (text === "clear" || text.includes("clear scenarios")) {
      allowEmpty(node);
      return;
    }
    if (button.matches?.(".h3b7-scenario > summary .h3b7-x") && (parse(rawScenarios(node))?.length || 0) <= 1) {
      allowEmpty(node);
    }
  }, true);
}

function attach(node) {
  if (!node || node.comfyClass !== TARGET) return;
  normalizeCompatibility(node);
  const root = node.__h3bRoot;
  if (!root?.isConnected) {
    setTimeout(() => attach(node), 100);
    return;
  }

  bindIntent(node, root);
  sync(node);

  if (!root.__h3ScenarioStateObserver) {
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        sync(node);
      });
    });
    observer.observe(root, { childList: true, subtree: true });
    root.__h3ScenarioStateObserver = observer;
  }

  if (!node.__h3ScenarioStateTimer) {
    node.__h3ScenarioStateTimer = setInterval(() => {
      if (!node.graph) {
        clearInterval(node.__h3ScenarioStateTimer);
        node.__h3ScenarioStateTimer = null;
        return;
      }
      sync(node);
    }, 700);
  }
}

function sweep() {
  for (const node of app.graph?._nodes || []) if (node?.comfyClass === TARGET) attach(node);
}

app.registerExtension({
  name: "H3Studio.BenchmarkScenarioStateV31",
  setup() {
    for (const delay of [0, 120, 400, 900]) setTimeout(sweep, delay);
  },
  nodeCreated(node) {
    if (node?.comfyClass === TARGET) setTimeout(() => attach(node), 100);
  },
  afterConfigureGraph() {
    for (const delay of [0, 120, 420]) setTimeout(sweep, delay);
  },
});
