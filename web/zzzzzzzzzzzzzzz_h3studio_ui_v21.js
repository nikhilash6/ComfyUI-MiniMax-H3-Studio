import { app } from "../../scripts/app.js";
import { stateFromNode } from "./js/studio_extension.js";

const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-ui-v21-style";

function icon(kind) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const paths = {
    compare: ["M7 7h11", "m15 4 3 3-3 3", "M17 17H6", "m9 14-3 3 3 3"],
    resolution: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],
    close: ["M7 7l10 10", "M17 7 7 17"],
    chevron: ["m9 6 6 6-6 6"],
    model: ["M12 3 5 6v6l7 4 7-4V6l-7-3Z", "m5 6 7 4 7-4", "M12 10v8"],
    sampling: ["M5 18 9 9", "M15 5l4 4", "M13 7l4 4", "M4 20l5-1 10-10-4-4L5 15l-1 5Z"],
    runtime: ["M12 3v3", "M12 18v3", "M3 12h3", "M18 12h3", "M12 12l4-2"],
    size: ["M4 9V4h5", "M15 4h5v5", "M20 15v5h-5", "M9 20H4v-5"],
  };
  for (const d of paths[kind] || paths.compare) {
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
    .h3b20-resolutions{position:relative}
    .h3b21-sweep-help{display:inline-flex;align-items:center;gap:5px;color:#7f8992;font-size:6.8px}
    .h3b21-sweep-help strong{color:#aeb6bd;font-weight:700}
    .h3b21-scenario-label{display:none}
    .h3b7-scenario[open] .h3b7-name{color:#f1f3f4!important}
    .h3b7-scenario:not([open]) .h3b7-name{color:#d6dadd!important}
    .h3b7-scenario>summary:focus-visible{outline:1px solid #596672!important;outline-offset:-1px!important}
    .h3b7-scenario .h3b7-tag{font-variant-numeric:tabular-nums}
    .h3b20-res-controls:empty:after{content:'No sweep points';color:#727b83;font-size:7px}
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

function scenarios(node) {
  try {
    const value = JSON.parse(String(widget(node, "scenarios_json")?.value || "[]"));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveScenarios(node, value) {
  const target = widget(node, "scenarios_json");
  if (!target) return;
  target.value = JSON.stringify(value);
  target.callback?.(target.value, app.canvas, node, [0, 0], {});
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

function normalizeScenarioNames(node) {
  if (node.__h3V21NamesNormalized) return;
  const current = scenarios(node);
  let changed = false;
  const next = current.map((scenario, index) => {
    const name = String(scenario?.name || "").trim();
    if (/^(?:scenario\s*)?[A-Z]$/i.test(name)) {
      changed = true;
      return { ...scenario, name: `Scenario ${index + 1}` };
    }
    return scenario;
  });
  node.__h3V21NamesNormalized = true;
  if (changed) saveScenarios(node, next);
}

function points(node) {
  const result = [];
  for (const token of String(widget(node, "matrix_megapixels")?.value || "").replaceAll("\r", "\n").replaceAll(",", "\n").split("\n")) {
    const value = Number(token.toLowerCase().replace("mp", "").trim());
    if (!Number.isFinite(value)) continue;
    const bounded = Math.max(.2, Math.min(8.5, Number(value.toFixed(2))));
    if (!result.includes(bounded)) result.push(bounded);
  }
  return result;
}

function savePoints(node, values) {
  const target = widget(node, "matrix_megapixels");
  if (!target) return;
  const clean = [...new Set(values.map((value) => Math.max(.2, Math.min(8.5, Number(Number(value).toFixed(2))))))];
  target.value = clean.map((value) => value.toFixed(2)).join(", ");
  target.callback?.(target.value, app.canvas, node, [0, 0], {});
  node.__h3b15Sig = null;
  node.__h3V21ResolutionSig = "";
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
  requestAnimationFrame(() => decorate(node));
}

function directorMp(node) {
  const director = sourceNode(node, "studio_context");
  const value = Number(stateFromNode(director)?.generation?.megapixels);
  return Number.isFinite(value) ? Math.max(.2, Math.min(8.5, value)) : 1;
}

function resolutionSignature(node) {
  return JSON.stringify([String(widget(node, "matrix_megapixels")?.value || ""), directorMp(node).toFixed(2)]);
}

function buildResolution(node) {
  const values = points(node);
  const root = document.createElement("div");
  root.className = "h3b20-resolutions";
  root.dataset.h3V21Resolution = "1";

  const copy = document.createElement("div");
  const title = document.createElement("div");
  title.className = "h3b20-res-title";
  title.append(icon("resolution"), document.createTextNode("Resolution sweep"));
  const sub = document.createElement("div");
  sub.className = "h3b20-res-copy";
  sub.textContent = values.length
    ? "Every scenario runs at every selected MP. This multiplies the generation count."
    : "Off — each scenario uses the MP set inside that scenario.";
  copy.append(title, sub);

  const state = document.createElement("span");
  state.className = `h3b20-res-state${values.length ? " on" : ""}`;
  state.textContent = values.length ? `ON · ${values.length}` : "OFF";
  root.append(copy, state);

  const controls = document.createElement("div");
  controls.className = "h3b20-res-controls";
  for (const value of values) {
    const chip = document.createElement("span");
    chip.className = "h3b20-res-chip";
    chip.append(document.createTextNode(`${value.toFixed(2)} MP`));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.title = `Remove ${value.toFixed(2)} MP`;
    remove.append(icon("close"));
    remove.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      savePoints(node, values.filter((entry) => Math.abs(entry - value) > .001));
    });
    chip.append(remove);
    controls.append(chip);
  }

  const wrap = document.createElement("div");
  wrap.className = "h3b20-add-wrap";
  const select = document.createElement("select");
  select.className = "h3b20-add";
  const current = directorMp(node);
  const choices = [
    ["", "+ Add sweep point…"],
    [`d:${current}`, `Director current · ${current.toFixed(2)} MP`],
    ["0.2", "0.20 MP · Draft"],
    ["0.5", "0.50 MP"],
    ["1", "1.00 MP · Recommended"],
    ["2", "2.00 MP"],
    ["4", "4.00 MP"],
    ["8.5", "8.50 MP · Extreme"],
  ];
  for (const [value, label] of choices) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  select.addEventListener("change", () => {
    if (!select.value) return;
    const value = select.value.startsWith("d:") ? Number(select.value.slice(2)) : Number(select.value);
    if (Number.isFinite(value) && !values.some((entry) => Math.abs(entry - value) < .001)) savePoints(node, [...values, value]);
    select.value = "";
  });
  wrap.append(select);
  controls.append(wrap);

  if (values.length) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "h3b20-clear";
    clear.textContent = "Disable sweep";
    clear.title = "Return to each scenario's own MP setting.";
    clear.addEventListener("click", () => savePoints(node, []));
    controls.append(clear);
  }
  root.append(controls);
  return root;
}

function updateCount(node) {
  const count = Math.max(1, scenarios(node).length)
    * Math.max(1, points(node).length)
    * Math.max(1, Number(widget(node, "repeats")?.value) || 1)
    + (widget(node, "compare_vae")?.value ? 1 : 0);
  const guard = Math.max(1, Number(widget(node, "max_generations")?.value) || 24);
  const badge = node?.__h3bRoot?.querySelector?.(".h3b15-count");
  if (badge) {
    badge.textContent = `${count} gen`;
    badge.classList.toggle("warn", count > guard && !widget(node, "allow_large_matrix")?.value);
  }
}

const FIELD_ICONS = { transformer: "model", sampling: "sampling", runtime: "runtime", mp: "size" };
function decorateScenarios(root) {
  for (const details of root.querySelectorAll(".h3b7-scenario")) {
    const summary = details.querySelector(":scope > summary");
    if (summary && !summary.querySelector(".h3b20-caret")) {
      const caret = document.createElement("span");
      caret.className = "h3b20-caret";
      caret.append(icon("chevron"));
      const remove = summary.querySelector(".h3b7-x");
      summary.insertBefore(caret, remove || null);
    }
    for (const field of details.querySelectorAll(".h3b7-field")) {
      const label = field.querySelector(":scope > .h3b7-label");
      if (!label || label.querySelector(".h3b20-field-icon")) continue;
      const kind = FIELD_ICONS[String(label.textContent || "").trim().toLowerCase()];
      if (!kind) continue;
      const mark = document.createElement("span");
      mark.className = "h3b20-field-icon";
      mark.append(icon(kind));
      label.prepend(mark);
    }
  }
}

function cleanLanguage(root) {
  const header = root.querySelector(".h3b7-icon");
  if (header && header.dataset.h3V21 !== "1") {
    header.dataset.h3V21 = "1";
    header.replaceChildren(icon("compare"));
    header.title = "Controlled comparison";
  }
  for (const element of root.querySelectorAll(".h3b17-seed-sub")) {
    if (/fair\s*a\/?b/i.test(element.textContent || "")) element.textContent = "Controlled · identical seed";
  }
  for (const element of root.querySelectorAll(".h3b7-sub")) {
    element.textContent = "Compare models, sampling, runtime or LoRAs under controlled settings.";
  }
}

function decorate(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) return;
  normalizeScenarioNames(node);
  cleanLanguage(root);

  const plan = root.querySelector(".h3b15-plan");
  if (plan) {
    const legacy = plan.querySelector(".h3b15-sweep");
    if (legacy) legacy.style.setProperty("display", "none", "important");
    const signature = resolutionSignature(node);
    const existing = plan.querySelector(":scope > .h3b20-resolutions");
    if (!existing || node.__h3V21ResolutionSig !== signature) {
      const next = buildResolution(node);
      if (existing) existing.replaceWith(next);
      else {
        const head = plan.querySelector(":scope > .h3b15-head");
        if (head) head.after(next); else plan.prepend(next);
      }
      node.__h3V21ResolutionSig = signature;
    }
  }

  decorateScenarios(root);
  updateCount(node);
}

function observe(node) {
  return;
  const root = node?.__h3bRoot;
  if (!root?.isConnected) { setTimeout(() => observe(node), 100); return; }

  /* V20's first draft rebuilt its resolution row from its own MutationObserver.
     Disconnect that benchmark-only observer and replace it with this idempotent one. */
  root.__h3V20Observer?.disconnect?.();
  root.__h3V20Observer = null;

  decorate(node);
  if (root.__h3V21Observer) return;
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
  root.__h3V21Observer = observer;
}

function sweep() {
  return;
  for (const node of app.graph?._nodes || []) if (node?.comfyClass === BENCHMARK) observe(node);
}

app.registerExtension({
  name: "H3Studio.UIV21",
  setup() { installStyles(); setTimeout(sweep, 300); },
  nodeCreated(node) { if (node?.comfyClass === BENCHMARK) setTimeout(() => observe(node), 300); },
  afterConfigureGraph() { installStyles(); setTimeout(sweep, 360); },
});
