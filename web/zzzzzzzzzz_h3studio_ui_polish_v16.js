import { app } from "../../scripts/app.js";

const DIRECTOR = "H3StudioDirector";
const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-ui-polish-v16-style";

function icon(kind) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const paths = {
    draft: ["M13 2 5 14h6l-1 8 9-12h-7l1-8Z"],
    recommended: ["m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"],
    detail: ["M5 5h14v14H5z", "M9 9h6v6H9z"],
    canvas: ["M3 5h18v12H3z", "M8 21h8", "M12 17v4"],
  };
  for (const d of paths[kind] || paths.detail) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
  }
  return svg;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Benchmark: the DOM widget owns the outer height; only the body scrolls. */
    .h3b7{
      display:flex!important;
      flex-direction:column!important;
      width:100%!important;
      height:100%!important;
      min-height:0!important;
      max-height:100%!important;
      overflow:hidden!important;
      scrollbar-gutter:auto!important;
    }
    .h3b7-top{position:relative!important;top:auto!important;flex:0 0 auto!important}
    .h3b7-body{
      flex:1 1 auto!important;
      min-height:0!important;
      max-height:none!important;
      overflow-y:auto!important;
      overflow-x:hidden!important;
      overscroll-behavior:contain!important;
      scrollbar-gutter:stable!important;
      scrollbar-width:thin!important;
      scrollbar-color:#626a73 #292d32!important;
      padding-bottom:26px!important;
    }
    .h3b7-body::-webkit-scrollbar{width:9px!important}
    .h3b7-body::-webkit-scrollbar-track{background:#292d32!important}
    .h3b7-body::-webkit-scrollbar-thumb{background:#626a73!important;border:2px solid #292d32!important;border-radius:999px!important}

    /* Target size: compact property control, no nested dashboard/card. */
    .h3s-field.is-h3-target{gap:5px!important}
    .h3s-target-stack{
      display:flex!important;
      flex-direction:column!important;
      gap:5px!important;
      padding:0!important;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
      box-shadow:none!important;
    }
    .h3s-target-stack .h3s-megapixel-control{padding:0!important;border:0!important;background:transparent!important}
    .h3s-target-stack .h3s-resolution-presets,
    .h3s-field.is-h3-target .h3s-resolution-presets{
      display:grid!important;
      grid-template-columns:repeat(3,minmax(0,1fr))!important;
      gap:4px!important;
      margin:0!important;
    }
    .h3s-resolution-preset{
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      gap:5px!important;
      min-height:27px!important;
      padding:4px 6px!important;
      border-radius:5px!important;
      white-space:nowrap!important;
      overflow:hidden!important;
    }
    .h3s-preset-icon{display:grid;place-items:center;flex:0 0 12px;width:12px;height:12px;color:#7f8992}
    .h3s-preset-icon svg{display:block;width:12px;height:12px}
    .h3s-resolution-preset.is-active .h3s-preset-icon{color:#c5cdd4}
    .h3s-preset-label{min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:7.5px;font-weight:650}

    .h3s-target-stack .h3s-resolution-preview{
      display:flex!important;
      align-items:flex-start!important;
      justify-content:space-between!important;
      gap:9px!important;
      min-height:0!important;
      margin:0!important;
      padding:3px 1px 2px!important;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
      box-shadow:none!important;
    }
    .h3s-target-stack .h3s-resolution-result{
      display:grid!important;
      grid-template-columns:16px minmax(0,1fr)!important;
      column-gap:6px!important;
      row-gap:0!important;
      align-items:center!important;
      min-width:0!important;
    }
    .h3s-target-stack .h3s-target-icon{
      grid-row:1/3!important;
      width:16px!important;
      height:16px!important;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
      color:#7f8992!important;
    }
    .h3s-target-stack .h3s-target-icon svg{width:13px!important;height:13px!important}
    .h3s-target-stack .h3s-resolution-result strong{
      font-size:9.5px!important;
      line-height:1.2!important;
      color:#e7eaed!important;
      font-weight:700!important;
    }
    .h3s-target-stack .h3s-resolution-result span:not(.h3s-target-icon){
      font-size:7.25px!important;
      line-height:1.3!important;
      color:#7f878f!important;
      white-space:normal!important;
      overflow:visible!important;
    }
    .h3s-target-stack .h3s-resolution-status{
      display:flex!important;
      flex-direction:column!important;
      align-items:flex-end!important;
      gap:1px!important;
      max-width:58%!important;
      text-align:right!important;
      min-width:0!important;
    }
    .h3s-target-stack .h3s-resolution-tier{
      padding:0!important;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
      color:#a5adb4!important;
      font-size:7px!important;
      font-weight:700!important;
      white-space:nowrap!important;
    }
    .h3s-target-stack .h3s-resolution-note{
      display:block!important;
      max-width:180px!important;
      color:#747d85!important;
      font-size:7px!important;
      line-height:1.3!important;
      white-space:normal!important;
      overflow:visible!important;
      text-overflow:clip!important;
    }
    .h3s-target-stack .h3s-resolution-modes{
      display:grid!important;
      grid-template-columns:1fr 1fr!important;
      gap:4px!important;
      margin:0!important;
    }
    .h3s-target-stack .h3s-resolution-mode{
      display:flex!important;
      align-items:center!important;
      justify-content:flex-start!important;
      gap:6px!important;
      min-height:29px!important;
      padding:4px 7px!important;
      border-radius:5px!important;
      background:#15181b!important;
      text-align:left!important;
    }
    .h3s-target-stack .h3s-mode-icon{
      display:grid!important;
      place-items:center!important;
      flex:0 0 15px!important;
      width:15px!important;
      height:15px!important;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
      color:#7f8992!important;
    }
    .h3s-target-stack .h3s-mode-icon svg{width:13px!important;height:13px!important}
    .h3s-target-stack .h3s-mode-copy{display:block!important;min-width:0!important}
    .h3s-target-stack .h3s-mode-copy strong{display:block!important;font-size:7.75px!important;line-height:1.15!important;font-weight:700!important}
    .h3s-target-stack .h3s-mode-copy span{display:block!important;margin:1px 0 0!important;color:#707981!important;font-size:6.6px!important;line-height:1.15!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    .h3s-target-stack .h3s-resolution-mode.is-active .h3s-mode-icon{color:#c2cbd3!important}

    @container (max-width:420px){
      .h3s-target-stack .h3s-resolution-preview{display:grid!important;grid-template-columns:1fr!important}
      .h3s-target-stack .h3s-resolution-status{align-items:flex-start!important;max-width:none!important;text-align:left!important}
      .h3s-target-stack .h3s-resolution-note{max-width:none!important}
    }
  `;
  document.head.append(style);
}

function presetKind(text) {
  const value = String(text || "").trim().toLowerCase();
  if (value.includes("draft")) return "draft";
  if (value.includes("recommended")) return "recommended";
  if (value.includes("4k")) return "canvas";
  return "detail";
}

function decoratePresets(panel) {
  for (const button of panel?.querySelectorAll?.(".h3s-resolution-preset") || []) {
    if (button.dataset.h3V16Preset === "1") continue;
    const label = String(button.textContent || "").trim();
    if (!label) continue;
    button.dataset.h3V16Preset = "1";
    const mark = document.createElement("span");
    mark.className = "h3s-preset-icon";
    mark.append(icon(presetKind(label)));
    const text = document.createElement("span");
    text.className = "h3s-preset-label";
    text.textContent = label;
    button.replaceChildren(mark, text);
  }
}

function bindBenchmarkScroll(node) {
  const root = node?.__h3bRoot;
  const body = root?.querySelector?.(".h3b7-body");
  if (!body || body.dataset.h3V16Scroll === "1") return;
  body.dataset.h3V16Scroll = "1";
  body.addEventListener("wheel", (event) => {
    if (body.scrollHeight <= body.clientHeight + 1) return;
    event.stopPropagation();
  }, { passive: true });
}

function decorateDirector(node) {
  const panel = node?.__h3studioPanel;
  if (!panel?.isConnected) return;
  decoratePresets(panel);
}

function decorate(node) {
  if (node?.comfyClass === BENCHMARK) bindBenchmarkScroll(node);
  else if (node?.comfyClass === DIRECTOR) decorateDirector(node);
}

function observe(node) {
  const root = node?.comfyClass === BENCHMARK ? node.__h3bRoot : node?.__h3studioPanel;
  if (!root?.isConnected) {
    setTimeout(() => observe(node), 120);
    return;
  }
  decorate(node);
  if (root.__h3V16Observer) return;
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      decorate(node);
    });
  });
  observer.observe(root, { childList: true, subtree: true });
  root.__h3V16Observer = observer;
}

function sweep() {
  for (const node of app.graph?._nodes || []) {
    if (node?.comfyClass === DIRECTOR || node?.comfyClass === BENCHMARK) observe(node);
  }
}

app.registerExtension({
  name: "H3Studio.UIPolishV16",
  setup() {
    installStyles();
    setTimeout(sweep, 280);
  },
  nodeCreated(node) {
    if (node?.comfyClass === DIRECTOR || node?.comfyClass === BENCHMARK) setTimeout(() => observe(node), 280);
  },
  afterConfigureGraph() {
    installStyles();
    setTimeout(sweep, 340);
  },
});
