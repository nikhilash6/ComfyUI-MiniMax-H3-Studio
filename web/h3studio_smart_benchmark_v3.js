import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { stateFromNode } from "./js/studio_extension.js";

const SMART = "H3StudioSmartBenchmark";
const DIRECTOR = "H3StudioDirector";
const LOADER = "H3StudioLoader";
const STYLE_ID = "h3studio-smart-benchmark-v3-style";
const ASSET_URL = "/h3studio/assets";

function widget(node, name) {
  return node?.widgets?.find((candidate) => candidate.name === name) || null;
}

function graphLink(id) {
  const links = app.graph?.links;
  if (!links || id == null) return null;
  return typeof links.get === "function" ? links.get(id) : links[id];
}

function sourceNode(node, inputName, expectedClass) {
  const input = node?.inputs?.find((candidate) => candidate.name === inputName);
  const link = graphLink(input?.link);
  if (!link) return null;
  const id = Number(link.origin_id ?? link.originId ?? link.source_id);
  const source = app.graph?.getNodeById?.(id);
  return !expectedClass || source?.comfyClass === expectedClass ? source : null;
}

function routeFor(director) {
  const state = director ? stateFromNode(director) : null;
  if (state?.generation?.route === "ref2va") return "ref2va";
  if (state?.generation?.route === "fl2va") return "fl2va";
  const refs = (state?.references || []).filter((item) => item?.enabled !== false).length;
  if (state?.generation?.mode === "reference_edit" || refs >= 2 || String(state?.generation?.sampling_profile || "").startsWith("pdd_ref2va_")) return "ref2va";
  return "fl2va";
}

function currentScenario(node, name = "Current setup") {
  const director = sourceNode(node, "studio_context", DIRECTOR);
  const loader = sourceNode(node, "h3_bundle", LOADER);
  const state = director ? stateFromNode(director) : {};
  const route = routeFor(director);
  const modelWidget = widget(loader, route === "ref2va" ? "ref2va_model" : "fl2va_model");
  return {
    name,
    model_name: String(modelWidget?.value || ""),
    sampling_profile: state?.generation?.sampling_profile || "base_quality_20",
    runtime_preset: state?.ui?.runtime_optimization || "auto",
    runtime_advanced: structuredClone(state?.ui?.runtime_advanced || {}),
    megapixels: Number(state?.generation?.megapixels || 1),
    custom_loras: structuredClone(Array.isArray(state?.ui?.custom_loras) ? state.ui.custom_loras : []),
  };
}

