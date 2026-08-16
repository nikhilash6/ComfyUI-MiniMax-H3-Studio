import { app } from "../../scripts/app.js";
import { stateFromNode } from "./js/studio_extension.js";
import { capNativeForTarget, formatMegapixels, planResolution, resolutionTier } from "./js/core/state.js";

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
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.append(style);
  }
  style.textContent = `
    /* Benchmark: one flat work surface. */
    .h3b7{display:flex!important;flex-direction:column!important;width:100%!important;height:100%!important;min-height:0!important;max-height:100%!important;overflow:hidden!important}
    .h3b7-top{position:relative!important;top:auto!important;flex:0 0 auto!important}
    .h3b7-body{flex:1 1 auto!important;min-height:0!important;max-height:none!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scrollbar-gutter:stable!important;scrollbar-width:thin!important;scrollbar-color:#59616a #292d32!important;padding-bottom:28px!important}
    .h3b7-body::-webkit-scrollbar{width:9px!important}.h3b7-body::-webkit-scrollbar-track{background:#292d32!important}.h3b7-body::-webkit-scrollbar-thumb{background:#59616a!important;border:2px solid #292d32!important;border-radius:999px!important}
    .h3b7-summary{padding:5px 0 7px!important;margin:0 0 8px!important;border-radius:0!important;border-bottom:1px solid #41464d!important;background:transparent!important}
    .h3b15-plan{gap:8px!important;margin:0 0 10px!important;padding:2px 0 10px!important;border:0!important;border-bottom:1px solid #41464d!important;border-radius:0!important;background:transparent!important}
    .h3b15-sweep{padding:0!important;border-radius:0!important;background:transparent!important}
    .h3b15-seeds{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:4px!important;padding:0!important;background:transparent!important}
    .h3b15-seeds button{min-height:27px!important;border:1px solid #454b52!important;border-radius:5px!important;background:transparent!important}.h3b15-seeds button.active{border-color:#687887!important;background:#46515d!important}
    .h3b15-grid{gap:7px!important}.h3b15-field input{background:#343940!important}
    .h3b15-checks{display:flex!important;flex-wrap:wrap!important;gap:5px 14px!important;padding-top:1px!important}
    .h3b15-check{flex:0 1 auto!important;min-height:22px!important;padding:1px 0!important;border:0!important;border-radius:0!important;background:transparent!important;color:#aeb5bc!important}
    .h3b15-note{margin-top:1px!important}
    .h3b16-help{display:flex;flex-direction:column;gap:3px;padding-top:7px;border-top:1px solid #3d434a;color:#808992;font-size:7.5px;line-height:1.4}
    .h3b16-help b{color:#aeb6bd;font-weight:700}.h3b16-help span{display:block;white-space:normal}
    .h3b7-scenario{border:0!important;border-top:1px solid #41464d!important;border-radius:0!important;background:transparent!important}.h3b7-scenario[open]{border-color:#4b525a!important}.h3b7-fields{border-top:1px solid #3f454c!important;background:transparent!important}

    /* Target size: full-width property row, compact readout, zero card chrome. */
    .h3s-v6-inspector .h3s-field.is-h3-target,.h3s-field.is-h3-target{display:flex!important;flex-direction:column!important;align-items:stretch!important;grid-template-columns:none!important;gap:5px!important;width:100%!important}
    .h3s-field.is-h3-target>.h3s-field-label{align-self:flex-start!important;margin:0!important}
    .h3s-target-stack{display:flex!important;flex-direction:column!important;gap:6px!important;width:100%!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
    .h3s-target-stack .h3s-megapixel-control{width:100%!important;padding:0!important;border:0!important;background:transparent!important}
    .h3s-target-stack .h3s-resolution-presets,.h3s-field.is-h3-target .h3s-resolution-presets{display:flex!important;flex-wrap:wrap!important;gap:4px!important;margin:0!important}
    .h3s-resolution-preset{display:inline-flex!important;flex:1 1 72px!important;align-items:center!important;justify-content:center!important;gap:4px!important;min-width:0!important;min-height:27px!important;padding:4px 6px!important;border-radius:5px!important;white-space:nowrap!important;overflow:visible!important}
    .h3s-preset-icon{display:grid;place-items:center;flex:0 0 11px;width:11px;height:11px;color:#7f8992}.h3s-preset-icon svg{display:block;width:11px;height:11px}.h3s-resolution-preset.is-active .h3s-preset-icon{color:#c5cdd4}.h3s-preset-label{min-width:0;overflow:visible!important;text-overflow:clip!important;white-space:nowrap!important;font-size:7.4px;font-weight:650}
    .h3s-target-stack .h3s-resolution-preview{display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:2px!important;width:100%!important;min-height:0!important;margin:0!important;padding:2px 0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
    .h3s-target-stack .h3s-target-icon{display:none!important}
    .h3s-target-stack .h3s-resolution-result{display:flex!important;align-items:baseline!important;gap:6px!important;min-width:0!important;width:100%!important}
    .h3s-target-stack .h3s-resolution-result strong{flex:0 0 auto!important;font-size:10px!important;line-height:1.25!important;color:#eef1f3!important;font-weight:700!important;white-space:nowrap!important}
    .h3s-target-stack .h3s-resolution-result span:not(.h3s-target-icon){min-width:0!important;color:#828b93!important;font-size:7.3px!important;line-height:1.25!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important}
    .h3s-target-stack .h3s-resolution-status{display:flex!important;flex-direction:row!important;align-items:baseline!important;gap:6px!important;width:100%!important;max-width:none!important;text-align:left!important;min-width:0!important}
    .h3s-target-stack .h3s-resolution-tier{flex:0 0 auto!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:#aab2b9!important;font-size:7.2px!important;font-weight:700!important;white-space:nowrap!important}
    .h3s-target-stack .h3s-resolution-note{display:block!important;flex:1 1 auto!important;max-width:none!important;color:#747d85!important;font-size:7.2px!important;line-height:1.3!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important}
    .h3s-target-stack .h3s-resolution-modes{display:grid!important;grid-template-columns:1fr 1fr!important;gap:4px!important;margin:1px 0 0!important}
    .h3s-target-stack .h3s-resolution-mode{display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:5px!important;min-height:28px!important;padding:4px 6px!important;border-radius:5px!important;background:#15181b!important;text-align:left!important}
    .h3s-target-stack .h3s-mode-icon{display:grid!important;place-items:center!important;flex:0 0 14px!important;width:14px!important;height:14px!important;border:0!important;border-radius:0!important;background:transparent!important;color:#7f8992!important}.h3s-target-stack .h3s-mode-icon svg{width:12px!important;height:12px!important}
    .h3s-target-stack .h3s-mode-copy{display:block!important;min-width:0!important}.h3s-target-stack .h3s-mode-copy strong{display:block!important;font-size:7.7px!important;line-height:1.15!important;font-weight:700!important}.h3s-target-stack .h3s-mode-copy span{display:block!important;margin:1px 0 0!important;color:#727b83!important;font-size:6.7px!important;line-height:1.2!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important}
    .h3s-target-stack .h3s-resolution-mode.is-active .h3s-mode-icon{color:#c2cbd3!important}
    @container (max-width:420px){.h3b15-grid{grid-template-columns:1fr 1fr!important}.h3b15-seeds{grid-template-columns:1fr!important}.h3s-target-stack .h3s-resolution-status{flex-direction:column!important;gap:1px!important}.h3s-target-stack .h3s-resolution-modes{grid-template-columns:1fr!important}}
  `;
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

