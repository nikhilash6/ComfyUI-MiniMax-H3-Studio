import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { applyState, stateFromNode } from "./js/studio_extension.js";

const TARGET = "H3StudioDirector";
const MAX_CUSTOM_LORAS = 6;
const MIN_STRENGTH = -4;
const MAX_STRENGTH = 4;
const STRENGTH_STEP = 0.05;
const CATALOG_URL = "/h3studio/loras";
const STYLE_ID = "h3studio-custom-loras-style";
const PICKER_ID = "h3studio-lora-picker";

let catalog = [];
let catalogPromise = null;
let activePickerCleanup = null;

function clamp(value, min, max, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeStack(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_CUSTOM_LORAS).map((item) => ({
    name: String(item?.name || "").replaceAll("\\", "/").trim(),
    strength: clamp(item?.strength, MIN_STRENGTH, MAX_STRENGTH, 1),
    enabled: item?.enabled !== false,
  }));
}

function formatSize(bytes) {
  const value = Number(bytes) || 0;
  if (value <= 0) return "";
  if (value >= 1024 ** 3) return `${(value / (1024 ** 3)).toFixed(2)} GiB`;
  if (value >= 1024 ** 2) return `${(value / (1024 ** 2)).toFixed(0)} MiB`;
  return `${Math.round(value / 1024)} KiB`;
}

function shortName(name) {
  const value = String(name || "").replaceAll("\\", "/");
  return value.split("/").pop() || value || "Choose LoRA";
}

