import { app } from "../../scripts/app.js";

const DIRECTOR = "H3StudioDirector";
const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-ui-finish-v18-style";

function icon(kind) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const paths = {
    layers: ["m12 3 8 4-8 4-8-4 8-4Z", "m4 12 8 4 8-4", "m4 17 8 4 8-4"],
    plus: ["M12 5v14", "M5 12h14"],
    refresh: ["M20 11a8 8 0 1 0-2.3 5.7", "M20 4v7h-7"],
    file: ["M6 3h8l4 4v14H6z", "M14 3v5h5"],
    sliders: ["M4 7h10", "M18 7h2", "M14 4v6", "M4 17h2", "M10 17h10", "M6 14v6"],
    trash: ["M5 7h14", "M9 7V4h6v3", "m8 4-.7 10H7.7L7 11", "M10 11v6", "M14 11v6"],
    up: ["m7 14 5-5 5 5"],
    down: ["m7 10 5 5 5-5"],
    info: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 10v6", "M12 7h.01"],
  };
  for (const d of paths[kind] || paths.layers) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.65");
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
    /* Target size: stable two-row readout. Nothing changes height while dragging. */
    .h3s-target-stack .h3s-resolution-preview{
      display:grid!important;
      grid-template-columns:minmax(120px,.9fr) minmax(0,1.1fr)!important;
      grid-template-rows:18px 26px!important;
      column-gap:12px!important;
      row-gap:0!important;
      align-items:start!important;
      width:100%!important;
      height:48px!important;
      min-height:48px!important;
      max-height:48px!important;
      padding:2px 0!important;
      margin:0!important;
      overflow:visible!important;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
      box-shadow:none!important;
    }
    .h3s-target-stack .h3s-resolution-result,
    .h3s-target-stack .h3s-resolution-status{display:contents!important}
    .h3s-target-stack .h3s-resolution-result strong{
      grid-column:1!important;grid-row:1!important;
      display:block!important;width:max-content!important;min-width:0!important;max-width:none!important;
      overflow:visible!important;text-overflow:clip!important;white-space:nowrap!important;
      font-size:11px!important;line-height:18px!important;font-weight:750!important;color:#eef1f3!important;
      font-variant-numeric:tabular-nums!important;letter-spacing:-.12px!important;
    }
    .h3s-target-stack .h3s-resolution-result span:not(.h3s-target-icon){
      grid-column:1!important;grid-row:2!important;
      display:block!important;min-width:0!important;max-width:100%!important;
      overflow:visible!important;text-overflow:clip!important;white-space:nowrap!important;
      color:#89929b!important;font-size:7.4px!important;line-height:13px!important;font-variant-numeric:tabular-nums!important;
    }
    .h3s-target-stack .h3s-resolution-tier{
      grid-column:2!important;grid-row:1!important;align-self:start!important;
      display:block!important;width:max-content!important;max-width:100%!important;
      padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;
      color:#aeb5bc!important;font-size:7.6px!important;line-height:18px!important;font-weight:750!important;white-space:nowrap!important;
    }
    .h3s-target-stack .h3s-resolution-note{
      grid-column:2!important;grid-row:2!important;align-self:start!important;
      display:block!important;width:100%!important;max-width:none!important;height:26px!important;
      margin:0!important;overflow:visible!important;white-space:normal!important;text-overflow:clip!important;
      color:#7f8891!important;font-size:7.25px!important;line-height:12px!important;
    }
    .h3s-target-stack .h3s-megapixel-value{min-width:66px!important;font-size:11px!important;font-weight:750!important;font-variant-numeric:tabular-nums!important}
    .h3s-target-stack .h3s-resolution-presets{margin-bottom:3px!important}

    /* Benchmark: exactly one scroll owner. */
    .h3b7{overflow:hidden!important;overscroll-behavior:none!important}
    .h3b7-body{
      flex:1 1 auto!important;min-height:0!important;height:100%!important;max-height:100%!important;
      overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;
      scrollbar-gutter:stable!important;scrollbar-width:thin!important;scrollbar-color:#5b636c transparent!important;
    }
    .h3b7-body::-webkit-scrollbar{width:8px!important}
    .h3b7-body::-webkit-scrollbar-track{background:transparent!important}
    .h3b7-body::-webkit-scrollbar-thumb{background:#555d65!important;border:2px solid transparent!important;background-clip:padding-box!important;border-radius:99px!important}
    .h3b15-plan{scroll-margin-top:0!important}

    /* Custom LoRAs: flat, icon-led inspector instead of a mini card wall. */
    .h3s-custom-loras{border-top:1px solid #272c31!important;padding-top:8px!important}
    .h3s-custom-loras .h3s-section-header{display:flex!important;align-items:center!important;gap:7px!important;margin-bottom:7px!important}
    .h3s-v18-lora-title-icon{display:grid;place-items:center;flex:0 0 16px;width:16px;height:16px;color:#8e9aa5}
    .h3s-v18-lora-title-icon svg{width:15px;height:15px}
    .h3s-custom-loras .h3s-section-title{font-weight:730!important;letter-spacing:.01em!important}
    .h3s-custom-loras .h3s-status-pill{margin-left:auto!important;padding:2px 6px!important;border:1px solid #30363c!important;border-radius:999px!important;background:transparent!important;color:#7f8992!important;font-size:7px!important}
    .h3s-custom-loras .h3s-section-stack{gap:7px!important}
    .h3s-lora-warning{display:flex!important;align-items:flex-start!important;gap:6px!important;margin:0!important;padding:0 0 7px!important;border-bottom:1px solid #252a2f!important;color:#7f8992!important;font-size:7.4px!important;line-height:1.35!important}
    .h3s-v18-info-icon{display:grid;place-items:center;flex:0 0 14px;width:14px;height:14px;margin-top:0;color:#8996a1}
    .h3s-v18-info-icon svg{width:13px;height:13px}
    .h3s-lora-stack{gap:0!important}
    .h3s-lora-row{
      display:grid!important;grid-template-columns:minmax(0,1fr) 26px!important;gap:6px!important;
      padding:8px 0!important;border:0!important;border-bottom:1px solid #262b30!important;border-radius:0!important;
      background:transparent!important;box-shadow:none!important;overflow:visible!important;
    }
    .h3s-lora-main{gap:6px!important}
    .h3s-lora-head{grid-template-columns:20px minmax(0,1fr)!important;gap:6px!important}
    .h3s-lora-enable{width:20px!important;height:29px!important}
    .h3s-lora-picker-trigger{height:30px!important;border-color:#30363c!important;background:#15191d!important;border-radius:6px!important;padding:4px 8px!important}
    .h3s-lora-picker-trigger:hover{border-color:#505a63!important;background:#181d21!important}
    .h3s-lora-picker-copy{gap:7px!important}
    .h3s-v18-file-icon{display:grid;place-items:center;flex:0 0 14px;width:14px;height:14px;color:#818d98}
    .h3s-v18-file-icon svg{width:13px;height:13px}
    .h3s-lora-file{font-size:8.5px!important;font-weight:650!important}
    .h3s-lora-subrow{grid-template-columns:58px minmax(0,1fr) 50px auto!important;gap:6px!important}
    .h3s-v18-strength-label{display:flex;align-items:center;gap:5px;color:#7f8992;font-size:7.2px;font-weight:650;white-space:nowrap}
    .h3s-v18-strength-label svg{width:13px;height:13px;color:#818d98}
    .h3s-lora-number{height:26px!important;border-color:#30363c!important;background:#15191d!important}
    .h3s-lora-order{gap:2px!important}
    .h3s-lora-order .h3s-lora-button,.h3s-lora-remove{display:grid!important;place-items:center!important;width:25px!important;height:25px!important;padding:0!important;border:0!important;background:transparent!important;color:#7e8891!important}
    .h3s-lora-order .h3s-lora-button:hover:not(:disabled){background:#20262b!important;color:#c6cdd3!important}
    .h3s-lora-order svg,.h3s-lora-remove svg{width:13px;height:13px}
    .h3s-lora-remove:hover{background:#2a2022!important;color:#d99298!important}
    .h3s-lora-empty{display:flex!important;align-items:center!important;gap:8px!important;padding:8px 0!important;border:0!important;border-radius:0!important;background:transparent!important;color:#7d8790!important;font-size:7.8px!important}
    .h3s-v18-empty-icon{display:grid;place-items:center;width:18px;height:18px;color:#79858f}.h3s-v18-empty-icon svg{width:16px;height:16px}
    .h3s-lora-toolbar{padding-top:7px!important;border-top:0!important;flex-wrap:nowrap!important}
    .h3s-lora-status{font-size:7.2px!important;color:#737d86!important}
    .h3s-lora-toolbar-actions{gap:4px!important}
    .h3s-lora-button{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;height:27px!important;border-color:#30373d!important;background:#181c20!important;color:#aeb6bd!important;font-size:7.6px!important}
    .h3s-lora-button:hover:not(:disabled){border-color:#4b555e!important;background:#20252a!important;color:#e1e5e8!important}
    .h3s-v18-button-icon{display:grid;place-items:center;width:13px;height:13px}.h3s-v18-button-icon svg{width:12px;height:12px}
    @container (max-width:420px){.h3s-lora-subrow{grid-template-columns:52px minmax(0,1fr) 48px!important}.h3s-lora-order{grid-column:2/-1!important;justify-content:flex-end!important}.h3s-target-stack .h3s-resolution-preview{grid-template-columns:112px minmax(0,1fr)!important}}
  `;
  document.head.append(style);
}

function stableText(element, value) {
  if (!element || element.textContent === value) return;
  if (element.childNodes.length === 1 && element.firstChild?.nodeType === Node.TEXT_NODE) element.firstChild.nodeValue = value;
  else element.textContent = value;
}

function targetTierKey(badge) {
  for (const key of ["conservative", "fast", "recommended", "extended", "experimental", "extreme"]) {
    if (badge?.classList?.contains(`is-${key}`)) return key;
  }
  return "recommended";
}

function polishTarget(node) {
  const panel = node?.__h3studioPanel;
  if (!panel?.isConnected) return;
  const preview = panel.querySelector(".h3s-target-stack .h3s-resolution-preview");
  if (!preview) return;
  preview.querySelectorAll(".h3s-target-icon").forEach((entry) => entry.remove());
  const badge = preview.querySelector(".h3s-resolution-tier");
  const note = preview.querySelector(".h3s-resolution-note");
  const copy = {
    conservative: ["Safe cap", "Keeps output near ~1 MP for lower memory use."],
    fast: ["Draft", "Fast low-resolution composition preview."],
    recommended: ["Recommended", "Best-supported direct working range."],
    extended: ["Extended", "Higher resolution; more time and VRAM."],
    experimental: ["High cost", "Experimental resolution; more pixels may not add detail."],
    extreme: ["Extreme", "Very expensive and experimental; quality is not guaranteed."],
  }[targetTierKey(badge)];
  if (copy) { stableText(badge, copy[0]); stableText(note, copy[1]); }

  const input = panel.querySelector(".h3s-target-stack .h3s-range-native");
  if (input && input.dataset.h3V18Target !== "1") {
    input.dataset.h3V18Target = "1";
    const sync = () => requestAnimationFrame(() => polishTarget(node));
    input.addEventListener("input", sync, { passive: true });
    input.addEventListener("change", sync);
  }
}

function preserveBenchmarkScroll(node) {
  const root = node?.__h3bRoot;
  const body = root?.querySelector?.(".h3b7-body");
  const input = root?.querySelector?.(".h3b15-range input[type='range']");
  if (!body || !input || input.dataset.h3V18Scroll === "1") return;
  input.dataset.h3V18Scroll = "1";
  let held = false;
  let top = 0;
  const restore = () => {
    if (!body.isConnected) return;
    body.scrollTop = top;
    requestAnimationFrame(() => { if (body.isConnected) body.scrollTop = top; });
  };
  input.addEventListener("pointerdown", () => { held = true; top = body.scrollTop; });
  input.addEventListener("input", () => {
    if (!held) top = body.scrollTop;
    restore();
  }, { capture: true, passive: true });
  const release = () => { restore(); requestAnimationFrame(() => { held = false; }); };
  input.addEventListener("pointerup", release);
  input.addEventListener("pointercancel", release);
  input.addEventListener("change", release);
  body.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
}

function markButton(button, kind, text = null) {
  if (!button || button.dataset.h3V18Icon === kind) return;
  button.dataset.h3V18Icon = kind;
  const label = text ?? String(button.textContent || "").trim();
  button.replaceChildren();
  const mark = document.createElement("span"); mark.className = "h3s-v18-button-icon"; mark.append(icon(kind));
  button.append(mark);
  if (label) button.append(document.createTextNode(label));
}

function polishLoras(node) {
  const section = node?.__h3studioPanel?.querySelector?.(".h3s-custom-loras");
  if (!section?.isConnected) return;
  const title = section.querySelector(".h3s-section-title");
  if (title && !title.previousElementSibling?.classList?.contains("h3s-v18-lora-title-icon")) {
    const mark = document.createElement("span"); mark.className = "h3s-v18-lora-title-icon"; mark.append(icon("layers")); title.before(mark);
  }
  const warning = section.querySelector(".h3s-lora-warning");
  if (warning && !warning.querySelector(".h3s-v18-info-icon")) {
    const mark = document.createElement("span"); mark.className = "h3s-v18-info-icon"; mark.append(icon("info")); warning.prepend(mark);
  }
  const empty = section.querySelector(".h3s-lora-empty");
  if (empty && !empty.querySelector(".h3s-v18-empty-icon")) {
    const mark = document.createElement("span"); mark.className = "h3s-v18-empty-icon"; mark.append(icon("layers")); empty.prepend(mark);
  }
  for (const trigger of section.querySelectorAll(".h3s-lora-picker-trigger")) {
    const copy = trigger.querySelector(".h3s-lora-picker-copy");
    if (copy && !copy.querySelector(".h3s-v18-file-icon")) {
      const mark = document.createElement("span"); mark.className = "h3s-v18-file-icon"; mark.append(icon("file")); copy.prepend(mark);
    }
  }
  for (const subrow of section.querySelectorAll(".h3s-lora-subrow")) {
    if (!subrow.querySelector(".h3s-v18-strength-label")) {
      const label = document.createElement("span"); label.className = "h3s-v18-strength-label"; label.append(icon("sliders"), document.createTextNode("Strength")); subrow.prepend(label);
    }
  }
  for (const order of section.querySelectorAll(".h3s-lora-order")) {
    const buttons = order.querySelectorAll("button");
    markButton(buttons[0], "up", "");
    markButton(buttons[1], "down", "");
  }
  for (const remove of section.querySelectorAll(".h3s-lora-remove")) markButton(remove, "trash", "");
  const actions = section.querySelectorAll(".h3s-lora-toolbar-actions .h3s-lora-button");
  if (actions[0]) markButton(actions[0], "refresh", "");
  if (actions[1]) markButton(actions[1], "plus", "Add LoRA");
}

function decorate(node) {
  if (node?.comfyClass === DIRECTOR) { polishTarget(node); polishLoras(node); }
  if (node?.comfyClass === BENCHMARK) preserveBenchmarkScroll(node);
}

function observe(node) {
  const root = node?.comfyClass === BENCHMARK ? node.__h3bRoot : node?.__h3studioPanel;
  if (!root?.isConnected) { setTimeout(() => observe(node), 100); return; }
  decorate(node);
  if (root.__h3V18Observer) return;
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; decorate(node); });
  });
  observer.observe(root, { childList: true, subtree: true });
  root.__h3V18Observer = observer;
}

function sweep() {
  for (const node of app.graph?._nodes || []) {
    if (node?.comfyClass === DIRECTOR || node?.comfyClass === BENCHMARK) observe(node);
  }
}

app.registerExtension({
  name: "H3Studio.UIFinishV18",
  setup() { installStyles(); setTimeout(sweep, 220); },
  nodeCreated(node) {
    if (node?.comfyClass === DIRECTOR || node?.comfyClass === BENCHMARK) setTimeout(() => observe(node), 220);
  },
  afterConfigureGraph() { installStyles(); setTimeout(sweep, 280); },
});
