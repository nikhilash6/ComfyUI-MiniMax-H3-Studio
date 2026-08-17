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
const FAVORITES_KEY = "h3studio.customLoraFavorites.v1";

const ICONS = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m15.5 15.5 4.5 4.5"></path></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.75 5.57 6.15.9-4.45 4.34 1.05 6.13L12 17.05l-5.5 2.89 1.05-6.13L3.1 9.47l6.15-.9L12 3Z"></path></svg>',
  chevronUp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 14 5-5 5 5"></path></svg>',
  chevronDown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"></path></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"></path></svg>',
  remove: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"></path></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8a7 7 0 1 0 1 5"></path><path d="M19 3v5h-5"></path></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
};

let catalog = [];
let catalogPromise = null;
let activePickerCleanup = null;
let favorites = loadFavorites();

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

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map((item) => String(item || "").replaceAll("\\", "/").trim()).filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites].sort((a, b) => a.localeCompare(b))));
  } catch {
    // UI preference only; never block LoRA usage if localStorage is unavailable.
  }
}

function isFavorite(name) {
  return Boolean(name) && favorites.has(String(name).replaceAll("\\", "/"));
}

function toggleFavorite(name, force) {
  const normalized = String(name || "").replaceAll("\\", "/").trim();
  if (!normalized) return false;
  const next = typeof force === "boolean" ? force : !favorites.has(normalized);
  if (next) favorites.add(normalized);
  else favorites.delete(normalized);
  saveFavorites();
  return next;
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
    .h3s-custom-loras{--h3l-control:color-mix(in srgb,var(--h3s-bg,var(--comfy-input-bg,#15191d)) 88%,white 6%);--h3l-control-hover:color-mix(in srgb,var(--h3s-bg,var(--comfy-input-bg,#15191d)) 82%,white 10%);--h3l-line:color-mix(in srgb,var(--h3s-border,var(--border-color,#343a40)) 78%,transparent);--h3l-muted:var(--h3s-muted,var(--descrip-text,#858f98));--h3l-text:var(--h3s-text,var(--input-text,#e8ebed))}
    .h3s-lora-stack{display:flex;flex-direction:column;gap:8px;min-width:0}
    .h3s-lora-toolbar{display:flex;align-items:center;justify-content:space-between;gap:9px;min-width:0;flex-wrap:wrap;padding-top:2px}
    .h3s-lora-toolbar-actions{display:flex;gap:6px;flex:none}
    .h3s-lora-button{height:29px;max-width:100%;padding:5px 9px;border:1px solid var(--h3l-line);border-radius:7px;background:var(--h3l-control);color:var(--h3l-text);cursor:pointer;font:650 9px/1.1 Inter,ui-sans-serif,system-ui;display:inline-flex;align-items:center;justify-content:center;gap:6px}
    .h3s-lora-button svg,.h3s-lora-icon-button svg,.h3lp-search-icon svg,.h3lp-star svg,.h3lp-trigger-icon svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
    .h3s-lora-button:hover:not(:disabled){border-color:#626c75;background:var(--h3l-control-hover)}
    .h3s-lora-button:focus-visible,.h3s-lora-icon-button:focus-visible,.h3lp-select:focus-visible,.h3lp-star:focus-visible{outline:2px solid rgba(140,153,166,.35);outline-offset:1px}
    .h3s-lora-button:disabled,.h3s-lora-icon-button:disabled{opacity:.34;cursor:default}
    .h3s-lora-row{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 30px;gap:8px;width:100%;max-width:100%;overflow:hidden;padding:9px;border:1px solid var(--h3l-line);border-radius:8px;background:transparent}
    .h3s-lora-row.is-disabled{opacity:.58}
    .h3s-lora-main{display:flex;flex-direction:column;gap:9px;min-width:0}
    .h3s-lora-head{display:grid;grid-template-columns:24px minmax(0,1fr) 30px;gap:7px;align-items:center;min-width:0}
    .h3s-lora-enable{display:grid;place-items:center;width:24px;height:30px;margin:0;cursor:pointer}
    .h3s-lora-enable input{width:14px;height:14px;margin:0;accent-color:#98a5b1}
    .h3s-lora-picker-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;height:32px;padding:5px 8px;border:1px solid var(--h3l-line);border-radius:7px;background:var(--h3l-control);color:var(--h3l-text);cursor:pointer;text-align:left;font:620 9.3px/1.15 Inter,ui-sans-serif,system-ui;overflow:hidden}
    .h3s-lora-picker-trigger:hover{border-color:#59636c;background:var(--h3l-control-hover)}
    .h3s-lora-picker-copy{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden}
    .h3s-lora-file{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .h3lp-trigger-icon{display:grid;place-items:center;flex:none;color:#7f8992}
    .h3s-lora-icon-button{display:grid;place-items:center;width:30px;height:30px;padding:0;border:1px solid transparent;border-radius:7px;background:transparent;color:#929ca4;cursor:pointer}
    .h3s-lora-icon-button:hover:not(:disabled){background:var(--h3l-control);color:#e8ebed;border-color:var(--h3l-line)}
    .h3s-lora-favorite.is-favorite{color:#d8b65c}
    .h3s-lora-favorite.is-favorite svg,.h3lp-star.is-favorite svg{fill:currentColor;stroke:currentColor}
    .h3s-lora-subrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:end;min-width:0}
    .h3s-lora-field{display:flex;flex-direction:column;gap:5px;min-width:0}
    .h3s-lora-field-label{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--h3l-muted);font:650 8.4px/1.1 Inter,ui-sans-serif,system-ui;letter-spacing:.015em}
    .h3s-lora-field-hint{opacity:.62;font-weight:500;font-variant-numeric:tabular-nums}
    .h3s-lora-strength-line{display:grid;grid-template-columns:minmax(90px,1fr) 58px;gap:8px;align-items:center;min-width:0}
    .h3s-lora-strength{position:relative;height:22px;min-width:0}
    .h3s-lora-strength-track{position:absolute;left:0;right:0;top:50%;height:3px;border-radius:999px;background:color-mix(in srgb,var(--h3l-line) 80%,black 14%);transform:translateY(-50%);overflow:hidden;pointer-events:none}
    .h3s-lora-strength-track::before{content:'';display:block;width:var(--h3l-strength-progress,62.5%);height:100%;background:#8996a2}
    .h3s-lora-strength input[type=range]{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
    .h3s-lora-strength-thumb{position:absolute;left:var(--h3l-strength-progress,62.5%);top:50%;width:12px;height:12px;border:2px solid color-mix(in srgb,var(--h3s-bg,#15191d) 80%,black 20%);border-radius:50%;background:#a4afb9;box-shadow:0 1px 3px rgba(0,0,0,.35);transform:translate(-50%,-50%);pointer-events:none}
    .h3s-lora-number{width:58px;height:29px;padding:3px 6px;border:1px solid var(--h3l-line);border-radius:6px;background:var(--h3l-control);color:var(--h3l-text);text-align:center;font:650 9px/1.1 ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}
    .h3s-lora-order-field{width:70px}
    .h3s-lora-order{display:grid;grid-template-columns:1fr 1fr;height:29px;border:1px solid var(--h3l-line);border-radius:7px;overflow:hidden;background:transparent}
    .h3s-lora-order .h3s-lora-icon-button{width:auto;height:27px;border:0;border-radius:0}
    .h3s-lora-order .h3s-lora-icon-button+ .h3s-lora-icon-button{border-left:1px solid var(--h3l-line)}
    .h3s-lora-remove{align-self:start}
    .h3s-lora-remove:hover{background:rgba(211,87,96,.10)!important;border-color:rgba(211,87,96,.18)!important;color:#ef9da4!important}
    .h3s-lora-empty{padding:12px;border:1px dashed var(--h3l-line);border-radius:8px;color:var(--h3l-muted);font-size:9px;line-height:1.45;background:transparent}
    .h3s-lora-status{overflow:hidden;color:var(--h3l-muted);font-size:8.5px;text-overflow:ellipsis;white-space:nowrap}
    .h3s-lora-warning{margin:0;color:var(--h3l-muted);font-size:8.5px;line-height:1.45}
    #${PICKER_ID}{position:fixed;z-index:100000;display:flex;flex-direction:column;width:min(420px,calc(100vw - 16px));max-width:calc(100vw - 16px);max-height:min(390px,calc(100vh - 16px));overflow:hidden;border:1px solid color-mix(in srgb,var(--border-color,#3e454b) 88%,white 5%);border-radius:10px;background:var(--comfy-menu-bg,#171b1f);color:var(--input-text,#eef0f2);box-shadow:0 18px 55px rgba(0,0,0,.46);font:10px/1.3 Inter,ui-sans-serif,system-ui;contain:layout paint}
    .h3lp-head{display:flex;align-items:center;gap:7px;padding:8px;border-bottom:1px solid color-mix(in srgb,var(--border-color,#343a40) 74%,transparent);background:color-mix(in srgb,var(--comfy-menu-bg,#171b1f) 90%,white 3%)}
    .h3lp-search-wrap{position:relative;display:flex;align-items:center;width:100%}
    .h3lp-search-icon{position:absolute;left:9px;display:grid;place-items:center;color:#7f8992;pointer-events:none}
    .h3lp-search{width:100%;height:32px;padding:6px 30px 6px 30px;border:1px solid color-mix(in srgb,var(--border-color,#343b41) 88%,white 4%);border-radius:7px;outline:none;background:var(--comfy-input-bg,#111519);color:var(--input-text,#f3f4f5);font:10px/1.2 Inter,ui-sans-serif,system-ui}
    .h3lp-search:focus{border-color:#64717c;box-shadow:0 0 0 2px rgba(129,145,159,.1)}
    .h3lp-search::-webkit-search-cancel-button{opacity:.62}
    .h3lp-list{flex:1 1 auto;min-height:0;max-height:310px;overflow:auto;padding:6px;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#4b535a transparent}
    .h3lp-list::-webkit-scrollbar{width:8px;height:8px}
    .h3lp-list::-webkit-scrollbar-track{background:transparent}
    .h3lp-list::-webkit-scrollbar-thumb{background:#454e55;border:2px solid var(--comfy-menu-bg,#171b1f);border-radius:999px}
    .h3lp-list::-webkit-scrollbar-thumb:hover{background:#5a646c}
    .h3lp-section+.h3lp-section{margin-top:7px;padding-top:7px;border-top:1px solid color-mix(in srgb,var(--border-color,#343a40) 62%,transparent)}
    .h3lp-section-title{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 6px 5px;color:#8c969e;font:700 8px/1.1 Inter,ui-sans-serif,system-ui;text-transform:uppercase;letter-spacing:.08em}
    .h3lp-entry{display:grid;grid-template-columns:minmax(0,1fr) 31px;align-items:stretch;width:100%;min-height:39px;border-radius:7px;background:transparent}
    .h3lp-entry:hover{background:color-mix(in srgb,var(--comfy-input-bg,#20262b) 78%,white 5%)}
    .h3lp-entry.is-current{background:color-mix(in srgb,var(--comfy-input-bg,#20262b) 82%,white 7%);box-shadow:inset 2px 0 0 #778591}
    .h3lp-select{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;width:100%;min-height:39px;padding:7px 7px 7px 9px;border:0;border-radius:7px 0 0 7px;background:transparent;color:#dfe3e6;cursor:pointer;text-align:left;font:inherit}
    .h3lp-select:hover,.h3lp-select:focus-visible{outline:0;color:#fff}
    .h3lp-select:disabled{opacity:.42;cursor:not-allowed}
    .h3lp-copy{display:flex;flex-direction:column;gap:2px;min-width:0}
    .h3lp-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:9.5px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace}
    .h3lp-meta{display:flex;gap:6px;align-items:center;min-width:0;color:#7f8992;font-size:7.8px}
    .h3lp-meta span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .h3lp-badge{flex:none;padding:1px 4px;border:1px solid color-mix(in srgb,var(--border-color,#3e454b) 70%,transparent);border-radius:4px;color:#9099a1;font-size:7px}
    .h3lp-size{align-self:center;flex:none;color:#7f8992;font-size:8px;white-space:nowrap}
    .h3lp-star{display:grid;place-items:center;width:31px;min-height:39px;padding:0;border:0;border-left:1px solid transparent;border-radius:0 7px 7px 0;background:transparent;color:#68737c;cursor:pointer}
    .h3lp-entry:hover .h3lp-star{border-left-color:color-mix(in srgb,var(--border-color,#343a40) 50%,transparent)}
    .h3lp-star:hover{color:#d8b65c}
    .h3lp-star.is-favorite{color:#d8b65c}
    .h3lp-empty{padding:22px 12px;color:#7f8992;text-align:center;font-size:9px}
    .h3lp-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 9px;border-top:1px solid color-mix(in srgb,var(--border-color,#343a40) 70%,transparent);color:#727d85;font-size:7.8px;background:color-mix(in srgb,var(--comfy-menu-bg,#171b1f) 92%,black 4%)}
    @media(max-width:520px){.h3s-lora-subrow{grid-template-columns:1fr}.h3s-lora-order-field{width:100%}.h3s-lora-order{width:70px}.h3s-lora-field-label{justify-content:flex-start}.h3s-lora-field-hint{margin-left:auto}}
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

function iconButton(icon, title, click, className = "") {
  const value = document.createElement("button");
  value.type = "button";
  value.className = `h3s-lora-icon-button ${className}`.trim();
  value.innerHTML = icon;
  value.title = title;
  value.setAttribute("aria-label", title);
  value.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    click(event);
  });
  return value;
}

function button(label, title, click, { icon = "", className = "" } = {}) {
  const value = document.createElement("button");
  value.type = "button";
  value.className = `h3s-lora-button ${className}`.trim();
  value.innerHTML = `${icon}<span>${label}</span>`;
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
  const searchWrap = document.createElement("div");
  searchWrap.className = "h3lp-search-wrap";
  const searchIcon = document.createElement("span");
  searchIcon.className = "h3lp-search-icon";
  searchIcon.innerHTML = ICONS.search;
  const search = document.createElement("input");
  search.className = "h3lp-search";
  search.type = "search";
  search.placeholder = "Search installed LoRAs…";
  search.autocomplete = "off";
  search.spellcheck = false;
  searchWrap.append(searchIcon, search);
  head.append(searchWrap);

  const list = document.createElement("div");
  list.className = "h3lp-list";
  const footer = document.createElement("div");
  footer.className = "h3lp-footer";
  panel.append(head, list, footer);
  document.body.append(panel);

  const place = () => {
    if (!anchor?.isConnected || !panel.isConnected) {
      closePicker();
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewLeft = viewport?.offsetLeft || 0;
    const viewTop = viewport?.offsetTop || 0;
    const viewWidth = viewport?.width || window.innerWidth;
    const viewHeight = viewport?.height || window.innerHeight;
    const margin = 8;
    const maxWidth = Math.max(240, viewWidth - margin * 2);
    const width = Math.min(420, Math.max(300, rect.width + 80), maxWidth);
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${Math.max(180, viewHeight - margin * 2)}px`;

    const measuredHeight = Math.min(panel.getBoundingClientRect().height || 360, viewHeight - margin * 2);
    const availableBelow = viewTop + viewHeight - rect.bottom - margin;
    const availableAbove = rect.top - viewTop - margin;
    const preferBelow = availableBelow >= Math.min(260, measuredHeight) || availableBelow >= availableAbove;
    const rawTop = preferBelow ? rect.bottom + 6 : rect.top - measuredHeight - 6;
    const top = Math.max(viewTop + margin, Math.min(viewTop + viewHeight - measuredHeight - margin, rawTop));
    const left = Math.max(viewLeft + margin, Math.min(viewLeft + viewWidth - width - margin, rect.left));

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  };

  const makeEntry = (entry) => {
    const entryRoot = document.createElement("div");
    const current = entry.name === selected;
    const unavailable = used.has(entry.name) && !current;
    entryRoot.className = `h3lp-entry${current ? " is-current" : ""}`;

    const select = document.createElement("button");
    select.type = "button";
    select.className = "h3lp-select";
    select.disabled = unavailable;
    select.title = unavailable ? `${entry.name} is already in this stack` : entry.name;

    const copy = document.createElement("span");
    copy.className = "h3lp-copy";
    const name = document.createElement("span");
    name.className = "h3lp-name";
    name.textContent = shortName(entry.name);
    const meta = document.createElement("span");
    meta.className = "h3lp-meta";

    const normalized = String(entry.name).replaceAll("\\", "/");
    const slash = normalized.lastIndexOf("/");
    if (slash > 0) {
      const path = document.createElement("span");
      path.textContent = normalized.slice(0, slash);
      meta.append(path);
    }
    if (current) {
      const badge = document.createElement("span");
      badge.className = "h3lp-badge";
      badge.textContent = "Current";
      meta.append(badge);
    } else if (unavailable) {
      const badge = document.createElement("span");
      badge.className = "h3lp-badge";
      badge.textContent = "In stack";
      meta.append(badge);
    }
    copy.append(name);
    if (meta.childNodes.length) copy.append(meta);

    const size = document.createElement("span");
    size.className = "h3lp-size";
    size.textContent = formatSize(entry.size_bytes);
    select.append(copy, size);
    select.addEventListener("click", () => {
      if (select.disabled) return;
      onSelect(entry.name);
      closePicker();
    });

    const star = document.createElement("button");
    star.type = "button";
    star.className = `h3lp-star${isFavorite(entry.name) ? " is-favorite" : ""}`;
    star.innerHTML = ICONS.star;
    star.title = isFavorite(entry.name) ? "Remove from favorites" : "Add to favorites";
    star.setAttribute("aria-label", star.title);
    star.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(entry.name);
      render();
    });

    entryRoot.append(select, star);
    return entryRoot;
  };

  const addSection = (title, entries) => {
    if (!entries.length) return;
    const section = document.createElement("section");
    section.className = "h3lp-section";
    const heading = document.createElement("div");
    heading.className = "h3lp-section-title";
    const label = document.createElement("span");
    label.textContent = title;
    const count = document.createElement("span");
    count.textContent = String(entries.length);
    heading.append(label, count);
    section.append(heading);
    entries.forEach((entry) => section.append(makeEntry(entry)));
    list.append(section);
  };

  const render = () => {
    const query = search.value.trim().toLowerCase();
    list.replaceChildren();

    const matches = catalog.filter((entry) => {
      if (!query) return true;
      const name = String(entry.name || "").toLowerCase();
      return name.includes(query) || shortName(name).includes(query);
    });

    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "h3lp-empty";
      empty.textContent = catalog.length ? "No matching LoRAs" : "No installed LoRAs found";
      list.append(empty);
    } else {
      const favoriteEntries = matches.filter((entry) => isFavorite(entry.name));
      const otherEntries = matches.filter((entry) => !isFavorite(entry.name));
      addSection("Favorites", favoriteEntries);
      addSection(favoriteEntries.length ? "All LoRAs" : "Installed LoRAs", otherEntries);
    }

    const visibleFavorites = catalog.filter((entry) => isFavorite(entry.name)).length;
    footer.innerHTML = `<span>${catalog.length} installed</span><span>${visibleFavorites} favorite${visibleFavorites === 1 ? "" : "s"}</span>`;
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
      list.querySelector(".h3lp-select:not(:disabled)")?.focus();
    }
  };
  const reposition = () => place();
  search.addEventListener("input", render);
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", keys, true);
  window.addEventListener("resize", reposition, { passive: true });
  window.addEventListener("scroll", reposition, { passive: true, capture: true });
  window.visualViewport?.addEventListener("resize", reposition, { passive: true });
  window.visualViewport?.addEventListener("scroll", reposition, { passive: true });

  activePickerCleanup = () => {
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", keys, true);
    window.removeEventListener("resize", reposition);
    window.removeEventListener("scroll", reposition, true);
    window.visualViewport?.removeEventListener("resize", reposition);
    window.visualViewport?.removeEventListener("scroll", reposition);
  };

  render();
  requestAnimationFrame(() => {
    place();
    search.focus({ preventScroll: true });
  });
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
  arrow.className = "h3lp-trigger-icon";
  arrow.innerHTML = ICONS.chevron;
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
  range.setAttribute("aria-label", "LoRA strength");

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

  const patch = (value) => {
    stack[index] = { ...stack[index], ...value };
    saveStack(node, state, stack);
    rerender();
  };

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

  const favorite = iconButton(ICONS.star, isFavorite(item.name) ? "Remove from favorites" : "Add to favorites", () => {
    if (!item.name) return;
    toggleFavorite(item.name);
    rerender();
  }, `h3s-lora-favorite${isFavorite(item.name) ? " is-favorite" : ""}`);
  favorite.disabled = !item.name;

  head.append(enabled, pickerTrigger(item, index, stack, patch), favorite);

  const subrow = document.createElement("div");
  subrow.className = "h3s-lora-subrow";

  const strengthField = document.createElement("div");
  strengthField.className = "h3s-lora-field";

  const strengthLabel = document.createElement("div");
  strengthLabel.className = "h3s-lora-field-label";
  const strengthText = document.createElement("span");
  strengthText.textContent = "Strength";
  const strengthHint = document.createElement("span");
  strengthHint.className = "h3s-lora-field-hint";
  strengthHint.textContent = `${MIN_STRENGTH} to ${MAX_STRENGTH}`;
  strengthLabel.append(strengthText, strengthHint);

  const strengthLine = document.createElement("div");
  strengthLine.className = "h3s-lora-strength-line";
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
  strengthLine.append(strength, number);
  strengthField.append(strengthLabel, strengthLine);

  const orderField = document.createElement("div");
  orderField.className = "h3s-lora-field h3s-lora-order-field";
  const orderLabel = document.createElement("div");
  orderLabel.className = "h3s-lora-field-label";
  const orderText = document.createElement("span");
  orderText.textContent = "Order";
  orderLabel.append(orderText);

  const order = document.createElement("div");
  order.className = "h3s-lora-order";
  const up = iconButton(ICONS.chevronUp, "Move LoRA earlier", () => {
    if (index <= 0) return;
    [stack[index - 1], stack[index]] = [stack[index], stack[index - 1]];
    saveStack(node, state, stack);
    rerender();
  });
  const down = iconButton(ICONS.chevronDown, "Move LoRA later", () => {
    if (index >= stack.length - 1) return;
    [stack[index + 1], stack[index]] = [stack[index], stack[index + 1]];
    saveStack(node, state, stack);
    rerender();
  });
  up.disabled = index === 0;
  down.disabled = index === stack.length - 1;
  order.append(up, down);
  orderField.append(orderLabel, order);

  subrow.append(strengthField, orderField);
  main.append(head, subrow);

  const remove = iconButton(ICONS.remove, "Remove LoRA", () => {
    closePicker();
    stack.splice(index, 1);
    saveStack(node, state, stack);
    rerender();
  }, "h3s-lora-remove");

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
  warning.textContent = "Speed already applies LightX/PDD acceleration. Add only compatible custom H3 LoRAs here; stack order is applied top to bottom.";

  const stackRoot = document.createElement("div");
  stackRoot.className = "h3s-lora-stack";
  const rerender = () => installLoraSection(node, true);

  if (!stack.length) {
    const empty = document.createElement("div");
    empty.className = "h3s-lora-empty";
    empty.textContent = "No custom LoRAs. Add one when you want an extra style, character or detail adapter.";
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

  const refresh = button("Refresh", "Refresh installed LoRAs", async () => {
    refresh.disabled = true;
    catalogStatus.textContent = "Refreshing…";
    try {
      await loadCatalog(true);
      favorites = loadFavorites();
      node.__h3studioLoraCatalogError = "";
      rerender();
    } catch (error) {
      node.__h3studioLoraCatalogError = String(error?.message || error);
      catalogStatus.textContent = node.__h3studioLoraCatalogError;
      refresh.disabled = false;
    }
  }, { icon: ICONS.refresh });

  const add = button("Add LoRA", "Choose an installed custom LoRA", (event) => {
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
  }, { icon: ICONS.plus });

  add.disabled = stack.length >= MAX_CUSTOM_LORAS;
  toolbarActions.append(refresh, add);
  toolbar.append(catalogStatus, toolbarActions);

  body.append(warning, stackRoot, toolbar);
  section.append(header, body);
  return section;
}

function sectionHost(panel) {
  return panel?.querySelector?.(".h3s-v6-inspector, .h3s-v7-inspector, .h3s-inspector") || panel;
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
