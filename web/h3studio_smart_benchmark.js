import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { stateFromNode } from "./js/studio_extension.js";

const TARGET = "H3StudioSmartBenchmark";
const DIRECTOR = "H3StudioDirector";
const LOADER = "H3StudioLoader";
const ASSET_URL = "/h3studio/assets";
const STYLE_ID = "h3studio-smart-benchmark-v4-style";
const SHARE_PREFIX = "H3B1:";
const SHARE_ZIP_PREFIX = "H3B1Z:";
const WIDGET_NAME = "h3studio_smart_benchmark";

let catalog = null;
let catalogPromise = null;

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null && text !== "") node.textContent = String(text);
  return node;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3b4{--b-bg:#0b1216;--b-surface:#101a1f;--b-raised:#142128;--b-border:rgba(157,177,188,.17);--b-text:#edf5f7;--b-muted:#8398a2;--b-accent:#39d6b7;width:100%;max-width:100%;max-height:700px;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding:12px;border:1px solid var(--b-border);border-radius:14px;background:linear-gradient(180deg,#0e171c,#091015);color:var(--b-text);font:11px/1.4 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;box-sizing:border-box}
    .h3b4 *{box-sizing:border-box;min-width:0}.h3b4::-webkit-scrollbar{width:9px}.h3b4::-webkit-scrollbar-thumb{background:#2b3d45;border:2px solid #091015;border-radius:999px}
    .h3b4-head{position:sticky;top:-12px;z-index:8;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:-1px 0 10px;padding:11px 1px 10px;background:linear-gradient(180deg,#0e171c 82%,rgba(14,23,28,.94));border-bottom:1px solid rgba(157,177,188,.10)}
    .h3b4-title{font-size:12px;font-weight:780;letter-spacing:.01em}.h3b4-sub{margin-top:2px;color:var(--b-muted);font-size:9px}.h3b4-health{flex:none;padding:4px 8px;border:1px solid rgba(57,214,183,.28);border-radius:999px;background:rgba(57,214,183,.06);color:#9df4df;font-size:8.5px;cursor:pointer}.h3b4-health.error{border-color:rgba(248,113,113,.35);background:rgba(248,113,113,.07);color:#fecaca}
    .h3b4-presets{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-bottom:9px}.h3b4-preset{min-height:47px;padding:7px 8px;border:1px solid var(--b-border);border-radius:9px;background:var(--b-surface);color:var(--b-text);text-align:left;cursor:pointer;transition:120ms ease}.h3b4-preset:hover{border-color:rgba(57,214,183,.45);transform:translateY(-1px)}.h3b4-preset.is-active{border-color:rgba(57,214,183,.72);background:linear-gradient(145deg,rgba(57,214,183,.14),rgba(57,214,183,.035));box-shadow:inset 0 0 0 1px rgba(57,214,183,.08)}.h3b4-preset b{display:block;font-size:9.5px}.h3b4-preset span{display:block;margin-top:2px;color:var(--b-muted);font-size:8px}.h3b4-preset.is-active span{color:#9bd8cd}
    .h3b4-toolbar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:9px}.h3b4-btn{min-height:29px;padding:5px 8px;border:1px solid var(--b-border);border-radius:8px;background:var(--b-surface);color:var(--b-text);cursor:pointer;font:650 8.8px/1.2 inherit}.h3b4-btn:hover{border-color:rgba(57,214,183,.45)}.h3b4-btn.primary{border-color:rgba(57,214,183,.4);background:rgba(57,214,183,.09)}.h3b4-btn.danger{color:#fca5a5}.h3b4-btn:disabled{opacity:.35;cursor:default}
    .h3b4-summary{display:flex;justify-content:space-between;gap:8px;margin-bottom:8px;padding:7px 8px;border:1px solid rgba(157,177,188,.10);border-radius:8px;background:rgba(0,0,0,.12);color:var(--b-muted);font-size:8.5px}.h3b4-summary strong{color:var(--b-text)}
    .h3b4-list{display:flex;flex-direction:column;gap:7px}.h3b4-card{padding:9px;border:1px solid var(--b-border);border-radius:11px;background:linear-gradient(145deg,var(--b-surface),rgba(12,20,24,.9))}.h3b4-card-head{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:7px;align-items:center;margin-bottom:8px}.h3b4-index{display:grid;place-items:center;width:24px;height:24px;border:1px solid rgba(57,214,183,.25);border-radius:7px;background:rgba(57,214,183,.06);color:#9df4df;font-weight:800}.h3b4-name{width:100%;height:29px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--b-text);padding:4px 6px;font:700 10px/1.2 inherit}.h3b4-name:hover,.h3b4-name:focus{outline:none;border-color:var(--b-border);background:rgba(0,0,0,.13)}
    .h3b4-field{margin-top:7px}.h3b4-label{display:flex;justify-content:space-between;gap:8px;margin:0 1px 4px;color:var(--b-muted);font-size:8px;text-transform:uppercase;letter-spacing:.055em}.h3b4-input{width:100%;height:30px;padding:5px 8px;border:1px solid var(--b-border);border-radius:8px;outline:none;background:#0a1216;color:var(--b-text);font:9px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace}.h3b4-input:focus{border-color:rgba(57,214,183,.55);box-shadow:0 0 0 2px rgba(57,214,183,.07)}
    .h3b4-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr) 100px;gap:7px}.h3b4-pills{display:flex;gap:4px;flex-wrap:wrap}.h3b4-pill{min-height:26px;padding:4px 7px;border:1px solid var(--b-border);border-radius:999px;background:#0b1418;color:var(--b-muted);cursor:pointer;font:650 8px/1.15 inherit}.h3b4-pill:hover{color:var(--b-text);border-color:rgba(57,214,183,.4)}.h3b4-pill.is-active{color:#dffff7;border-color:rgba(57,214,183,.65);background:rgba(57,214,183,.11)}
    .h3b4-loras{display:flex;flex-direction:column;gap:4px}.h3b4-lora{display:grid;grid-template-columns:minmax(0,1fr) 72px 24px;gap:5px;align-items:center;padding:5px 6px;border:1px solid rgba(157,177,188,.10);border-radius:7px;background:rgba(0,0,0,.12)}.h3b4-lora-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:8.5px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace}.h3b4-strength{width:100%;height:26px;border:1px solid var(--b-border);border-radius:6px;background:#091115;color:var(--b-text);padding:3px 5px;font-size:8.5px}.h3b4-x{display:grid;place-items:center;width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:#fca5a5;cursor:pointer}
    .h3b4-add{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px;margin-top:5px}.h3b4-empty{padding:16px;border:1px dashed var(--b-border);border-radius:10px;color:var(--b-muted);text-align:center;font-size:9px}.h3b4-import{display:none;margin:0 0 9px}.h3b4-import.open{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px}.h3b4-import textarea{min-height:58px;resize:vertical;border:1px solid var(--b-border);border-radius:8px;background:#091115;color:var(--b-text);padding:7px;font:8px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace}
    @media(max-width:760px){.h3b4-presets{grid-template-columns:1fr 1fr}.h3b4-grid{grid-template-columns:1fr}.h3b4{max-height:620px}}
  `;
  document.head.append(style);
}

function widget(node, name) { return node?.widgets?.find((item) => item.name === name) || null; }
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
  if (state?.generation?.mode === "reference_edit" || refs >= 2 || String(state?.generation?.sampling_profile || "").startsWith("pdd_ref2va_")) return "ref2va";
  return "fl2va";
}
function currentScenario(node, name = "Current setup") {
  const director = sourceNode(node, "studio_context", DIRECTOR);
  const loader = sourceNode(node, "h3_bundle", LOADER);
  const state = director ? stateFromNode(director) : {};
  const route = routeFor(director);
  return {
    name,
    model_name: String(widget(loader, route === "ref2va" ? "ref2va_model" : "fl2va_model")?.value || ""),
    sampling_profile: state?.generation?.sampling_profile || "base_quality_20",
    runtime_preset: state?.ui?.runtime_optimization || "auto",
    runtime_advanced: structuredClone(state?.ui?.runtime_advanced || {}),
    megapixels: Number(state?.generation?.megapixels || 1),
    custom_loras: structuredClone(Array.isArray(state?.ui?.custom_loras) ? state.ui.custom_loras : []),
  };
}
function parseScenarios(node) {
  try {
    const value = JSON.parse(String(widget(node, "scenarios_json")?.value || "[]"));
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}
function saveScenarios(node, scenarios, preset = "custom") {
  const target = widget(node, "scenarios_json");
  if (!target) return;
  target.value = JSON.stringify(scenarios);
  target.callback?.(target.value, app.canvas, node, [0, 0], {});
  node.properties ||= {};
  node.properties.h3studio_benchmark_preset = preset;
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}
function hideNativeWidget(target) {
  if (!target) return;
  target.hidden = true;
  target.__h3b4OriginalCompute ||= target.computeSize;
  target.computeSize = () => [0, -4];
  target.type = "hidden";
}
function hidePlumbing(node) {
  for (const name of ["scenarios_json", "max_scenarios", "grid_cell_size"]) hideNativeWidget(widget(node, name));
}

async function loadCatalog(force = false) {
  if (!force && catalog) return catalog;
  if (!force && catalogPromise) return catalogPromise;
  catalogPromise = (async () => {
    const response = await api.fetchApi(ASSET_URL, { cache: "no-store" });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok || data?.error) throw new Error(data?.error || `HTTP ${response.status}`);
    catalog = data;
    return data;
  })();
  try { return await catalogPromise; } finally { catalogPromise = null; }
}

function modelChoices(route) {
  return (catalog?.models || []).filter((item) => item.route === route || item.route === "unknown").map((item) => item.name);
}
function samplingChoices(route) {
  return (catalog?.sampling_profiles || []).filter((item) => !item.route || item.route === route).map((item) => [item.key, item.label || item.key]);
}
function runtimeChoices() {
  const source = catalog?.runtime_presets || [];
  return source.length ? source.map((item) => [item.key, item.label || item.key]) : [
    ["auto", "Auto"], ["fast", "Fast"], ["og_current", "OG"], ["quality", "Quality"], ["low_vram", "Low VRAM"], ["extreme_low_vram", "Extreme"],
  ];
}
function installedLoras() { return (catalog?.loras || []).filter((item) => item.known_h3).map((item) => item.name); }

function applyPreset(node, kind) {
  const base = currentScenario(node);
  let scenarios;
  if (kind === "current") scenarios = [base];
  else if (kind === "auto-og") scenarios = [
    { ...structuredClone(base), name: "Auto", runtime_preset: "auto" },
    { ...structuredClone(base), name: "OG / Current", runtime_preset: "og_current" },
  ];
  else if (kind === "runtime") scenarios = [
    { ...structuredClone(base), name: "Auto", runtime_preset: "auto" },
    { ...structuredClone(base), name: "Fast", runtime_preset: "fast" },
    { ...structuredClone(base), name: "OG / Current", runtime_preset: "og_current" },
  ];
  else scenarios = [
    { ...structuredClone(base), name: "Auto", runtime_preset: "auto" },
    { ...structuredClone(base), name: "Low VRAM", runtime_preset: "low_vram" },
    { ...structuredClone(base), name: "Extreme Low VRAM", runtime_preset: "extreme_low_vram" },
  ];
  saveScenarios(node, scenarios, kind);
  render(node);
}

function pillGroup(items, selected, onPick) {
  const root = el("div", "h3b4-pills");
  for (const [key, label] of items) {
    const button = el("button", `h3b4-pill${String(key) === String(selected) ? " is-active" : ""}`, label);
    button.type = "button";
    button.title = label;
    button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); onPick(key); });
    root.append(button);
  }
  return root;
}

function patchScenario(node, index, patch) {
  const scenarios = parseScenarios(node);
  if (!scenarios[index]) return;
  scenarios[index] = { ...scenarios[index], ...patch };
  saveScenarios(node, scenarios, "custom");
  render(node);
}
function removeScenario(node, index) {
  const scenarios = parseScenarios(node); scenarios.splice(index, 1); saveScenarios(node, scenarios, "custom"); render(node);
}

function loraRows(node, scenario, index) {
  const root = el("div", "h3b4-loras");
  const values = Array.isArray(scenario.custom_loras) ? scenario.custom_loras : [];
  values.forEach((item, loraIndex) => {
    if (!item?.name) return;
    const row = el("div", "h3b4-lora");
    const name = el("div", "h3b4-lora-name", item.name); name.title = item.name;
    const strength = el("input", "h3b4-strength"); strength.type = "number"; strength.step = "0.05"; strength.min = "-4"; strength.max = "4"; strength.value = String(item.strength ?? 1);
    strength.addEventListener("change", () => {
      const next = structuredClone(values); next[loraIndex] = { ...next[loraIndex], strength: Number(strength.value) || 0 }; patchScenario(node, index, { custom_loras: next });
    });
    const remove = el("button", "h3b4-x", "×"); remove.type = "button"; remove.title = "Remove LoRA";
    remove.addEventListener("click", () => { const next = structuredClone(values); next.splice(loraIndex, 1); patchScenario(node, index, { custom_loras: next }); });
    row.append(name, strength, remove); root.append(row);
  });
  const add = el("div", "h3b4-add");
  const search = el("input", "h3b4-input"); search.placeholder = "Search installed H3 LoRA…"; search.setAttribute("list", `h3b4-loras-${node.id}-${index}`);
  const list = el("datalist"); list.id = `h3b4-loras-${node.id}-${index}`;
  for (const name of installedLoras()) { const option = document.createElement("option"); option.value = name; list.append(option); }
  const button = el("button", "h3b4-btn", "Add LoRA"); button.type = "button";
  button.addEventListener("click", () => {
    const name = search.value.trim(); if (!name) return;
    const next = structuredClone(values); next.push({ name, strength: 1, enabled: true }); patchScenario(node, index, { custom_loras: next });
  });
  add.append(search, button, list); root.append(add);
  return root;
}

function scenarioCard(node, scenario, index, route) {
  const card = el("article", "h3b4-card");
  const head = el("div", "h3b4-card-head");
  head.append(el("span", "h3b4-index", index + 1));
  const name = el("input", "h3b4-name"); name.value = scenario.name || `Scenario ${index + 1}`; name.setAttribute("aria-label", `Scenario ${index + 1} name`);
  name.addEventListener("change", () => patchScenario(node, index, { name: name.value.trim() || `Scenario ${index + 1}` }));
  const remove = el("button", "h3b4-btn danger", "Remove"); remove.type = "button"; remove.addEventListener("click", () => removeScenario(node, index));
  head.append(name, remove); card.append(head);

  const modelField = el("div", "h3b4-field"); modelField.append(el("div", "h3b4-label", "Transformer"));
  const model = el("input", "h3b4-input"); model.value = scenario.model_name || ""; model.placeholder = "Search installed transformer…"; model.setAttribute("list", `h3b4-models-${node.id}-${index}`);
  const models = el("datalist"); models.id = `h3b4-models-${node.id}-${index}`;
  for (const choice of modelChoices(route)) { const option = document.createElement("option"); option.value = choice; models.append(option); }
  model.addEventListener("change", () => patchScenario(node, index, { model_name: model.value.trim() }));
  modelField.append(model, models); card.append(modelField);

  const grid = el("div", "h3b4-grid");
  const samplingField = el("div", "h3b4-field"); samplingField.append(el("div", "h3b4-label", "Sampling profile"), pillGroup(samplingChoices(route), scenario.sampling_profile, (value) => patchScenario(node, index, { sampling_profile: value })));
  const runtimeField = el("div", "h3b4-field"); runtimeField.append(el("div", "h3b4-label", "Runtime"), pillGroup(runtimeChoices(), scenario.runtime_preset || "auto", (value) => patchScenario(node, index, { runtime_preset: value })));
  const mpField = el("div", "h3b4-field"); mpField.append(el("div", "h3b4-label", "Megapixels"));
  const mp = el("input", "h3b4-input"); mp.type = "number"; mp.min = "0.2"; mp.max = "8.5"; mp.step = "0.05"; mp.value = String(Number(scenario.megapixels || 1)); mp.addEventListener("change", () => patchScenario(node, index, { megapixels: Number(mp.value) || 1 })); mpField.append(mp);
  grid.append(samplingField, runtimeField, mpField); card.append(grid);

  const loraField = el("div", "h3b4-field"); loraField.append(el("div", "h3b4-label", "Scenario LoRAs"), loraRows(node, scenario, index)); card.append(loraField);
  return card;
}

function bytesToB64(bytes) { let s = ""; for (const value of bytes) s += String.fromCharCode(value); return btoa(s); }
function b64ToBytes(value) { const s = atob(value); return Uint8Array.from(s, (char) => char.charCodeAt(0)); }
async function gzipBytes(bytes) {
  if (typeof CompressionStream !== "function") return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzipBytes(bytes) {
  if (typeof DecompressionStream !== "function") throw new Error("This browser cannot unpack compressed benchmark codes.");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function exportCode(node) {
  const raw = new TextEncoder().encode(JSON.stringify({ v: 1, scenarios: parseScenarios(node) }));
  const plain = `${SHARE_PREFIX}${bytesToB64(raw)}`;
  const zipped = await gzipBytes(raw);
  if (!zipped) return plain;
  const compact = `${SHARE_ZIP_PREFIX}${bytesToB64(zipped)}`;
  return compact.length < plain.length ? compact : plain;
}
async function importCode(raw) {
  const text = String(raw || "").trim();
  const start = [SHARE_ZIP_PREFIX, SHARE_PREFIX].map((prefix) => [prefix, text.indexOf(prefix)]).filter(([, index]) => index >= 0).sort((a, b) => a[1] - b[1])[0];
  const code = start ? text.slice(start[1]).split(/\s/)[0] : text;
  let payload;
  if (code.startsWith(SHARE_ZIP_PREFIX)) payload = JSON.parse(new TextDecoder().decode(await gunzipBytes(b64ToBytes(code.slice(SHARE_ZIP_PREFIX.length)))));
  else if (code.startsWith(SHARE_PREFIX)) payload = JSON.parse(new TextDecoder().decode(b64ToBytes(code.slice(SHARE_PREFIX.length))));
  else payload = JSON.parse(code);
  if (Number(payload?.v) !== 1 || !Array.isArray(payload.scenarios)) throw new Error("Unsupported H3 benchmark preset.");
  return payload.scenarios;
}
async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = el("textarea"); area.value = text; area.style.position = "fixed"; area.style.opacity = "0"; document.body.append(area); area.select(); document.execCommand("copy"); area.remove();
}
function toast(summary, detail, severity = "success") { app.extensionManager?.toast?.add?.({ severity, summary, detail, life: 4200 }); }

function buildRoot(node) {
  const root = el("div", "h3b4"); root.dataset.h3BenchmarkUi = "v4";
  const director = sourceNode(node, "studio_context", DIRECTOR); const route = routeFor(director); const scenarios = parseScenarios(node);
  const head = el("div", "h3b4-head"); const copy = el("div"); copy.append(el("div", "h3b4-title", "Smart Benchmark"), el("div", "h3b4-sub", "Change one variable at a time. Same Director seed, exact model/LoRA strengths, clean scenario state."));
  const health = el("button", "h3b4-health", catalog ? `${catalog.models?.length || 0} models · ${catalog.loras?.length || 0} LoRAs` : "checking assets…"); health.type = "button"; health.title = "Refresh installed assets";
  health.addEventListener("click", async () => { catalog = null; try { await loadCatalog(true); render(node); } catch (error) { node.__h3b4AssetError = String(error?.message || error); render(node); } });
  if (node.__h3b4AssetError) { health.classList.add("error"); health.textContent = "assets unavailable · retry"; health.title = node.__h3b4AssetError; }
  head.append(copy, health); root.append(head);

  const active = String(node.properties?.h3studio_benchmark_preset || "custom");
  const presets = el("div", "h3b4-presets");
  for (const [key, title, sub] of [["current","Current only","baseline"],["auto-og","Auto vs OG","runtime A/B"],["runtime","Runtime sweep","Auto · Fast · OG"],["memory","Memory sweep","Auto · Low · Extreme"]]) {
    const button = el("button", `h3b4-preset${active === key ? " is-active" : ""}`); button.type = "button"; button.append(el("b", "", title), el("span", "", sub)); button.addEventListener("click", () => applyPreset(node, key)); presets.append(button);
  }
  root.append(presets);

  const toolbar = el("div", "h3b4-toolbar");
  const add = el("button", "h3b4-btn primary", "+ Current setup"); add.type = "button"; add.addEventListener("click", () => { const next = [...parseScenarios(node), currentScenario(node, `Scenario ${parseScenarios(node).length + 1}`)]; saveScenarios(node, next, "custom"); render(node); });
  const clear = el("button", "h3b4-btn", "Clear"); clear.type = "button"; clear.addEventListener("click", () => { saveScenarios(node, [], "custom"); render(node); });
  const copyButton = el("button", "h3b4-btn", "Copy for Discord"); copyButton.type = "button"; copyButton.addEventListener("click", async () => { const code = await exportCode(node); await copyText(`H3 Studio benchmark · ${parseScenarios(node).length} scenarios\n${code}`); toast("Benchmark copied", `${code.length} characters`); });
  const paste = el("button", "h3b4-btn", "Paste / import"); paste.type = "button"; paste.addEventListener("click", () => { root.querySelector(".h3b4-import")?.classList.toggle("open"); });
  toolbar.append(add, clear, copyButton, paste); root.append(toolbar);

  const importer = el("div", "h3b4-import"); const area = el("textarea"); area.placeholder = "Paste H3B1 / H3B1Z code or benchmark JSON here…"; const importButton = el("button", "h3b4-btn primary", "Import"); importButton.type = "button"; importButton.addEventListener("click", async () => { try { saveScenarios(node, await importCode(area.value), "custom"); render(node); toast("Benchmark imported", "Scenario state restored."); } catch (error) { toast("Benchmark import failed", String(error?.message || error), "error"); } }); importer.append(area, importButton); root.append(importer);

  const max = Number(widget(node, "max_scenarios")?.value || 12); const summary = el("div", "h3b4-summary"); summary.append(el("span", "", `${scenarios.length} scenario${scenarios.length === 1 ? "" : "s"} · route ${route.toUpperCase()} · same Director seed`), el("strong", "", scenarios.length > max ? `Too many · guard ${max}` : `guard ${max}`)); root.append(summary);
  const list = el("div", "h3b4-list");
  if (!scenarios.length) list.append(el("div", "h3b4-empty", "Choose a benchmark preset above or add the current setup. Each change updates the scenario immediately."));
  scenarios.forEach((scenario, index) => list.append(scenarioCard(node, scenario, index, route))); root.append(list);
  return root;
}

function render(node) {
  hidePlumbing(node);
  if (!node?.graph || !node.__h3bRoot?.isConnected) return;
  const next = buildRoot(node); node.__h3bRoot.replaceWith(next); node.__h3bRoot = next; node.setDirtyCanvas?.(true, true);
}

function dedupeDomWidgets(node) {
  const matches = (node.widgets || []).filter((item) => item.name === WIDGET_NAME);
  if (matches.length <= 1) return matches[0] || null;
  const keep = matches[0];
  for (const extra of matches.slice(1)) {
    extra.element?.remove?.(); extra.inputEl?.remove?.();
    const index = node.widgets.indexOf(extra); if (index >= 0) node.widgets.splice(index, 1);
  }
  console.warn(`[H3 Studio] Removed ${matches.length - 1} duplicate Smart Benchmark DOM widget(s).`);
  return keep;
}

function install(node) {
  installStyles(); hidePlumbing(node); dedupeDomWidgets(node);
  if (node.__h3bInstalled && node.__h3bRoot?.isConnected) { render(node); return; }
  if (typeof node.addDOMWidget !== "function") return;
  node.__h3bInstalled = true;
  const existing = dedupeDomWidgets(node);
  if (existing?.element?.isConnected) {
    node.__h3bRoot = existing.element; render(node);
  } else {
    const root = buildRoot(node); node.__h3bRoot = root;
    node.addDOMWidget(WIDGET_NAME, WIDGET_NAME, root, {
      serialize: false,
      hideOnZoom: false,
      getValue: () => undefined,
      getMinHeight: () => 380,
      getMaxHeight: () => 700,
    });
  }
  const width = Math.max(760, Number(node.size?.[0]) || 760); const height = Math.max(620, Math.min(760, Number(node.size?.[1]) || 680)); node.setSize?.([width, height]);
  loadCatalog().then(() => { node.__h3b4AssetError = ""; render(node); }).catch((error) => { node.__h3b4AssetError = String(error?.message || error); render(node); });
}

app.registerExtension({
  name: "H3Studio.SmartBenchmarkUIV4",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TARGET) return;
    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function h3b4Created() { const result = created?.apply(this, arguments); queueMicrotask(() => install(this)); return result; };
    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function h3b4Configured() { const result = configured?.apply(this, arguments); queueMicrotask(() => install(this)); return result; };
  },
  afterConfigureGraph() {
    setTimeout(() => { for (const node of app.graph?._nodes || []) if (node?.comfyClass === TARGET) install(node); }, 80);
  },
});
