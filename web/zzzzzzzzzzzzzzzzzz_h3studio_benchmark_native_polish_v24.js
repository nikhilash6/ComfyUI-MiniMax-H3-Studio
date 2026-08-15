import { app } from "../../scripts/app.js";

const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-benchmark-native-polish-v24-style";

function icon(kind) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const paths = {
    repeat:["M17 2l4 4-4 4","M3 11V9a3 3 0 0 1 3-3h15","M7 22l-4-4 4-4","M21 13v2a3 3 0 0 1-3 3H3"],
    seed:["M12 21V10","M12 14c-4 0-7-2.5-7-6 4 0 7 2.5 7 6Z","M12 11c4 0 7-2.5 7-6-4 0-7 2.5-7 6Z"],
    shield:["M12 3l7 3v5c0 4.6-2.8 8-7 10-4.2-2-7-5.4-7-10V6l7-3Z"],
    grid:["M4 4h6v6H4z","M14 4h6v6h-6z","M4 14h6v6H4z","M14 14h6v6h-6z"],
    size:["M4 9V4h5","M15 4h5v5","M20 15v5h-5","M9 20H4v-5"],
    lock:["M7 10V7a5 5 0 0 1 10 0v3","M5 10h14v10H5z"],
    rows:["M4 6h16","M4 12h16","M4 18h16","M7 3 4 6l3 3"],
    shuffle:["M4 7h3c5 0 5 10 10 10h3","M17 14l3 3-3 3","M4 17h3c2.1 0 3.3-1.8 4.5-4","M13 9c1.1-1.2 2.3-2 4-2h3","M17 4l3 3-3 3"],
    image:["M4 5h16v14H4z","M8 10h.01","M4 16l4-4 3 3 2-2 7 6"],
    prompt:["M5 4h14v16H5z","M8 8h8","M8 12h8","M8 16h5"],
    eye:["M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z","M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"],
    cube:["M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2Z","M4 6.5l8 4.5 8-4.5","M12 11v9"],
    plus:["M12 5v14","M5 12h14"],
    copy:["M9 9h10v10H9z","M5 15H4V5h10v1"],
    import:["M12 3v12","M8 11l4 4 4-4","M5 20h14"],
    trash:["M4 7h16","M9 7V4h6v3","M7 7l1 13h8l1-13"],
  };
  for (const d of paths[kind] || paths.seed) {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "1.6");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    svg.append(p);
  }
  return svg;
}

