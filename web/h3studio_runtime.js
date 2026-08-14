import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { applyState, stateFromNode } from "./js/studio_extension.js";

const TARGET = "H3StudioDirector";
const STYLE_ID = "h3studio-runtime-style";
const CAPABILITIES_URL = "/h3studio/runtime/capabilities";

const PRESETS = [
  ["auto", "Auto · recommended"],
  ["og_current", "OG / Current · unchanged runtime"],
  ["quality", "Quality · conservative PyTorch"],
  ["fast", "Fast · accelerated attention"],
  ["low_vram", "Low VRAM · lower attention peaks"],
  ["extreme_low_vram", "Extreme Low VRAM · survival first"],
];
const ATTENTION = [
  ["auto", "Auto / preset"],
  ["og", "OG / inherited"],
  ["pytorch", "PyTorch"],
  ["comfy_kitchen", "Comfy Kitchen"],
  ["sage_mem_eff", "Sage · H3 memory-efficient"],
];
const HEAD_CHUNKS = [[0, "Auto / preset"], [1, "Off"], [2, "2"], [4, "4"], [8, "8"], [16, "16"]];
const FFN_CHUNKS = [[0, "Off · recommended"], [2, "2"], [4, "4"], [8, "8"], [16, "16"], [32, "32"]];