function findTargetField(panel) {
  return [...(panel?.querySelectorAll?.(".h3s-field") || [])].find((field) =>
    String(field.querySelector(":scope > .h3s-field-label")?.textContent || "").trim().toLowerCase() === "target size"
  ) || null;
}

function ensureTargetLayout(node) {
  const panel = node?.__h3studioPanel;
  if (!panel?.isConnected) return;
  const field = findTargetField(panel);
  if (!field) return;
  field.classList.add("is-h3-target");
  const section = field.closest(".h3s-section") || panel;
  const control = field.querySelector(".h3s-megapixel-control") || section.querySelector(".h3s-megapixel-control");
  const preview = field.querySelector(".h3s-resolution-preview") || section.querySelector(".h3s-resolution-preview");
  const modes = field.querySelector(".h3s-resolution-modes") || section.querySelector(".h3s-resolution-modes");
  let stack = field.querySelector(":scope > .h3s-target-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "h3s-target-stack";
    field.append(stack);
  }
  for (const item of [control, preview, modes]) if (item && item.parentElement !== stack) stack.append(item);

  /* Inline important beats older late-loaded style layers. */
  for (const [key, value] of [["display","flex"],["flex-direction","column"],["align-items","stretch"],["width","100%"]]) field.style.setProperty(key, value, "important");
  for (const [key, value] of [["padding","0"],["border","0"],["background","transparent"],["box-shadow","none"],["width","100%"]]) stack.style.setProperty(key, value, "important");
  if (preview) for (const [key, value] of [["padding","2px 0"],["border","0"],["border-radius","0"],["background","transparent"],["box-shadow","none"],["width","100%"]]) preview.style.setProperty(key, value, "important");
}