function mark(kind) {
  const span = document.createElement("span");
  span.className = "h3b25-icon";
  span.append(icon(kind));
  return span;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3b23 .h3b25-icon{display:inline-grid;place-items:center;width:13px;height:13px;flex:0 0 13px;color:color-mix(in srgb,var(--descrip-text,#87919a) 88%,white 7%);opacity:.9}
    .h3b23 .h3b25-icon svg{display:block;width:12px;height:12px}
    .h3b23 .h3b25-with-icon{display:flex!important;align-items:center!important;gap:5px!important}

    /* Slightly stronger controls while retaining the native/transparent surface. */
    .h3b23 .h3b15-quick button,.h3b23 .h3b7-btn,.h3b23 .h3b20-add,.h3b23 .h3b20-res-chip{
      border-color:color-mix(in srgb,var(--border-color,#3c4349) 90%,white 5%)!important;
    }
    .h3b23 .h3b15-quick button:hover,.h3b23 .h3b7-btn:hover,.h3b23 .h3b20-add:hover,.h3b23 .h3b20-res-chip:hover{
      border-color:color-mix(in srgb,var(--border-color,#4c555d) 78%,white 18%)!important;
      color:var(--input-text,#e7eaed)!important;
    }
    .h3b23 .h3b15-quick button.primary,.h3b23 .h3b7-btn.primary,.h3b23 .h3b15-seeds button.active{
      border-color:color-mix(in srgb,var(--border-color,#525d66) 70%,white 22%)!important;
    }

    .h3b23 .h3b15-seeds button{position:relative!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:7px!important;padding-left:9px!important}
    .h3b23 .h3b15-seeds button .h3b25-icon{color:#9ca7af!important}
    .h3b23 .h3b15-seeds button.active .h3b25-icon{color:#c3cbd1!important}

    .h3b23 .h3b17-field-head{display:flex!important;align-items:center!important;gap:5px!important}
    .h3b23 .h3b17-field-head .h3b25-icon{width:12px;height:12px;flex-basis:12px;opacity:.82}
    .h3b23 .h3b17-field-head .h3b25-icon svg{width:11px;height:11px}
    .h3b23 .h3b20-res-title{display:flex!important;align-items:center!important;gap:5px!important}
    .h3b23 .h3b20-res-title>.h3b25-icon{opacity:.86}

    .h3b23 .h3b15-check{display:inline-flex!important;align-items:center!important;gap:5px!important}
    .h3b23 .h3b15-check>.h3b25-icon{width:11px;height:11px;flex-basis:11px;opacity:.72}
    .h3b23 .h3b15-check>.h3b25-icon svg{width:10px;height:10px}

    .h3b23 .h3b7-actions .h3b7-btn,.h3b23 .h3b15-quick button{display:inline-flex!important;align-items:center!important;gap:5px!important}
    .h3b23 .h3b7-actions .h3b25-icon,.h3b23 .h3b15-quick .h3b25-icon{width:11px;height:11px;flex-basis:11px;opacity:.78}
    .h3b23 .h3b7-actions .h3b25-icon svg,.h3b23 .h3b15-quick .h3b25-icon svg{width:10px;height:10px}

    .h3b23 .h3b7-scenario>summary{transition:background .11s ease!important}
    .h3b23 .h3b7-scenario>summary:hover{background:color-mix(in srgb,var(--comfy-input-bg,#181c20) 24%,transparent)!important}
    .h3b23 .h3b7-scenario[open]>summary{background:color-mix(in srgb,var(--comfy-input-bg,#181c20) 17%,transparent)!important}
  `;
  document.head.append(style);
}

function addIcon(host, kind) {
  if (!host || host.querySelector(":scope > .h3b25-icon")) return;
  host.classList.add("h3b25-with-icon");
  host.prepend(mark(kind));
}

function decorate(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) return;

  const resolutionTitle = root.querySelector(".h3b20-res-title");
  addIcon(resolutionTitle, "size");

  const fieldHeads = [...root.querySelectorAll(".h3b17-field-head")];
  for (const head of fieldHeads) {
    const text = String(head.textContent || "").trim().toLowerCase();
    if (text.includes("repeat")) addIcon(head, "repeat");
    else if (text.includes("seed")) addIcon(head, "seed");
    else if (text.includes("max generation")) addIcon(head, "shield");
    else if (text.includes("grid")) addIcon(head, "grid");
  }

  const seedButtons = [...root.querySelectorAll(".h3b15-seeds button")];
  addIcon(seedButtons[0], "lock");
  addIcon(seedButtons[1], "rows");
  addIcon(seedButtons[2], "shuffle");

  for (const check of root.querySelectorAll(".h3b15-check")) {
    const text = String(check.textContent || "").trim().toLowerCase();
    if (text.includes("reference")) addIcon(check, "image");
    else if (text.includes("prompt")) addIcon(check, "prompt");
    else if (text.includes("live")) addIcon(check, "eye");
    else if (text.includes("vae")) addIcon(check, "cube");
    else if (text.includes("guard")) addIcon(check, "shield");
  }

  const actions = [...root.querySelectorAll(".h3b7-actions .h3b7-btn")];
  addIcon(actions[0], "plus");
  addIcon(actions[1], "copy");
  addIcon(actions[2], "import");
  addIcon(actions[3], "trash");
}

function observe(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) { setTimeout(() => observe(node), 100); return; }
  decorate(node);
  if (root.__h3b25Observer) return;
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; if (root.isConnected) decorate(node); });
  });
  observer.observe(root, { childList:true, subtree:true });
  root.__h3b25Observer = observer;
}

function sweep() {
  for (const node of app.graph?._nodes || []) if (node?.comfyClass === BENCHMARK) observe(node);
}

app.registerExtension({
  name:"H3Studio.BenchmarkNativePolishV24",
  setup(){ installStyles(); setTimeout(sweep,380); },
  nodeCreated(node){ if(node?.comfyClass===BENCHMARK) setTimeout(()=>observe(node),380); },
  afterConfigureGraph(){ installStyles(); setTimeout(sweep,440); },
});
