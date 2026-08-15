import { app } from "../../scripts/app.js";

const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-benchmark-director-v22-style";

function svg(kind) {
  const ns = "http://www.w3.org/2000/svg";
  const root = document.createElementNS(ns, "svg");
  root.setAttribute("viewBox", "0 0 24 24");
  root.setAttribute("aria-hidden", "true");
  const paths = {
    size: ["M4 9V4h5", "M15 4h5v5", "M20 15v5h-5", "M9 20H4v-5"],
  };
  for (const d of paths[kind] || paths.size) {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "1.65");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    root.append(p);
  }
  return root;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Benchmark now follows the Director inspector language instead of its own dashboard theme. */
    .h3b7.h3b22{
      --h3b22-bg:#101214;
      --h3b22-control:#15191d;
      --h3b22-control-hover:#181d21;
      --h3b22-border:#2d3338;
      --h3b22-line:#252a2f;
      --h3b22-text:#eef0f2;
      --h3b22-muted:#818a92;
      --h3b22-soft:#aab2b9;
      background:var(--h3b22-bg)!important;
      border:1px solid var(--h3b22-border)!important;
      border-radius:9px!important;
      box-shadow:none!important;
      color:var(--h3b22-text)!important;
    }
    .h3b22 .h3b7-top{
      min-height:48px!important;padding:9px 12px!important;
      background:#111416!important;border-bottom:1px solid var(--h3b22-line)!important;
      backdrop-filter:none!important;
    }
    .h3b22 .h3b7-title-row{gap:7px!important}
    .h3b22 .h3b7-icon{width:18px!important;height:18px!important;border:0!important;background:transparent!important;color:#87939d!important}
    .h3b22 .h3b7-icon svg{width:16px!important;height:16px!important}
    .h3b22 .h3b7-title{font-size:11px!important;font-weight:740!important}
    .h3b22 .h3b7-sub{font-size:7.3px!important;color:#737d86!important}
    .h3b22 .h3b7-assets{height:24px!important;border:1px solid var(--h3b22-border)!important;background:transparent!important;color:#7f8992!important;border-radius:6px!important}

    .h3b22 .h3b7-body{padding:0 12px 16px!important;background:transparent!important}
    .h3b22 .h3b7-toolbar{
      display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;
      margin:0!important;padding:9px 0!important;border-bottom:1px solid var(--h3b22-line)!important;
    }
    .h3b22 .h3b7-toolbar:before{display:none!important}
    .h3b22 .h3b15-quick{display:flex!important;gap:4px!important;flex-wrap:wrap!important}
    .h3b22 .h3b15-quick button,.h3b22 .h3b7-btn{
      height:27px!important;min-height:27px!important;padding:0 8px!important;
      border:1px solid var(--h3b22-border)!important;border-radius:6px!important;
      background:var(--h3b22-control)!important;color:#9ca5ad!important;box-shadow:none!important;
      font-size:7.2px!important;font-weight:650!important;
    }
    .h3b22 .h3b15-quick button:hover,.h3b22 .h3b7-btn:hover{background:var(--h3b22-control-hover)!important;color:#e7eaed!important;border-color:#414951!important}
    .h3b22 .h3b15-quick button.primary,.h3b22 .h3b7-btn.primary{background:#20262b!important;border-color:#3d4851!important;color:#dfe5e9!important}
    .h3b22 .h3b7-actions{display:flex!important;gap:4px!important;flex-wrap:nowrap!important}
    .h3b22 .h3b21-button-icon{width:12px!important;height:12px!important}

    .h3b22 .h3b7-summary{min-height:27px!important;padding:6px 0!important;margin:0!important;background:transparent!important;border:0!important;border-bottom:1px solid var(--h3b22-line)!important;color:#707a82!important;font-size:6.8px!important}
    .h3b22 .h3b7-summary strong{color:#858f97!important;font-size:6.8px!important}

    /* Run setup: flatter, calmer, and closer to Director sections. */
    .h3b22 .h3b15-plan{margin:0!important;padding:10px 0 9px!important;border:0!important;border-bottom:1px solid var(--h3b22-line)!important;background:transparent!important}
    .h3b22 .h3b15-head{margin:0 0 7px!important;padding:0!important}
    .h3b22 .h3b15-head strong{font-size:9px!important;font-weight:700!important;color:#d9dde0!important}
    .h3b22 .h3b15-head small{font-size:6.7px!important;color:#707981!important}
    .h3b22 .h3b15-count{height:20px!important;border:1px solid var(--h3b22-border)!important;background:transparent!important;color:#818a92!important;font-size:6.4px!important}
    .h3b22 .h3b20-resolutions{padding:7px 0!important;border-top:1px solid var(--h3b22-line)!important;border-bottom:0!important;gap:4px 8px!important}
    .h3b22 .h3b20-res-title{font-size:7.4px!important;color:#a8b0b7!important}
    .h3b22 .h3b20-res-copy{font-size:6.5px!important;color:#6f7880!important}
    .h3b22 .h3b20-res-chip,.h3b22 .h3b20-add{background:var(--h3b22-control)!important;border-color:var(--h3b22-border)!important}
    .h3b22 .h3b15-seeds{margin:7px 0 0!important;padding:2px!important;border:1px solid var(--h3b22-border)!important;background:#121518!important;border-radius:6px!important}
    .h3b22 .h3b15-seeds button{min-height:33px!important;padding:4px 7px!important;border-radius:5px!important}
    .h3b22 .h3b15-seeds button.active{background:#20262b!important}
    .h3b22 .h3b17-seed-title{font-size:7.2px!important}.h3b22 .h3b17-seed-sub{font-size:6.1px!important;color:#6f7880!important}
    .h3b22 .h3b15-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:7px!important;margin-top:8px!important}
    .h3b22 .h3b17-help{display:none!important}
    .h3b22 .h3b17-field-head{font-size:6.6px!important;color:#79838b!important}
    .h3b22 .h3b17-select{height:28px!important;background:var(--h3b22-control)!important;border-color:var(--h3b22-border)!important;border-radius:6px!important;color:#d8dde0!important}
    .h3b22 .h3b17-field-note{font-size:6px!important;line-height:8px!important;color:#626c74!important;min-height:16px!important}
    .h3b22 .h3b15-checks{margin-top:8px!important;padding:7px 0 0!important;border-top:1px solid var(--h3b22-line)!important;gap:5px 13px!important}
    .h3b22 .h3b15-check{font-size:6.5px!important;color:#7d878f!important}
    .h3b22 .h3b15-note{display:none!important}
    .h3b22 .h3b22-noise{display:none!important}

    /* Exactly one icon system: keep v21 icons and suppress older decorators. */
    .h3b22 .h3b20-field-icon,.h3b22 .h3b17-field-icon,.h3b22 .h3b17-toggle-icon{display:none!important}
    .h3b22 .h3b21-field-icon{display:grid!important;place-items:center!important;width:13px!important;height:13px!important;color:#76828c!important}
    .h3b22 .h3b21-field-icon svg{width:12px!important;height:12px!important}

    /* Scenarios: same label-left/control-right structure as Director inspector. */
    .h3b22 .h3b7-list{margin:0!important;border:0!important;gap:0!important}
    .h3b22 .h3b7-list:before{content:'Scenarios'!important;padding:10px 0 6px!important;border-bottom:1px solid var(--h3b22-line)!important;color:#929aa1!important;font-size:7.2px!important;font-weight:700!important;letter-spacing:0!important;text-transform:none!important}
    .h3b22 .h3b7-scenario{border:0!important;border-bottom:1px solid var(--h3b22-line)!important;border-radius:0!important;background:transparent!important;overflow:visible!important}
    .h3b22 .h3b7-scenario:before{display:none!important}
    .h3b22 .h3b7-scenario>summary{grid-template-columns:27px minmax(150px,1fr) auto auto auto 17px 22px!important;gap:6px!important;min-height:43px!important;padding:5px 0!important;background:transparent!important}
    .h3b22 .h3b7-scenario>summary:hover{background:transparent!important}
    .h3b22 .h3b7-index{width:23px!important;height:23px!important;border:1px solid var(--h3b22-border)!important;border-radius:6px!important;background:#15191d!important;color:#98a2aa!important;font-size:7px!important}
    .h3b22 .h3b7-name{height:28px!important;padding:3px 5px!important;background:transparent!important;border-color:transparent!important;color:#e6e9eb!important;font-size:9px!important;font-weight:680!important}
    .h3b22 .h3b7-name:hover,.h3b22 .h3b7-name:focus{background:var(--h3b22-control)!important;border-color:var(--h3b22-border)!important}
    .h3b22 .h3b7-tag{padding:0 5px!important;border:0!important;border-radius:0!important;background:transparent!important;color:#737d85!important;font-size:6.4px!important}
    .h3b22 .h3b20-caret{color:#6f7981!important}
    .h3b22 .h3b7-scenario[open] .h3b20-caret{color:#a2abb2!important}

    .h3b22 .h3b7-fields{
      display:flex!important;flex-direction:column!important;gap:0!important;
      padding:4px 0 9px!important;border-top:1px solid #20252a!important;
      background:transparent!important;
    }
    .h3b22 .h3b7-field{
      display:grid!important;grid-template-columns:92px minmax(0,1fr)!important;align-items:center!important;gap:10px!important;
      min-height:39px!important;padding:4px 0!important;border-bottom:1px solid #1d2226!important;
    }
    .h3b22 .h3b7-label{display:flex!important;align-items:center!important;gap:5px!important;margin:0!important;color:#7d878f!important;font-size:6.8px!important;font-weight:650!important;text-transform:none!important;letter-spacing:0!important}
    .h3b22 .h3b7-input,.h3b22 .h3b7-select{width:100%!important;height:30px!important;border:1px solid var(--h3b22-border)!important;border-radius:6px!important;background:var(--h3b22-control)!important;color:#e0e4e7!important;font-size:8px!important}
    .h3b22 .h3b7-input:hover,.h3b22 .h3b7-select:hover{border-color:#414950!important;background:var(--h3b22-control-hover)!important}
    .h3b22 .h3b7-input:focus,.h3b22 .h3b7-select:focus{border-color:#4d5963!important;box-shadow:none!important}
    .h3b22 .h3b7-loras{display:block!important;grid-column:auto!important;margin:0!important;padding:6px 0 2px 102px!important;border:0!important}
    .h3b22 .h3b7-loras>summary{font-size:6.8px!important;color:#78838b!important}
    .h3b22 .h3b7-lora{background:var(--h3b22-control)!important;border-color:var(--h3b22-border)!important;border-radius:6px!important}

    /* Kill every older MP widget inside the scenario MP field and render one Director-like control. */
    .h3b22 .h3b22-mp-field>:not(.h3b7-label):not(.h3b22-mp):not(.h3b22-origin){display:none!important}
    .h3b22 .h3b22-origin{display:none!important}
    .h3b22 .h3b22-mp{display:grid!important;grid-template-columns:minmax(0,1fr) 58px!important;gap:8px!important;align-items:center!important;height:30px!important;padding:0 8px!important;border:1px solid var(--h3b22-border)!important;border-radius:6px!important;background:var(--h3b22-control)!important}
    .h3b22 .h3b22-mp-track{position:relative;height:18px!important}
    .h3b22 .h3b22-mp-track:before{content:'';position:absolute;left:0;right:0;top:50%;height:4px;border-radius:99px;background:#2b3136;transform:translateY(-50%)}
    .h3b22 .h3b22-mp-track:after{content:'';position:absolute;left:0;top:50%;width:var(--h3b22-p,10%);height:4px;border-radius:99px;background:linear-gradient(90deg,#68ad9e 0%,#83ad7b 24%,#b29f62 50%,#c87d58 72%,#cb5d64 100%);transform:translateY(-50%)}
    .h3b22 .h3b22-mp-track input{position:absolute;inset:0;z-index:2;width:100%!important;height:100%!important;margin:0!important;opacity:0!important;cursor:pointer!important}
    .h3b22 .h3b22-mp-thumb{position:absolute;left:var(--h3b22-p,10%);top:50%;width:12px;height:12px;border:2px solid #1c2125;border-radius:50%;background:#aeb8bf;transform:translate(-50%,-50%);pointer-events:none}
    .h3b22 .h3b22-mp-value{text-align:right;color:#dce1e4;font-size:7.7px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}

    @container (max-width:700px){
      .h3b22 .h3b15-grid{grid-template-columns:1fr 1fr!important}
      .h3b22 .h3b7-toolbar{align-items:flex-start!important;flex-direction:column!important}
      .h3b22 .h3b7-scenario>summary{grid-template-columns:25px minmax(120px,1fr) auto 17px 22px!important}
      .h3b22 .h3b7-scenario>summary .h3b7-tag:nth-of-type(n+2){display:none!important}
      .h3b22 .h3b7-field{grid-template-columns:78px minmax(0,1fr)!important}
      .h3b22 .h3b7-loras{padding-left:88px!important}
    }
  `;
  document.head.append(style);
}

function mpField(details) {
  return [...(details?.querySelectorAll?.(":scope > .h3b7-fields > .h3b7-field") || [])].find((field) => {
    const text = String(field.querySelector(":scope > .h3b7-label")?.textContent || "").trim().toLowerCase();
    return text === "mp" || text.includes("resolution");
  }) || null;
}

function buildMpControl(details, field) {
  const original = field.querySelector("input[type='number']");
  if (!original) return;
  field.classList.add("h3b22-mp-field");
  original.classList.add("h3b22-origin");
  const label = field.querySelector(":scope > .h3b7-label");
  if (label) {
    const textNode = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.nodeValue = " Target size";
    else label.append(document.createTextNode("Target size"));
  }
  if (field.querySelector(":scope > .h3b22-mp")) return;

  const control = document.createElement("div");
  control.className = "h3b22-mp";
  const track = document.createElement("div");
  track.className = "h3b22-mp-track";
  const thumb = document.createElement("span");
  thumb.className = "h3b22-mp-thumb";
  const range = document.createElement("input");
  range.type = "range";
  range.min = ".2";
  range.max = "8.5";
  range.step = ".05";
  range.value = String(Math.max(.2, Math.min(8.5, Number(original.value) || 1)));
  range.setAttribute("aria-label", "Scenario target size in megapixels");
  const value = document.createElement("span");
  value.className = "h3b22-mp-value";

  const sync = () => {
    const n = Math.max(.2, Math.min(8.5, Number(range.value) || 1));
    const p = ((n - .2) / 8.3) * 100;
    track.style.setProperty("--h3b22-p", `${p}%`);
    value.textContent = `${n.toFixed(2)} MP`;
    const tags = details.querySelectorAll(":scope > summary .h3b7-tag");
    if (tags.length) tags[tags.length - 1].textContent = `${n.toFixed(2)} MP`;
  };
  range.addEventListener("input", sync, { passive: true });
  range.addEventListener("change", () => {
    original.value = range.value;
    original.dispatchEvent(new Event("change", { bubbles: true }));
  });
  track.append(thumb, range);
  control.append(track, value);
  field.append(control);
  sync();
}

function hideNoise(root) {
  for (const node of root.querySelectorAll("p,div,span")) {
    const text = String(node.textContent || "").trim();
    if (/^(Seeds:|Run size:|Report:)/.test(text) && node.children.length < 4) node.classList.add("h3b22-noise");
  }
}

function cleanScenario(details) {
  const field = mpField(details);
  if (field) buildMpControl(details, field);
}

function decorate(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) return;
  root.classList.add("h3b22");
  hideNoise(root);
  const head = root.querySelector(".h3b15-head");
  if (head) {
    const title = head.querySelector("strong");
    const sub = head.querySelector("small");
    if (title) title.textContent = "Run setup";
    if (sub) sub.textContent = "Shared comparison settings. Scenario-specific controls stay below.";
  }
  for (const details of root.querySelectorAll(".h3b7-scenario")) cleanScenario(details);
}

function observe(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) { setTimeout(() => observe(node), 100); return; }
  decorate(node);
  if (root.__h3b22Observer) return;
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; decorate(node); });
  });
  observer.observe(root, { childList: true, subtree: true });
  root.__h3b22Observer = observer;
}

function sweep() {
  for (const node of app.graph?._nodes || []) if (node?.comfyClass === BENCHMARK) observe(node);
}

app.registerExtension({
  name: "H3Studio.BenchmarkDirectorV22",
  setup() { installStyles(); setTimeout(sweep, 320); },
  nodeCreated(node) { if (node?.comfyClass === BENCHMARK) setTimeout(() => observe(node), 320); },
  afterConfigureGraph() { installStyles(); setTimeout(sweep, 380); },
});