function liveMegapixel(node, input) {
  const panel = node?.__h3studioPanel;
  const control = input?.closest?.(".h3s-megapixel-control");
  const range = input?.closest?.(".h3s-range");
  if (!panel || !control) return;
  const min = Number(input.min) || 0.2;
  const max = Number(input.max) || 8.5;
  const value = Math.max(min, Math.min(max, Number(input.value) || min));
  const progress = ((value - min) / Math.max(0.0001, max - min)) * 100;
  if (range) range.style.setProperty("--h3s-range-progress", `${progress}%`);
  const output = control.querySelector(".h3s-megapixel-value");
  if (output) output.textContent = formatMegapixels(value);

  const state = stateFromNode(node);
  const cap = capNativeForTarget(value, state.generation.cap_native_resolution);
  const plan = planResolution(state.generation.aspect_ratio, value, state.generation.custom_width, state.generation.custom_height, cap);
  const tier = resolutionTier(value, cap);
  const result = panel.querySelector(".h3s-resolution-result");
  const strong = result?.querySelector("strong");
  const detail = result?.querySelector("span:not(.h3s-target-icon)");
  const badge = panel.querySelector(".h3s-resolution-tier");
  const note = panel.querySelector(".h3s-resolution-note");
  if (strong) strong.textContent = `${plan.width} × ${plan.height}`;
  if (detail) detail.textContent = `${plan.actualMegapixels.toFixed(2)} MP actual · ${plan.capped ? "safe cap" : "direct"}`;
  if (badge) { badge.className = `h3s-resolution-tier is-${tier.key}`; badge.textContent = tier.label; }
  if (note) note.textContent = tier.note;
}

function bindLiveMegapixel(node) {
  const input = node?.__h3studioPanel?.querySelector?.(".h3s-megapixel-control .h3s-range-native");
  if (!input) return;
  if (input.dataset.h3V16Live !== "1") {
    input.dataset.h3V16Live = "1";
    input.addEventListener("input", () => liveMegapixel(node, input), { passive: true });
    input.addEventListener("change", () => liveMegapixel(node, input));
  }
  liveMegapixel(node, input);
}

const HELP = {
  "repeats": ["Repeats", "Runs every scenario this many times. Use 1 for quick A/B; raise it when you want consistency data."],
  "seed step": ["Seed increment", "Amount added between paired seeds when a seed-changing strategy is selected."],
  "gen guard": ["Max generations", "Safety limit that prevents an accidental scenario × resolution × repeat explosion."],
  "cell px": ["Grid tile size", "Only changes the size of images in the final comparison grid; it does not change generation resolution."],
};

