import { app } from "../../scripts/app.js";
import { stateFromNode } from "./js/studio_extension.js";
import { capNativeForTarget, planResolution, resolutionTier } from "./js/core/state.js";

const DIRECTOR = "H3StudioDirector";
const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-ui-v20-style";

function svg(kind) {
  const ns = "http://www.w3.org/2000/svg";
  const root = document.createElementNS(ns, "svg");
  root.setAttribute("viewBox", "0 0 24 24");
  root.setAttribute("aria-hidden", "true");
  const paths = {
    compare: ["M7 7h11", "m15 4 3 3-3 3", "M17 17H6", "m9 14-3 3 3 3"],
    resolution: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],
    model: ["M12 3 5 6v6l7 4 7-4V6l-7-3Z", "m5 6 7 4 7-4", "M12 10v8"],
    sampling: ["M5 18 9 9", "M15 5l4 4", "M13 7l4 4", "M4 20l5-1 10-10-4-4L5 15l-1 5Z"],
    runtime: ["M12 3v3", "M12 18v3", "M3 12h3", "M18 12h3", "m5.6-6.4 2.1 2.1", "m8.6 8.6 2.1 2.1", "m0-13.2-2.1 2.1", "m-8.6 8.6-2.1 2.1", "M12 12l4-2"],
    size: ["M4 9V4h5", "M15 4h5v5", "M20 15v5h-5", "M9 20H4v-5"],
    info: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 10v6", "M12 7h.01"],
    chevron: ["m9 6 6 6-6 6"],
    plus: ["M12 5v14", "M5 12h14"],
    close: ["M7 7l10 10", "M17 7 7 17"],
  };
  for (const d of paths[kind] || paths.info) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.65");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    root.append(path);
  }
  return root;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Follow ComfyUI's own neutral widget palette instead of inventing another card theme. */
    .h3b7{
      --h3v20-bg:var(--comfy-menu-bg,#18181b);
      --h3v20-surface:var(--comfy-input-bg,#242427);
      --h3v20-border:var(--border-color,#34343a);
      --h3v20-text:var(--input-text,#e5e7eb);
      --h3v20-muted:var(--descrip-text,#92929a);
      background:var(--h3v20-bg)!important;border-color:var(--h3v20-border)!important;border-radius:8px!important;
      color:var(--h3v20-text)!important;
    }
    .h3b7-top{padding:10px 12px!important;background:color-mix(in srgb,var(--h3v20-bg) 93%,white 3%)!important;border-bottom:1px solid var(--h3v20-border)!important}
    .h3b7-title-row{gap:7px!important}.h3b7-icon{width:18px!important;height:18px!important;border:0!important;border-radius:0!important;background:transparent!important;color:#9aa6b2!important;font-size:0!important}.h3b7-icon svg{width:17px;height:17px}
    .h3b7-title{font-size:11px!important;font-weight:760!important;letter-spacing:-.01em}.h3b7-sub{font-size:7.8px!important;color:var(--h3v20-muted)!important}
    .h3b7-assets{border-color:var(--h3v20-border)!important;background:transparent!important;color:#9ca5ad!important;border-radius:6px!important}

    .h3b7-body{padding:9px 12px 14px!important}.h3b7-toolbar{padding-bottom:8px!important;margin-bottom:0!important;border-bottom:1px solid var(--h3v20-border)!important}
    .h3b15-quick{gap:3px!important}.h3b15-quick button,.h3b7-btn{height:28px!important;border:1px solid var(--h3v20-border)!important;border-radius:6px!important;background:transparent!important;color:#aeb6bd!important;box-shadow:none!important}
    .h3b15-quick button:hover,.h3b7-btn:hover{background:color-mix(in srgb,var(--h3v20-surface) 82%,white 5%)!important;color:#f2f3f4!important}.h3b15-quick button.primary,.h3b7-btn.primary{background:#323b45!important;border-color:#485563!important;color:#edf1f4!important}
    .h3b7-summary{margin:0!important;padding:7px 1px!important;border-radius:0!important;background:transparent!important;border-bottom:1px solid var(--h3v20-border)!important;color:var(--h3v20-muted)!important}

    .h3b15-plan{padding:9px 0 10px!important;margin:0!important;border:0!important;border-bottom:1px solid var(--h3v20-border)!important;background:transparent!important}
    .h3b15-head{padding:0!important;margin-bottom:7px!important}.h3b15-head strong{font-size:9.5px!important}.h3b15-head small{font-size:7.3px!important;color:var(--h3v20-muted)!important}.h3b15-count{border:1px solid var(--h3v20-border)!important;background:transparent!important;color:#9ca5ad!important}
    .h3b15-sweep{display:none!important}

    .h3b20-resolutions{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 12px;align-items:center;padding:8px 0 9px;border-bottom:1px solid color-mix(in srgb,var(--h3v20-border) 78%,transparent)}
    .h3b20-res-title{display:flex;align-items:center;gap:6px;color:#d9dde1;font-size:8.3px;font-weight:720}.h3b20-res-title svg{width:14px;height:14px;color:#8996a1}
    .h3b20-res-copy{margin-top:2px;color:var(--h3v20-muted);font-size:7px;line-height:1.35}.h3b20-res-state{justify-self:end;padding:2px 6px;border:1px solid var(--h3v20-border);border-radius:999px;color:#87919a;font-size:6.8px;white-space:nowrap}.h3b20-res-state.on{color:#c3ccd4;border-color:#4b5762;background:#29323a}
    .h3b20-res-controls{grid-column:1/-1;display:flex;align-items:center;gap:5px;flex-wrap:wrap}.h3b20-res-chip{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 6px;border:1px solid var(--h3v20-border);border-radius:5px;background:var(--h3v20-surface);color:#c8ced3;font-size:7.3px;font-variant-numeric:tabular-nums}.h3b20-res-chip button{display:grid;place-items:center;width:13px;height:13px;padding:0;border:0;background:transparent;color:#7d8790;cursor:pointer}.h3b20-res-chip button:hover{color:#d89da2}.h3b20-res-chip svg{width:10px;height:10px}
    .h3b20-add-wrap{position:relative;min-width:150px}.h3b20-add{appearance:none;width:100%;height:25px;padding:3px 24px 3px 8px;border:1px solid var(--h3v20-border);border-radius:5px;background:var(--h3v20-surface);color:#aeb6bd;font-size:7.4px;outline:none;cursor:pointer}.h3b20-add-wrap:after{content:'';pointer-events:none;position:absolute;right:9px;top:8px;width:6px;height:6px;border-right:1px solid #808a93;border-bottom:1px solid #808a93;transform:rotate(45deg)}.h3b20-clear{height:25px;padding:3px 7px;border:0;background:transparent;color:#7f8992;font-size:7px;cursor:pointer}.h3b20-clear:hover{color:#d3d7db}

    .h3b15-seeds{margin-top:9px!important;padding:2px!important;border:1px solid var(--h3v20-border)!important;border-radius:7px!important;background:color-mix(in srgb,var(--h3v20-surface) 68%,transparent)!important}.h3b15-seeds button{border-radius:5px!important}.h3b15-seeds button.active{background:#35414d!important}
    .h3b17-seed-title{font-size:7.7px!important}.h3b17-seed-sub{font-size:6.4px!important;color:#7e8790!important}
    .h3b15-grid{margin-top:9px!important}.h3b17-field-note{font-size:6.6px!important;color:#757e86!important}.h3b17-select{background:var(--h3v20-surface)!important;border-color:var(--h3v20-border)!important;border-radius:6px!important}
    .h3b15-checks{border-top:1px solid var(--h3v20-border)!important}.h3b15-note{display:none!important}

    .h3b7-list{gap:0!important;margin-top:10px!important;border-top:1px solid var(--h3v20-border)!important}
    .h3b7-scenario{border:0!important;border-bottom:1px solid var(--h3v20-border)!important;border-radius:0!important;background:transparent!important;overflow:visible!important}.h3b7-scenario[open]{border-color:var(--h3v20-border)!important}
    .h3b7-scenario>summary{grid-template-columns:24px minmax(150px,1fr) auto auto auto 18px 24px!important;min-height:44px!important;padding:6px 4px!important;border-radius:5px!important;transition:background .12s ease}.h3b7-scenario>summary:hover{background:color-mix(in srgb,var(--h3v20-surface) 55%,transparent)!important}
    .h3b7-index{width:20px!important;height:20px!important;border:1px solid var(--h3v20-border)!important;border-radius:50%!important;background:transparent!important;color:#9da7af!important;font-size:7.5px!important}.h3b7-name{font-size:9px!important;background:transparent!important}.h3b7-tag{border:1px solid color-mix(in srgb,var(--h3v20-border) 82%,transparent)!important;background:transparent!important;color:#89939c!important;border-radius:5px!important;font-size:6.8px!important}.h3b7-x{color:#7d858d!important}.h3b7-x:hover{background:#2d2225!important;color:#d89da3!important}
    .h3b20-caret{display:grid;place-items:center;width:18px;height:18px;color:#727c85;transition:transform .12s ease}.h3b20-caret svg{width:12px;height:12px}.h3b7-scenario[open] .h3b20-caret{transform:rotate(90deg)}
    .h3b7-fields{grid-template-columns:minmax(180px,1.35fr) minmax(130px,1fr) minmax(120px,1fr) 92px!important;gap:8px!important;padding:9px 28px 11px!important;border-top:1px solid color-mix(in srgb,var(--h3v20-border) 76%,transparent)!important;background:color-mix(in srgb,var(--h3v20-surface) 38%,transparent)!important}.h3b7-field{gap:4px!important}.h3b7-label{display:flex!important;align-items:center!important;gap:5px!important;color:#858f98!important;font-size:6.8px!important;text-transform:none!important;letter-spacing:0!important}.h3b20-field-icon{display:grid;place-items:center;width:13px;height:13px;color:#7f8b96}.h3b20-field-icon svg{width:12px;height:12px}.h3b7-input,.h3b7-select{height:30px!important;border-color:var(--h3v20-border)!important;border-radius:6px!important;background:var(--h3v20-surface)!important;color:var(--h3v20-text)!important}
    .h3b7-loras{padding-top:2px!important}.h3b7-loras>summary{color:#8d979f!important}.h3b7-lora{background:color-mix(in srgb,var(--h3v20-surface) 72%,transparent)!important}

    /* Director target summary: one stable compact status strip, no long reflowing paragraph. */
    .h3s-target-stack .h3s-resolution-preview.h3s-v20-resolution-summary{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;grid-template-rows:20px 15px!important;column-gap:10px!important;row-gap:0!important;align-items:center!important;width:100%!important;height:39px!important;min-height:39px!important;max-height:39px!important;margin:1px 0 0!important;padding:3px 1px!important;border:0!important;border-top:1px solid #252b30!important;border-radius:0!important;background:transparent!important;overflow:hidden!important;box-shadow:none!important}
    .h3s-v20-dimensions{grid-column:1;grid-row:1;color:#eef1f3;font-size:10px;font-weight:760;font-variant-numeric:tabular-nums;white-space:nowrap}.h3s-v20-mp{grid-column:1;grid-row:2;color:#7f8992;font-size:7px;font-variant-numeric:tabular-nums;white-space:nowrap}.h3s-v20-tier{grid-column:2;grid-row:1;justify-self:end;padding:2px 6px;border:1px solid #30373d;border-radius:999px;background:transparent;color:#a9b1b8;font-size:6.8px;font-weight:720;white-space:nowrap}.h3s-v20-cost{grid-column:2;grid-row:2;justify-self:end;color:#727c84;font-size:6.7px;white-space:nowrap}
    .h3s-v20-tier.is-extreme,.h3s-v20-tier.is-experimental{border-color:#51423d;color:#c7a194;background:#211c1a}.h3s-v20-tier.is-recommended{border-color:#34463f;color:#9eb7ac;background:#18201d}

    @container (max-width:680px){.h3b7-scenario>summary{grid-template-columns:22px minmax(120px,1fr) auto 18px 24px!important}.h3b7-scenario>summary .h3b7-tag:nth-of-type(n+2){display:none!important}.h3b7-fields{grid-template-columns:1fr 1fr!important;padding-left:12px!important;padding-right:12px!important}}
  `;
  document.head.append(style);
}

function widget(node, name) {
  return (node?.widgets || []).find((item) => item?.name === name) || null;
}

function graphLink(id) {
  const links = app.graph?.links;
  if (!links || id == null) return null;
  return typeof links.get === "function" ? links.get(id) : links[id];
}

function sourceNode(node, inputName) {
  const input = node?.inputs?.find((entry) => entry?.name === inputName);
  const link = graphLink(input?.link);
  if (!link) return null;
  return app.graph?.getNodeById?.(Number(link.origin_id ?? link.originId ?? link.source_id)) || null;
}

function readScenarios(node) {
  try {
    const value = JSON.parse(String(widget(node, "scenarios_json")?.value || "[]"));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function readPoints(node) {
  const values = [];
  for (const token of String(widget(node, "matrix_megapixels")?.value || "").replaceAll("\r", "\n").replaceAll(",", "\n").split("\n")) {
    const value = Number(token.toLowerCase().replace("mp", "").trim());
    if (!Number.isFinite(value)) continue;
    const bounded = Math.max(.2, Math.min(8.5, Number(value.toFixed(2))));
    if (!values.includes(bounded)) values.push(bounded);
  }
  return values;
}

function writePoints(node, values) {
  const target = widget(node, "matrix_megapixels");
  if (!target) return;
  const next = [...new Set(values.map((value) => Math.max(.2, Math.min(8.5, Number(Number(value).toFixed(2))))))];
  target.value = next.map((value) => value.toFixed(2)).join(", ");
  target.callback?.(target.value, app.canvas, node, [0, 0], {});
  node.__h3b15Sig = null;
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
  requestAnimationFrame(() => decorateBenchmark(node));
}

function currentDirectorMp(node) {
  const director = sourceNode(node, "studio_context");
  const value = Number(stateFromNode(director)?.generation?.megapixels);
  return Number.isFinite(value) ? Math.max(.2, Math.min(8.5, value)) : 1;
}

function updateGenerationCount(node) {
  const scenarios = Math.max(1, readScenarios(node).length);
  const points = Math.max(1, readPoints(node).length);
  const repeats = Math.max(1, Number(widget(node, "repeats")?.value) || 1);
  const vae = widget(node, "compare_vae")?.value ? 1 : 0;
  const count = scenarios * points * repeats + vae;
  const guard = Math.max(1, Number(widget(node, "max_generations")?.value) || 24);
  const allow = Boolean(widget(node, "allow_large_matrix")?.value);
  const badge = node?.__h3bRoot?.querySelector?.(".h3b15-count");
  if (badge) {
    badge.textContent = `${count} gen`;
    badge.classList.toggle("warn", count > guard && !allow);
  }
}

function buildResolutionControl(node) {
  const root = document.createElement("div");
  root.className = "h3b20-resolutions";
  const points = readPoints(node);

  const copy = document.createElement("div");
  const title = document.createElement("div");
  title.className = "h3b20-res-title";
  title.append(svg("resolution"), document.createTextNode("Resolution sweep"));
  const sub = document.createElement("div");
  sub.className = "h3b20-res-copy";
  sub.textContent = points.length
    ? "Every scenario runs once at every selected resolution. Remove all points to use each scenario's own MP."
    : "Optional. Off right now — every scenario uses its own MP setting.";
  copy.append(title, sub);

  const state = document.createElement("span");
  state.className = `h3b20-res-state${points.length ? " on" : ""}`;
  state.textContent = points.length ? `${points.length} point${points.length === 1 ? "" : "s"} · ON` : "OFF";
  root.append(copy, state);

  const controls = document.createElement("div");
  controls.className = "h3b20-res-controls";
  for (const value of points) {
    const chip = document.createElement("span");
    chip.className = "h3b20-res-chip";
    chip.append(document.createTextNode(`${value.toFixed(2)} MP`));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.title = `Remove ${value.toFixed(2)} MP`;
    remove.append(svg("close"));
    remove.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      writePoints(node, points.filter((entry) => Math.abs(entry - value) > .001));
    });
    chip.append(remove);
    controls.append(chip);
  }

  const wrap = document.createElement("div");
  wrap.className = "h3b20-add-wrap";
  const select = document.createElement("select");
  select.className = "h3b20-add";
  const directorMp = currentDirectorMp(node);
  const choices = [
    ["", "+ Add resolution…"],
    [`director:${directorMp}`, `Director current · ${directorMp.toFixed(2)} MP`],
    ["0.2", "0.20 MP · Draft"], ["0.5", "0.50 MP"], ["1", "1.00 MP · Recommended"],
    ["2", "2.00 MP"], ["4", "4.00 MP"], ["8.5", "8.50 MP · Extreme"],
  ];
  for (const [value, label] of choices) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  select.addEventListener("change", () => {
    if (!select.value) return;
    const value = select.value.startsWith("director:") ? Number(select.value.split(":")[1]) : Number(select.value);
    if (Number.isFinite(value) && !points.some((entry) => Math.abs(entry - value) < .001)) writePoints(node, [...points, value]);
    select.value = "";
  });
  wrap.append(select);
  controls.append(wrap);

  if (points.length) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "h3b20-clear";
    clear.textContent = "Use scenario MP";
    clear.title = "Disable the resolution sweep and use each scenario's own megapixel value.";
    clear.addEventListener("click", () => writePoints(node, []));
    controls.append(clear);
  }
  root.append(controls);
  return root;
}

const FIELD_ICONS = { transformer: "model", sampling: "sampling", runtime: "runtime", mp: "size" };
function decorateScenarioRows(root) {
  for (const details of root.querySelectorAll(".h3b7-scenario")) {
    const summary = details.querySelector(":scope > summary");
    if (summary && !summary.querySelector(".h3b20-caret")) {
      const remove = summary.querySelector(".h3b7-x");
      const caret = document.createElement("span");
      caret.className = "h3b20-caret";
      caret.append(svg("chevron"));
      summary.insertBefore(caret, remove || null);
    }
    for (const field of details.querySelectorAll(".h3b7-field")) {
      const label = field.querySelector(":scope > .h3b7-label");
      if (!label || label.querySelector(".h3b20-field-icon")) continue;
      const key = String(label.textContent || "").trim().toLowerCase();
      const kind = FIELD_ICONS[key];
      if (!kind) continue;
      const mark = document.createElement("span");
      mark.className = "h3b20-field-icon";
      mark.append(svg(kind));
      label.prepend(mark);
    }
  }
}

function normalizeBenchmarkLanguage(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) return;
  const headerIcon = root.querySelector(".h3b7-icon");
  if (headerIcon && headerIcon.dataset.h3V20 !== "1") {
    headerIcon.dataset.h3V20 = "1";
    headerIcon.replaceChildren(svg("compare"));
    headerIcon.title = "Controlled comparison";
  }
  for (const sub of root.querySelectorAll(".h3b17-seed-sub")) {
    if (/fair\s*a\/?b/i.test(sub.textContent || "")) sub.textContent = "Controlled · identical seed";
  }
}

function decorateBenchmark(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) return;
  normalizeBenchmarkLanguage(node);
  const plan = root.querySelector(".h3b15-plan");
  if (plan) {
    const legacy = plan.querySelector(".h3b15-sweep");
    if (legacy) legacy.style.setProperty("display", "none", "important");
    plan.querySelector(":scope > .h3b20-resolutions")?.remove();
    const head = plan.querySelector(":scope > .h3b15-head");
    const resolution = buildResolutionControl(node);
    if (head) head.after(resolution); else plan.prepend(resolution);
  }
  decorateScenarioRows(root);
  updateGenerationCount(node);
}

const TIER_COPY = {
  conservative: ["Safe", "Lower memory"],
  fast: ["Draft", "Fast preview"],
  recommended: ["Recommended", "Best supported"],
  extended: ["High res", "Higher cost"],
  experimental: ["Experimental", "Very high cost"],
  extreme: ["Extreme", "Very high cost"],
};

function updateTargetSummary(node) {
  const panel = node?.__h3studioPanel;
  if (!panel?.isConnected) return;
  const preview = panel.querySelector(".h3s-target-stack .h3s-resolution-preview");
  const input = panel.querySelector(".h3s-target-stack .h3s-range-native");
  if (!preview || !input) return;

  if (preview.dataset.h3V20 !== "1") {
    preview.dataset.h3V20 = "1";
    preview.classList.add("h3s-v20-resolution-summary");
    const dimensions = document.createElement("strong"); dimensions.className = "h3s-v20-dimensions";
    const mp = document.createElement("span"); mp.className = "h3s-v20-mp";
    const tier = document.createElement("span"); tier.className = "h3s-v20-tier";
    const cost = document.createElement("span"); cost.className = "h3s-v20-cost";
    preview.replaceChildren(dimensions, mp, tier, cost);
  }

  const value = Math.max(Number(input.min) || .2, Math.min(Number(input.max) || 8.5, Number(input.value) || 1));
  const state = stateFromNode(node);
  const generation = state?.generation || {};
  const cap = capNativeForTarget(value, generation.cap_native_resolution);
  const plan = planResolution(generation.aspect_ratio || "1:1", value, generation.custom_width || 1024, generation.custom_height || 1024, cap);
  const tierInfo = resolutionTier(value, cap);
  const [tierLabel, costLabel] = TIER_COPY[tierInfo?.key] || [tierInfo?.label || "Direct", "Direct target"];

  const dimensions = preview.querySelector(".h3s-v20-dimensions");
  const mp = preview.querySelector(".h3s-v20-mp");
  const tier = preview.querySelector(".h3s-v20-tier");
  const cost = preview.querySelector(".h3s-v20-cost");
  if (dimensions) dimensions.textContent = `${plan.width} × ${plan.height}`;
  if (mp) mp.textContent = `${plan.actualMegapixels.toFixed(2)} MP actual · ${plan.capped ? "Safe cap" : "Direct"}`;
  if (tier) { tier.className = `h3s-v20-tier is-${tierInfo?.key || "recommended"}`; tier.textContent = tierLabel; tier.title = tierInfo?.note || ""; }
  if (cost) cost.textContent = costLabel;

  if (input.dataset.h3V20Summary !== "1") {
    input.dataset.h3V20Summary = "1";
    const sync = () => updateTargetSummary(node);
    input.addEventListener("input", sync, { passive: true });
    input.addEventListener("change", sync);
  }
}

function decorate(node) {
  if (node?.comfyClass === BENCHMARK) decorateBenchmark(node);
  if (node?.comfyClass === DIRECTOR) updateTargetSummary(node);
}

function observe(node) {
  return;
  const root = node?.comfyClass === BENCHMARK ? node.__h3bRoot : node?.__h3studioPanel;
  if (!root?.isConnected) { setTimeout(() => observe(node), 100); return; }
  decorate(node);
  if (root.__h3V20Observer) return;
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; decorate(node); });
  });
  observer.observe(root, { childList: true, subtree: true });
  root.__h3V20Observer = observer;
}

function sweep() {
  return;
  for (const node of app.graph?._nodes || []) {
    if (node?.comfyClass === BENCHMARK || node?.comfyClass === DIRECTOR) observe(node);
  }
}

app.registerExtension({
  name: "H3Studio.UIV20",
  setup() { installStyles(); setTimeout(sweep, 240); },
  nodeCreated(node) {
    if (node?.comfyClass === BENCHMARK || node?.comfyClass === DIRECTOR) setTimeout(() => observe(node), 240);
  },
  afterConfigureGraph() { installStyles(); setTimeout(sweep, 320); },
});
