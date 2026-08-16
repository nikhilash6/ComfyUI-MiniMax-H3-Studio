import { app } from "../../scripts/app.js";

const TARGET = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-benchmark-v30-style";
const MAX_SCENARIOS = 4;
const SEED_STRATEGIES = [
  ["Same seed for all - fair comparison", "Same seed", "Exact A/B"],
  ["New seed each row - paired comparison", "Paired rows", "New seed per row"],
  ["New seed every image - diversity sweep", "Every image", "Diversity sweep"],
];

function widget(node, name) {
  return (node?.widgets || []).find((item) => item?.name === name) || null;
}

function setWidget(node, name, value, notify = true) {
  const target = widget(node, name);
  if (!target || target.value === value) return false;
  target.value = value;
  if (notify) target.callback?.(value, app.canvas, node, [0, 0], {});
  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
  return true;
}

function normalizeCompatibility(node) {
  // These were visible/serialized during the short tabbed-benchmark experiment.
  // Normalize them on load so old workflows cannot fail prompt validation.
  setWidget(node, "benchmark_mode", "Unified", false);
  setWidget(node, "max_scenarios", MAX_SCENARIOS, false);
}

function scenarios(node) {
  try {
    const value = JSON.parse(String(widget(node, "scenarios_json")?.value || "[]"));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function resolutionPoints(node) {
  const values = [];
  for (const token of String(widget(node, "matrix_megapixels")?.value || "")
    .replaceAll("\r", "\n")
    .replaceAll(",", "\n")
    .split("\n")) {
    const number = Number(token.toLowerCase().replace("megapixels", "").replace("megapixel", "").replace("mp", "").trim());
    if (!Number.isFinite(number)) continue;
    const value = Math.max(0.2, Math.min(8.5, Number(number.toFixed(2))));
    if (!values.includes(value)) values.push(value);
  }
  return values;
}

function generationCount(node) {
  const scenarioCount = Math.max(1, scenarios(node).length);
  const points = Math.max(1, resolutionPoints(node).length);
  const repeats = Math.max(1, Number(widget(node, "repeats")?.value) || 1);
  return scenarioCount * points * repeats + (widget(node, "compare_vae")?.value ? 1 : 0);
}

function icon(kind) {
  const ns = "http://www.w3.org/2000/svg";
  const root = document.createElementNS(ns, "svg");
  root.setAttribute("viewBox", "0 0 24 24");
  root.setAttribute("aria-hidden", "true");
  const paths = {
    seed: ["M12 21c4.4 0 8-3.6 8-8 0-5-4.7-9.2-8-10-3.3.8-8 5-8 10 0 4.4 3.6 8 8 8Z", "M8 14c2.2-1.1 4.8-3.5 6-6", "M10 10c1 .2 2 .8 2.7 1.6"],
    repeat: ["M17 2l4 4-4 4", "M3 11V9a3 3 0 0 1 3-3h15", "M7 22l-4-4 4-4", "M21 13v2a3 3 0 0 1-3 3H3"],
    shield: ["M12 3 19 6v5c0 4.8-2.9 8.1-7 10-4.1-1.9-7-5.2-7-10V6l7-3Z", "m9 12 2 2 4-5"],
    resolution: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],
    preview: ["M3 12s3.3-6 9-6 9 6 9 6-3.3 6-9 6-9-6-9-6Z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
    image: ["M4 5h16v14H4z", "m6 14 4-5 3 3 2-2 3 4", "M9 10h.01"],
    text: ["M5 6h14", "M12 6v12", "M8 18h8"],
    vae: ["M12 3 5 7v10l7 4 7-4V7l-7-4Z", "m5 7 7 4 7-4", "M12 11v10"],
    step: ["M5 17h3v3H5z", "M10.5 12h3v3h-3z", "M16 7h3v3h-3z", "M7 15l5-5 5-5"],
    model: ["M12 3 5 6v6l7 4 7-4V6l-7-3Z", "m5 6 7 4 7-4", "M12 10v8"],
    sampling: ["M5 18 9 9", "M15 5l4 4", "M13 7l4 4", "M4 20l5-1 10-10-4-4L5 15l-1 5Z"],
    runtime: ["M12 3v3", "M12 18v3", "M3 12h3", "M18 12h3", "M12 12l4-2"],
    size: ["M4 9V4h5", "M15 4h5v5", "M20 15v5h-5", "M9 20H4v-5"],
    lora: ["M8 4h8l4 8-8 8-8-8 4-8Z", "M9 10h6", "M12 7v6"],
  };
  for (const d of paths[kind] || paths.seed) {
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
    .h3benchmark-v30 .h3b15-plan{display:none!important}
    .h3benchmark-v30 .h3b7-summary{padding:7px 0!important;min-height:32px!important}
    .h3benchmark-v30 .h3b7-empty{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:5px!important;min-height:104px!important;margin:8px 0 0!important;padding:18px!important;border:1px dashed color-mix(in srgb,var(--border-color,#3c444b) 78%,transparent)!important;border-radius:9px!important;background:color-mix(in srgb,var(--comfy-input-bg,#181c20) 22%,transparent)!important;color:#7f8992!important}
    .h3benchmark-v30 .h3b7-empty strong{font-size:9px!important;color:#cbd1d6!important}.h3benchmark-v30 .h3b7-empty span{font-size:7.4px!important;color:#747e86!important;text-align:center!important}

    .h3final-v30-setup{padding:12px 0 11px;border-bottom:1px solid color-mix(in srgb,var(--border-color,#343a40) 68%,transparent)}
    .h3final-v30-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}
    .h3final-v30-title{display:flex;align-items:center;gap:7px;color:#e2e6e9;font-size:9.2px;font-weight:760}.h3final-v30-title svg{width:14px;height:14px;color:#8997a2}
    .h3final-v30-count{padding:3px 7px;border:1px solid color-mix(in srgb,var(--border-color,#41484f) 82%,white 4%);border-radius:999px;color:#8f9aa2;font-size:6.9px;font-weight:700;font-variant-numeric:tabular-nums}.h3final-v30-count.warn{border-color:#674b45;color:#d0a094;background:rgba(140,72,56,.08)}
    .h3final-v30-grid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(90px,.55fr) minmax(90px,.55fr) minmax(110px,.7fr);gap:7px}
    .h3final-v30-field{display:flex;flex-direction:column;gap:4px;min-width:0}.h3final-v30-label{display:flex;align-items:center;gap:5px;color:#87929a;font-size:6.9px;font-weight:680}.h3final-v30-label svg{width:12px;height:12px;color:#75838e;flex:none}
    .h3final-v30-input,.h3final-v30-select{appearance:none;-webkit-appearance:none;width:100%;height:33px;padding:0 10px;border:1px solid color-mix(in srgb,var(--border-color,#3d444b) 88%,white 4%);border-radius:7px;background-color:var(--comfy-input-bg,#181c20);color:#e0e4e7;font-size:8px;outline:none;box-shadow:none}
    .h3final-v30-select{padding-right:32px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5 6 6.5 11 1.5' fill='none' stroke='%239aa4ad' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:10px 7px}
    .h3final-v30-input:hover,.h3final-v30-select:hover{border-color:#525e67}.h3final-v30-input:focus,.h3final-v30-select:focus{border-color:#66757f;box-shadow:0 0 0 2px rgba(126,143,158,.10)}
    .h3final-v30-note{min-height:10px;color:#69747c;font-size:6.35px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .h3final-v30-toggles{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px}
    .h3final-v30-toggle{display:inline-flex;align-items:center;gap:6px;min-height:29px;padding:0 8px;border:1px solid color-mix(in srgb,var(--border-color,#3d444b) 78%,transparent);border-radius:7px;background:transparent;color:#858f97;font-size:7px;font-weight:650;cursor:pointer}.h3final-v30-toggle:hover{background:color-mix(in srgb,var(--comfy-input-bg,#181c20) 55%,transparent);color:#cbd1d5}.h3final-v30-toggle.active{border-color:#4b5964;background:#252e35;color:#d9dfe3}.h3final-v30-toggle svg{width:12px;height:12px;color:#778691}.h3final-v30-toggle.active svg{color:#aebac2}
    .h3final-v30-toggle.danger.active{border-color:#66504a;background:rgba(119,73,62,.12);color:#d4aaa0}

    .h3benchmark-v30 .h3b7-label{gap:7px!important}.h3final-v30-field-icon{display:grid!important;place-items:center!important;flex:0 0 14px!important;width:14px!important;height:14px!important;color:#75838d!important}.h3final-v30-field-icon svg{display:block;width:13px;height:13px}
    .h3benchmark-v30 .h3b20-field-icon,.h3benchmark-v30 .h3b17-field-icon,.h3benchmark-v30 .h3b17-toggle-icon,.h3benchmark-v30 .h3b21-field-icon{display:none!important}
    .h3final-v30-meta{display:flex;align-items:center;justify-content:flex-end;gap:5px;overflow:hidden}.h3final-v30-chip{display:inline-flex;align-items:center;gap:4px;max-width:118px;padding:3px 6px;border:1px solid color-mix(in srgb,var(--border-color,#3d444b) 68%,transparent);border-radius:6px;color:#7f8991;font-size:6.6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.h3final-v30-chip svg{width:10px;height:10px;flex:none;color:#74818b}.h3final-v30-chip span{overflow:hidden;text-overflow:ellipsis}
    .h3benchmark-v30 .h3b7-scenario>summary{grid-template-columns:32px minmax(135px,1fr) minmax(170px,.9fr) 30px 30px!important}

    @container (max-width:720px){.h3final-v30-grid{grid-template-columns:1fr 1fr}.h3final-v30-meta{display:none!important}.h3benchmark-v30 .h3b7-scenario>summary{grid-template-columns:30px minmax(120px,1fr) 30px 30px!important}}
    @container (max-width:520px){.h3final-v30-grid{grid-template-columns:1fr}.h3final-v30-toggles{gap:4px}.h3final-v30-toggle{flex:1 1 45%;justify-content:flex-start}}
  `;
  document.head.append(style);
}

function fieldLabel(kind, text) {
  const label = document.createElement("div");
  label.className = "h3final-v30-label";
  label.append(icon(kind), document.createTextNode(text));
  return label;
}

function field(kind, label, control, note = "") {
  const root = document.createElement("label");
  root.className = "h3final-v30-field";
  root.append(fieldLabel(kind, label), control);
  const help = document.createElement("div");
  help.className = "h3final-v30-note";
  help.textContent = note;
  root.append(help);
  return root;
}

function selectControl(node, name, options) {
  const select = document.createElement("select");
  select.className = "h3final-v30-select";
  const current = String(widget(node, name)?.value ?? "");
  for (const [value, label] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = String(value) === current;
    select.append(option);
  }
  select.addEventListener("change", () => {
    setWidget(node, name, select.value);
    requestAnimationFrame(() => polish(node));
  });
  return select;
}

function numberControl(node, name, min, max, step = 1) {
  const input = document.createElement("input");
  input.type = "number";
  input.className = "h3final-v30-input";
  input.min = String(min); input.max = String(max); input.step = String(step);
  input.value = String(widget(node, name)?.value ?? min);
  input.addEventListener("change", () => {
    const value = Math.max(min, Math.min(max, Number(input.value) || min));
    input.value = String(value);
    setWidget(node, name, value);
    requestAnimationFrame(() => polish(node));
  });
  return input;
}

function textControl(node, name, placeholder) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "h3final-v30-input";
  input.placeholder = placeholder;
  input.value = String(widget(node, name)?.value || "");
  input.addEventListener("change", () => {
    setWidget(node, name, input.value.trim());
    requestAnimationFrame(() => polish(node));
  });
  return input;
}

function toggle(node, name, kind, label, danger = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `h3final-v30-toggle${danger ? " danger" : ""}`;
  const sync = () => button.classList.toggle("active", Boolean(widget(node, name)?.value));
  button.append(icon(kind), document.createTextNode(label));
  button.addEventListener("click", () => {
    setWidget(node, name, !Boolean(widget(node, name)?.value));
    sync();
    requestAnimationFrame(() => polish(node));
  });
  sync();
  return button;
}

function setupSignature(node) {
  return JSON.stringify([
    String(widget(node, "seed_strategy")?.value || ""),
    Number(widget(node, "seed_step")?.value || 1),
    Number(widget(node, "repeats")?.value || 1),
    Number(widget(node, "max_generations")?.value || 24),
    String(widget(node, "matrix_megapixels")?.value || ""),
    Boolean(widget(node, "live_cell_previews")?.value),
    Boolean(widget(node, "include_reference_context")?.value),
    Boolean(widget(node, "include_original_prompt")?.value),
    Boolean(widget(node, "compare_vae")?.value),
    Boolean(widget(node, "allow_large_matrix")?.value),
    scenarios(node).length,
  ]);
}

function ensureSetup(node, root) {
  const body = root.querySelector(".h3b7-body");
  const summary = body?.querySelector(":scope > .h3b7-summary");
  if (!body || !summary) return;
  const sig = setupSignature(node);
  let panel = body.querySelector(":scope > .h3final-v30-setup");
  if (panel?.dataset.sig === sig) return;
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "h3final-v30-setup";
    summary.after(panel);
  }
  panel.dataset.sig = sig;
  panel.replaceChildren();

  const count = generationCount(node);
  const guard = Math.max(1, Number(widget(node, "max_generations")?.value) || 24);
  const allow = Boolean(widget(node, "allow_large_matrix")?.value);
  const head = document.createElement("div");
  head.className = "h3final-v30-head";
  const title = document.createElement("div");
  title.className = "h3final-v30-title";
  title.append(icon("seed"), document.createTextNode("Run setup"));
  const badge = document.createElement("span");
  badge.className = `h3final-v30-count${count > guard && !allow ? " warn" : ""}`;
  badge.textContent = `${count} generation${count === 1 ? "" : "s"}`;
  head.append(title, badge);

  const grid = document.createElement("div");
  grid.className = "h3final-v30-grid";
  const seedOptions = SEED_STRATEGIES.map(([value, label]) => [value, label]);
  const seed = selectControl(node, "seed_strategy", seedOptions);
  const selectedSeed = SEED_STRATEGIES.find(([value]) => value === seed.value);
  grid.append(
    field("seed", "Seed behavior", seed, selectedSeed?.[2] || "Controlled comparison"),
    field("repeat", "Repeats", numberControl(node, "repeats", 1, 16), "Per scenario"),
    field("step", "Seed step", numberControl(node, "seed_step", 1, 1000000), "Used when seeds change"),
    field("shield", "Generation guard", numberControl(node, "max_generations", 1, 128), "Blocks accidental huge runs"),
  );

  const resolution = textControl(node, "matrix_megapixels", "Scenario MP (or 0.5, 1, 2…)");
  const resolutionField = field("resolution", "Resolution sweep", resolution, "Empty = use each scenario's own target size");
  resolutionField.style.gridColumn = "1 / -1";
  grid.append(resolutionField);

  const toggles = document.createElement("div");
  toggles.className = "h3final-v30-toggles";
  toggles.append(
    toggle(node, "live_cell_previews", "preview", "Live previews"),
    toggle(node, "include_reference_context", "image", "Reference strip"),
    toggle(node, "include_original_prompt", "text", "Original prompt"),
    toggle(node, "compare_vae", "vae", "VAE isolation"),
    toggle(node, "allow_large_matrix", "shield", "Allow over guard", true),
  );
  panel.append(head, grid, toggles);
}

const FIELD_ICONS = {
  transformer: "model",
  sampling: "sampling",
  runtime: "runtime",
  "target size": "size",
  mp: "size",
};

function ensureScenarioDecor(details) {
  for (const field of details.querySelectorAll(":scope > .h3b7-fields > .h3b7-field")) {
    const label = field.querySelector(":scope > .h3b7-label");
    if (!label || label.querySelector(".h3final-v30-field-icon")) continue;
    const text = String(label.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    const kind = FIELD_ICONS[text];
    if (!kind) continue;
    const mark = document.createElement("span");
    mark.className = "h3final-v30-field-icon";
    mark.append(icon(kind));
    label.prepend(mark);
  }

  const loraSummary = details.querySelector(".h3b7-loras > summary");
  if (loraSummary && !loraSummary.querySelector(".h3final-v30-field-icon")) {
    const mark = document.createElement("span");
    mark.className = "h3final-v30-field-icon";
    mark.append(icon("lora"));
    loraSummary.prepend(mark);
  }

  const summary = details.querySelector(":scope > summary");
  if (!summary) return;
  const tags = [...summary.querySelectorAll(".h3b7-tag")].map((tag) => String(tag.textContent || "").trim()).filter(Boolean);
  const sig = tags.join("|");
  let meta = summary.querySelector(":scope > .h3final-v30-meta");
  if (meta?.dataset.sig === sig) return;
  if (!meta) {
    meta = document.createElement("div");
    meta.className = "h3final-v30-meta";
    const caret = summary.querySelector(":scope > .h3final-caret");
    summary.insertBefore(meta, caret || summary.querySelector(":scope > .h3b7-x") || null);
  }
  meta.dataset.sig = sig;
  meta.replaceChildren();
  const kinds = ["runtime", "sampling", "size"];
  tags.slice(0, 3).forEach((text, index) => {
    const chip = document.createElement("span");
    chip.className = "h3final-v30-chip";
    const label = document.createElement("span");
    label.textContent = text;
    chip.append(icon(kinds[index] || "size"), label);
    meta.append(chip);
  });
}

function decorateEmpty(root) {
  const empty = root.querySelector(".h3b7-empty");
  if (!empty || empty.dataset.h3V30 === "1") return;
  empty.dataset.h3V30 = "1";
  const title = document.createElement("strong");
  title.textContent = "No benchmark scenarios yet";
  const copy = document.createElement("span");
  copy.textContent = "Add the current setup or choose a comparison preset above.";
  empty.replaceChildren(title, copy);
}

function enforceScenarioLimit(node, root) {
  const count = scenarios(node).length;
  const add = [...root.querySelectorAll(".h3b7-actions .h3b7-btn")].find((button) => /add scenario/i.test(button.textContent || ""));
  if (!add) return;
  add.disabled = count >= MAX_SCENARIOS;
  add.title = count >= MAX_SCENARIOS ? `Benchmark supports up to ${MAX_SCENARIOS} scenarios.` : "Add the current Director setup as another scenario.";
}

function polish(node) {
  if (!node || node.comfyClass !== TARGET) return;
  normalizeCompatibility(node);
  const root = node.__h3bRoot;
  if (!root?.isConnected) return;
  root.classList.add("h3benchmark-v30");
  ensureSetup(node, root);
  root.querySelectorAll(".h3b7-scenario").forEach(ensureScenarioDecor);
  decorateEmpty(root);
  enforceScenarioLimit(node, root);
  const summary = root.querySelector(".h3b7-summary strong");
  if (summary) summary.textContent = `Guard ${MAX_SCENARIOS}`;
}

function observe(node) {
  normalizeCompatibility(node);
  const root = node?.__h3bRoot;
  if (!root?.isConnected) {
    setTimeout(() => observe(node), 90);
    return;
  }
  polish(node);
  if (root.__h3V30Observer) return;
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      polish(node);
    });
  });
  observer.observe(root, { childList: true, subtree: true });
  root.__h3V30Observer = observer;
}

function sweep() {
  installStyles();
  for (const node of app.graph?._nodes || []) {
    if (node?.comfyClass === TARGET) observe(node);
  }
}

app.registerExtension({
  name: "H3Studio.BenchmarkV30",
  setup() {
    installStyles();
    for (const delay of [0, 120, 350, 800]) setTimeout(sweep, delay);
  },
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TARGET) return;
    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function h3BenchmarkV30Created() {
      const result = created?.apply(this, arguments);
      normalizeCompatibility(this);
      setTimeout(() => observe(this), 60);
      return result;
    };
    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function h3BenchmarkV30Configured() {
      const result = configured?.apply(this, arguments);
      normalizeCompatibility(this);
      setTimeout(() => observe(this), 60);
      return result;
    };
  },
  nodeCreated(node) {
    if (node?.comfyClass === TARGET) setTimeout(() => observe(node), 80);
  },
  afterConfigureGraph() {
    for (const delay of [0, 100, 300]) setTimeout(sweep, delay);
  },
});
