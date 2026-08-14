import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { stateFromNode } from "./js/studio_extension.js";

const TARGET = "H3StudioSmartBenchmark";
const DIRECTOR = "H3StudioDirector";
const LOADER = "H3StudioLoader";
const ASSET_URL = "/h3studio/assets";
const STYLE_ID = "h3studio-smart-benchmark-style";
const SHARE_PREFIX = "H3B1:";

let catalog = null;
let catalogPromise = null;

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3b-root { width:100%; min-width:560px; box-sizing:border-box; background:#0d1419; border:1px solid #29363f; border-radius:10px; padding:10px; color:#dce7ed; font:12px/1.35 Inter,system-ui,sans-serif; }
    .h3b-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:9px; }
    .h3b-head strong { font-size:14px; }
    .h3b-help { color:#93a4ad; font-size:11px; margin-top:2px; }
    .h3b-toolbar,.h3b-share { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
    .h3b-button { border:1px solid #354650; background:#172228; color:#dce7ed; border-radius:7px; padding:6px 8px; cursor:pointer; font:inherit; }
    .h3b-button:hover { border-color:#00cfa6; }
    .h3b-button.primary { border-color:#00a987; background:#123027; }
    .h3b-summary { background:#121c22; border:1px solid #28363f; border-radius:8px; padding:7px 9px; color:#aebec6; margin-bottom:9px; }
    .h3b-scenarios { display:flex; flex-direction:column; gap:8px; }
    .h3b-card { border:1px solid #2a3942; background:#10191e; border-radius:9px; padding:9px; }
    .h3b-card-head { display:flex; align-items:center; gap:7px; margin-bottom:8px; }
    .h3b-card-index { width:22px; height:22px; border-radius:999px; display:grid; place-items:center; background:#17332c; color:#7ee7cf; font-weight:700; flex:none; }
    .h3b-card-name { flex:1; min-width:0; }
    .h3b-grid { display:grid; grid-template-columns:minmax(190px,1.5fr) minmax(155px,1fr) minmax(140px,1fr) 96px; gap:7px; }
    .h3b-field { min-width:0; }
    .h3b-field label { display:block; color:#81939d; font-size:10px; margin:0 0 3px 1px; }
    .h3b-field input,.h3b-field select { width:100%; box-sizing:border-box; border:1px solid #31424c; background:#0b1216; color:#e1edf2; border-radius:6px; padding:5px 6px; font:inherit; }
    .h3b-loras { margin-top:8px; border-top:1px solid #25323a; padding-top:7px; }
    .h3b-lora-picker { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:6px; }
    .h3b-lora-picker input { width:100%; box-sizing:border-box; border:1px solid #31424c; background:#0b1216; color:#e1edf2; border-radius:6px; padding:5px 6px; font:inherit; }
    .h3b-lora-list { display:flex; flex-direction:column; gap:5px; margin-top:6px; }
    .h3b-lora-row { display:grid; grid-template-columns:auto minmax(0,1fr) 74px auto; gap:6px; align-items:center; background:#0c151a; border:1px solid #24343d; border-radius:6px; padding:5px 6px; }
    .h3b-lora-name { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .h3b-lora-strength { width:74px; box-sizing:border-box; }
    .h3b-rec { color:#74d7c2; font-size:9px; margin-left:5px; }
    .h3b-warning { color:#f0b46c; font-size:10px; margin-top:6px; line-height:1.4; }
    .h3b-empty { color:#72858f; font-size:11px; padding:8px; text-align:center; border:1px dashed #2c3c45; border-radius:7px; }
    .h3b-status { font-size:10px; color:#7ee7cf; }
    .h3b-icon { border:0; background:transparent; color:#9fb0b9; cursor:pointer; font-size:13px; padding:3px; }
    .h3b-icon:hover { color:#fff; }
    @media (max-width:760px) { .h3b-root { min-width:420px; } .h3b-grid { grid-template-columns:1fr 1fr; } }
  `;
  document.head.append(style);
}

async function loadCatalog(force = false) {
  if (!force && catalog) return catalog;
  if (!force && catalogPromise) return catalogPromise;
  catalogPromise = (async () => {
    const response = typeof api.fetchApi === "function"
      ? await api.fetchApi(ASSET_URL)
      : await fetch(ASSET_URL, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error(`Asset catalog failed (${response.status})`);
    catalog = await response.json();
    return catalog;
  })();
  try { return await catalogPromise; } finally { catalogPromise = null; }
}

function widget(node, name) { return node?.widgets?.find((candidate) => candidate.name === name) || null; }

function graphLink(id) {
  const links = app.graph?.links;
  if (!links || id == null) return null;
  return typeof links.get === "function" ? links.get(id) : links[id];
}

function sourceNode(node, inputName, expectedClass) {
  const input = node?.inputs?.find((candidate) => candidate.name === inputName);
  const link = graphLink(input?.link);
  if (!link) return null;
  const sourceId = link.origin_id ?? link.originId ?? link.source_id;
  const source = app.graph?.getNodeById?.(Number(sourceId));
  return !expectedClass || source?.comfyClass === expectedClass ? source : null;
}

function directorFor(node) { return sourceNode(node, "studio_context", DIRECTOR); }
function loaderFor(node) { return sourceNode(node, "h3_bundle", LOADER); }

function routeForDirector(director) {
  if (!director) return "fl2va";
  if (director.__h3studioRuntimeResolved?.workload?.route) return director.__h3studioRuntimeResolved.workload.route;
  const state = stateFromNode(director);
  if (state.generation?.route === "ref2va") return "ref2va";
  if (state.generation?.route === "fl2va") return "fl2va";
  const refs = (state.references || []).filter((item) => item?.enabled !== false).length;
  if (state.generation?.mode === "reference_edit" || refs >= 2 || String(state.generation?.sampling_profile || "").startsWith("pdd_ref2va_")) return "ref2va";
  return "fl2va";
}

function currentModel(node, route) {
  const loader = loaderFor(node);
  const name = route === "ref2va" ? "ref2va_model" : "fl2va_model";
  return String(widget(loader, name)?.value || "");
}

function hiddenScenarioWidget(node) {
  const target = widget(node, "scenarios_json");
  if (target && !target.__h3bHidden) {
    target.__h3bHidden = true;
    target.computeSize = () => [0, -4];
    target.type = "hidden";
  }
  return target;
}

function parseScenarios(node) {
  const raw = String(hiddenScenarioWidget(node)?.value || "[]");
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function saveScenarios(node, scenarios) {
  const target = hiddenScenarioWidget(node);
  if (!target) return;
  target.value = JSON.stringify(scenarios);
  target.callback?.(target.value, app.canvas, node, [0, 0], {});
  node.setDirtyCanvas?.(true, true);
}

function currentScenario(node, suffix = "Current Director") {
  const director = directorFor(node);
  const state = director ? stateFromNode(director) : null;
  const route = routeForDirector(director);
  return {
    name: suffix,
    model_name: currentModel(node, route),
    sampling_profile: state?.generation?.sampling_profile || "base_quality_20",
    runtime_preset: state?.ui?.runtime_optimization || "auto",
    runtime_advanced: state?.ui?.runtime_advanced || {},
    megapixels: Number(state?.generation?.megapixels || 1),
    custom_loras: Array.isArray(state?.ui?.custom_loras) ? structuredClone(state.ui.custom_loras) : [],
  };
}

function samplingOptions(route) {
  return (catalog?.sampling_profiles || []).filter((item) => !item.route || item.route === route);
}

function modelOptions(route) {
  return (catalog?.models || []).filter((item) => item.route === route || item.route === "unknown");
}

function loraByName(name) { return (catalog?.loras || []).find((item) => item.name === name) || null; }
function profileByKey(key) { return (catalog?.sampling_profiles || []).find((item) => item.key === key) || null; }

function optionSelect(value, items, keyFn, labelFn, change) {
  const select = document.createElement("select");
  for (const item of items) {
    const option = document.createElement("option");
    option.value = String(keyFn(item));
    option.textContent = labelFn(item);
    select.append(option);
  }
  if (value && ![...select.options].some((option) => option.value === String(value))) {
    const option = document.createElement("option"); option.value = String(value); option.textContent = `${value} · not in catalog`; select.prepend(option);
  }
  select.value = String(value || select.options[0]?.value || "");
  select.addEventListener("change", () => change(select.value));
  return select;
}

function field(label, control) {
  const root = document.createElement("div"); root.className = "h3b-field";
  const title = document.createElement("label"); title.textContent = label;
  root.append(title, control); return root;
}

function icon(text, title, click) {
  const button = document.createElement("button"); button.type = "button"; button.className = "h3b-icon"; button.textContent = text; button.title = title;
  button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); click(); });
  return button;
}

function normalButton(text, click, primary = false) {
  const button = document.createElement("button"); button.type = "button"; button.className = `h3b-button${primary ? " primary" : ""}`; button.textContent = text;
  button.addEventListener("click", async (event) => { event.preventDefault(); event.stopPropagation(); await click(); });
  return button;
}

function patchScenario(node, index, patch) {
  const scenarios = parseScenarios(node);
  scenarios[index] = { ...(scenarios[index] || {}), ...patch };
  saveScenarios(node, scenarios);
  render(node);
}

function scenarioWarnings(scenario, route) {
  const warnings = [];
  const model = catalog?.models?.find((item) => item.name === scenario.model_name);
  if (model?.route && model.route !== "unknown" && model.route !== route) warnings.push(`Model is ${model.route.toUpperCase()} but connected Director resolves ${route.toUpperCase()}.`);
  const profile = profileByKey(scenario.sampling_profile);
  if (profile?.route && profile.route !== route) warnings.push(`Sampling Profile requires ${profile.route.toUpperCase()}.`);
  if (profile?.lora_artifact) {
    const duplicate = (scenario.custom_loras || []).find((item) => item?.enabled !== false && String(item?.name || "").split("/").pop() === String(profile.lora_artifact).split("/").pop());
    if (duplicate) warnings.push("Custom LoRA duplicates the adapter already owned by this Sampling Profile; remove it to avoid double application.");
  }
  return warnings;
}

function buildLoras(node, scenario, index) {
  const root = document.createElement("div"); root.className = "h3b-loras";
  const picker = document.createElement("div"); picker.className = "h3b-lora-picker";
  const search = document.createElement("input"); search.type = "search"; search.placeholder = `Search ${(catalog?.loras || []).length} installed LoRAs…`;
  const listId = `h3b-loras-${node.id}-${index}`; search.setAttribute("list", listId);
  const datalist = document.createElement("datalist"); datalist.id = listId;
  for (const item of catalog?.loras || []) { const option = document.createElement("option"); option.value = item.name; datalist.append(option); }
  const add = normalButton("Add LoRA", async () => {
    const name = search.value.trim(); if (!name) return;
    const info = loraByName(name);
    const current = [...(scenario.custom_loras || [])];
    if (current.some((item) => item.name === name)) return;
    current.push({ name, strength: Number(info?.recommended_strength ?? 1), enabled: true });
    patchScenario(node, index, { custom_loras: current });
  });
  search.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); add.click(); } });
  picker.append(search, add, datalist); root.append(picker);

  const rows = document.createElement("div"); rows.className = "h3b-lora-list";
  const loras = Array.isArray(scenario.custom_loras) ? scenario.custom_loras : [];
  if (!loras.length) {
    const empty = document.createElement("div"); empty.className = "h3b-empty"; empty.textContent = "No custom LoRAs · the Sampling Profile adapter, if any, is handled automatically."; rows.append(empty);
  }
  loras.forEach((item, loraIndex) => {
    const row = document.createElement("div"); row.className = "h3b-lora-row";
    const enabled = document.createElement("input"); enabled.type = "checkbox"; enabled.checked = item.enabled !== false;
    enabled.addEventListener("change", () => {
      const next = [...loras]; next[loraIndex] = { ...item, enabled: enabled.checked }; patchScenario(node, index, { custom_loras: next });
    });
    const name = document.createElement("div"); name.className = "h3b-lora-name"; name.textContent = item.name; name.title = item.name;
    const info = loraByName(item.name);
    if (info?.recommended_strength != null) { const rec = document.createElement("span"); rec.className = "h3b-rec"; rec.textContent = `rec ${info.recommended_strength}`; name.append(rec); }
    const strength = document.createElement("input"); strength.type = "number"; strength.className = "h3b-lora-strength"; strength.step = "0.05"; strength.min = "-5"; strength.max = "5"; strength.value = String(Number(item.strength ?? 1));
    strength.title = "Exact LoRA strength used by this benchmark scenario";
    strength.addEventListener("change", () => { const next = [...loras]; next[loraIndex] = { ...item, strength: Number(strength.value || 0) }; patchScenario(node, index, { custom_loras: next }); });
    const remove = icon("×", "Remove LoRA", () => { const next = loras.filter((_, i) => i !== loraIndex); patchScenario(node, index, { custom_loras: next }); });
    row.append(enabled, name, strength, remove); rows.append(row);
  });
  root.append(rows); return root;
}

function buildScenario(node, scenario, index, route) {
  const card = document.createElement("div"); card.className = "h3b-card";
  const head = document.createElement("div"); head.className = "h3b-card-head";
  const badge = document.createElement("div"); badge.className = "h3b-card-index"; badge.textContent = String(index + 1);
  const name = document.createElement("input"); name.className = "h3b-card-name"; name.value = scenario.name || `Scenario ${index + 1}`; name.placeholder = "Scenario name";
  name.addEventListener("change", () => patchScenario(node, index, { name: name.value.trim() || `Scenario ${index + 1}` }));
  head.append(badge, name, icon("⧉", "Duplicate scenario", () => { const scenarios = parseScenarios(node); scenarios.splice(index + 1, 0, structuredClone(scenario)); scenarios[index + 1].name = `${scenario.name || `Scenario ${index + 1}`} copy`; saveScenarios(node, scenarios); render(node); }), icon("×", "Delete scenario", () => { const scenarios = parseScenarios(node); scenarios.splice(index, 1); saveScenarios(node, scenarios); render(node); }));

  const grid = document.createElement("div"); grid.className = "h3b-grid";
  const models = modelOptions(route);
  const modelSelect = optionSelect(scenario.model_name || currentModel(node, route), models, (item) => item.name, (item) => `${item.name.split("/").pop()}${item.quantization ? ` · ${item.quantization}` : ""}`, (value) => patchScenario(node, index, { model_name: value }));
  const profiles = samplingOptions(route);
  const sampling = optionSelect(scenario.sampling_profile, profiles, (item) => item.key, (item) => `${item.label}${item.steps ? ` · ${item.steps} steps` : ""}`, (value) => patchScenario(node, index, { sampling_profile: value }));
  const runtimes = catalog?.runtime_presets || [];
  const runtime = optionSelect(scenario.runtime_preset || "auto", runtimes, (item) => item.key, (item) => item.label, (value) => patchScenario(node, index, { runtime_preset: value }));
  const mp = document.createElement("input"); mp.type = "number"; mp.min = "0.20"; mp.max = "8.50"; mp.step = "0.05"; mp.value = String(Number(scenario.megapixels || 1));
  mp.addEventListener("change", () => patchScenario(node, index, { megapixels: Math.max(0.2, Math.min(8.5, Number(mp.value || 1))) }));
  grid.append(field("Transformer", modelSelect), field("Sampling Profile", sampling), field("Runtime", runtime), field("Megapixels", mp));
  card.append(head, grid, buildLoras(node, scenario, index));
  for (const warning of scenarioWarnings(scenario, route)) { const line = document.createElement("div"); line.className = "h3b-warning"; line.textContent = warning; card.append(line); }
  return card;
}

function utf8ToB64(text) {
  const bytes = new TextEncoder().encode(text); let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}
function b64ToUtf8(text) { const normalized = text.replaceAll("-", "+").replaceAll("_", "/"); const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)); return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))); }

async function copyText(text) {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  const area = document.createElement("textarea"); area.value = text; area.style.position = "fixed"; area.style.opacity = "0"; document.body.append(area); area.select(); document.execCommand("copy"); area.remove();
}
function toast(summary, detail, severity = "success") { app.extensionManager?.toast?.add?.({ severity, summary, detail, life: 4200 }); }

function exportCode(node) { return `${SHARE_PREFIX}${utf8ToB64(JSON.stringify({ v: 1, scenarios: parseScenarios(node) }))}`; }
function importCode(raw) {
  const text = String(raw || "").trim(); const start = text.indexOf(SHARE_PREFIX); const code = start >= 0 ? text.slice(start).split(/\s/)[0] : text;
  const payload = code.startsWith(SHARE_PREFIX) ? JSON.parse(b64ToUtf8(code.slice(SHARE_PREFIX.length))) : JSON.parse(text);
  if (Number(payload?.v) !== 1 || !Array.isArray(payload.scenarios)) throw new Error("Unsupported H3 benchmark preset.");
  return payload.scenarios;
}

function buildRoot(node) {
  const root = document.createElement("div"); root.className = "h3b-root";
  const director = directorFor(node); const route = routeForDirector(director); const scenarios = parseScenarios(node);
  const head = document.createElement("div"); head.className = "h3b-head";
  const copy = document.createElement("div"); const title = document.createElement("strong"); title.textContent = "Smart Benchmark Scenario Builder";
  const help = document.createElement("div"); help.className = "h3b-help"; help.textContent = "Pick installed transformers and LoRAs visually. Every LoRA keeps its exact strength; every scenario prints its resolved runtime config."; copy.append(title, help);
  const status = document.createElement("div"); status.className = "h3b-status"; status.textContent = catalog ? `${catalog.models?.length || 0} H3 models · ${catalog.loras?.length || 0} LoRAs` : "loading assets…"; head.append(copy, status);

  const toolbar = document.createElement("div"); toolbar.className = "h3b-toolbar";
  toolbar.append(
    normalButton("+ Current setup", async () => { const next = [...parseScenarios(node), currentScenario(node)]; saveScenarios(node, next); render(node); }, true),
    normalButton("Runtime A/B", async () => {
      const base = currentScenario(node, "Auto"); base.runtime_preset = "auto";
      const og = structuredClone(base); og.name = "OG / Current"; og.runtime_preset = "og_current";
      const fast = structuredClone(base); fast.name = "Fast"; fast.runtime_preset = "fast";
      saveScenarios(node, [...parseScenarios(node), base, og, fast]); render(node);
    }),
    normalButton("Clear", async () => { saveScenarios(node, []); render(node); }),
    normalButton("Refresh assets", async () => { catalog = null; await loadCatalog(true); render(node); }),
  );

  const share = document.createElement("div"); share.className = "h3b-share";
  share.append(
    normalButton("Copy benchmark for Discord", async () => { const code = exportCode(node); await copyText(`H3 Studio benchmark · ${scenarios.length} scenarios\n${code}`); toast("Benchmark copied", `${code.length} character H3B1 code`); }),
    normalButton("Paste benchmark", async () => { const raw = globalThis.prompt?.("Paste H3B1 benchmark code or JSON:", ""); if (!raw) return; saveScenarios(node, importCode(raw)); render(node); toast("Benchmark imported", "Scenarios restored with models, LoRAs and strengths."); }),
  );

  const summary = document.createElement("div"); summary.className = "h3b-summary";
  const max = Number(widget(node, "max_scenarios")?.value || 12);
  summary.textContent = `${scenarios.length} scenario${scenarios.length === 1 ? "" : "s"} · same Director seed for fair A/B · route ${route.toUpperCase()} · guard ${max}${scenarios.length > max ? " · TOO MANY: increase guard or remove scenarios" : ""}`;

  const list = document.createElement("div"); list.className = "h3b-scenarios";
  if (!scenarios.length) { const empty = document.createElement("div"); empty.className = "h3b-empty"; empty.textContent = "Start with Current setup, then duplicate it and change only the model, runtime, Sampling Profile, LoRA or resolution you actually want to compare."; list.append(empty); }
  scenarios.forEach((scenario, index) => list.append(buildScenario(node, scenario, index, route)));
  root.append(head, toolbar, share, summary, list);
  return root;
}

function render(node) {
  if (!node?.graph || !node.__h3bRoot?.isConnected) return;
  const next = buildRoot(node); node.__h3bRoot.replaceWith(next); node.__h3bRoot = next; node.setDirtyCanvas?.(true, true);
}

function install(node) {
  if (node.__h3bInstalled || typeof node.addDOMWidget !== "function") return;
  node.__h3bInstalled = true; installStyles(); hiddenScenarioWidget(node);
  const root = buildRoot(node); node.__h3bRoot = root;
  node.addDOMWidget("h3studio_smart_benchmark", "h3studio_smart_benchmark", root, { serialize: false, hideOnZoom: false, getValue: () => undefined });
  const size = node.computeSize?.() || [620, 500]; node.setSize?.([Math.max(620, size[0]), Math.max(520, size[1])]);
  loadCatalog().then(() => render(node)).catch((error) => { toast("Benchmark assets", String(error?.message || error), "error"); });
}

app.registerExtension({
  name: "H3Studio.SmartBenchmarkUI",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TARGET) return;
    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function h3bCreated() { const result = created?.apply(this, arguments); queueMicrotask(() => install(this)); return result; };
    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function h3bConfigured() { const result = configured?.apply(this, arguments); queueMicrotask(() => { install(this); render(this); }); return result; };
  },
});