function explainBenchmark(node) {
  const root = node?.__h3bRoot;
  const plan = root?.querySelector?.(".h3b15-plan");
  if (!plan) return;
  for (const field of plan.querySelectorAll(".h3b15-field")) {
    const label = field.querySelector("span");
    const key = String(label?.textContent || "").trim().toLowerCase();
    const item = HELP[key];
    if (!item) continue;
    label.textContent = item[0];
    field.title = item[1];
  }
  const titles = {
    "Reference context": "Include the Director reference-role/context information in the benchmark report.",
    "Original prompt": "Include the original Director prompt in the benchmark report.",
    "Live cell previews": "Show each benchmark cell as soon as that generation finishes.",
    "Also isolate VAE": "Add a same-latent VAE decode A/B so decoder differences can be isolated from sampling.",
    "Allow over guard": "Permit the run even when the planned generation count exceeds Max generations.",
  };
  for (const check of plan.querySelectorAll(".h3b15-check")) {
    const text = String(check.textContent || "").trim();
    if (titles[text]) check.title = titles[text];
  }
  for (const button of plan.querySelectorAll(".h3b15-seeds button")) {
    const text = String(button.textContent || "").trim();
    if (text === "Same seed") button.title = "Best for a fair A/B: every scenario sees the exact same seed.";
    if (text === "New seed / row") button.title = "Each repeat/row gets a new seed, but scenarios within that row stay paired.";
    if (text === "New seed / image") button.title = "Every generated image gets a different seed. Useful for diversity, less fair for direct A/B.";
  }
  if (!plan.querySelector(".h3b16-help")) {
    const help = document.createElement("div");
    help.className = "h3b16-help";
    help.innerHTML = `<span><b>Seeds:</b> Same seed = fairest A/B · New / row = paired repeats · New / image = diversity sweep.</span><span><b>Run size:</b> Repeats multiplies each setup · Seed increment changes paired seeds · Max generations is the safety stop · Grid tile size affects only the report layout.</span><span><b>Report:</b> Reference context and Original prompt add context to the report · Live previews show cells during the run · Isolate VAE adds a same-latent decoder check.</span>`;
    plan.append(help);
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
  return;
  const panel = node?.__h3studioPanel;
  if (!panel?.isConnected) return;
  ensureTargetLayout(node);
  decoratePresets(panel);
  bindLiveMegapixel(node);
}

function decorateBenchmark(node) {
  bindBenchmarkScroll(node);
  explainBenchmark(node);
}

function decorate(node) {
  if (node?.comfyClass === BENCHMARK) decorateBenchmark(node);
  else if (node?.comfyClass === DIRECTOR) decorateDirector(node);
}

function observe(node) {
  return;
  const root = node?.comfyClass === BENCHMARK ? node.__h3bRoot : node?.__h3studioPanel;
  if (!root?.isConnected) { setTimeout(() => observe(node), 100); return; }
  decorate(node);
  if (root.__h3V16Observer) return;
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; decorate(node); });
  });
  observer.observe(root, { childList: true, subtree: true });
  root.__h3V16Observer = observer;
}

function sweep() {
  return;
  for (const node of app.graph?._nodes || []) if (node?.comfyClass === DIRECTOR || node?.comfyClass === BENCHMARK) observe(node);
}

app.registerExtension({
  name: "H3Studio.UIPolishV16",
  setup() { installStyles(); setTimeout(sweep, 220); },
  nodeCreated(node) { if (node?.comfyClass === DIRECTOR || node?.comfyClass === BENCHMARK) setTimeout(() => observe(node), 220); },
  afterConfigureGraph() { installStyles(); setTimeout(sweep, 280); },
});
