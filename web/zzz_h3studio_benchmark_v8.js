import { app } from "../../scripts/app.js";
import { stateFromNode } from "./js/studio_extension.js";


if (!globalThis.__H3_STUDIO_CANONICAL_UI__) {
const TARGET = "H3StudioSmartBenchmark";
const DIRECTOR = "H3StudioDirector";
const LOADER = "H3StudioLoader";
const STYLE_ID = "h3studio-benchmark-v8-style";

function widget(node, name) { return node?.widgets?.find((item) => item?.name === name) || null; }
function graphLink(id) {
  const links = app.graph?.links;
  if (!links || id == null) return null;
  return typeof links.get === "function" ? links.get(id) : links[id];
}
function sourceNode(node, inputName, expectedClass = "") {
  const input = node?.inputs?.find((item) => item.name === inputName);
  const link = graphLink(input?.link);
  if (!link) return null;
  const source = app.graph?.getNodeById?.(Number(link.origin_id ?? link.originId ?? link.source_id));
  return !expectedClass || source?.comfyClass === expectedClass ? source : null;
}
function routeFor(director) {
  const state = director ? stateFromNode(director) : null;
  if (state?.generation?.route === "ref2va") return "ref2va";
  if (state?.generation?.route === "fl2va") return "fl2va";
  const refs = (state?.references || []).filter((item) => item?.enabled !== false).length;
  return state?.generation?.mode === "reference_edit" || refs >= 2 ? "ref2va" : "fl2va";
}
function currentBase(node) {
  const director = sourceNode(node, "studio_context", DIRECTOR);
  const loader = sourceNode(node, "h3_bundle", LOADER);
  const state = director ? stateFromNode(director) : {};
  const route = routeFor(director);
  return {
    model_name: String(widget(loader, route === "ref2va" ? "ref2va_model" : "fl2va_model")?.value || ""),
    runtime_preset: state?.ui?.runtime_optimization || "auto",
    runtime_advanced: structuredClone(state?.ui?.runtime_advanced || {}),
    megapixels: Number(state?.generation?.megapixels || 1),
    custom_loras: structuredClone(Array.isArray(state?.ui?.custom_loras) ? state.ui.custom_loras : []),
  };
}
function qualityVsLightX(node) {
  const base = currentBase(node);
  return [
    { ...structuredClone(base), name: "Base · 20 steps", sampling_profile: "base_quality_20" },
    { ...structuredClone(base), name: "LightX · 8 steps", sampling_profile: "lightx_v1_fl2v_8" },
  ];
}
function refreshBenchmark(node) {
  queueMicrotask(() => {
    try { node.onConfigure?.({}); } catch { node.setDirtyCanvas?.(true, true); }
  });
}
function saveScenarios(node, scenarios) {
  const target = widget(node, "scenarios_json");
  if (!target) return;
  target.value = JSON.stringify(scenarios);
  target.callback?.(target.value, app.canvas, node, [0, 0], {});
  node.properties ||= {};
  node.properties.h3studio_benchmark_preset = "quality-lightx";
  node.setDirtyCanvas?.(true, true);
  refreshBenchmark(node);
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3b7{--b-accent:#c88a4c!important;background:#303236!important;border-color:#4a4e55!important;border-radius:8px!important;max-height:520px!important}
    .h3b7-top{background:#373a3f!important;border-bottom-color:#4a4e55!important;box-shadow:inset 3px 0 0 #b8783e;padding:10px 12px!important}
    .h3b7-icon{background:#292c30!important;color:#d9a16d!important;border:0!important;font-size:12px!important}
    .h3b7-body{padding:9px 11px 11px!important}.h3b7-segments{background:#292c30!important;border:1px solid #40444a!important;padding:2px!important}.h3b7-segment{min-height:25px!important;padding:4px 8px!important;transition:background .12s ease,color .12s ease!important}.h3b7-segment.is-active{background:#564331!important;color:#f4d0aa!important;box-shadow:inset 0 0 0 1px #7a5a3d!important}
    .h3b7-btn{min-height:26px!important;background:#3a3e43!important;border-color:#50555d!important;transition:background .12s ease,border-color .12s ease,transform .12s ease!important}.h3b7-btn.primary{background:#574432!important;border-color:#7a5b3e!important;color:#f4d4b4!important}.h3b7-btn:active{transform:translateY(1px)}
    .h3b7-summary{background:#2c2f33!important;border-left:2px solid #8d6846!important}.h3b7-scenario{background:#36393e!important;border-color:#484d54!important}.h3b7-scenario[open]{background:#383c41!important;border-color:#5a6068!important}.h3b7-index{background:#2b2e32!important;color:#d7a06d!important}.h3b7-fields{background:#303338!important}.h3b7-input,.h3b7-select{background:#383c41!important;border-color:#50555d!important}.h3b7-empty{background:#32353a!important;padding:14px!important}
  `;
  document.head.append(style);
}

function ensureDefault(node) {
  node.properties ||= {};
  if (node.properties.h3studio_benchmark_v8_initialized) return;
  node.properties.h3studio_benchmark_v8_initialized = true;
  let scenarios = [];
  try { scenarios = JSON.parse(String(widget(node, "scenarios_json")?.value || "[]")); } catch { scenarios = []; }
  if (!Array.isArray(scenarios) || !scenarios.length) saveScenarios(node, qualityVsLightX(node));
}

function fitNode(_node) {
  // Respect user-set and saved node dimensions on canvas.
}

function decorate(node) {
  const root = node?.__h3bRoot;
  if (!root) return;
  const icon = root.querySelector(".h3b7-icon");
  if (icon) { icon.textContent = "↔"; icon.title = "Same-seed A/B benchmark"; }
  const buttons = [...root.querySelectorAll(".h3b7-segment")];
  const current = buttons.find((button) => String(button.textContent || "").trim() === "Current");
  if (current && current.dataset.h3b8 !== "1") {
    const replacement = current.cloneNode(true);
    replacement.dataset.h3b8 = "1";
    replacement.textContent = "Base 20 ↔ LightX 8";
    replacement.classList.toggle("is-active", String(node.properties?.h3studio_benchmark_preset || "") === "quality-lightx");
    replacement.addEventListener("click", (event) => {
      event.preventDefault(); event.stopPropagation();
      saveScenarios(node, qualityVsLightX(node));
    });
    current.replaceWith(replacement);
  }
  const auto = buttons.find((button) => String(button.textContent || "").trim() === "Auto vs OG");
  if (auto) auto.textContent = "Auto ↔ OG";
  const scenarios = root.querySelectorAll(".h3b7-scenario");
  if (scenarios.length === 2) scenarios.forEach((scenario, index) => { const badge = scenario.querySelector(".h3b7-index"); if (badge) badge.textContent = index ? "B" : "A"; });
  fitNode(node);
}

function attach(node) {
  if (!node || node.comfyClass !== TARGET) return;
  installStyles(); ensureDefault(node); decorate(node);
  if (node.__h3BenchmarkV8) return;
  node.__h3BenchmarkV8 = true;
  const root = node.__h3bRoot;
  if (root) {
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; decorate(node); });
    });
    observer.observe(root, { childList: true, subtree: true });
  }
}

app.registerExtension({
  name: "H3Studio.SmartBenchmarkV8",
  setup() { installStyles(); },
  nodeCreated(node) { if (node?.comfyClass === TARGET) setTimeout(() => attach(node), 80); },
  afterConfigureGraph() { setTimeout(() => { for (const node of app.graph?._nodes || []) if (node?.comfyClass === TARGET) attach(node); }, 140); },
});
}
