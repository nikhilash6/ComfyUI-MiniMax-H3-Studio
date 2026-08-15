import { app } from "../../scripts/app.js";
import { applyState, stateFromNode } from "./js/studio_extension.js";

const BENCHMARK = "H3StudioSmartBenchmark";
const DIRECTOR = "H3StudioDirector";
const LOADER = "H3StudioLoader";
const STYLE_ID = "h3studio-unified-benchmark-v15-style";
const SEEDS = [
  "Same seed for all - fair comparison",
  "New seed each row - paired comparison",
  "New seed every image - diversity sweep",
];
const MANAGED_RE = /(?:h3[_-]?pdd|pdd[_-]|lightx|lightx2v|turbo[_-](?:4|8)step)/i;

const widget = (node, name) => (node?.widgets || []).find((item) => item?.name === name) || null;
function commit(node, name, value) {
  const target = widget(node, name);
  if (!target) return false;
  target.value = value;
  target.callback?.(value, app.canvas, node, [0, 0], {});
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
  return true;
}
function graphLink(id) {
  const links = app.graph?.links;
  if (!links || id == null) return null;
  return typeof links.get === "function" ? links.get(id) : links[id];
}
function sourceNode(node, inputName, expected = "") {
  const input = node?.inputs?.find((item) => item.name === inputName);
  const link = graphLink(input?.link);
  if (!link) return null;
  const id = link.origin_id ?? link.originId ?? link.source_id;
  const source = app.graph?.getNodeById?.(Number(id));
  return !expected || source?.comfyClass === expected ? source : null;
}
function routeFor(director) {
  const state = director ? stateFromNode(director) : null;
  if (state?.generation?.route === "ref2va") return "ref2va";
  if (state?.generation?.route === "fl2va") return "fl2va";
  const refs = (state?.references || []).filter((item) => item?.enabled !== false).length;
  return state?.generation?.mode === "reference_edit" || refs >= 2 ? "ref2va" : "fl2va";
}
function currentScenario(node, name = "Current") {
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
    custom_loras: [],
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
  target.value = JSON.stringify(scenarios.slice(0, 4));
  target.callback?.(target.value, app.canvas, node, [0, 0], {});
  node.properties ||= {};
  node.properties.h3studio_benchmark_preset = preset;
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}
function managed(name) { return MANAGED_RE.test(String(name || "").replaceAll("\\", "/").split("/").pop() || ""); }

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* v14's temporary mode switcher is gone. Smart Benchmark is one surface. */
    .h3b14-modebar,.h3b14-panel,.h3b14-vae{display:none!important}
    .h3b7[data-h3b14-mode]{--unused:0}.h3b7 .h3b7-toolbar,.h3b7 .h3b7-summary,.h3b7 .h3b7-list,.h3b7 .h3b7-import{display:flex!important}
    .h3b7 .h3b7-import{display:none!important}.h3b7 .h3b7-import.open{display:grid!important}
    .h3b7{overflow-y:scroll!important;overflow-x:hidden!important;scrollbar-width:thin!important;scrollbar-color:#626a74 #292d32!important;scrollbar-gutter:stable!important;overscroll-behavior:contain!important}
    .h3b7::-webkit-scrollbar{width:9px!important}.h3b7::-webkit-scrollbar-track{background:#292d32!important}.h3b7::-webkit-scrollbar-thumb{background:#626a74!important;border:2px solid #292d32!important;border-radius:99px!important}
    .h3b7-body{padding-bottom:18px!important}.h3b7-segments{display:none!important}
    .h3b15-quick{display:flex;gap:4px;flex-wrap:wrap;min-width:0}.h3b15-quick button{height:27px;padding:4px 8px;border:1px solid #4c535c;border-radius:5px;background:#353a40;color:#c8ced5;cursor:pointer;font:650 8px/1.2 Inter,ui-sans-serif,system-ui}.h3b15-quick button:hover{background:#424951;color:#fff}.h3b15-quick button.is-primary{border-color:#6d7c8e;background:#485564;color:#fff}
    .h3b15-plan{display:flex;flex-direction:column;gap:8px;margin:0 0 9px;padding:9px;border:1px solid #454c54;border-radius:7px;background:#30343a;min-width:0}.h3b15-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.h3b15-head strong{display:block;color:#f0f2f4;font-size:10px}.h3b15-head span{display:block;margin-top:2px;color:#8f979f;font-size:8px;line-height:1.35}.h3b15-count{flex:none!important;margin:0!important;padding:3px 6px!important;border-radius:5px;background:#3d444c;color:#c7cdd4!important;font-size:7.5px!important}.h3b15-count.is-warn{background:#503b3d;color:#efb4b8!important}
    .h3b15-mp{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 9px;align-items:center;padding:7px;border-radius:6px;background:#353a40}.h3b15-mp-main{min-width:0}.h3b15-range{position:relative;height:20px;--p:10%}.h3b15-range::before{content:'';position:absolute;left:0;right:0;top:50%;height:5px;border-radius:99px;background:#272c31;transform:translateY(-50%);box-shadow:inset 0 1px 2px rgba(0,0,0,.35)}.h3b15-range::after{content:'';position:absolute;left:0;width:var(--p);top:50%;height:5px;border-radius:99px;transform:translateY(-50%);background:linear-gradient(90deg,#61b6a4 0%,#7dbb83 24%,#b7ad5e 48%,#d28b50 69%,#dc6354 84%,#d84558 100%);box-shadow:0 0 8px color-mix(in srgb,var(--heat,#61b6a4) 35%,transparent)}.h3b15-range input{position:absolute;inset:0;z-index:2;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}.h3b15-thumb{position:absolute;z-index:1;left:var(--p);top:50%;width:13px;height:13px;border:2px solid #24292e;border-radius:50%;background:var(--heat,#91a0ad);box-shadow:0 1px 4px rgba(0,0,0,.45);transform:translate(-50%,-50%)}.h3b15-scale{display:flex;justify-content:space-between;color:#727b84;font-size:7px}.h3b15-mp-read{min-width:76px;text-align:right}.h3b15-mp-read strong{display:block;color:#f0f2f4;font-size:10px;font-variant-numeric:tabular-nums}.h3b15-mp-read span{color:#8c949d;font-size:7.5px}.h3b15-mp-actions{display:flex;align-items:center;gap:5px;grid-column:1/-1;flex-wrap:wrap}.h3b15-chip{display:inline-flex;align-items:center;gap:4px;min-height:23px;padding:3px 6px;border:1px solid #4a5159;border-radius:5px;background:#3a4047;color:#dce0e4;font-size:7.5px}.h3b15-chip button{width:13px;height:13px;padding:0;border:0;background:transparent;color:#999fa6;cursor:pointer}.h3b15-chip button:hover{color:#f1a3a8}.h3b15-add,.h3b15-clear{height:23px;padding:3px 7px;border:1px solid #505861;border-radius:5px;background:#40474f;color:#e2e5e8;cursor:pointer;font-size:7.5px}.h3b15-clear{background:transparent;color:#969ea6}
    .h3b15-seeds{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;padding:3px;border-radius:6px;background:#282c31}.h3b15-seeds button{min-height:27px;padding:4px 5px;border:0;border-radius:4px;background:transparent;color:#9da5ae;cursor:pointer;font-size:7.5px}.h3b15-seeds button:hover{background:#393f46;color:#fff}.h3b15-seeds button.is-active{background:#4a5663;color:#fff}
    .h3b15-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.h3b15-field{display:flex;flex-direction:column;gap:3px;min-width:0}.h3b15-label{color:#8f979f;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}.h3b15-number{width:100%;height:27px;padding:3px 6px;border:1px solid #4a5159;border-radius:5px;background:#383e45;color:#eff1f3;outline:none;font-size:8.5px}.h3b15-checks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}.h3b15-check{display:flex;align-items:center;gap:5px;min-height:27px;padding:4px 6px;border-radius:5px;background:#363c42;color:#b8bec5;font-size:7.5px;cursor:pointer}.h3b15-check input{margin:0;accent-color:#8fa5bd}.h3b15-note{color:#858e97;font-size:7.5px;line-height:1.4}

    /* Director target size is one cohesive control, not three detached blocks. */
    .h3s-field.is-h3-target{grid-column:1/-1!important;display:flex!important;flex-direction:column!important;gap:5px!important;min-width:0!important}.h3s-target-stack{display:flex;flex-direction:column;gap:6px;min-width:0;padding:8px;border:1px solid color-mix(in srgb,var(--h3s-border,#4a5057) 90%,transparent);border-radius:8px;background:color-mix(in srgb,var(--h3s-bg,#24282d) 80%,white 4%)}
    .h3s-target-stack .h3s-megapixel-control{padding:0!important;background:transparent!important;border:0!important}.h3s-target-stack .h3s-range-track{height:6px!important;background:#282d32!important;border-radius:99px!important}.h3s-target-stack .h3s-v14-mp-spectrum{height:6px!important;background:linear-gradient(90deg,#60b6a4 0%,#7abc82 23%,#b8ae5f 47%,#d48c50 68%,#dd6455 84%,#d74458 100%)!important;box-shadow:0 0 7px rgba(213,91,78,.08)}
    .h3s-target-stack .h3s-range-thumb{width:15px!important;height:15px!important;border-width:2px!important}
    .h3s-target-stack .h3s-resolution-preview{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr)!important;gap:8px!important;align-items:center!important;margin:0!important;padding:7px 8px!important;border:0!important;border-radius:6px!important;background:#353b42!important;min-width:0!important}.h3s-target-stack .h3s-resolution-result{display:grid!important;grid-template-columns:22px minmax(0,1fr)!important;column-gap:7px!important;align-items:center!important;min-width:0!important}.h3s-target-icon{grid-row:1/3;display:grid;place-items:center;width:22px;height:22px;border-radius:5px;background:#414951;color:#b8c4d0}.h3s-target-icon svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:1.7}.h3s-target-stack .h3s-resolution-result strong{font-size:11px!important;line-height:1.15!important;color:#f2f4f5!important}.h3s-target-stack .h3s-resolution-result span:not(.h3s-target-icon){font-size:7.5px!important;color:#939ba4!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important}.h3s-target-stack .h3s-resolution-status{display:flex!important;flex-direction:column!important;align-items:flex-start!important;gap:2px!important;min-width:0!important}.h3s-target-stack .h3s-resolution-tier{max-width:100%!important;padding:2px 6px!important;border-radius:4px!important;font-size:7px!important;line-height:1.3!important;white-space:nowrap!important}.h3s-target-stack .h3s-resolution-note{display:block!important;max-width:none!important;color:#929aa3!important;font-size:7.5px!important;line-height:1.35!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important}
    .h3s-target-stack .h3s-resolution-modes{display:grid!important;grid-template-columns:1fr 1fr!important;gap:5px!important;margin:0!important}.h3s-target-stack .h3s-resolution-mode{display:grid!important;grid-template-columns:25px minmax(0,1fr)!important;gap:7px!important;align-items:center!important;min-height:38px!important;padding:6px 7px!important;border-radius:6px!important;text-align:left!important}.h3s-resolution-mode-icon{display:grid;place-items:center;width:25px;height:25px;border-radius:5px;background:rgba(255,255,255,.045);color:#aeb9c5}.h3s-resolution-mode-icon svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.7}.h3s-resolution-mode-copy strong{display:block;color:inherit;font-size:8.5px;line-height:1.2}.h3s-resolution-mode-copy span{display:block;margin-top:1px;color:#858e97;font-size:7px;line-height:1.2}.h3s-resolution-mode.is-active .h3s-resolution-mode-copy span{color:#bdc7d1}
    @container (max-width:560px){.h3b15-grid{grid-template-columns:1fr 1fr}.h3b15-checks{grid-template-columns:1fr 1fr}.h3b15-seeds{grid-template-columns:1fr}.h3s-target-stack .h3s-resolution-preview{grid-template-columns:1fr!important}}
  `;
  document.head.append(style);
}

function svgIcon(kind) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const paths = {
    safe: ["M12 3 5 6v5c0 4.5 2.7 8 7 10 4.3-2 7-5.5 7-10V6l-7-3Z", "m9.5 12 1.7 1.7 3.6-4"],
    direct: ["M4 8V4h4", "M20 8V4h-4", "M4 16v4h4", "M20 16v4h-4", "M8 12h8"],
    size: ["M4 7V4h3", "M17 4h3v3", "M20 17v3h-3", "M7 20H4v-3", "M8 8h8v8H8z"],
  };
  for (const d of paths[kind] || paths.size) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
  }
  return svg;
}

function parsePoints(raw) {
  const out = [];
  for (const token of String(raw || "").replaceAll("\r", "\n").replaceAll(",", "\n").split("\n")) {
    const number = Number(token.toLowerCase().replace("mp", "").trim());
    if (!Number.isFinite(number)) continue;
    const value = Math.max(.2, Math.min(8.5, Number(number.toFixed(2))));
    if (!out.includes(value)) out.push(value);
  }
  return out;
}
function savePoints(node, points) { commit(node, "matrix_megapixels", points.map((value) => value.toFixed(2)).join(", ")); }
function colorAt(value) {
  const t = Math.max(0, Math.min(1, (Number(value) - .2) / 8.3));
  if (t < .3) return "#67b39d";
  if (t < .58) return "#b5ad61";
  if (t < .78) return "#d18c50";
  return "#d95159";
}
function field(label, control) {
  const root = document.createElement("label"); root.className = "h3b15-field";
  const text = document.createElement("span"); text.className = "h3b15-label"; text.textContent = label;
  root.append(text, control); return root;
}
function numberInput(node, name, min, max) {
  const input = document.createElement("input"); input.className = "h3b15-number"; input.type = "number";
  input.min = String(min); input.max = String(max); input.step = "1"; input.value = String(widget(node, name)?.value ?? min);
  input.addEventListener("change", () => { const value = Math.max(min, Math.min(max, Number(input.value) || min)); commit(node, name, value); decorateBenchmark(node); });
  return input;
}
function toggle(node, name, label) {
  const root = document.createElement("label"); root.className = "h3b15-check";
  const input = document.createElement("input"); input.type = "checkbox"; input.checked = Boolean(widget(node, name)?.value);
  input.addEventListener("change", () => { commit(node, name, input.checked); decorateBenchmark(node); });
  const text = document.createElement("span"); text.textContent = label; root.append(input, text); return root;
}

function quickPreset(node, kind) {
  const base = currentScenario(node);
  const clone = () => structuredClone(base);
  let scenarios = [];
  if (kind === "base-lightx") {
    if (routeFor(sourceNode(node, "studio_context", DIRECTOR)) === "fl2va") scenarios = [
      { ...clone(), name: "Base 20", sampling_profile: "base_quality_20", custom_loras: [] },
      { ...clone(), name: "LightX 8 · full", sampling_profile: "lightx_v1_fl2v_8", custom_loras: [] },
    ];
    else scenarios = [{ ...clone(), name: "Current" }];
  } else if (kind === "runtime") scenarios = [
    { ...clone(), name: "Auto", runtime_preset: "auto" },
    { ...clone(), name: "Fast", runtime_preset: "fast" },
    { ...clone(), name: "OG", runtime_preset: "og_current" },
  ];
  else scenarios = [
    { ...clone(), name: "Auto", runtime_preset: "auto" },
    { ...clone(), name: "Low VRAM", runtime_preset: "low_vram" },
    { ...clone(), name: "Extreme", runtime_preset: "extreme_low_vram" },
  ];
  saveScenarios(node, scenarios, kind);
  node.__h3b15PlanSignature = "";
  setTimeout(() => decorateBenchmark(node), 0);
}

function ensureBenchmarkDefaults(node) {
  const scenarios = parseScenarios(node);
  if (scenarios.length) return;
  quickPreset(node, "base-lightx");
}
function sanitizeBenchmark(node) {
  const scenarios = parseScenarios(node);
  let changed = false;
  for (const scenario of scenarios) {
    if (!Array.isArray(scenario?.custom_loras)) continue;
    const next = scenario.custom_loras.filter((item) => !managed(item?.name));
    if (next.length !== scenario.custom_loras.length) { scenario.custom_loras = next; changed = true; }
  }
  if (changed) saveScenarios(node, scenarios, "custom");
}
function sanitizeDirector(node) {
  const state = stateFromNode(node);
  const stack = Array.isArray(state?.ui?.custom_loras) ? state.ui.custom_loras : [];
  const filtered = stack.filter((item) => !managed(item?.name));
  if (filtered.length === stack.length) return;
  state.ui = { ...state.ui, custom_loras: filtered };
  applyState(node, state);
  console.warn(`[H3 Studio] Removed ${stack.length - filtered.length} managed acceleration adapter(s) from Custom LoRAs; use Speed profiles for LightX/PDD.`);
}

function buildMpSweep(node) {
  const root = document.createElement("div"); root.className = "h3b15-mp";
  const main = document.createElement("div"); main.className = "h3b15-mp-main";
  const range = document.createElement("div"); range.className = "h3b15-range";
  const input = document.createElement("input"); input.type = "range"; input.min = ".2"; input.max = "8.5"; input.step = ".05";
  const points = parsePoints(widget(node, "matrix_megapixels")?.value);
  input.value = String(points.at(-1) ?? currentScenario(node).megapixels ?? 1);
  const thumb = document.createElement("span"); thumb.className = "h3b15-thumb"; range.append(thumb, input);
  const scale = document.createElement("div"); scale.className = "h3b15-scale"; scale.innerHTML = "<span>0.2</span><span>2 MP</span><span>4 MP</span><span>8.5</span>"; main.append(range, scale);
  const read = document.createElement("div"); read.className = "h3b15-mp-read"; const strong = document.createElement("strong"), note = document.createElement("span"); note.textContent = "sweep point"; read.append(strong, note); root.append(main, read);
  const actions = document.createElement("div"); actions.className = "h3b15-mp-actions";
  const renderPoints = () => {
    actions.replaceChildren();
    const values = parsePoints(widget(node, "matrix_megapixels")?.value);
    if (!values.length) {
      const chip = document.createElement("span"); chip.className = "h3b15-chip"; chip.textContent = "Use each scenario's MP"; actions.append(chip);
    } else values.forEach((value, index) => {
      const chip = document.createElement("span"); chip.className = "h3b15-chip"; chip.append(document.createTextNode(`${value.toFixed(2)} MP`));
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.addEventListener("click", () => { savePoints(node, values.filter((_v, i) => i !== index)); decorateBenchmark(node); }); chip.append(remove); actions.append(chip);
    });
    const add = document.createElement("button"); add.className = "h3b15-add"; add.type = "button"; add.textContent = "+ Add current"; add.addEventListener("click", () => { const value = Number(input.value); const next = [...values]; if (!next.some((item) => Math.abs(item - value) < .001)) next.push(value); savePoints(node, next); decorateBenchmark(node); }); actions.append(add);
    if (values.length) { const clear = document.createElement("button"); clear.className = "h3b15-clear"; clear.type = "button"; clear.textContent = "Use scenario MP"; clear.addEventListener("click", () => { savePoints(node, []); decorateBenchmark(node); }); actions.append(clear); }
  };
  const sync = () => { const value = Number(input.value); const p = ((value - .2) / 8.3) * 100; range.style.setProperty("--p", `${p}%`); range.style.setProperty("--heat", colorAt(value)); strong.textContent = `${value.toFixed(2)} MP`; };
  input.addEventListener("input", sync, { passive: true }); sync(); renderPoints(); root.append(actions); return root;
}

function buildPlan(node) {
  const plan = document.createElement("div"); plan.className = "h3b15-plan";
  const head = document.createElement("div"); head.className = "h3b15-head";
  const copy = document.createElement("div"); const title = document.createElement("strong"); title.textContent = "Benchmark plan"; const sub = document.createElement("span"); sub.textContent = "Scenarios + fair seeds + optional resolution sweep, all in one run."; copy.append(title, sub);
  const scenarios = Math.max(1, parseScenarios(node).length); const points = Math.max(1, parsePoints(widget(node, "matrix_megapixels")?.value).length); const repeats = Math.max(1, Number(widget(node, "repeats")?.value) || 1); const count = scenarios * points * repeats + (widget(node, "compare_vae")?.value ? 1 : 0); const guard = Math.max(1, Number(widget(node, "max_generations")?.value) || 24);
  const countEl = document.createElement("span"); countEl.className = `h3b15-count${count > guard && !widget(node, "allow_large_matrix")?.value ? " is-warn" : ""}`; countEl.textContent = `${count} gen`; head.append(copy, countEl); plan.append(head);
  plan.append(buildMpSweep(node));
  const seedBox = document.createElement("div"); seedBox.className = "h3b15-seeds"; const active = String(widget(node, "seed_strategy")?.value || SEEDS[0]); ["Same seed", "New seed / row", "New seed / image"].forEach((label, index) => { const button = document.createElement("button"); button.type = "button"; button.className = SEEDS[index] === active ? "is-active" : ""; button.textContent = label; button.title = SEEDS[index]; button.addEventListener("click", () => { commit(node, "seed_strategy", SEEDS[index]); decorateBenchmark(node); }); seedBox.append(button); }); plan.append(seedBox);
  const grid = document.createElement("div"); grid.className = "h3b15-grid"; grid.append(field("Repeats", numberInput(node, "repeats", 1, 16)), field("Seed step", numberInput(node, "seed_step", 1, 1000000)), field("Gen guard", numberInput(node, "max_generations", 1, 128)), field("Cell px", numberInput(node, "grid_cell_size", 320, 1024))); plan.append(grid);
  const checks = document.createElement("div"); checks.className = "h3b15-checks"; checks.append(toggle(node, "include_reference_context", "Reference context"), toggle(node, "include_original_prompt", "Original prompt"), toggle(node, "live_cell_previews", "Live cell previews"), toggle(node, "compare_vae", "Also isolate VAE"), toggle(node, "allow_large_matrix", "Allow over guard")); plan.append(checks);
  const note = document.createElement("div"); note.className = "h3b15-note"; note.textContent = parsePoints(widget(node, "matrix_megapixels")?.value).length ? "Every scenario runs at every MP chip above. Clear the sweep to use each scenario's own MP." : "Each scenario keeps its own MP. Add sweep points only when you actually want a resolution matrix."; plan.append(note);
  return plan;
}

function decorateBenchmark(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) return;
  ensureBenchmarkDefaults(node); sanitizeBenchmark(node);
  commit(node, "benchmark_mode", "Unified");
  root.dataset.h3b14Mode = "scenario";
  root.style.setProperty("overflow-y", "scroll", "important");
  root.style.setProperty("overflow-x", "hidden", "important");
  root.querySelectorAll(":scope .h3b14-modebar,:scope .h3b14-panel,:scope .h3b14-vae").forEach((item) => item.remove());
  const body = root.querySelector(".h3b7-body"); if (!body) return;
  const signature = JSON.stringify([widget(node,"matrix_megapixels")?.value,widget(node,"repeats")?.value,widget(node,"seed_strategy")?.value,widget(node,"seed_step")?.value,widget(node,"max_generations")?.value,widget(node,"grid_cell_size")?.value,widget(node,"include_reference_context")?.value,widget(node,"include_original_prompt")?.value,widget(node,"live_cell_previews")?.value,widget(node,"compare_vae")?.value,widget(node,"allow_large_matrix")?.value,widget(node,"scenarios_json")?.value]);
  if (node.__h3b15PlanSignature !== signature || !body.querySelector(":scope > .h3b15-plan")) {
    body.querySelector(":scope > .h3b15-plan")?.remove();
    const summary = body.querySelector(":scope > .h3b7-summary"); const plan = buildPlan(node); summary?.after(plan) || body.prepend(plan); node.__h3b15PlanSignature = signature;
  }
  const toolbar = body.querySelector(":scope > .h3b7-toolbar");
  if (toolbar && !toolbar.querySelector(":scope > .h3b15-quick")) {
    const quick = document.createElement("div"); quick.className = "h3b15-quick";
    [["Base 20 ↔ LightX 8","base-lightx",true],["Runtime","runtime",false],["Memory","memory",false]].forEach(([label,kind,primary]) => { const button=document.createElement("button"); button.type="button"; button.textContent=label; if(primary) button.className="is-primary"; button.addEventListener("click",()=>quickPreset(node,kind)); quick.append(button); });
    toolbar.prepend(quick);
  }
}

function tierKey(badge) {
  for (const key of ["conservative","fast","recommended","extended","experimental","extreme"]) if (badge?.classList?.contains(`is-${key}`)) return key;
  return "recommended";
}
function polishTier(section) {
  const badge = section.querySelector(".h3s-resolution-tier"), note = section.querySelector(".h3s-resolution-note"); if (!badge || !note) return;
  const map = {
    conservative:["Safe cap","~1 MP planning for predictable memory."], fast:["Draft","Fast low-resolution composition check."], recommended:["Recommended","Best-supported direct working range."], extended:["Extended","More pixels · higher time and VRAM."], experimental:["High cost","Experimental high-resolution territory; extra pixels may not add detail."], extreme:["Extreme","Very high cost · experimental; extra pixels are not a quality guarantee."],
  };
  const [label,text] = map[tierKey(badge)] || map.recommended; badge.textContent = label; note.textContent = text;
}
function modeButton(button, kind, title, sub) {
  if (!button || button.dataset.h3b15Mode === kind) return;
  button.dataset.h3b15Mode = kind;
  const icon = document.createElement("span"); icon.className = "h3s-resolution-mode-icon"; icon.append(svgIcon(kind));
  const copy = document.createElement("span"); copy.className = "h3s-resolution-mode-copy"; const strong=document.createElement("strong"); strong.textContent=title; const span=document.createElement("span"); span.textContent=sub; copy.append(strong,span); button.replaceChildren(icon,copy);
}
function polishTargetSize(node) {
  const panel = node?.__h3studioPanel; if (!panel?.isConnected) return;
  const section = [...panel.querySelectorAll(".h3s-section")].find((item) => String(item.querySelector(":scope > .h3s-section-header .h3s-section-title")?.textContent || "").trim().toLowerCase() === "generation");
  if (!section) return;
  const field = [...section.querySelectorAll(".h3s-field")].find((item) => String(item.querySelector(":scope > .h3s-field-label")?.textContent || "").trim().toLowerCase() === "target size");
  const control = field?.querySelector(":scope > .h3s-megapixel-control, :scope > .h3s-target-stack > .h3s-megapixel-control");
  const preview = section.querySelector(".h3s-resolution-preview"); const modes = section.querySelector(".h3s-resolution-modes");
  if (field && control && preview && modes && !field.querySelector(":scope > .h3s-target-stack")) {
    field.classList.add("is-h3-target");
    const stack = document.createElement("div"); stack.className = "h3s-target-stack"; field.append(stack); stack.append(control, preview, modes);
  }
  const result = section.querySelector(".h3s-target-stack .h3s-resolution-result"); if (result && !result.querySelector(":scope > .h3s-target-icon")) { const icon=document.createElement("span"); icon.className="h3s-target-icon"; icon.append(svgIcon("size")); result.prepend(icon); }
  const buttons = section.querySelectorAll(".h3s-target-stack .h3s-resolution-mode"); modeButton(buttons[0], "safe", "Safe cap", "Keep near ~1 MP"); modeButton(buttons[1], "direct", "Direct target", "Honor selected MP");
  polishTier(section);
  const input = section.querySelector(".h3s-target-stack .h3s-range-native"); if (input && input.dataset.h3b15Tier !== "1") { input.dataset.h3b15Tier="1"; input.addEventListener("input",()=>polishTier(section)); input.addEventListener("change",()=>polishTier(section)); }
  const priority = [...panel.querySelectorAll(".h3s-field-label")].find((label) => String(label.textContent).trim() === "Reference priority"); if (priority) { priority.textContent = "Reference adherence"; priority.title = "Changes prompt preservation wording only; it is not a model/LoRA conditioning weight."; }
  sanitizeDirector(node);
}

function observe(node) {
  const root = node.comfyClass === BENCHMARK ? node.__h3bRoot : node.__h3studioPanel;
  if (!root?.isConnected) { setTimeout(() => observe(node), 120); return; }
  const run = () => node.comfyClass === BENCHMARK ? decorateBenchmark(node) : polishTargetSize(node);
  run(); if (root.__h3b15Observer) return;
  let queued = false; const observer = new MutationObserver(() => { if (queued) return; queued=true; requestAnimationFrame(()=>{ queued=false; run(); }); }); observer.observe(root,{childList:true,subtree:true}); root.__h3b15Observer=observer;
}
function sweep() { for (const node of app.graph?._nodes || []) if (node?.comfyClass === BENCHMARK || node?.comfyClass === DIRECTOR) observe(node); }

app.registerExtension({
  name:"H3Studio.UnifiedBenchmarkV15",
  setup(){ installStyles(); setTimeout(sweep,260); },
  nodeCreated(node){ if (node?.comfyClass===BENCHMARK||node?.comfyClass===DIRECTOR) setTimeout(()=>observe(node),260); },
  afterConfigureGraph(){ installStyles(); setTimeout(sweep,320); },
});