async function loadCatalog(force = false) {
  if (!force && catalog.length) return catalog;
  if (!force && catalogPromise) return catalogPromise;
  catalogPromise = (async () => {
    const response = typeof api.fetchApi === "function"
      ? await api.fetchApi(CATALOG_URL)
      : await fetch(CATALOG_URL, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error(`LoRA catalog request failed (${response.status})`);
    const payload = await response.json();
    if (payload?.error) throw new Error(payload.error);
    catalog = Array.isArray(payload?.items) ? payload.items.filter((item) => item?.name) : [];
    return catalog;
  })();
  try {
    return await catalogPromise;
  } finally {
    catalogPromise = null;
  }
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3s-custom-loras,.h3s-custom-loras *{box-sizing:border-box;min-width:0}
    .h3s-lora-stack{display:flex;flex-direction:column;gap:6px;min-width:0}
    .h3s-lora-toolbar{display:flex;align-items:center;justify-content:space-between;gap:7px;min-width:0;flex-wrap:wrap}
    .h3s-lora-toolbar-actions{display:flex;gap:5px;flex:none}
    .h3s-lora-button{height:27px;max-width:100%;padding:4px 8px;border:1px solid var(--h3s-border,#343a40);border-radius:6px;background:color-mix(in srgb,var(--h3s-bg,#15191d) 86%,white 5%);color:var(--h3s-text,#e8ebed);cursor:pointer;font:650 9px/1.1 Inter,ui-sans-serif,system-ui}
    .h3s-lora-button:hover:not(:disabled){border-color:#626c75;background:color-mix(in srgb,var(--h3s-bg,#15191d) 80%,white 9%)}
    .h3s-lora-button:focus-visible{outline:2px solid rgba(140,153,166,.3);outline-offset:1px}
    .h3s-lora-button:disabled{opacity:.38;cursor:default}
    .h3s-lora-row{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 27px;gap:7px;width:100%;max-width:100%;overflow:hidden;padding:7px;border:1px solid color-mix(in srgb,var(--h3s-border,#343a40) 88%,transparent);border-radius:7px;background:color-mix(in srgb,var(--h3s-bg,#15191d) 91%,white 3%)}
    .h3s-lora-row.is-disabled{opacity:.58}
    .h3s-lora-main{display:flex;flex-direction:column;gap:7px;min-width:0}
    .h3s-lora-head{display:grid;grid-template-columns:22px minmax(0,1fr);gap:6px;align-items:center;min-width:0}
    .h3s-lora-enable{display:grid;place-items:center;width:22px;height:27px;margin:0;cursor:pointer}
    .h3s-lora-enable input{width:13px;height:13px;margin:0;accent-color:#98a5b1}
    .h3s-lora-picker-trigger{display:flex;align-items:center;justify-content:space-between;gap:7px;width:100%;height:29px;padding:4px 7px;border:1px solid var(--h3s-border,#343a40);border-radius:6px;background:var(--h3s-bg,#15191d);color:var(--h3s-text,#eef0f2);cursor:pointer;text-align:left;font:600 9px/1.15 Inter,ui-sans-serif,system-ui;overflow:hidden}
    .h3s-lora-picker-trigger:hover{border-color:#56616a;background:color-mix(in srgb,var(--h3s-bg,#15191d) 93%,white 4%)}
    .h3s-lora-picker-copy{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden}
    .h3s-lora-file{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .h3s-lora-picker-arrow{flex:none;width:7px;height:7px;border-right:1px solid #7f8992;border-bottom:1px solid #7f8992;transform:translateY(-2px) rotate(45deg)}
    .h3s-lora-subrow{display:grid;grid-template-columns:minmax(0,1fr) 52px auto;gap:6px;align-items:center;min-width:0}
    .h3s-lora-strength{position:relative;height:18px;min-width:0}
    .h3s-lora-strength-track{position:absolute;left:0;right:0;top:50%;height:3px;border-radius:999px;background:#2d3338;transform:translateY(-50%);overflow:hidden;pointer-events:none}
    .h3s-lora-strength-track::before{content:'';display:block;width:var(--h3l-strength-progress,62.5%);height:100%;background:#8996a2}
    .h3s-lora-strength input[type=range]{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
    .h3s-lora-strength-thumb{position:absolute;left:var(--h3l-strength-progress,62.5%);top:50%;width:11px;height:11px;border:2px solid #22282d;border-radius:50%;background:#a4afb9;box-shadow:0 1px 3px rgba(0,0,0,.35);transform:translate(-50%,-50%);pointer-events:none}
    .h3s-lora-number{width:52px;height:27px;padding:3px 5px;border:1px solid var(--h3s-border,#343a40);border-radius:5px;background:var(--h3s-bg,#15191d);color:var(--h3s-text,#eef0f2);text-align:center;font:600 9px/1.1 ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}
    .h3s-lora-order{display:flex;gap:3px;flex:none}
    .h3s-lora-order .h3s-lora-button{width:25px;height:25px;padding:0;font-size:10px}
    .h3s-lora-remove{display:grid;place-items:center;width:27px;height:27px;padding:0;border:0;border-radius:5px;background:transparent;color:#929aa1;cursor:pointer;font:400 17px/1 system-ui;flex:none}
    .h3s-lora-remove:hover{background:rgba(211,87,96,.12);color:#ef9da4}
    .h3s-lora-empty{padding:10px;border:1px dashed var(--h3s-border,#343a40);border-radius:7px;color:var(--h3s-muted,#858f98);font-size:9px;line-height:1.4}
    .h3s-lora-status{overflow:hidden;color:var(--h3s-muted,#858f98);font-size:8.5px;text-overflow:ellipsis;white-space:nowrap}
    .h3s-lora-warning{margin:0;color:#c69a5a;font-size:8.5px;line-height:1.4}
    #${PICKER_ID}{position:fixed;z-index:100000;width:min(430px,calc(100vw - 20px));max-height:min(420px,calc(100vh - 20px));overflow:hidden;border:1px solid #3e454b;border-radius:9px;background:#171b1f;color:#eef0f2;box-shadow:0 18px 60px rgba(0,0,0,.52);font:10px/1.3 Inter,ui-sans-serif,system-ui}
    .h3lp-head{display:flex;align-items:center;gap:7px;padding:8px;border-bottom:1px solid #2b3136;background:#1b2024}
    .h3lp-search{width:100%;height:30px;padding:5px 8px;border:1px solid #343b41;border-radius:6px;outline:none;background:#111519;color:#f3f4f5;font:10px/1.2 Inter,ui-sans-serif,system-ui}
    .h3lp-search:focus{border-color:#64717c;box-shadow:0 0 0 2px rgba(129,145,159,.1)}
    .h3lp-list{max-height:330px;overflow:auto;padding:5px;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#4b535a transparent}
    .h3lp-option{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;width:100%;min-height:35px;padding:6px 7px;border:0;border-radius:5px;background:transparent;color:#dfe3e6;cursor:pointer;text-align:left;font:inherit}
    .h3lp-option:hover,.h3lp-option:focus-visible{outline:0;background:#252b30;color:#fff}
    .h3lp-option.is-current{background:#22282d;box-shadow:inset 2px 0 0 #778591}
    .h3lp-option.is-used{opacity:.38;cursor:not-allowed}
    .h3lp-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:9.5px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace}
    .h3lp-size{flex:none;color:#7f8992;font-size:8px;white-space:nowrap}
    .h3lp-empty{padding:16px 10px;color:#7f8992;text-align:center;font-size:9px}
    @media(max-width:420px){.h3s-lora-subrow{grid-template-columns:minmax(0,1fr) 48px}.h3s-lora-order{grid-column:1/-1;justify-content:flex-end}}
  `;
  document.head.append(style);
}

function stateStack(node) {
  const state = stateFromNode(node);
  return { state, stack: normalizeStack(state.ui?.custom_loras) };
}

function saveStack(node, state, stack) {
  state.ui = { ...state.ui, custom_loras: normalizeStack(stack) };
  applyState(node, state);
  node.setDirtyCanvas?.(true, true);
}

function button(text, title, click, className = "") {
  const value = document.createElement("button");
  value.type = "button";
  value.className = `h3s-lora-button ${className}`.trim();
  value.textContent = text;
  value.title = title;
  value.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    click(event);
  });
  return value;
}

function closePicker() {
  activePickerCleanup?.();
  activePickerCleanup = null;
  document.getElementById(PICKER_ID)?.remove();
}

function openPicker(anchor, { selected = "", used = new Set(), onSelect }) {
  closePicker();
  const panel = document.createElement("div");
  panel.id = PICKER_ID;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Choose installed LoRA");
  const head = document.createElement("div");
  head.className = "h3lp-head";
  const search = document.createElement("input");
  search.className = "h3lp-search";
  search.type = "search";
  search.placeholder = "Search installed LoRAs…";
  search.autocomplete = "off";
  head.append(search);
  const list = document.createElement("div");
  list.className = "h3lp-list";
  panel.append(head, list);
  document.body.append(panel);

  const place = () => {
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(430, Math.max(280, rect.width + 90), window.innerWidth - 20);
    panel.style.width = `${width}px`;
    const height = Math.min(420, panel.scrollHeight || 360, window.innerHeight - 20);
    const below = window.innerHeight - rect.bottom;
    const top = below >= Math.min(height, 300) ? rect.bottom + 5 : Math.max(10, rect.top - height - 5);
    panel.style.left = `${Math.max(10, Math.min(window.innerWidth - width - 10, rect.left))}px`;
    panel.style.top = `${top}px`;
  };

  const render = () => {
    const query = search.value.trim().toLowerCase();
    list.replaceChildren();
    const matches = catalog.filter((entry) => !query || String(entry.name).toLowerCase().includes(query));
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "h3lp-empty";
      empty.textContent = catalog.length ? "No matching LoRAs" : "No installed LoRAs found";
      list.append(empty);
      place();
      return;
    }
    for (const entry of matches) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = `h3lp-option${entry.name === selected ? " is-current" : ""}${used.has(entry.name) && entry.name !== selected ? " is-used" : ""}`;
      option.disabled = used.has(entry.name) && entry.name !== selected;
      option.title = entry.name;
      const name = document.createElement("span");
      name.className = "h3lp-name";
      name.textContent = entry.name;
      const size = document.createElement("span");
      size.className = "h3lp-size";
      size.textContent = formatSize(entry.size_bytes);
      option.append(name, size);
      option.addEventListener("click", () => {
        if (option.disabled) return;
        onSelect(entry.name);
        closePicker();
      });
      list.append(option);
    }
    place();
  };

  const outside = (event) => {
    if (panel.contains(event.target) || anchor.contains(event.target)) return;
    closePicker();
  };
  const keys = (event) => {
    if (event.key === "Escape") closePicker();
    if (event.key === "ArrowDown" && event.target === search) {
      event.preventDefault();
      list.querySelector("button:not(:disabled)")?.focus();
    }
  };
  const reposition = () => place();
  search.addEventListener("input", render);
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", keys, true);
  window.addEventListener("resize", reposition, { passive: true });
  window.addEventListener("scroll", reposition, { passive: true, capture: true });
  activePickerCleanup = () => {
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", keys, true);
    window.removeEventListener("resize", reposition);
    window.removeEventListener("scroll", reposition, true);
  };
  render();
  requestAnimationFrame(() => { place(); search.focus({ preventScroll: true }); });
}

function pickerTrigger(item, index, stack, onChange) {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "h3s-lora-picker-trigger";
  trigger.setAttribute("aria-label", `Custom LoRA ${index + 1}`);
  trigger.title = item.name || "Choose installed LoRA";
  const copy = document.createElement("span");
  copy.className = "h3s-lora-picker-copy";
  const file = document.createElement("span");
  file.className = "h3s-lora-file";
  file.textContent = item.name ? shortName(item.name) : "Choose installed LoRA…";
  copy.append(file);
  const arrow = document.createElement("span");
  arrow.className = "h3s-lora-picker-arrow";
  trigger.append(copy, arrow);
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openPicker(trigger, {
      selected: item.name,
      used: new Set(stack.filter((_, otherIndex) => otherIndex !== index).map((entry) => entry.name).filter(Boolean)),
      onSelect: (name) => onChange({ name }),
    });
  });
  return trigger;
}

function strengthControl(item, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "h3s-lora-strength";
  const track = document.createElement("span");
  track.className = "h3s-lora-strength-track";
  const thumb = document.createElement("span");
  thumb.className = "h3s-lora-strength-thumb";
  const range = document.createElement("input");
  range.type = "range";
  range.min = String(MIN_STRENGTH);
  range.max = String(MAX_STRENGTH);
  range.step = String(STRENGTH_STEP);
  range.value = String(item.strength);
  range.title = "LoRA strength";
  const sync = (raw) => {
    const value = clamp(raw, MIN_STRENGTH, MAX_STRENGTH, 1);
    const progress = ((value - MIN_STRENGTH) / (MAX_STRENGTH - MIN_STRENGTH)) * 100;
    wrap.style.setProperty("--h3l-strength-progress", `${progress}%`);
    return value;
  };
  range.addEventListener("input", () => sync(range.value));
  range.addEventListener("change", () => onChange({ strength: sync(range.value) }));
  wrap.append(track, thumb, range);
  sync(item.strength);
  return wrap;
}

function row(node, state, stack, item, index, rerender) {
  const root = document.createElement("div");
  root.className = `h3s-lora-row${item.enabled ? "" : " is-disabled"}`;
  const main = document.createElement("div");
  main.className = "h3s-lora-main";
  const head = document.createElement("div");
  head.className = "h3s-lora-head";
  const enabled = document.createElement("label");
  enabled.className = "h3s-lora-enable";
  enabled.title = "Enable this LoRA";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = item.enabled;
  checkbox.setAttribute("aria-label", `Enable custom LoRA ${index + 1}`);
  checkbox.addEventListener("change", () => {
    stack[index] = { ...stack[index], enabled: checkbox.checked };
    saveStack(node, state, stack);
    rerender();
  });
  enabled.append(checkbox);

  const patch = (value) => {
    stack[index] = { ...stack[index], ...value };
    saveStack(node, state, stack);
    rerender();
  };
  head.append(enabled, pickerTrigger(item, index, stack, patch));

  const subrow = document.createElement("div");
  subrow.className = "h3s-lora-subrow";
  const strength = strengthControl(item, patch);
  const number = document.createElement("input");
  number.className = "h3s-lora-number";
  number.type = "number";
  number.min = String(MIN_STRENGTH);
  number.max = String(MAX_STRENGTH);
  number.step = String(STRENGTH_STEP);
  number.value = String(item.strength);
  number.setAttribute("aria-label", `LoRA ${index + 1} strength`);
  number.addEventListener("change", () => patch({ strength: clamp(number.value, MIN_STRENGTH, MAX_STRENGTH, 1) }));
  const order = document.createElement("div");
  order.className = "h3s-lora-order";
  const up = button("↑", "Move LoRA earlier", () => {
    if (index <= 0) return;
    [stack[index - 1], stack[index]] = [stack[index], stack[index - 1]];
    saveStack(node, state, stack); rerender();
  });
  const down = button("↓", "Move LoRA later", () => {
    if (index >= stack.length - 1) return;
    [stack[index + 1], stack[index]] = [stack[index], stack[index + 1]];
    saveStack(node, state, stack); rerender();
  });
  up.disabled = index === 0;
  down.disabled = index === stack.length - 1;
  order.append(up, down);
  subrow.append(strength, number, order);
  main.append(head, subrow);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "h3s-lora-remove";
  remove.textContent = "×";
  remove.title = "Remove LoRA";
  remove.setAttribute("aria-label", `Remove custom LoRA ${index + 1}`);
  remove.addEventListener("click", (event) => {
    event.preventDefault(); event.stopPropagation(); closePicker();
    stack.splice(index, 1);
    saveStack(node, state, stack);
    rerender();
  });
  root.append(main, remove);
  return root;
}

function buildSection(node) {
  const { state, stack } = stateStack(node);
  const section = document.createElement("section");
  section.className = "h3s-section h3s-custom-loras";
  section.dataset.h3studioCustomLoras = "true";
  const header = document.createElement("div");
  header.className = "h3s-section-header";
  const title = document.createElement("span");
  title.className = "h3s-section-title";
  title.textContent = "Custom LoRAs";
  const status = document.createElement("span");
  status.className = "h3s-status-pill";
  status.textContent = `${stack.filter((item) => item.enabled && item.name).length}/${MAX_CUSTOM_LORAS} active`;
  header.append(title, status);

  const body = document.createElement("div");
  body.className = "h3s-section-stack";
  const warning = document.createElement("p");
  warning.className = "h3s-lora-warning";
  warning.textContent = "Speed already applies LightX/PDD acceleration. Add only compatible custom H3 LoRAs here; order matters.";

  const stackRoot = document.createElement("div");
  stackRoot.className = "h3s-lora-stack";
  const rerender = () => installLoraSection(node, true);
  if (!stack.length) {
    const empty = document.createElement("div");
    empty.className = "h3s-lora-empty";
    empty.textContent = "No custom LoRAs. Add one only when you want an extra style, character or detail adapter.";
    stackRoot.append(empty);
  } else {
    stack.forEach((item, index) => stackRoot.append(row(node, state, stack, item, index, rerender)));
  }

  const toolbar = document.createElement("div");
  toolbar.className = "h3s-lora-toolbar";
  const catalogStatus = document.createElement("span");
  catalogStatus.className = "h3s-lora-status";
  catalogStatus.textContent = node.__h3studioLoraCatalogError
    || (catalog.length ? `${catalog.length} installed LoRA${catalog.length === 1 ? "" : "s"}` : "Loading installed LoRAs…");
  const toolbarActions = document.createElement("div");
  toolbarActions.className = "h3s-lora-toolbar-actions";
  const refresh = button("↻", "Refresh installed LoRAs", async () => {
    refresh.disabled = true;
    catalogStatus.textContent = "Refreshing…";
    try {
      await loadCatalog(true);
      node.__h3studioLoraCatalogError = "";
      rerender();
    } catch (error) {
      node.__h3studioLoraCatalogError = String(error?.message || error);
      catalogStatus.textContent = node.__h3studioLoraCatalogError;
      refresh.disabled = false;
    }
  });
  const add = button("+ Add LoRA", "Choose an installed custom LoRA", (event) => {
    if (stack.length >= MAX_CUSTOM_LORAS) return;
    const used = new Set(stack.map((item) => item.name).filter(Boolean));
    openPicker(event.currentTarget, {
      used,
      onSelect: (name) => {
        stack.push({ name, strength: 1, enabled: true });
        saveStack(node, state, stack);
        rerender();
      },
    });
  });
  add.disabled = stack.length >= MAX_CUSTOM_LORAS;
  toolbarActions.append(refresh, add);
  toolbar.append(catalogStatus, toolbarActions);
  body.append(warning, stackRoot, toolbar);
  section.append(header, body);
  return section;
}

function sectionHost(panel) {
  return panel?.querySelector?.(".h3s-col-right, .h3s-v6-inspector, .h3s-v7-inspector, .h3s-inspector") || panel;
}

function installLoraSection(node, replace = false) {
  const panel = node?.__h3studioPanel;
  if (!panel?.isConnected) return;
  const existing = panel.querySelector(".h3s-custom-loras");
  if (existing && !replace) return;
  closePicker();
  const section = buildSection(node);
  if (existing) existing.replaceWith(section);
  else {
    const host = sectionHost(panel);
    const advanced = [...host.children].find((child) => child.querySelector?.(".h3s-advanced-toggle"));
    host.insertBefore(section, advanced || null);
  }
}

function watchDirector(node) {
  if (node.__h3studioLoraObserver || node.__h3studioLoraWatchPending) return;
  node.__h3studioLoraWatchPending = true;
  let attempts = 0;
  const wait = () => {
    const panel = node.__h3studioPanel;
    if (!panel) {
      attempts += 1;
      if (attempts < 600) setTimeout(wait, 25);
      else node.__h3studioLoraWatchPending = false;
      return;
    }
    node.__h3studioLoraWatchPending = false;
    installStyles();
    installLoraSection(node);
    const observer = new MutationObserver(() => {
      if (!panel.querySelector(".h3s-custom-loras")) installLoraSection(node);
    });
    observer.observe(panel, { childList: true });
    node.__h3studioLoraObserver = observer;
    loadCatalog().then(() => {
      node.__h3studioLoraCatalogError = "";
      installLoraSection(node, true);
    }).catch((error) => {
      node.__h3studioLoraCatalogError = String(error?.message || error);
      installLoraSection(node, true);
    });
  };
  setTimeout(wait, 0);
}

app.registerExtension({
  name: "H3Studio.CustomLoRAs",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TARGET) return;
    const originalCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function h3studioCustomLorasCreated() {
      const result = originalCreated?.apply(this, arguments);
      watchDirector(this);
      return result;
    };
  },
});

export { MAX_CUSTOM_LORAS, normalizeStack };
