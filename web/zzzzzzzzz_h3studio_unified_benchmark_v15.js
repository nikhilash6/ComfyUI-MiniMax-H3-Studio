import { app } from "../../scripts/app.js";
import { applyState, stateFromNode } from "./js/studio_extension.js";

const BENCHMARK = "H3StudioSmartBenchmark";
const DIRECTOR = "H3StudioDirector";
const LOADER = "H3StudioLoader";
const STYLE_ID = "h3studio-unified-v15-style";
const SEEDS = [
  "Same seed for all - fair comparison",
  "New seed each row - paired comparison",
  "New seed every image - diversity sweep",
];
const MANAGED = /(?:h3[_-]?pdd|pdd[_-]|lightx|lightx2v|turbo[_-](?:4|8)step)/i;
const PLAN_WIDGETS = [
  "benchmark_mode","profiles","matrix_megapixels","repeats","seed_strategy","seed_step","max_generations",
  "allow_large_matrix","include_reference_context","include_original_prompt","live_cell_previews","compare_vae",
];

const w = (node, name) => (node?.widgets || []).find((item) => item?.name === name) || null;
function commit(node, name, value) {
  const target = w(node, name);
  if (!target) return false;
  if (String(target.value) === String(value)) return false;
  target.value = value;
  target.callback?.(value, app.canvas, node, [0, 0], {});
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
  return true;
}
function linkFor(node, inputName) {
  const input = node?.inputs?.find((item) => item.name === inputName);
  const links = app.graph?.links;
  const link = !links || input?.link == null ? null : typeof links.get === "function" ? links.get(input.link) : links[input.link];
  if (!link) return null;
  return app.graph?.getNodeById?.(Number(link.origin_id ?? link.originId ?? link.source_id)) || null;
}
function routeFor(director) {
  const state = director ? stateFromNode(director) : null;
  if (state?.generation?.route === "ref2va") return "ref2va";
  if (state?.generation?.route === "fl2va") return "fl2va";
  const refs = (state?.references || []).filter((item) => item?.enabled !== false).length;
  return state?.generation?.mode === "reference_edit" || refs >= 2 ? "ref2va" : "fl2va";
}
function currentScenario(node) {
  const director = linkFor(node, "studio_context");
  const loader = linkFor(node, "h3_bundle");
  const state = director ? stateFromNode(director) : {};
  const route = routeFor(director);
  return {
    name: "Current",
    model_name: String(w(loader, route === "ref2va" ? "ref2va_model" : "fl2va_model")?.value || ""),
    sampling_profile: state?.generation?.sampling_profile || "base_quality_20",
    runtime_preset: state?.ui?.runtime_optimization || "auto",
    runtime_advanced: structuredClone(state?.ui?.runtime_advanced || {}),
    megapixels: Number(state?.generation?.megapixels || 1),
    custom_loras: [],
  };
}
function scenarios(node) {
  try { const value = JSON.parse(String(w(node,"scenarios_json")?.value || "[]")); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function saveScenarios(node, value, preset = "custom") {
  const target = w(node, "scenarios_json"); if (!target) return;
  const json = JSON.stringify(value.slice(0,4));
  if (String(target.value) === json) return;
  target.value = json; target.callback?.(json, app.canvas, node, [0,0], {});
  node.properties ||= {}; node.properties.h3studio_benchmark_preset = preset;
  node.setDirtyCanvas?.(true,true); app.graph?.setDirtyCanvas?.(true,true);
}
function isManaged(name) { return MANAGED.test(String(name || "").replaceAll("\\","/").split("/").pop() || ""); }
function points(node) {
  const out = [];
  for (const token of String(w(node,"matrix_megapixels")?.value || "").replaceAll("\r","\n").replaceAll(",","\n").split("\n")) {
    const n = Number(token.toLowerCase().replace("mp","").trim());
    if (!Number.isFinite(n)) continue;
    const value = Math.max(.2, Math.min(8.5, Number(n.toFixed(2))));
    if (!out.includes(value)) out.push(value);
  }
  return out;
}
function savePoints(node, value) { commit(node,"matrix_megapixels",value.map((n)=>n.toFixed(2)).join(", ")); }
function hidePlumbing(node) {
  for (const name of PLAN_WIDGETS) {
    const item = w(node,name); if (!item) continue;
    item.hidden = true; item.type = "hidden"; item.computeSize = () => [0,0];
    if (item.inputEl?.style) item.inputEl.style.display = "none";
    if (item.element?.style) item.element.style.display = "none";
  }
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style"); style.id = STYLE_ID;
  style.textContent = `
    .h3b14-modebar,.h3b14-panel,.h3b14-vae,.h3b7-segments{display:none!important}
    .h3b7 .h3b7-toolbar,.h3b7 .h3b7-summary,.h3b7 .h3b7-list{display:flex!important}.h3b7 .h3b7-import{display:none!important}.h3b7 .h3b7-import.open{display:grid!important}
    .h3b7{overflow-y:scroll!important;overflow-x:hidden!important;scrollbar-width:thin!important;scrollbar-color:#626a73 #292d32!important;scrollbar-gutter:stable!important;overscroll-behavior:contain!important}
    .h3b7::-webkit-scrollbar{width:9px!important}.h3b7::-webkit-scrollbar-track{background:#292d32!important}.h3b7::-webkit-scrollbar-thumb{background:#626a73!important;border:2px solid #292d32!important;border-radius:99px!important}.h3b7-body{padding-bottom:18px!important}
    .h3b15-quick{display:flex;gap:4px;flex-wrap:wrap}.h3b15-quick button{height:27px;padding:4px 8px;border:1px solid #4d555e;border-radius:5px;background:#363c43;color:#c8ced4;cursor:pointer;font:650 8px/1.2 Inter,system-ui}.h3b15-quick button:hover{background:#424a53;color:#fff}.h3b15-quick .primary{background:#485666;border-color:#6b7d91;color:#fff}
    .h3b15-plan{display:flex;flex-direction:column;gap:8px;margin:0 0 9px;padding:9px;border:1px solid #464d55;border-radius:7px;background:#30343a}.h3b15-head{display:flex;justify-content:space-between;gap:10px}.h3b15-head strong{display:block;font-size:10px;color:#f0f2f4}.h3b15-head small{display:block;margin-top:2px;color:#8d959e;font-size:8px}.h3b15-count{flex:none;height:20px;padding:3px 6px;border-radius:5px;background:#3d444c;color:#cbd0d5;font-size:7.5px}.h3b15-count.warn{background:#503b3e;color:#efb2b8}
    .h3b15-sweep{padding:7px;border-radius:6px;background:#353a40}.h3b15-range-row{display:grid;grid-template-columns:minmax(0,1fr) 72px;gap:9px;align-items:center}.h3b15-range{position:relative;height:20px;--p:10%;--heat:#64b49d}.h3b15-range:before{content:'';position:absolute;left:0;right:0;top:50%;height:5px;border-radius:99px;background:#272c31;transform:translateY(-50%)}.h3b15-range:after{content:'';position:absolute;left:0;width:var(--p);top:50%;height:5px;border-radius:99px;transform:translateY(-50%);background:linear-gradient(90deg,#61b6a4 0%,#7dbb83 24%,#b7ad5e 48%,#d28b50 69%,#dc6354 84%,#d84558 100%);box-shadow:0 0 7px color-mix(in srgb,var(--heat) 30%,transparent)}.h3b15-range input{position:absolute;inset:0;z-index:2;width:100%;margin:0;opacity:0;cursor:pointer}.h3b15-thumb{position:absolute;left:var(--p);top:50%;z-index:1;width:13px;height:13px;border:2px solid #24292e;border-radius:50%;background:var(--heat);transform:translate(-50%,-50%);box-shadow:0 1px 4px #0008}.h3b15-scale{display:flex;justify-content:space-between;color:#717a84;font-size:7px}.h3b15-read{text-align:right}.h3b15-read strong{display:block;color:#eef1f3;font-size:10px}.h3b15-read span{color:#858e97;font-size:7px}.h3b15-chips{display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-top:6px}.h3b15-chip{display:flex;gap:4px;align-items:center;min-height:22px;padding:3px 6px;border:1px solid #4b525a;border-radius:5px;background:#3a4047;color:#dce0e4;font-size:7.5px}.h3b15-chip button{width:13px;height:13px;padding:0;border:0;background:transparent;color:#9ca3aa;cursor:pointer}.h3b15-mini{height:22px;padding:3px 7px;border:1px solid #505861;border-radius:5px;background:#414850;color:#e3e6e8;cursor:pointer;font-size:7.5px}.h3b15-mini.ghost{background:transparent;color:#969ea6}
    .h3b15-seeds{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;padding:3px;border-radius:6px;background:#282c31}.h3b15-seeds button{min-height:27px;border:0;border-radius:4px;background:transparent;color:#9da5ae;cursor:pointer;font-size:7.5px}.h3b15-seeds button.active{background:#4a5663;color:#fff}
    .h3b15-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.h3b15-field{display:flex;flex-direction:column;gap:3px}.h3b15-field span{color:#8f979f;font-size:7px;font-weight:700;text-transform:uppercase}.h3b15-field input{width:100%;height:27px;padding:3px 6px;border:1px solid #4a5159;border-radius:5px;background:#383e45;color:#f0f2f4;font-size:8.5px}.h3b15-checks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}.h3b15-check{display:flex;align-items:center;gap:5px;min-height:27px;padding:4px 6px;border-radius:5px;background:#363c42;color:#b8bec5;font-size:7.5px}.h3b15-check input{margin:0;accent-color:#91a6bd}.h3b15-note{color:#858e97;font-size:7.5px;line-height:1.4}
    .h3s-field.is-h3-target{grid-column:1/-1!important;display:flex!important;flex-direction:column!important;gap:5px!important}.h3s-target-stack{display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid color-mix(in srgb,var(--h3s-border,#4a5057) 90%,transparent);border-radius:8px;background:color-mix(in srgb,var(--h3s-bg,#24282d) 80%,white 4%)}.h3s-target-stack .h3s-megapixel-control{padding:0!important;border:0!important;background:transparent!important}.h3s-target-stack .h3s-range-track{height:6px!important;background:#282d32!important}.h3s-target-stack .h3s-v14-mp-spectrum{height:6px!important;background:linear-gradient(90deg,#60b6a4 0%,#7abc82 23%,#b8ae5f 47%,#d48c50 68%,#dd6455 84%,#d74458 100%)!important}.h3s-target-stack .h3s-range-thumb{width:15px!important;height:15px!important}
    .h3s-target-stack .h3s-resolution-preview{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr)!important;gap:8px!important;align-items:center!important;margin:0!important;padding:7px 8px!important;border:0!important;border-radius:6px!important;background:#353b42!important}.h3s-target-stack .h3s-resolution-result{display:grid!important;grid-template-columns:22px minmax(0,1fr)!important;column-gap:7px!important;align-items:center!important}.h3s-target-icon{grid-row:1/3;display:grid;place-items:center;width:22px;height:22px;border-radius:5px;background:#414951;color:#bcc7d1}.h3s-target-icon svg,.h3s-mode-icon svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.7}.h3s-target-stack .h3s-resolution-result strong{font-size:11px!important;color:#f2f4f5!important}.h3s-target-stack .h3s-resolution-result span:not(.h3s-target-icon){white-space:normal!important;overflow:visible!important;color:#939ba4!important;font-size:7.5px!important}.h3s-target-stack .h3s-resolution-status{display:flex!important;flex-direction:column!important;align-items:flex-start!important;gap:2px!important}.h3s-target-stack .h3s-resolution-tier{padding:2px 6px!important;border-radius:4px!important;font-size:7px!important;white-space:nowrap!important}.h3s-target-stack .h3s-resolution-note{display:block!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important;max-width:none!important;color:#929aa3!important;font-size:7.5px!important;line-height:1.35!important}
    .h3s-target-stack .h3s-resolution-modes{display:grid!important;grid-template-columns:1fr 1fr!important;gap:5px!important;margin:0!important}.h3s-target-stack .h3s-resolution-mode{display:grid!important;grid-template-columns:25px minmax(0,1fr)!important;gap:7px!important;align-items:center!important;min-height:38px!important;padding:6px 7px!important;text-align:left!important}.h3s-mode-icon{display:grid;place-items:center;width:25px;height:25px;border-radius:5px;background:#ffffff0c;color:#aeb9c5}.h3s-mode-copy strong{display:block;font-size:8.5px}.h3s-mode-copy span{display:block;margin-top:1px;color:#858e97;font-size:7px}.h3s-resolution-mode.is-active .h3s-mode-copy span{color:#bdc7d1}
    @container (max-width:560px){.h3b15-grid{grid-template-columns:1fr 1fr}.h3b15-checks{grid-template-columns:1fr 1fr}.h3b15-seeds{grid-template-columns:1fr}.h3s-target-stack .h3s-resolution-preview{grid-template-columns:1fr!important}}
  `;
  document.head.append(style);
}

function svg(kind) {
  const ns="http://www.w3.org/2000/svg", el=document.createElementNS(ns,"svg"); el.setAttribute("viewBox","0 0 24 24");
  const ds = kind === "safe" ? ["M12 3 5 6v5c0 4.5 2.7 8 7 10 4.3-2 7-5.5 7-10V6l-7-3Z","m9.5 12 1.7 1.7 3.6-4"] : kind === "direct" ? ["M4 8V4h4","M20 8V4h-4","M4 16v4h4","M20 16v4h-4","M8 12h8"] : ["M4 7V4h3","M17 4h3v3","M20 17v3h-3","M7 20H4v-3","M8 8h8v8H8z"];
  for (const d of ds) { const p=document.createElementNS(ns,"path"); p.setAttribute("d",d); p.setAttribute("stroke-linecap","round"); p.setAttribute("stroke-linejoin","round"); el.append(p); }
  return el;
}
function heat(value) { const t=(Number(value)-.2)/8.3; return t<.3?"#67b39d":t<.58?"#b5ad61":t<.78?"#d18c50":"#d95159"; }
function numberField(node,name,label,min,max) {
  const root=document.createElement("label"); root.className="h3b15-field"; const cap=document.createElement("span"); cap.textContent=label;
  const input=document.createElement("input"); input.type="number"; input.min=String(min); input.max=String(max); input.value=String(w(node,name)?.value ?? min);
  input.addEventListener("change",()=>{ const v=Math.max(min,Math.min(max,Number(input.value)||min)); commit(node,name,v); refreshBenchmark(node); }); root.append(cap,input); return root;
}
function check(node,name,label) {
  const root=document.createElement("label"); root.className="h3b15-check"; const input=document.createElement("input"); input.type="checkbox"; input.checked=Boolean(w(node,name)?.value); const text=document.createElement("span"); text.textContent=label;
  input.addEventListener("change",()=>{ commit(node,name,input.checked); refreshBenchmark(node); }); root.append(input,text); return root;
}
function preset(node,kind) {
  const base=currentScenario(node), clone=()=>structuredClone(base); let list=[];
  if (kind==="base-lightx") list=routeFor(linkFor(node,"studio_context"))==="fl2va" ? [
    {...clone(),name:"Base 20",sampling_profile:"base_quality_20",custom_loras:[]},
    {...clone(),name:"LightX 8 · full",sampling_profile:"lightx_v1_fl2v_8",custom_loras:[]},
  ] : [{...clone(),name:"Current"}];
  else if(kind==="runtime") list=[{...clone(),name:"Auto",runtime_preset:"auto"},{...clone(),name:"Fast",runtime_preset:"fast"},{...clone(),name:"OG",runtime_preset:"og_current"}];
  else list=[{...clone(),name:"Auto",runtime_preset:"auto"},{...clone(),name:"Low VRAM",runtime_preset:"low_vram"},{...clone(),name:"Extreme",runtime_preset:"extreme_low_vram"}];
  saveScenarios(node,list,kind); node.__h3b15Sig=""; setTimeout(()=>refreshBenchmark(node),0);
}
function sanitizeBenchmark(node) {
  const list=scenarios(node); let changed=false;
  for(const item of list){ if(!Array.isArray(item?.custom_loras))continue; const next=item.custom_loras.filter((x)=>!isManaged(x?.name)); if(next.length!==item.custom_loras.length){item.custom_loras=next;changed=true;} }
  if(changed) saveScenarios(node,list,"custom");
}
function sanitizeDirector(node) {
  const state=stateFromNode(node), stack=Array.isArray(state?.ui?.custom_loras)?state.ui.custom_loras:[], next=stack.filter((x)=>!isManaged(x?.name));
  if(next.length===stack.length)return; state.ui={...state.ui,custom_loras:next}; applyState(node,state); console.warn(`[H3 Studio] Removed ${stack.length-next.length} managed acceleration adapter(s) from Custom LoRAs; select them in Speed instead.`);
}
function buildSweep(node) {
  const box=document.createElement("div"); box.className="h3b15-sweep"; const row=document.createElement("div"); row.className="h3b15-range-row";
  const main=document.createElement("div"), range=document.createElement("div"); range.className="h3b15-range"; const input=document.createElement("input"); input.type="range"; input.min=".2"; input.max="8.5"; input.step=".05"; input.value=String(points(node).at(-1)??currentScenario(node).megapixels??1); const thumb=document.createElement("span"); thumb.className="h3b15-thumb"; range.append(thumb,input); const scale=document.createElement("div"); scale.className="h3b15-scale"; scale.innerHTML="<span>0.2</span><span>2 MP</span><span>4 MP</span><span>8.5</span>"; main.append(range,scale);
  const read=document.createElement("div"); read.className="h3b15-read"; const strong=document.createElement("strong"), small=document.createElement("span"); small.textContent="sweep point"; read.append(strong,small); row.append(main,read); box.append(row);
  const sync=()=>{const v=Number(input.value),p=((v-.2)/8.3)*100;range.style.setProperty("--p",`${p}%`);range.style.setProperty("--heat",heat(v));strong.textContent=`${v.toFixed(2)} MP`;}; input.addEventListener("input",sync,{passive:true}); sync();
  const chips=document.createElement("div"); chips.className="h3b15-chips"; const values=points(node);
  if(!values.length){const chip=document.createElement("span");chip.className="h3b15-chip";chip.textContent="Use each scenario's MP";chips.append(chip);} else values.forEach((value,index)=>{const chip=document.createElement("span");chip.className="h3b15-chip";chip.append(document.createTextNode(`${value.toFixed(2)} MP`));const remove=document.createElement("button");remove.type="button";remove.textContent="×";remove.addEventListener("click",()=>{savePoints(node,values.filter((_v,i)=>i!==index));refreshBenchmark(node);});chip.append(remove);chips.append(chip);});
  const add=document.createElement("button");add.type="button";add.className="h3b15-mini";add.textContent="+ Add current";add.addEventListener("click",()=>{const v=Number(input.value),next=[...values];if(!next.some((x)=>Math.abs(x-v)<.001))next.push(v);savePoints(node,next);refreshBenchmark(node);});chips.append(add);
  if(values.length){const clear=document.createElement("button");clear.type="button";clear.className="h3b15-mini ghost";clear.textContent="Use scenario MP";clear.addEventListener("click",()=>{savePoints(node,[]);refreshBenchmark(node);});chips.append(clear);} box.append(chips); return box;
}
function buildPlan(node) {
  const root=document.createElement("div");root.className="h3b15-plan";const head=document.createElement("div");head.className="h3b15-head";const copy=document.createElement("div"),title=document.createElement("strong"),sub=document.createElement("small");title.textContent="Benchmark plan";sub.textContent="Scenarios, fair seeds and resolution sweeps in one run.";copy.append(title,sub);
  const count=Math.max(1,scenarios(node).length)*Math.max(1,points(node).length)*Math.max(1,Number(w(node,"repeats")?.value)||1)+(w(node,"compare_vae")?.value?1:0),guard=Math.max(1,Number(w(node,"max_generations")?.value)||24);const badge=document.createElement("span");badge.className=`h3b15-count${count>guard&&!w(node,"allow_large_matrix")?.value?" warn":""}`;badge.textContent=`${count} gen`;head.append(copy,badge);root.append(head,buildSweep(node));
  const seeds=document.createElement("div");seeds.className="h3b15-seeds";const active=String(w(node,"seed_strategy")?.value||SEEDS[0]);["Same seed","New seed / row","New seed / image"].forEach((label,i)=>{const b=document.createElement("button");b.type="button";b.textContent=label;b.title=SEEDS[i];if(active===SEEDS[i])b.className="active";b.addEventListener("click",()=>{commit(node,"seed_strategy",SEEDS[i]);refreshBenchmark(node);});seeds.append(b);});root.append(seeds);
  const grid=document.createElement("div");grid.className="h3b15-grid";grid.append(numberField(node,"repeats","Repeats",1,16),numberField(node,"seed_step","Seed step",1,1000000),numberField(node,"max_generations","Gen guard",1,128),numberField(node,"grid_cell_size","Cell px",320,1024));root.append(grid);
  const checks=document.createElement("div");checks.className="h3b15-checks";checks.append(check(node,"include_reference_context","Reference context"),check(node,"include_original_prompt","Original prompt"),check(node,"live_cell_previews","Live cell previews"),check(node,"compare_vae","Also isolate VAE"),check(node,"allow_large_matrix","Allow over guard"));root.append(checks);const note=document.createElement("div");note.className="h3b15-note";note.textContent=points(node).length?"Each scenario runs at every MP chip. Clear the sweep to use each scenario's own MP.":"Each scenario keeps its own MP. Add sweep points only when you want a resolution comparison.";root.append(note);return root;
}
function refreshBenchmark(node) {
  const root=node?.__h3bRoot;if(!root?.isConnected)return;hidePlumbing(node);sanitizeBenchmark(node);if(!scenarios(node).length)preset(node,"base-lightx");commit(node,"benchmark_mode","Unified");root.dataset.h3b14Mode="scenario";root.querySelectorAll(".h3b14-modebar,.h3b14-panel,.h3b14-vae").forEach((x)=>x.remove());
  const body=root.querySelector(".h3b7-body");if(!body)return;const sig=JSON.stringify([w(node,"scenarios_json")?.value,w(node,"matrix_megapixels")?.value,w(node,"repeats")?.value,w(node,"seed_strategy")?.value,w(node,"seed_step")?.value,w(node,"max_generations")?.value,w(node,"grid_cell_size")?.value,w(node,"include_reference_context")?.value,w(node,"include_original_prompt")?.value,w(node,"live_cell_previews")?.value,w(node,"compare_vae")?.value,w(node,"allow_large_matrix")?.value]);
  if(node.__h3b15Sig!==sig||!body.querySelector(":scope > .h3b15-plan")){body.querySelector(":scope > .h3b15-plan")?.remove();const plan=buildPlan(node),summary=body.querySelector(":scope > .h3b7-summary");if(summary)summary.after(plan);else body.prepend(plan);node.__h3b15Sig=sig;}
  const toolbar=body.querySelector(":scope > .h3b7-toolbar");if(toolbar&&!toolbar.querySelector(":scope > .h3b15-quick")){const quick=document.createElement("div");quick.className="h3b15-quick";[["Base 20 ↔ LightX 8","base-lightx","primary"],["Runtime","runtime",""] ,["Memory","memory",""]].forEach(([label,kind,cls])=>{const b=document.createElement("button");b.type="button";b.textContent=label;b.className=cls;b.addEventListener("click",()=>preset(node,kind));quick.append(b);});toolbar.prepend(quick);}
}
function tierKey(badge){for(const key of ["conservative","fast","recommended","extended","experimental","extreme"])if(badge?.classList?.contains(`is-${key}`))return key;return"recommended";}
function setText(node,text){if(node&&node.textContent!==text)node.textContent=text;}
function polishTier(section){const badge=section.querySelector(".h3s-resolution-tier"),note=section.querySelector(".h3s-resolution-note");if(!badge||!note)return;const map={conservative:["Safe cap","~1 MP planning for predictable memory."],fast:["Draft","Fast low-resolution composition check."],recommended:["Recommended","Best-supported direct working range."],extended:["Extended","More pixels · higher time and VRAM."],experimental:["High cost","Experimental high-resolution territory; extra pixels may not add detail."],extreme:["Extreme","Very high cost · experimental; extra pixels are not a quality guarantee."]};const value=map[tierKey(badge)]||map.recommended;setText(badge,value[0]);setText(note,value[1]);}
function modeButton(button,kind,title,sub){if(!button||button.dataset.h3b15Mode===kind)return;button.dataset.h3b15Mode=kind;const icon=document.createElement("span");icon.className="h3s-mode-icon";icon.append(svg(kind));const copy=document.createElement("span");copy.className="h3s-mode-copy";const strong=document.createElement("strong");strong.textContent=title;const small=document.createElement("span");small.textContent=sub;copy.append(strong,small);button.replaceChildren(icon,copy);}
function refreshDirector(node){const panel=node?.__h3studioPanel;if(!panel?.isConnected)return;sanitizeDirector(node);const section=[...panel.querySelectorAll(".h3s-section")].find((x)=>String(x.querySelector(":scope > .h3s-section-header .h3s-section-title")?.textContent||"").trim().toLowerCase()==="generation");if(!section)return;const field=[...section.querySelectorAll(".h3s-field")].find((x)=>String(x.querySelector(":scope > .h3s-field-label")?.textContent||"").trim().toLowerCase()==="target size");const control=field?.querySelector(":scope > .h3s-megapixel-control,:scope > .h3s-target-stack > .h3s-megapixel-control"),preview=section.querySelector(".h3s-resolution-preview"),modes=section.querySelector(".h3s-resolution-modes");if(field&&control&&preview&&modes&&!field.querySelector(":scope > .h3s-target-stack")){field.classList.add("is-h3-target");const stack=document.createElement("div");stack.className="h3s-target-stack";field.append(stack);stack.append(control,preview,modes);}const result=section.querySelector(".h3s-target-stack .h3s-resolution-result");if(result&&!result.querySelector(":scope > .h3s-target-icon")){const icon=document.createElement("span");icon.className="h3s-target-icon";icon.append(svg("size"));result.prepend(icon);}const buttons=section.querySelectorAll(".h3s-target-stack .h3s-resolution-mode");modeButton(buttons[0],"safe","Safe cap","Keep near ~1 MP");modeButton(buttons[1],"direct","Direct target","Honor selected MP");polishTier(section);const input=section.querySelector(".h3s-target-stack .h3s-range-native");if(input&&input.dataset.h3b15Tier!=="1"){input.dataset.h3b15Tier="1";input.addEventListener("input",()=>polishTier(section));input.addEventListener("change",()=>polishTier(section));}const priority=[...panel.querySelectorAll(".h3s-field-label")].find((x)=>x.textContent.trim()==="Reference priority");if(priority){priority.textContent="Reference adherence";priority.title="Prompt preservation wording only; not a model/LoRA conditioning weight.";}}
function observe(node){const root=node.comfyClass===BENCHMARK?node.__h3bRoot:node.__h3studioPanel;if(!root?.isConnected){setTimeout(()=>observe(node),120);return;}const run=()=>node.comfyClass===BENCHMARK?refreshBenchmark(node):refreshDirector(node);run();if(root.__h3b15Observer)return;let queued=false;const obs=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;run();});});obs.observe(root,{childList:true,subtree:true});root.__h3b15Observer=obs;}
function sweep(){for(const node of app.graph?._nodes||[])if(node?.comfyClass===BENCHMARK||node?.comfyClass===DIRECTOR)observe(node);}

app.registerExtension({name:"H3Studio.UnifiedBenchmarkV15",setup(){installStyles();setTimeout(sweep,260);},nodeCreated(node){if(node?.comfyClass===BENCHMARK||node?.comfyClass===DIRECTOR)setTimeout(()=>observe(node),260);},afterConfigureGraph(){installStyles();setTimeout(sweep,320);}});
