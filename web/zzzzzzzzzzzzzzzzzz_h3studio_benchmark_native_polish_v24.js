import { app } from "../../scripts/app.js";

const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-benchmark-native-polish-v24-style";

function icon(kind) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const paths = {
    plus:["M12 5v14","M5 12h14"],
    copy:["M9 9h10v10H9z","M5 15H4V5h10v1"],
    import:["M12 3v12","M8 11l4 4 4-4","M5 20h14"],
    trash:["M4 7h16","M9 7V4h6v3","M7 7l1 13h8l1-13"],
  };
  for (const d of paths[kind] || paths.plus) {
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
    .h3b23 .h3b25-icon{display:inline-grid;place-items:center;width:11px;height:11px;flex:0 0 11px;color:color-mix(in srgb,var(--descrip-text,#87919a) 88%,white 7%);opacity:.8}
    .h3b23 .h3b25-icon svg{display:block;width:10px;height:10px}
    .h3b23 .h3b7-actions .h3b7-btn{display:inline-flex!important;align-items:center!important;gap:5px!important}

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
    .h3b23 .h3b7-scenario>summary{transition:background .11s ease!important}
    .h3b23 .h3b7-scenario>summary:hover{background:color-mix(in srgb,var(--comfy-input-bg,#181c20) 24%,transparent)!important}
    .h3b23 .h3b7-scenario[open]>summary{background:color-mix(in srgb,var(--comfy-input-bg,#181c20) 17%,transparent)!important}
  `;
  document.head.append(style);
}

function hasIcon(host) {
  if (!host) return true;
  return Boolean(host.querySelector(":scope > svg,:scope > .h3b25-icon,:scope > .h3b17-quick-icon,:scope > .h3b17-seed-icon,:scope > .h3b17-field-icon,:scope > .h3b17-toggle-icon,:scope > .h3b20-field-icon"));
}

function addIcon(host, kind) {
  if (!host || hasIcon(host)) return;
  host.prepend(mark(kind));
}

function decorate(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) return;

  // v17/v20 already own seed, field, toggle, quick-compare and resolution icons.
  // v24 only fills the one genuinely undecorated area: top actions.
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
