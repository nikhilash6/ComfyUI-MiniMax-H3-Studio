import { app } from "../../scripts/app.js";


if (!globalThis.__H3_STUDIO_CANONICAL_UI__) {
const DIRECTOR = "H3StudioDirector";
const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-ui-fix-v17-style";

function svg(kind) {
  const ns = "http://www.w3.org/2000/svg";
  const el = document.createElementNS(ns, "svg");
  el.setAttribute("viewBox", "0 0 24 24");
  el.setAttribute("aria-hidden", "true");
  const paths = {
    repeat: ["M20 7h-9a5 5 0 0 0-5 5v1", "m17 4 3 3-3 3", "M4 17h9a5 5 0 0 0 5-5v-1", "m7 20-3-3 3-3"],
    seed: ["M12 21V10", "M12 14c-4 0-7-2.5-7-6 4 0 7 2 7 6Z", "M12 11c3.6 0 6-2.2 6-5-3.6 0-6 2.2-6 5Z"],
    guard: ["M12 3 5 6v5c0 4.5 2.7 8 7 10 4.3-2 7-5.5 7-10V6l-7-3Z", "M12 8v5", "M12 17h.01"],
    grid: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],
    lock: ["M7 11V8a5 5 0 0 1 10 0v3", "M6 11h12v9H6z"],
    row: ["M4 6h16", "M4 12h16", "M4 18h16", "m16 9 3 3-3 3"],
    shuffle: ["M4 7h3c5 0 5 10 10 10h3", "m17 14 3-3-3-3", "M4 17h3c2 0 3-.9 4-2.3", "M13 9.3C14 7.9 15 7 17 7h3", "m17 4 3 3-3 3"],
    mp: ["M5 5h14v14H5z", "M9 9h6v6H9z"],
    reference: ["M4 5h16v14H4z", "M8 9h.01", "m4 6 3-3 3 3"],
    prompt: ["M5 4h14v16H5z", "M8 8h8", "M8 12h8", "M8 16h5"],
    preview: ["M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"],
    vae: ["M12 3 5 7v7l7 4 7-4V7l-7-4Z", "m5 7 7 4 7-4", "M12 11v8"],
  };
  for (const d of paths[kind] || paths.mp) {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "1.6");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    el.append(p);
  }
  return el;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3s-v6-inspector .h3s-field.is-h3-target{display:grid!important;grid-template-columns:1fr!important;align-items:stretch!important;gap:6px!important}
    .h3s-v6-inspector .h3s-field.is-h3-target>.h3s-field-label{align-self:auto!important}
    .h3s-field.is-h3-target .h3s-target-stack{width:100%!important;min-width:0!important}
    .h3s-target-stack .h3s-target-icon{display:none!important}
    .h3s-target-stack .h3s-resolution-preview{display:grid!important;grid-template-columns:minmax(0,.9fr) minmax(130px,1.1fr)!important;align-items:center!important;gap:12px!important;height:40px!important;min-height:40px!important;max-height:40px!important;padding:2px 0!important;overflow:hidden!important;background:transparent!important;border:0!important}
    .h3s-target-stack .h3s-resolution-result{display:grid!important;grid-template-columns:1fr!important;grid-template-rows:18px 14px!important;align-content:center!important;min-width:0!important;height:34px!important;overflow:hidden!important}
    .h3s-target-stack .h3s-resolution-result strong{display:block!important;min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-size:11px!important;line-height:18px!important;font-variant-numeric:tabular-nums!important}
    .h3s-target-stack .h3s-resolution-result span:not(.h3s-target-icon){display:block!important;min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-size:7.5px!important;line-height:14px!important;font-variant-numeric:tabular-nums!important}
    .h3s-target-stack .h3s-resolution-status{display:grid!important;grid-template-rows:14px 24px!important;align-content:center!important;align-items:start!important;min-width:0!important;max-width:none!important;height:38px!important;text-align:left!important;overflow:hidden!important}
    .h3s-target-stack .h3s-resolution-tier{font-size:7.5px!important;line-height:14px!important;white-space:nowrap!important}
    .h3s-target-stack .h3s-resolution-note{display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:2!important;max-width:none!important;height:24px!important;overflow:hidden!important;white-space:normal!important;text-overflow:ellipsis!important;font-size:7.25px!important;line-height:12px!important}
    .h3s-megapixel-control .h3s-megapixel-value{display:inline-block!important;min-width:58px!important;text-align:center!important;font-variant-numeric:tabular-nums!important}
    .h3s-target-stack .h3s-range-track,.h3s-target-stack .h3s-v14-mp-spectrum{height:5px!important}.h3s-target-stack .h3s-range-thumb{width:14px!important;height:14px!important}.h3s-target-stack .h3s-resolution-modes{margin-top:1px!important}

    .h3b15-plan{margin:0 0 10px!important;padding:2px 0 9px!important;border:0!important;border-bottom:1px solid #454b52!important;border-radius:0!important;background:transparent!important}
    .h3b15-head{padding:0 1px 5px!important}.h3b15-sweep{padding:6px 0 8px!important;background:transparent!important;border-radius:0!important}.h3b15-chips{margin-top:5px!important}
    .h3b15-seeds{gap:1px!important;padding:2px!important;border:1px solid #444a51!important;background:#292d32!important}
    .h3b15-seeds button{display:grid!important;grid-template-columns:17px minmax(0,1fr)!important;grid-template-rows:auto auto!important;column-gap:6px!important;align-items:center!important;min-height:38px!important;padding:5px 8px!important;text-align:left!important}
    .h3b17-seed-icon{grid-row:1/3;display:grid;place-items:center;width:17px;height:17px;color:#858f98}.h3b17-seed-icon svg{width:15px;height:15px}.h3b17-seed-title{font-size:8px;font-weight:700;color:#d7dce0;line-height:1.15}.h3b17-seed-sub{font-size:6.7px;color:#7e8790;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.h3b15-seeds button.active .h3b17-seed-icon{color:#c7d2dc}.h3b15-seeds button.active .h3b17-seed-sub{color:#aeb7c0}
    .h3b15-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:7px!important;margin-top:8px!important}.h3b15-field{gap:4px!important}.h3b15-field>span{display:none!important}.h3b15-field>input{display:none!important}
    .h3b17-field-head{display:flex;align-items:center;gap:5px;min-height:16px;color:#919aa3;font-size:7.2px;font-weight:700;text-transform:none}.h3b17-field-icon{display:grid;place-items:center;width:14px;height:14px;color:#7e8993}.h3b17-field-icon svg{width:13px;height:13px}.h3b17-help{margin-left:auto;display:grid;place-items:center;width:14px;height:14px;border:1px solid #50575f;border-radius:50%;color:#87919a;font-size:8px;font-weight:700;cursor:help}
    .h3b17-select-wrap{position:relative}.h3b17-select{appearance:none;-webkit-appearance:none;width:100%;height:31px;padding:4px 28px 4px 9px;border:1px solid #4b5259;border-radius:6px;background:#343a40;color:#edf0f2;font:8.5px/1.2 Inter,system-ui;cursor:pointer;outline:none}.h3b17-select:hover{border-color:#626c75;background:#394047}.h3b17-select:focus{border-color:#788897;box-shadow:0 0 0 2px #91a7c712}.h3b17-chevron{pointer-events:none;position:absolute;right:9px;top:50%;width:7px;height:7px;border-right:1.5px solid #8e99a3;border-bottom:1.5px solid #8e99a3;transform:translateY(-68%) rotate(45deg)}.h3b17-field-note{min-height:20px;color:#747d86;font-size:6.8px;line-height:10px}
    .h3b15-checks{display:flex!important;align-items:center!important;gap:5px 14px!important;flex-wrap:wrap!important;margin-top:9px!important;padding:7px 1px 0!important;border-top:1px solid #41474e!important}.h3b15-check{display:inline-flex!important;align-items:center!important;gap:5px!important;min-height:22px!important;padding:0!important;background:transparent!important;color:#aab1b8!important;cursor:pointer!important}.h3b15-check input{width:13px;height:13px;margin:0!important}.h3b17-toggle-icon{display:grid;place-items:center;width:14px;height:14px;color:#7f8992}.h3b17-toggle-icon svg{width:13px;height:13px}.h3b15-note{margin-top:7px!important;padding:0!important;color:#78818a!important}.h3b17-mp-select{height:23px!important;min-width:128px!important;padding:3px 24px 3px 7px!important;font-size:7.5px!important}.h3b15-quick button{display:inline-flex!important;align-items:center!important;gap:5px!important}.h3b17-quick-icon{display:grid;place-items:center;width:13px;height:13px;color:#9aa5af}.h3b17-quick-icon svg{width:12px;height:12px}
    @container (max-width:620px){.h3b15-grid{grid-template-columns:1fr 1fr!important}.h3s-target-stack .h3s-resolution-preview{grid-template-columns:1fr!important;height:auto!important;max-height:none!important}.h3s-target-stack .h3s-resolution-status{display:none!important}}
  `;
  document.head.append(style);
}

function addIcon(parent, kind, className) { const mark=document.createElement("span"); mark.className=className; mark.append(svg(kind)); parent.append(mark); return mark; }

function normalizeTarget(node) {
  const panel=node?.__h3studioPanel;if(!panel?.isConnected)return;
  panel.querySelectorAll(".h3s-resolution-result .h3s-target-icon").forEach((icon)=>icon.remove());
  const result=panel.querySelector(".h3s-resolution-result");
  if(result){const spans=[...result.querySelectorAll(":scope > span")];if(spans.length>1)spans.slice(1).forEach((x)=>x.remove());}
}

const FIELD_META={
  "REPEATS":{kind:"repeat",title:"Repeats",help:"Run every comparison case this many times.",options:[1,2,3,4,6,8]},
  "SEED STEP":{kind:"seed",title:"Seed increment",help:"Amount added when the benchmark creates a new seed.",options:[1,10,100,1000,10000]},
  "SEED INCREMENT":{kind:"seed",title:"Seed increment",help:"Amount added when the benchmark creates a new seed.",options:[1,10,100,1000,10000]},
  "GEN GUARD":{kind:"guard",title:"Max generations",help:"Safety cap. The run is blocked above this count unless Allow over guard is enabled.",options:[8,16,24,32,48,64,96,128]},
  "MAX GENERATIONS":{kind:"guard",title:"Max generations",help:"Safety cap. The run is blocked above this count unless Allow over guard is enabled.",options:[8,16,24,32,48,64,96,128]},
  "CELL PX":{kind:"grid",title:"Grid preview",help:"Width of each result tile in the comparison grid. It does not change generated resolution.",options:[320,480,640,768,896,1024]},
  "GRID TILE SIZE":{kind:"grid",title:"Grid preview",help:"Width of each result tile in the comparison grid. It does not change generated resolution.",options:[320,480,640,768,896,1024]},
};

function selectForField(field,input,meta){
  if(field.dataset.h3V17Field==="1")return;field.dataset.h3V17Field="1";
  const oldLabel=field.querySelector(":scope > span"),head=document.createElement("div");head.className="h3b17-field-head";addIcon(head,meta.kind,"h3b17-field-icon");
  const label=document.createElement("span");label.textContent=meta.title;const help=document.createElement("span");help.className="h3b17-help";help.textContent="?";help.title=meta.help;head.append(label,help);
  const wrap=document.createElement("div");wrap.className="h3b17-select-wrap";const select=document.createElement("select");select.className="h3b17-select";const current=Number(input.value),values=[...meta.options];if(Number.isFinite(current)&&!values.includes(current))values.unshift(current);
  for(const value of values){const option=document.createElement("option");option.value=String(value);option.textContent=meta.kind==="grid"?`${value} px`:String(value);select.append(option);}select.value=String(current);
  select.addEventListener("change",()=>{input.value=select.value;input.dispatchEvent(new Event("change",{bubbles:true}));});const chevron=document.createElement("span");chevron.className="h3b17-chevron";wrap.append(select,chevron);
  const note=document.createElement("div");note.className="h3b17-field-note";note.textContent=meta.help;oldLabel?.after(head);field.append(wrap,note);
}

function decorateFields(root){for(const field of root.querySelectorAll(".h3b15-field")){const raw=String(field.querySelector(":scope > span")?.textContent||"").trim().toUpperCase(),meta=FIELD_META[raw],input=field.querySelector(":scope > input");if(meta&&input)selectForField(field,input,meta);}}

function decorateSeedButtons(root){
  const meta=[["lock","Same seed","Fair A/B · identical seed"],["row","Per row","New seed for each paired row"],["shuffle","Per image","New seed for every image"]];
  [...root.querySelectorAll(".h3b15-seeds button")].forEach((button,index)=>{if(button.dataset.h3V17Seed==="1")return;button.dataset.h3V17Seed="1";const[kind,title,sub]=meta[index]||meta[0];button.replaceChildren();addIcon(button,kind,"h3b17-seed-icon");const strong=document.createElement("span");strong.className="h3b17-seed-title";strong.textContent=title;const small=document.createElement("span");small.className="h3b17-seed-sub";small.textContent=sub;button.append(strong,small);});
}

const TOGGLE_META={
  "Reference context":["reference","Include reference-role and description context in the report."],
  "Original prompt":["prompt","Include the original Director prompt in the report."],
  "Live cell previews":["preview","Show each result cell as soon as that generation finishes."],
  "Also isolate VAE":["vae","Add a same-latent VAE decode comparison so decoder differences are isolated."],
  "Allow over guard":["guard","Permit a run whose generation count exceeds Max generations."],
};
function decorateToggles(root){for(const label of root.querySelectorAll(".h3b15-check")){if(label.dataset.h3V17Toggle==="1")continue;const text=label.querySelector("span:last-child"),key=String(text?.textContent||"").trim(),meta=TOGGLE_META[key];if(!meta)continue;label.dataset.h3V17Toggle="1";label.title=meta[1];const icon=document.createElement("span");icon.className="h3b17-toggle-icon";icon.append(svg(meta[0]));text?.before(icon);}}

function parsePoints(node){const widget=(node?.widgets||[]).find((item)=>item?.name==="matrix_megapixels"),values=[];for(const token of String(widget?.value||"").replaceAll("\r","\n").replaceAll(",","\n").split("\n")){const value=Number(token.toLowerCase().replace("mp","").trim());if(Number.isFinite(value)&&!values.includes(value))values.push(value);}return{widget,values};}
function addMpDropdown(node,root){
  const chips=root.querySelector(".h3b15-chips");if(!chips||chips.querySelector(".h3b17-mp-wrap"))return;const oldAdd=[...chips.querySelectorAll("button")].find((b)=>String(b.textContent).includes("Add current"));if(oldAdd)oldAdd.style.display="none";
  const wrap=document.createElement("div");wrap.className="h3b17-select-wrap h3b17-mp-wrap";const select=document.createElement("select");select.className="h3b17-select h3b17-mp-select";for(const[value,label]of[["","+ Add resolution"],["0.2","0.20 MP · Draft"],["1","1.00 MP · Safe"],["2","2.00 MP"],["4","4.00 MP"],["8.5","8.50 MP · Extreme"]]){const option=document.createElement("option");option.value=value;option.textContent=label;select.append(option);}
  select.addEventListener("change",()=>{const value=Number(select.value);if(!Number.isFinite(value))return;const{widget,values}=parsePoints(node);if(!widget)return;if(!values.some((x)=>Math.abs(x-value)<.001))values.push(value);widget.value=values.map((x)=>Number(x).toFixed(2)).join(", ");widget.callback?.(widget.value,app.canvas,node,[0,0],{});node.setDirtyCanvas?.(true,true);app.graph?.setDirtyCanvas?.(true,true);root.querySelector(".h3b15-plan")?.remove();select.value="";});
  const chevron=document.createElement("span");chevron.className="h3b17-chevron";wrap.append(select,chevron);chips.append(wrap);
}
function decorateQuick(root){const kinds=["mp","repeat","guard"];[...root.querySelectorAll(".h3b15-quick button")].forEach((button,index)=>{if(button.dataset.h3V17Quick==="1")return;button.dataset.h3V17Quick="1";const text=button.textContent;button.replaceChildren();addIcon(button,kinds[index]||"mp","h3b17-quick-icon");button.append(document.createTextNode(text));});}

function decorateBenchmark(node){const root=node?.__h3bRoot;if(!root?.isConnected)return;decorateSeedButtons(root);decorateFields(root);decorateToggles(root);decorateQuick(root);addMpDropdown(node,root);}
function decorate(node){if(node?.comfyClass===DIRECTOR)normalizeTarget(node);else if(node?.comfyClass===BENCHMARK)decorateBenchmark(node);}
function observe(node){const root=node?.comfyClass===DIRECTOR?node.__h3studioPanel:node?.__h3bRoot;if(!root?.isConnected){setTimeout(()=>observe(node),100);return;}decorate(node);if(root.__h3V17Observer)return;let queued=false;const observer=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorate(node);});});observer.observe(root,{childList:true,subtree:true});root.__h3V17Observer=observer;}
function sweep(){for(const node of app.graph?._nodes||[])if(node?.comfyClass===DIRECTOR||node?.comfyClass===BENCHMARK)observe(node);}
app.registerExtension({name:"H3Studio.UIFixV17",setup(){installStyles();setTimeout(sweep,220);},nodeCreated(node){if(node?.comfyClass===DIRECTOR||node?.comfyClass===BENCHMARK)setTimeout(()=>observe(node),220);},afterConfigureGraph(){installStyles();setTimeout(sweep,280);}});

}
