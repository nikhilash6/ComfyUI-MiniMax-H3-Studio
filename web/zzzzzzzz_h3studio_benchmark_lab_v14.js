import { app } from "../../scripts/app.js";

import { stateFromNode } from "./js/studio_extension.js";
import { capNativeForTarget, planResolution, resolutionTier } from "./js/core/state.js";

const BENCHMARK = "H3StudioSmartBenchmark";
const DIRECTOR = "H3StudioDirector";
const STYLE_ID = "h3studio-benchmark-lab-v14-style";
const MODES = ["Scenario lab", "Matrix A/B", "VAE decode A/B"];
const SEEDS = [
  "Same seed for all - fair comparison",
  "New seed each row - paired comparison",
  "New seed every image - diversity sweep",
];
const HIDDEN = new Set([
  "scenarios_json", "max_scenarios", "grid_cell_size", "benchmark_mode", "profiles", "matrix_megapixels",
  "repeats", "seed_strategy", "seed_step", "max_generations", "allow_large_matrix",
  "include_reference_context", "include_original_prompt", "live_cell_previews",
]);

const widget = (node, name) => (node?.widgets || []).find((item) => item?.name === name) || null;
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
function commit(node, name, value) {
  const target = widget(node, name);
  if (!target) return false;
  target.value = value;
  target.callback?.(value, app.canvas, node, [0, 0], {});
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
  return true;
}
function hideNative(node) {
  for (const item of node?.widgets || []) {
    if (!HIDDEN.has(item?.name)) continue;
    item.hidden = true;
    item.computeSize = () => [0, 0];
    item.type = "hidden";
    if (item.inputEl?.style) item.inputEl.style.display = "none";
    if (item.element?.style) item.element.style.display = "none";
  }
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3s-megapixel-control .h3s-range-track::before{display:none!important}
    .h3s-megapixel-control .h3s-range-track{height:4px!important;background:#2b3035!important;box-shadow:inset 0 1px 1px rgba(0,0,0,.30)!important}
    .h3s-v14-mp-spectrum,.h3b14-spectrum{position:absolute;left:0;right:0;top:50%;height:4px;border-radius:999px;transform:translateY(-50%);pointer-events:none;background:linear-gradient(90deg,#66b1a1 0%,#70b588 22%,#b0ad66 44%,#cf9753 62%,#db6f4d 78%,#d84b58 100%);clip-path:inset(0 calc(100% - var(--h3s-range-progress,0%)) 0 0)}
    .h3s-megapixel-control .h3s-range-thumb{background:var(--h3s-v14-current,#9ba8b2)!important;border:2px solid #252a2f!important;box-shadow:0 1px 4px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.04)!important}
    .h3s-v6-layout,.h3s-v7-layout{min-height:0!important;overflow:hidden!important}
    .h3s-v6-main,.h3s-v6-inspector,.h3s-v7-main,.h3s-v7-inspector{height:100%!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scrollbar-gutter:stable!important}
    .h3s-v6-inspector,.h3s-v7-inspector{padding-bottom:34px!important;scroll-padding-bottom:34px!important}.h3s-v14-scroll-end{height:18px;flex:0 0 18px;pointer-events:none}

    .h3b14-modebar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 9px;padding:4px;border-radius:7px;background:#262a2f}.h3b14-modes{display:flex;gap:3px;flex-wrap:wrap}.h3b14-mode{min-height:28px;padding:5px 9px;border:0;border-radius:5px;background:transparent;color:#aab0b8;cursor:pointer;font:650 8.5px/1.2 Inter,ui-sans-serif,system-ui}.h3b14-mode:hover{background:#363b42;color:#fff}.h3b14-mode.is-active{background:#4a535f;color:#fff}.h3b14-modehint{color:#858c95;font-size:8px;white-space:nowrap}
    .h3b7[data-h3b14-mode="matrix"] .h3b7-toolbar,.h3b7[data-h3b14-mode="matrix"] .h3b7-summary,.h3b7[data-h3b14-mode="matrix"] .h3b7-list,.h3b7[data-h3b14-mode="matrix"] .h3b7-import,.h3b7[data-h3b14-mode="vae"] .h3b7-toolbar,.h3b7[data-h3b14-mode="vae"] .h3b7-summary,.h3b7[data-h3b14-mode="vae"] .h3b7-list,.h3b7[data-h3b14-mode="vae"] .h3b7-import{display:none!important}

    .h3b7-fields{grid-template-columns:minmax(0,1.35fr) minmax(0,1fr) minmax(0,1fr)!important}.h3b14-mp-field{grid-column:1/-1!important;padding-top:2px}.h3b14-mp-field>.h3b7-input{display:none!important}
    .h3b14-mp{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px 10px;align-items:center;min-width:0;padding:7px 8px;border:1px solid #454b53;border-radius:6px;background:#34383e}.h3b14-mp-main{min-width:0}.h3b14-mp-range{position:relative;height:18px;min-width:0;--h3s-range-progress:0%}.h3b14-track{position:absolute;left:0;right:0;top:50%;height:4px;border-radius:999px;background:#292e33;transform:translateY(-50%);box-shadow:inset 0 1px 1px rgba(0,0,0,.3)}.h3b14-thumb{position:absolute;left:var(--h3s-range-progress,0%);top:50%;width:12px;height:12px;border:2px solid #272c31;border-radius:50%;background:var(--h3b14-current,#9ca8b1);box-shadow:0 1px 4px rgba(0,0,0,.45);transform:translate(-50%,-50%);pointer-events:none}.h3b14-mp-range input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}.h3b14-mp-scale{display:flex;justify-content:space-between;color:#737b84;font-size:7px}.h3b14-mp-readout{display:flex;flex-direction:column;align-items:flex-end;gap:1px;min-width:98px}.h3b14-mp-readout strong{color:#eef1f3;font-size:10px;font-variant-numeric:tabular-nums}.h3b14-mp-readout span{max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8f979f;font-size:7.5px}

    .h3b14-panel{display:flex;flex-direction:column;gap:9px;padding:10px;border:1px solid #454b53;border-radius:7px;background:#30343a}.h3b14-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.h3b14-panel-head strong{display:block;font-size:10.5px}.h3b14-panel-head span{display:block;margin-top:2px;color:#8e969f;font-size:8px;line-height:1.4}.h3b14-count{flex:none;padding:3px 6px;border-radius:5px;background:#3a3f46;color:#b9c0c7;font-size:7.5px}.h3b14-count.is-over{background:#50383b;color:#efb0b6}
    .h3b14-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.h3b14-field{display:flex;flex-direction:column;gap:4px;min-width:0}.h3b14-field.is-wide{grid-column:1/-1}.h3b14-label{color:#989fa8;font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}.h3b14-textarea,.h3b14-number{width:100%;border:1px solid #4a5058;border-radius:5px;background:#383d43;color:#f0f2f4;outline:none;font:8.5px/1.3 Inter,ui-sans-serif,system-ui}.h3b14-number{height:29px;padding:4px 7px}.h3b14-textarea{min-height:48px;padding:6px 7px;resize:vertical}.h3b14-textarea:focus,.h3b14-number:focus{border-color:#718096;box-shadow:0 0 0 2px rgba(145,167,199,.08)}
    .h3b14-points{display:flex;gap:4px;flex-wrap:wrap}.h3b14-point{display:flex;align-items:center;gap:4px;min-height:24px;padding:3px 6px;border:1px solid #4b5159;border-radius:5px;background:#383d43;color:#dfe3e6;font-size:8px}.h3b14-point button{width:14px;height:14px;padding:0;border:0;background:transparent;color:#969ea6;cursor:pointer}.h3b14-point button:hover{color:#f0a4aa}.h3b14-add-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:center}.h3b14-add{height:29px;padding:4px 9px;border:1px solid #59616a;border-radius:5px;background:#414952;color:#f2f4f5;cursor:pointer;font-size:8px;font-weight:700}.h3b14-add:hover{background:#4a535d}
    .h3b14-seeds{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:3px;border-radius:6px;background:#292d32}.h3b14-seed{min-height:29px;padding:4px 6px;border:0;border-radius:4px;background:transparent;color:#9da4ad;cursor:pointer;font-size:7.5px}.h3b14-seed:hover{background:#393e45;color:#fff}.h3b14-seed.is-active{background:#4a535f;color:#fff}.h3b14-inline{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px}.h3b14-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.h3b14-check{display:flex;align-items:center;gap:6px;min-height:29px;padding:5px 7px;border-radius:5px;background:#363a40;color:#b8bec5;font-size:8px;cursor:pointer}.h3b14-check input{margin:0;accent-color:#94a7bd}.h3b14-note{padding:7px 8px;border-radius:5px;background:#34383e;color:#8f979f;font-size:8px;line-height:1.45}.h3b14-note strong{color:#dfe3e6}.h3b14-note.is-warn{background:#49383a;color:#e7b1b6}.h3b14-vae{padding:13px;border:1px solid #454b53;border-radius:7px;background:#30343a}.h3b14-vae strong{font-size:10.5px}.h3b14-vae p{margin:4px 0 10px;color:#959da6;font-size:8.5px;line-height:1.45}
    @container (max-width:620px){.h3b14-grid,.h3b14-inline,.h3b14-checks,.h3b14-seeds{grid-template-columns:1fr}.h3b14-modebar{align-items:flex-start;flex-direction:column}.h3b14-modehint{white-space:normal}.h3b7-fields{grid-template-columns:1fr!important}}
  `;
  document.head.append(style);
}

const clamp = (value, min, max, fallback = min) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
function interpolate(stops, t) {
  const value = Math.max(0, Math.min(1, t));
  let left = stops[0], right = stops.at(-1);
  for (let i = 1; i < stops.length; i += 1) if (value <= stops[i][0]) { left = stops[i - 1]; right = stops[i]; break; }
  const local = (value - left[0]) / Math.max(0.00001, right[0] - left[0]);
  const rgb = [1, 2, 3].map((i) => Math.round(left[i] + (right[i] - left[i]) * local));
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
}
function mpColor(value, min = 0.2, max = 8.5) {
  const t = (clamp(value, min, max, min) - min) / Math.max(0.00001, max - min);
  return interpolate([[0,102,177,161],[.22,112,181,136],[.44,176,173,102],[.62,207,151,83],[.78,219,111,77],[1,216,75,88]], t);
}
function updateProgress(root, input, value) {
  const min = Number(input.min) || .2, max = Number(input.max) || 8.5;
  const bounded = clamp(value, min, max, min), progress = ((bounded - min) / Math.max(.00001, max - min)) * 100;
  root.style.setProperty("--h3s-range-progress", `${progress}%`);
  root.style.setProperty("--h3b14-current", mpColor(bounded, min, max));
  return bounded;
}
function directorResolution(node, mp) {
  const director = sourceNode(node, "studio_context", DIRECTOR);
  if (!director) return null;
  const generation = stateFromNode(director)?.generation || {};
  const cap = capNativeForTarget(mp, generation.cap_native_resolution);
  const plan = planResolution(generation.aspect_ratio || "1:1", mp, generation.custom_width || 1024, generation.custom_height || 1024, cap);
  return { plan, tier: resolutionTier(mp, cap) };
}
function createMpSlider({ value, onCommit, onPreview, benchmarkNode }) {
  const root = document.createElement("div"); root.className = "h3b14-mp";
  const main = document.createElement("div"); main.className = "h3b14-mp-main";
  const range = document.createElement("div"); range.className = "h3b14-mp-range";
  const track = document.createElement("span"); track.className = "h3b14-track";
  const spectrum = document.createElement("span"); spectrum.className = "h3b14-spectrum";
  const thumb = document.createElement("span"); thumb.className = "h3b14-thumb";
  const input = document.createElement("input"); input.type = "range"; input.min = ".2"; input.max = "8.5"; input.step = ".05"; input.value = String(clamp(value, .2, 8.5, 1)); input.setAttribute("aria-label", "Megapixels");
  range.append(track, spectrum, thumb, input);
  const scale = document.createElement("div"); scale.className = "h3b14-mp-scale"; scale.innerHTML = "<span>0.2</span><span>2 MP</span><span>4 MP</span><span>8.5</span>";
  main.append(range, scale);
  const readout = document.createElement("div"); readout.className = "h3b14-mp-readout";
  const strong = document.createElement("strong"), detail = document.createElement("span"); readout.append(strong, detail); root.append(main, readout);
  const sync = (next) => {
    const bounded = updateProgress(range, input, next); input.value = String(bounded); strong.textContent = `${bounded.toFixed(2)} MP`;
    const resolved = benchmarkNode ? directorResolution(benchmarkNode, bounded) : null;
    detail.textContent = resolved ? `${resolved.plan.width} × ${resolved.plan.height} · ${resolved.tier.label}` : "Direct H3 canvas";
    detail.title = resolved?.tier?.note || ""; onPreview?.(bounded); return bounded;
  };
  input.addEventListener("input", () => sync(input.value), { passive: true });
  input.addEventListener("change", () => onCommit?.(sync(input.value)));
  sync(input.value); root.__h3b14Input = input; return root;
}

function decorateDirectorGradient(node) {
  const range = node?.__h3studioPanel?.querySelector(".h3s-megapixel-control .h3s-range"), input = range?.querySelector(".h3s-range-native");
  if (!range || !input) return;
  if (!range.querySelector(":scope > .h3s-v14-mp-spectrum")) {
    const spectrum = document.createElement("span"); spectrum.className = "h3s-v14-mp-spectrum"; range.insertBefore(spectrum, input);
  }
  const sync = () => range.style.setProperty("--h3s-v14-current", mpColor(input.value, Number(input.min) || .2, Number(input.max) || 8.5));
  if (input.dataset.h3b14Gradient !== "1") { input.dataset.h3b14Gradient = "1"; input.addEventListener("input", sync, { passive: true }); input.addEventListener("change", sync); }
  sync();
}
function sectionTitle(section) { return String(section?.querySelector?.(":scope > .h3s-section-header .h3s-section-title")?.textContent || "").trim().toLowerCase(); }
function belongsInspector(section) {
  return Boolean(section?.classList?.contains("h3s-runtime-section") || section?.classList?.contains("h3s-custom-loras") || section?.classList?.contains("h3s-share-section") || section?.querySelector?.(":scope > .h3s-advanced-toggle") || ["generation","runtime","preset","custom loras"].includes(sectionTitle(section)));
}
function fixDirectorScroll(node) {
  const panel = node?.__h3studioPanel;
  if (!panel?.isConnected) return;
  const layout = panel.querySelector(".h3s-v6-layout,.h3s-v7-layout"), inspector = layout?.querySelector(".h3s-v6-inspector,.h3s-v7-inspector"), main = layout?.querySelector(".h3s-v6-main,.h3s-v7-main");
  if (!layout || !inspector || !main) return;
  for (const child of [...panel.children]) if (child !== layout && !child.classList?.contains("h3s-studio-header") && child.classList?.contains("h3s-section") && belongsInspector(child)) inspector.append(child);
  const header = panel.querySelector(":scope > .h3s-studio-header"), available = Number(panel.clientHeight) - Number(header?.offsetHeight || 46);
  if (available > 120) { layout.style.setProperty("height", `${Math.floor(available)}px`, "important"); layout.style.setProperty("max-height", `${Math.floor(available)}px`, "important"); }
  panel.style.setProperty("overflow", "hidden", "important"); inspector.style.setProperty("overflow-y", "auto", "important"); main.style.setProperty("overflow-y", "auto", "important");
  if (!inspector.querySelector(":scope > .h3s-v14-scroll-end")) { const end = document.createElement("div"); end.className = "h3s-v14-scroll-end"; inspector.append(end); }
  const dom = widget(node, "h3studio_controls");
  if (dom?.options && !dom.options.__h3b14AfterResize) { const previous = dom.options.afterResize; dom.options.__h3b14AfterResize = true; dom.options.afterResize = (...args) => { previous?.(...args); requestAnimationFrame(() => fixDirectorScroll(node)); }; }
  decorateDirectorGradient(node);
}

function parseList(value) { return String(value || "").replaceAll("\r", "\n").replaceAll(",", "\n").split("\n").map((item) => item.trim()).filter(Boolean); }
function parsePoints(value) {
  const values = [];
  for (const token of parseList(value)) { const number = Number(token.toLowerCase().replace("mp", "").trim()); if (!Number.isFinite(number)) continue; const bounded = Number(clamp(number, .2, 8.5, 1).toFixed(2)); if (!values.includes(bounded)) values.push(bounded); }
  return values.length ? values : [1];
}
function savePoints(node, values) { commit(node, "matrix_megapixels", [...new Set(values.map((v) => Number(clamp(v,.2,8.5,1).toFixed(2))))].map((v) => v.toFixed(2)).join(", ")); }
function field(label, control, wide = false) { const root = document.createElement("label"); root.className = `h3b14-field${wide ? " is-wide" : ""}`; const caption = document.createElement("span"); caption.className = "h3b14-label"; caption.textContent = label; root.append(caption, control); return root; }
function numberInput(node, name, min, max) { const input = document.createElement("input"); input.type = "number"; input.className = "h3b14-number"; input.min = String(min); input.max = String(max); input.step = "1"; input.value = String(widget(node,name)?.value ?? min); input.addEventListener("change", () => { commit(node,name,clamp(input.value,min,max,min)); refreshBenchmark(node); }); return input; }
function toggle(node, name, label) { const root = document.createElement("label"); root.className = "h3b14-check"; const input = document.createElement("input"); input.type = "checkbox"; input.checked = Boolean(widget(node,name)?.value); input.addEventListener("change", () => { commit(node,name,input.checked); refreshBenchmark(node); }); const text = document.createElement("span"); text.textContent = label; root.append(input,text); return root; }
function matrixCount(node) { return Math.max(1,parseList(widget(node,"profiles")?.value).length) * Math.max(1,parsePoints(widget(node,"matrix_megapixels")?.value).length) * Math.max(1,Number(widget(node,"repeats")?.value)||1); }

function buildMatrix(node) {
  const panel = document.createElement("div"); panel.className = "h3b14-panel";
  const head = document.createElement("div"); head.className = "h3b14-panel-head"; const copy = document.createElement("div"), title = document.createElement("strong"), sub = document.createElement("span"); title.textContent = "Same-seed matrix"; sub.textContent = "Profiles × resolutions × repeats, with the old benchmark's controlled seed and safety options."; copy.append(title,sub);
  const total = matrixCount(node), guard = Math.max(1,Number(widget(node,"max_generations")?.value)||24), count = document.createElement("span"); count.className = `h3b14-count${total > guard ? " is-over" : ""}`; count.textContent = `${total} gen`; head.append(copy,count); panel.append(head);
  const grid = document.createElement("div"); grid.className = "h3b14-grid";
  const profiles = document.createElement("textarea"); profiles.className = "h3b14-textarea"; profiles.value = String(widget(node,"profiles")?.value || ""); profiles.placeholder = "Director selected profile, base_quality_20"; profiles.addEventListener("change", () => { commit(node,"profiles",profiles.value); refreshBenchmark(node); }); grid.append(field("Profiles",profiles,true));
  const pointField = document.createElement("div"); pointField.className = "h3b14-field is-wide"; const label = document.createElement("span"); label.className = "h3b14-label"; label.textContent = "Resolution points"; const points = document.createElement("div"); points.className = "h3b14-points"; const values = parsePoints(widget(node,"matrix_megapixels")?.value);
  values.forEach((value,index) => { const chip = document.createElement("span"); chip.className = "h3b14-point"; chip.append(document.createTextNode(`${value.toFixed(2)} MP`)); const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.addEventListener("click", () => { const next = values.filter((_v,i) => i !== index); if (next.length) { savePoints(node,next); refreshBenchmark(node); } }); chip.append(remove); points.append(chip); });
  let pending = values.at(-1) || 1; const slider = createMpSlider({ value:pending, benchmarkNode:node, onPreview:(value)=>{ pending=value; } }); const addRow = document.createElement("div"); addRow.className = "h3b14-add-row"; const add = document.createElement("button"); add.type = "button"; add.className = "h3b14-add"; add.textContent = "Add MP"; add.addEventListener("click", () => { if (!values.some((value) => Math.abs(value-pending)<.001)) { savePoints(node,[...values,pending]); refreshBenchmark(node); } }); addRow.append(slider,add); pointField.append(label,points,addRow); grid.append(pointField);
  const seedField = document.createElement("div"); seedField.className = "h3b14-field is-wide"; const seedLabel = document.createElement("span"); seedLabel.className = "h3b14-label"; seedLabel.textContent = "Seed strategy"; const seedBox = document.createElement("div"); seedBox.className = "h3b14-seeds"; const activeSeed = String(widget(node,"seed_strategy")?.value || SEEDS[0]); ["Same seed","New seed / row","New seed / image"].forEach((text,index) => { const button = document.createElement("button"); button.type = "button"; button.className = `h3b14-seed${SEEDS[index]===activeSeed?" is-active":""}`; button.textContent = text; button.title = SEEDS[index]; button.addEventListener("click", () => { commit(node,"seed_strategy",SEEDS[index]); refreshBenchmark(node); }); seedBox.append(button); }); seedField.append(seedLabel,seedBox); grid.append(seedField);
  const inline = document.createElement("div"); inline.className = "h3b14-inline"; inline.append(field("Repeats",numberInput(node,"repeats",1,16)),field("Seed step",numberInput(node,"seed_step",1,1000000)),field("Generation guard",numberInput(node,"max_generations",1,128))); grid.append(field("Run limits",inline,true));
  const cell = document.createElement("input"); cell.type = "range"; cell.min = "320"; cell.max = "1024"; cell.step = "64"; cell.value = String(widget(node,"grid_cell_size")?.value || 576); cell.addEventListener("change", () => commit(node,"grid_cell_size",Number(cell.value))); grid.append(field("Output cell size",cell,true));
  const checks = document.createElement("div"); checks.className = "h3b14-checks"; checks.append(toggle(node,"include_reference_context","Reference context"),toggle(node,"include_original_prompt","Original prompt"),toggle(node,"live_cell_previews","Live cell previews"),toggle(node,"allow_large_matrix","Allow over guard")); grid.append(field("Output + safety",checks,true)); panel.append(grid);
  const note = document.createElement("div"), allowed = Boolean(widget(node,"allow_large_matrix")?.value); note.className = `h3b14-note${total>guard&&!allowed?" is-warn":""}`; note.innerHTML = total>guard&&!allowed ? `<strong>${total} generations exceeds the ${guard}-generation guard.</strong> Raise the guard or explicitly allow the large matrix.` : `<strong>${total} generation${total===1?"":"s"}.</strong> Prompt/reference context stays fixed; only the selected matrix variables change.`; panel.append(note); return panel;
}
function buildVae(node) { const panel = document.createElement("div"); panel.className = "h3b14-vae"; const title = document.createElement("strong"); title.textContent = "Identical-latent VAE A/B"; const text = document.createElement("p"); text.textContent = "Samples once at T=1, then decodes the exact same latent with the original H3 video VAE and the optional image VAE, isolating decoder quality and decode time."; const cell = document.createElement("input"); cell.type = "range"; cell.min="320"; cell.max="1024"; cell.step="64"; cell.value=String(widget(node,"grid_cell_size")?.value||576); cell.addEventListener("change",()=>commit(node,"grid_cell_size",Number(cell.value))); panel.append(title,text,field("Output cell size",cell)); return panel; }
function modeKey(mode) { return mode === "Matrix A/B" ? "matrix" : mode === "VAE decode A/B" ? "vae" : "scenario"; }
function modeBar(node, mode) { const bar = document.createElement("div"); bar.className="h3b14-modebar"; const modes=document.createElement("div"); modes.className="h3b14-modes"; ["Scenarios","Matrix A/B","VAE A/B"].forEach((label,index)=>{ const button=document.createElement("button"); button.type="button"; button.className=`h3b14-mode${mode===MODES[index]?" is-active":""}`; button.textContent=label; button.addEventListener("click",()=>{ commit(node,"benchmark_mode",MODES[index]); refreshBenchmark(node); }); modes.append(button); }); const hint=document.createElement("span"); hint.className="h3b14-modehint"; hint.textContent=mode==="Scenario lab"?"arbitrary setups":mode==="Matrix A/B"?"controlled matrix":"decoder isolation"; bar.append(modes,hint); return bar; }

function decorateScenarioMp(node, root) {
  for (const item of root.querySelectorAll(".h3b7-fields > .h3b7-field")) {
    if (String(item.querySelector(":scope > .h3b7-label")?.textContent || "").trim().toUpperCase() !== "MP") continue;
    const native = item.querySelector(":scope > .h3b7-input[type='number']"); if (!native || item.querySelector(":scope > .h3b14-mp")) continue;
    item.classList.add("h3b14-mp-field"); item.append(createMpSlider({ value:native.value, benchmarkNode:node, onCommit:(value)=>{ native.value=String(value); native.dispatchEvent(new Event("change",{bubbles:true})); } }));
  }
}
function managed(name) { const value=String(name||"").replaceAll("\\","/").split("/").pop().toLowerCase(); return value.includes("h3_pdd")||value.includes("pdd_")||value.includes("lightx")||value.includes("lightx2v")||/turbo[_-](4|8)step/.test(value); }
function filterBenchmarkLoras(root) { for (const option of root.querySelectorAll(".h3b7-loras datalist option")) if (managed(option.value)) option.remove(); for (const input of root.querySelectorAll(".h3b7-loras .h3b7-input")) input.placeholder="Search custom/style LoRA…"; }
function filterDirectorPicker() { const picker=document.getElementById("h3studio-lora-picker"); if (!picker) return; for (const option of picker.querySelectorAll(".h3lp-option")) { const name=String(option.querySelector(".h3lp-name")?.textContent||option.textContent||"").trim(); if (managed(name)) option.remove(); } }

function signature(node, mode) {
  return JSON.stringify([mode,widget(node,"profiles")?.value,widget(node,"matrix_megapixels")?.value,widget(node,"repeats")?.value,widget(node,"seed_strategy")?.value,widget(node,"seed_step")?.value,widget(node,"max_generations")?.value,widget(node,"allow_large_matrix")?.value,widget(node,"include_reference_context")?.value,widget(node,"include_original_prompt")?.value,widget(node,"live_cell_previews")?.value,widget(node,"grid_cell_size")?.value]);
}
function refreshBenchmark(node) {
  hideNative(node);
  const root=node?.__h3bRoot, body=root?.querySelector?.(".h3b7-body"); if (!root?.isConnected||!body) return;
  const mode=String(widget(node,"benchmark_mode")?.value||"Scenario lab"), key=modeKey(mode), sig=signature(node,mode), bar=body.querySelector(":scope > .h3b14-modebar");
  root.dataset.h3b14Mode=key;
  const panelOk = key==="scenario" || (key==="matrix" && body.querySelector(":scope > .h3b14-panel")) || (key==="vae" && body.querySelector(":scope > .h3b14-vae"));
  if (!bar || root.dataset.h3b14Signature !== sig || !panelOk) {
    body.querySelector(":scope > .h3b14-modebar")?.remove(); body.querySelector(":scope > .h3b14-panel")?.remove(); body.querySelector(":scope > .h3b14-vae")?.remove();
    const nextBar=modeBar(node,mode); body.prepend(nextBar); if (key==="matrix") nextBar.after(buildMatrix(node)); else if (key==="vae") nextBar.after(buildVae(node)); root.dataset.h3b14Signature=sig;
  }
  if (key==="scenario") decorateScenarioMp(node,root);
  filterBenchmarkLoras(root);
}
function observeBenchmark(node) {
  const root=node?.__h3bRoot; if (!root?.isConnected) return; refreshBenchmark(node); if (root.__h3b14Observer) return;
  let queued=false; const observer=new MutationObserver(()=>{ if (queued) return; queued=true; requestAnimationFrame(()=>{ queued=false; refreshBenchmark(node); }); }); observer.observe(root,{childList:true,subtree:true}); root.__h3b14Observer=observer;
}
function observeDirector(node) {
  const root=node?.__h3studioPanel; if (!root?.isConnected) return; fixDirectorScroll(node); if (root.__h3b14DirectorObserver) return;
  let queued=false; const observer=new MutationObserver(()=>{ if (queued) return; queued=true; requestAnimationFrame(()=>{ queued=false; fixDirectorScroll(node); }); }); observer.observe(root,{childList:true,subtree:true}); root.__h3b14DirectorObserver=observer;
}
function attach(node) { if (!node?.graph) return; if (node.comfyClass===BENCHMARK) node.__h3bRoot?.isConnected ? observeBenchmark(node) : setTimeout(()=>attach(node),120); else if (node.comfyClass===DIRECTOR) node.__h3studioPanel?.isConnected ? observeDirector(node) : setTimeout(()=>attach(node),120); }
function sweep() { for (const node of app.graph?._nodes||[]) if (node?.comfyClass===BENCHMARK||node?.comfyClass===DIRECTOR) attach(node); filterDirectorPicker(); }
const bodyObserver=new MutationObserver(()=>filterDirectorPicker());

app.registerExtension({
  name:"H3Studio.BenchmarkLabV14",
  setup(){ installStyles(); bodyObserver.observe(document.body,{childList:true,subtree:true}); setTimeout(sweep,220); },
  nodeCreated(node){ if (node?.comfyClass===BENCHMARK||node?.comfyClass===DIRECTOR) setTimeout(()=>attach(node),220); },
  afterConfigureGraph(){ installStyles(); setTimeout(sweep,300); },
});