let capabilities = null;
let capabilitiesPromise = null;

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3s-runtime { display:flex; flex-direction:column; gap:9px; }
    .h3s-runtime-top { display:grid; grid-template-columns:minmax(180px,1fr) auto; gap:8px; align-items:center; }
    .h3s-runtime-select,.h3s-runtime-advanced select,.h3s-runtime-advanced input { width:100%; box-sizing:border-box; }
    .h3s-runtime-detected { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
    .h3s-runtime-chip { border:1px solid var(--h3s-border,#35414a); background:var(--h3s-panel-2,#172127); border-radius:8px; padding:7px 8px; min-width:0; }
    .h3s-runtime-chip strong { display:block; font-size:11px; opacity:.68; font-weight:600; margin-bottom:2px; }
    .h3s-runtime-chip span { display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:12px; }
    .h3s-runtime-result { border:1px solid color-mix(in srgb,var(--h3s-accent,#00cfa6) 45%,var(--h3s-border,#35414a)); border-radius:10px; padding:10px; background:color-mix(in srgb,var(--h3s-accent,#00cfa6) 7%,var(--h3s-panel,#11191e)); }
    .h3s-runtime-result-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px; }
    .h3s-runtime-result-title { font-weight:700; }
    .h3s-runtime-reason { font-size:11px; line-height:1.45; opacity:.82; margin-top:7px; }
    .h3s-runtime-config { display:grid; grid-template-columns:110px minmax(0,1fr); gap:3px 8px; font-size:11px; }
    .h3s-runtime-config span:nth-child(odd) { opacity:.62; }
    .h3s-runtime-warning { color:#f3b66b; font-size:11px; line-height:1.4; margin-top:5px; }
    .h3s-runtime-advanced { border-top:1px solid var(--h3s-border,#35414a); padding-top:8px; }
    .h3s-runtime-advanced summary { cursor:pointer; font-size:11px; opacity:.78; user-select:none; }
    .h3s-runtime-advanced-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; }
    .h3s-runtime-field label { display:block; font-size:10px; opacity:.68; margin-bottom:3px; }
    .h3s-runtime-note { font-size:10px; opacity:.62; line-height:1.4; grid-column:1/-1; }
    .h3s-runtime-button { border:1px solid var(--h3s-border,#35414a); background:var(--h3s-panel-2,#172127); color:inherit; border-radius:7px; padding:6px 8px; cursor:pointer; font:inherit; }
    .h3s-runtime-button:hover { border-color:var(--h3s-accent,#00cfa6); }
    @media (max-width:600px) { .h3s-runtime-detected,.h3s-runtime-advanced-grid { grid-template-columns:1fr; } }
  `;
  document.head.append(style);
}

async function loadCapabilities(force = false) {
  if (!force && capabilities) return capabilities;
  if (!force && capabilitiesPromise) return capabilitiesPromise;
  capabilitiesPromise = (async () => {
    const response = typeof api.fetchApi === "function"
      ? await api.fetchApi(CAPABILITIES_URL)
      : await fetch(CAPABILITIES_URL, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error(`Runtime capability request failed (${response.status})`);
    const payload = await response.json();
    capabilities = payload?.capabilities || null;
    return capabilities;
  })();
  try { return await capabilitiesPromise; } finally { capabilitiesPromise = null; }
}

function button(text, title, click) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "h3s-runtime-button";
  el.textContent = text;
  el.title = title;
  el.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    click();
  });
  return el;
}

function select(value, options, onChange, className = "") {
  const el = document.createElement("select");
  el.className = className;
  for (const [key, label] of options) {
    const option = document.createElement("option");
    option.value = String(key);
    option.textContent = label;
    el.append(option);
  }
  el.value = String(value);
  el.addEventListener("change", () => onChange(el.value));
  return el;
}

function chip(label, value) {
  const root = document.createElement("div");
  root.className = "h3s-runtime-chip";
  const title = document.createElement("strong");
  title.textContent = label;
  const text = document.createElement("span");
  text.textContent = value;
  text.title = value;
  root.append(title, text);
  return root;
}

function bool(value) { return value ? "available" : "unavailable"; }
function formatVram(value) { return Number(value) > 0 ? `${Number(value).toFixed(1)} GB` : "unknown"; }

function runtimeState(node) {
  const state = stateFromNode(node);
  const ui = { ...(state.ui || {}) };
  const advanced = { attention_backend: "auto", head_chunks: 0, ffn_chunks: 0, ffn_sequence_threshold: 4096, ...(ui.runtime_advanced || {}) };
  return {
    state,
    preset: String(ui.runtime_optimization || "auto"),
    advanced,
  };
}

function saveRuntime(node, state, preset, advanced, dirty = true) {
  state.ui = {
    ...(state.ui || {}),
    director_node_id: String(node.id),
    runtime_optimization: preset,
    runtime_advanced: advanced,
  };
  applyState(node, state, dirty);
}

function field(label, control) {
  const root = document.createElement("div");
  root.className = "h3s-runtime-field";
  const name = document.createElement("label");
  name.textContent = label;
  root.append(name, control);
  return root;
}

function actualResult(node, requested) {
  const data = node.__h3studioRuntimeResolved;
  const root = document.createElement("div");
  root.className = "h3s-runtime-result";
  const head = document.createElement("div");
  head.className = "h3s-runtime-result-head";
  const title = document.createElement("span");
  title.className = "h3s-runtime-result-title";
  title.textContent = data ? `${data.requested_label} → ${data.resolved_label}` : `${PRESETS.find(([key]) => key === requested)?.[1] || requested}`;
  const status = document.createElement("span");
  status.className = "h3s-status-pill";
  status.textContent = data ? "RESOLVED" : "NEXT RUN";
  head.append(title, status);
  root.append(head);

  if (!data) {
    const note = document.createElement("div");
    note.className = "h3s-runtime-reason";
    note.textContent = requested === "auto"
      ? "Auto resolves after H3 conditioning so it can use the real packed sequence length, route, references, frame packet, GPU and available kernels."
      : "The exact effective backend will be printed and shown here on the next generation.";
    root.append(note);
    return root;
  }

  const config = document.createElement("div");
  config.className = "h3s-runtime-config";
  const work = data.workload || {};
  const pairs = [
    ["Attention", data.attention_label || data.attention_backend],
    ["Head chunks", Number(data.head_chunks) > 1 ? String(data.head_chunks) : "off"],
    ["Packed tokens", Number(work.sequence_length || 0).toLocaleString()],
    ["Workload", `${String(work.route || "").toUpperCase()} · ${work.frames || "?"}f · ${Number(work.megapixels || 0).toFixed(2)} MP · ${work.reference_count || 0} refs`],
    ["VAE", data.vae_mode || "native"],
    ["Sampling", `${data.sampling_profile || ""} · unchanged`],
  ];
  for (const [key, value] of pairs) {
    const k = document.createElement("span"); k.textContent = key;
    const v = document.createElement("span"); v.textContent = value;
    config.append(k, v);
  }
  root.append(config);
  const reason = document.createElement("div");
  reason.className = "h3s-runtime-reason";
  reason.textContent = `Why: ${data.reason || "No reason reported."}`;
  root.append(reason);
  for (const warning of [...(data.warnings || []), ...(data.fallbacks || []), ...(data.patch_notes || [])]) {
    if (!warning || String(warning).includes("runtime_patch_cache=hit")) continue;
    const line = document.createElement("div");
    line.className = "h3s-runtime-warning";
    line.textContent = warning;
    root.append(line);
  }
  return root;
}

function buildSection(node) {
  const { state, preset, advanced } = runtimeState(node);
  if (String(state.ui?.director_node_id || "") !== String(node.id)) {
    saveRuntime(node, state, preset, advanced, false);
  }
  const section = document.createElement("section");
  section.className = "h3s-section h3s-runtime-section";
  const header = document.createElement("div");
  header.className = "h3s-section-header";
  const title = document.createElement("span");
  title.className = "h3s-section-title";
  title.textContent = "Runtime Optimization";
  const pill = document.createElement("span");
  pill.className = "h3s-status-pill";
  pill.textContent = preset === "auto" ? "AUTO" : "MANUAL";
  header.append(title, pill);

  const body = document.createElement("div");
  body.className = "h3s-section-stack h3s-runtime";
  const help = document.createElement("p");
  help.className = "h3s-context-help";
  help.textContent = "Runtime changes kernels and memory behavior only. It never switches Base, LightX, PDD, steps or your LoRA stack.";

  const top = document.createElement("div");
  top.className = "h3s-runtime-top";
  const presetSelect = select(preset, PRESETS, (value) => {
    const current = runtimeState(node);
    saveRuntime(node, current.state, value, current.advanced);
    installRuntimeSection(node, true);
  }, "h3s-runtime-select");
  const refresh = button("Detect", "Refresh GPU and backend detection", async () => {
    refresh.disabled = true;
    try { await loadCapabilities(true); node.__h3studioRuntimeCapabilityError = ""; }
    catch (error) { node.__h3studioRuntimeCapabilityError = String(error?.message || error); }
    finally { installRuntimeSection(node, true); }
  });
  top.append(presetSelect, refresh);

  const detected = document.createElement("div");
  detected.className = "h3s-runtime-detected";
  if (capabilities) {
    detected.append(
      chip("GPU", `${capabilities.gpu_name} · ${formatVram(capabilities.total_vram_gb)} · ${capabilities.compute_capability || ""}`),
      chip("Backends", `CK ${bool(capabilities.ck_attention)} · Sage ${bool(capabilities.sage_mem_eff)} · head chunks ${bool(capabilities.low_vram_attention)}`),
      chip("Native H3", `masked latent ${bool(capabilities.native_h3_masks)} · AddGuide ${bool(capabilities.native_h3_add_guide)}`),
      chip("Optional", `FaceRefine ${bool(capabilities.face_refine)} · FFN chunks ${bool(capabilities.ffn_chunking)}`),
    );
  } else {
    detected.append(chip("Detection", node.__h3studioRuntimeCapabilityError || "Loading GPU/backend capabilities…"));
    loadCapabilities().then(() => installRuntimeSection(node, true)).catch((error) => {
      node.__h3studioRuntimeCapabilityError = String(error?.message || error);
      installRuntimeSection(node, true);
    });
  }

  const advancedRoot = document.createElement("details");
  advancedRoot.className = "h3s-runtime-advanced";
  const summary = document.createElement("summary");
  summary.textContent = "Advanced overrides · usually leave on Auto";
  const grid = document.createElement("div");
  grid.className = "h3s-runtime-advanced-grid";
  const patchAdvanced = (patch) => {
    const current = runtimeState(node);
    const next = { ...current.advanced, ...patch };
    saveRuntime(node, current.state, current.preset, next);
    installRuntimeSection(node, true);
  };
  grid.append(
    field("Attention backend", select(advanced.attention_backend, ATTENTION, (value) => patchAdvanced({ attention_backend: value }))),
    field("Attention head chunks", select(advanced.head_chunks, HEAD_CHUNKS, (value) => patchAdvanced({ head_chunks: Number(value) }))),
    field("FFN chunks · experimental", select(advanced.ffn_chunks, FFN_CHUNKS, (value) => patchAdvanced({ ffn_chunks: Number(value) }))),
  );
  const threshold = document.createElement("input");
  threshold.type = "number";
  threshold.min = "256";
  threshold.max = "262144";
  threshold.step = "256";
  threshold.value = String(advanced.ffn_sequence_threshold || 4096);
  threshold.addEventListener("change", () => patchAdvanced({ ffn_sequence_threshold: Math.max(256, Number(threshold.value) || 4096) }));
  grid.append(field("FFN sequence threshold", threshold));
  const note = document.createElement("div");
  note.className = "h3s-runtime-note";
  note.textContent = "Head chunking is mathematically exact for independent H3 attention heads. FFN chunking is kept here only for experiments; Auto never selects it because H3 attention is the useful memory target.";
  grid.append(note);
  advancedRoot.append(summary, grid);

  body.append(help, top, detected, actualResult(node, preset), advancedRoot);
  section.append(header, body);
  return section;
}

function installRuntimeSection(node, replace = false) {
  const panel = node?.__h3studioPanel;
  if (!panel?.isConnected) return;
  const existing = panel.querySelector(":scope > .h3s-runtime-section");
  if (existing && !replace) return;
  const section = buildSection(node);
  if (existing) existing.replaceWith(section);
  else {
    const loras = panel.querySelector(":scope > .h3s-custom-loras");
    const advanced = [...panel.children].find((child) => child.querySelector?.(".h3s-advanced-toggle"));
    panel.insertBefore(section, loras || advanced || null);
  }
}

function watchDirector(node) {
  const wait = () => {
    if (!node.graph) return;
    if (node.__h3studioPanel?.isConnected) {
      installRuntimeSection(node);
      return;
    }
    setTimeout(wait, 60);
  };
  setTimeout(wait, 0);
}

api.addEventListener("h3studio-runtime-resolved", ({ detail }) => {
  const id = String(detail?.node_id || "");
  if (!id) return;
  for (const node of app.graph?._nodes || []) {
    if (node?.comfyClass !== TARGET || String(node.id) !== id) continue;
    node.__h3studioRuntimeResolved = detail;
    installRuntimeSection(node, true);
  }
});

app.registerExtension({
  name: "H3Studio.RuntimeOptimization",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TARGET) return;
    const originalCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function h3studioRuntimeCreated() {
      const result = originalCreated?.apply(this, arguments);
      installStyles();
      watchDirector(this);
      return result;
    };
    const originalConfigured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function h3studioRuntimeConfigured() {
      const result = originalConfigured?.apply(this, arguments);
      installStyles();
      watchDirector(this);
      return result;
    };
  },
});