function setScenarios(node, scenarios) {
  const target = widget(node, "scenarios_json");
  if (!target) return;
  target.value = JSON.stringify(scenarios);
  target.callback?.(target.value, app.canvas, node, [0, 0], {});
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

function preset(node, kind) {
  const base = currentScenario(node);
  if (kind === "current") {
    setScenarios(node, [base]);
  } else if (kind === "auto-og") {
    setScenarios(node, [
      { ...structuredClone(base), name: "Auto", runtime_preset: "auto" },
      { ...structuredClone(base), name: "OG / Current", runtime_preset: "og_current" },
    ]);
  } else if (kind === "runtime") {
    setScenarios(node, [
      { ...structuredClone(base), name: "Auto", runtime_preset: "auto" },
      { ...structuredClone(base), name: "Fast", runtime_preset: "fast" },
      { ...structuredClone(base), name: "OG / Current", runtime_preset: "og_current" },
    ]);
  } else if (kind === "memory") {
    setScenarios(node, [
      { ...structuredClone(base), name: "Auto", runtime_preset: "auto" },
      { ...structuredClone(base), name: "Low VRAM", runtime_preset: "low_vram" },
      { ...structuredClone(base), name: "Extreme Low VRAM", runtime_preset: "extreme_low_vram" },
    ]);
  }
  // The base benchmark UI owns rendering. Its hidden scenarios widget callback
  // updates backend state; ask its existing refresh path to redraw once.
  const refresh = [...(node.__h3bRoot?.querySelectorAll?.("button") || [])]
    .find((button) => /refresh assets/i.test(button.textContent || ""));
  if (refresh && kind === "__refresh") refresh.click();
}

function button(text, title, kind, node) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "h3b3-preset";
  el.textContent = text;
  el.title = title;
  el.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    preset(node, kind);
    // The scenario editor is reconstructed from the hidden JSON by the base UI.
    const currentButton = [...(node.__h3bRoot?.querySelectorAll?.("button") || [])]
      .find((candidate) => /\+ current setup/i.test(candidate.textContent || ""));
    // Tickle the root without mutating scenarios again: dispatching a resize is
    // enough for Comfy's DOM widget to recalc while the value callback persists.
    node.setDirtyCanvas?.(true, true);
    window.dispatchEvent(new Event("resize"));
    if (!currentButton) console.debug("[H3 Studio] Benchmark base toolbar not mounted yet.");
  });
  return el;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3b-root[data-h3b-v3="true"]{min-width:0!important;width:100%!important;max-width:100%!important;max-height:720px!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;padding:12px!important;border:1px solid #2a3a42!important;border-radius:12px!important;background:linear-gradient(180deg,#0e171b,#0a1115)!important;scrollbar-gutter:stable}
    .h3b-root[data-h3b-v3="true"] *{box-sizing:border-box;min-width:0}
    .h3b-root[data-h3b-v3="true"]::-webkit-scrollbar{width:10px}.h3b-root[data-h3b-v3="true"]::-webkit-scrollbar-thumb{background:#30434c;border:2px solid #0a1115;border-radius:999px}
    .h3b-root[data-h3b-v3="true"] .h3b-head{position:sticky;top:-12px;z-index:8;padding:11px 0 9px;background:linear-gradient(180deg,#0e171b 86%,rgba(14,23,27,.92));border-bottom:1px solid #223039;align-items:center!important}
    .h3b-root[data-h3b-v3="true"] .h3b-help{max-width:610px;color:#8fa2ab!important}.h3b-root[data-h3b-v3="true"] .h3b-status{padding:4px 8px;border:1px solid #315149;border-radius:999px;background:#10231f;color:#8eead4!important;cursor:default;white-space:nowrap}
    .h3b-root[data-h3b-v3="true"] .h3b-status.h3b3-error{border-color:#7f3e46;background:#29161a;color:#fecaca!important;cursor:pointer}
    .h3b3-presets{margin:9px 0 10px;padding:9px;border:1px solid #263a42;border-radius:9px;background:#0b1519}.h3b3-presets-head{display:flex;justify-content:space-between;gap:8px;margin-bottom:7px}.h3b3-presets-title{font-weight:800;color:#d9f8f0}.h3b3-presets-help{font-size:10px;color:#80939c}
    .h3b3-preset-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.h3b3-preset{min-height:30px;border:1px solid #314750;border-radius:7px;background:#121e22;color:#dce8ed;padding:6px 8px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.h3b3-preset:hover{border-color:#2dd4bf;background:#143027}
    .h3b-root[data-h3b-v3="true"] .h3b-toolbar,.h3b-root[data-h3b-v3="true"] .h3b-share{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(130px,1fr))!important;gap:6px!important}.h3b-root[data-h3b-v3="true"] .h3b-button{width:100%;min-height:30px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .h3b-root[data-h3b-v3="true"] .h3b-grid{grid-template-columns:minmax(0,1.45fr) minmax(0,1fr) minmax(0,1fr) 92px!important}.h3b-root[data-h3b-v3="true"] .h3b-field input,.h3b-root[data-h3b-v3="true"] .h3b-field select{max-width:100%;width:100%}.h3b-root[data-h3b-v3="true"] .h3b-card{overflow:visible!important}
    @media(max-width:760px){.h3b3-preset-grid{grid-template-columns:1fr 1fr}.h3b-root[data-h3b-v3="true"]{max-height:620px!important}.h3b-root[data-h3b-v3="true"] .h3b-grid{grid-template-columns:1fr 1fr!important}}
  `;
  document.head.append(style);
}

function ensurePresets(node, root) {
  let panel = root.querySelector(":scope > .h3b3-presets");
  if (panel) return panel;
  panel = document.createElement("section");
  panel.className = "h3b3-presets";
  panel.innerHTML = `<div class="h3b3-presets-head"><div class="h3b3-presets-title">Quick benchmark presets</div><div class="h3b3-presets-help">same seed · same model/profile/LoRAs unless the preset says otherwise</div></div>`;
  const grid = document.createElement("div");
  grid.className = "h3b3-preset-grid";
  grid.append(
    button("Current only", "One scenario matching the connected Director exactly", "current", node),
    button("Auto vs OG", "Compare new Auto against the pre-optimizer runtime", "auto-og", node),
    button("Runtime sweep", "Auto, Fast and OG with every generation setting held constant", "runtime", node),
    button("Memory sweep", "Auto, Low VRAM and Extreme Low VRAM", "memory", node),
  );
  panel.append(grid);
  const toolbar = root.querySelector(":scope > .h3b-toolbar");
  root.insertBefore(panel, toolbar || root.children[1] || null);
  return panel;
}

async function assetHealth(node, root, force = false) {
  if (node.__h3b3AssetCheck && !force) return node.__h3b3AssetCheck;
  const status = root.querySelector(".h3b-status");
  if (status) {
    status.classList.remove("h3b3-error");
    status.textContent = "checking assets…";
  }
  node.__h3b3AssetCheck = (async () => {
    try {
      const response = await api.fetchApi(ASSET_URL, { cache: "no-store" });
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      if (!response.ok || data?.error) throw new Error(data?.error || `HTTP ${response.status}`);
      node.__h3bV3Catalog = data;
      const target = node.__h3bRoot?.querySelector?.(".h3b-status") || status;
      if (target) {
        target.classList.remove("h3b3-error");
        target.textContent = `${data.models?.length || 0} H3 models · ${data.loras?.length || 0} LoRAs`;
        target.title = "Asset catalog connected";
      }
      // If the base module was the part that failed, retry its own catalog load
      // once now that the route is known-good so its model/LoRA datalists fill.
      const refresh = [...(node.__h3bRoot?.querySelectorAll?.("button") || [])]
        .find((button) => /refresh assets/i.test(button.textContent || ""));
      if (refresh && !node.__h3b3RetriedBaseCatalog) {
        node.__h3b3RetriedBaseCatalog = true;
        setTimeout(() => refresh.click(), 0);
      }
      return data;
    } catch (error) {
      const target = node.__h3bRoot?.querySelector?.(".h3b-status") || status;
      if (target) {
        target.classList.add("h3b3-error");
        target.textContent = "assets unavailable · retry";
        target.title = String(error?.message || error);
        target.onclick = () => assetHealth(node, node.__h3bRoot, true);
      }
      console.error("[H3 Studio] Smart Benchmark asset catalog failed", error);
      return null;
    } finally {
      node.__h3b3AssetCheck = null;
    }
  })();
  return node.__h3b3AssetCheck;
}

function polish(node) {
  if (!node || node.comfyClass !== SMART) return;
  installStyles();
  const root = node.__h3bRoot;
  if (!root?.isConnected) return;
  root.dataset.h3bV3 = "true";
  root.style.setProperty("overflow-y", "auto", "important");
  root.style.setProperty("overflow-x", "hidden", "important");
  const parent = root.parentElement;
  if (parent) {
    parent.style.setProperty("overflow", "visible", "important");
    parent.style.setProperty("max-width", "100%", "important");
    parent.style.setProperty("width", "100%", "important");
  }
  ensurePresets(node, root);
  const size = node.size || [0, 0];
  if (Number(size[0]) < 760 || Number(size[1]) < 680) node.setSize?.([Math.max(760, Number(size[0]) || 760), Math.max(680, Number(size[1]) || 680)]);
  const status = root.querySelector(".h3b-status");
  if (status && /loading assets/i.test(status.textContent || "") && !node.__h3b3AssetCheck) assetHealth(node, root);
}

function watch(node) {
  if (!node || node.comfyClass !== SMART || node.__h3b3Watching) return;
  node.__h3b3Watching = true;
  let attempts = 0;
  const wait = () => {
    if (!node.__h3bRoot?.isConnected) {
      attempts += 1;
      if (attempts < 800) setTimeout(wait, 25);
      return;
    }
    polish(node);
    const parent = node.__h3bRoot.parentElement;
    const observer = new MutationObserver(() => requestAnimationFrame(() => polish(node)));
    observer.observe(parent || node.__h3bRoot, { childList: true, subtree: true });
    node.__h3b3Observer = observer;
  };
  setTimeout(wait, 0);
}

app.registerExtension({
  name: "H3Studio.SmartBenchmarkV3",
  afterConfigureGraph() {
    for (const node of app.graph?._nodes || []) if (node?.comfyClass === SMART) watch(node);
  },
  nodeCreated(node) {
    if (node?.comfyClass === SMART) watch(node);
  },
});
