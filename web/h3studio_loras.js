import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { applyState, stateFromNode } from "./js/studio_extension.js";

const TARGET = "H3StudioDirector";
const MAX_CUSTOM_LORAS = 6;
const MIN_STRENGTH = 0;
const MAX_STRENGTH = 3;
const STRENGTH_STEP = 0.05;
const CATALOG_URL = "/h3studio/loras";
const STYLE_ID = "h3studio-custom-loras-style-v4";
const PICKER_ID = "h3studio-lora-picker";
const FAVORITES_KEY = "h3studio.customLoraFavorites.v1";
const STRENGTHS_KEY = "h3studio.customLoraStrengths.v1";
const MAX_SAVED_STRENGTHS = 256;
const UI_VERSION = "native-v4";

const ICONS = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m15.5 15.5 4.5 4.5"></path></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.75 5.57 6.15.9-4.45 4.34 1.05 6.13L12 17.05l-5.5 2.89 1.05-6.13L3.1 9.47l6.15-.9L12 3Z"></path></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"></path></svg>',
  remove: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"></path></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8a7 7 0 1 0 1 5"></path><path d="M19 3v5h-5"></path></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
};

let catalog = [];
let catalogPromise = null;
let activePickerCleanup = null;
let favorites = loadFavorites();
let savedStrengths = loadSavedStrengths();
let strengthSaveTimer = null;

function clamp(value, min, max, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeLoraName(value) {
  return String(value || "").replaceAll("\\", "/").trim();
}

function normalizeStack(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_CUSTOM_LORAS).map((item) => ({
    name: normalizeLoraName(item?.name),
    strength: clamp(item?.strength, MIN_STRENGTH, MAX_STRENGTH, 1),
    enabled: item?.enabled !== false,
  }));
}

function formatStrength(value) {
  return clamp(value, MIN_STRENGTH, MAX_STRENGTH, 1)
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
}

function formatSize(bytes) {
  const value = Number(bytes) || 0;
  if (value <= 0) return "";
  if (value >= 1024 ** 3) return `${(value / (1024 ** 3)).toFixed(2)} GiB`;
  if (value >= 1024 ** 2) return `${(value / (1024 ** 2)).toFixed(0)} MiB`;
  return `${Math.round(value / 1024)} KiB`;
}

function shortName(name) {
  const value = normalizeLoraName(name);
  return value.split("/").pop() || value || "Choose LoRA";
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed)
      ? parsed.map((item) => normalizeLoraName(item)).filter(Boolean)
      : []);
  } catch {
    return new Set();
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites].sort((a, b) => a.localeCompare(b))));
  } catch {
    // Favorites are a browser-local UI preference only.
  }
}

function isFavorite(name) {
  const normalized = normalizeLoraName(name);
  return Boolean(normalized) && favorites.has(normalized);
}

function toggleFavorite(name) {
  const normalized = normalizeLoraName(name);
  if (!normalized) return false;
  if (favorites.has(normalized)) favorites.delete(normalized);
  else favorites.add(normalized);
  saveFavorites();
  return favorites.has(normalized);
}

function loadSavedStrengths() {
  try {
    const raw = localStorage.getItem(STRENGTHS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const source = Array.isArray(parsed?.items)
      ? parsed.items
      : parsed && typeof parsed === "object"
        ? Object.entries(parsed).map(([name, strength]) => ({ name, strength }))
        : [];
    const entries = [];
    for (const item of source) {
      const name = normalizeLoraName(item?.name);
      const number = Number(item?.strength);
      if (!name || !Number.isFinite(number)) continue;
      entries.push([
        name,
        {
          strength: clamp(number, MIN_STRENGTH, MAX_STRENGTH, 1),
          updatedAt: Math.max(0, Number(item?.updated_at || item?.updatedAt) || 0),
        },
      ]);
    }
    entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
    return new Map(entries.slice(0, MAX_SAVED_STRENGTHS));
  } catch {
    return new Map();
  }
}

function saveSavedStrengthsNow() {
  if (strengthSaveTimer) {
    clearTimeout(strengthSaveTimer);
    strengthSaveTimer = null;
  }
  try {
    const items = [...savedStrengths.entries()]
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, MAX_SAVED_STRENGTHS)
      .map(([name, value]) => ({
        name,
        strength: clamp(value.strength, MIN_STRENGTH, MAX_STRENGTH, 1),
        updated_at: Math.max(0, Number(value.updatedAt) || 0),
      }));
    localStorage.setItem(STRENGTHS_KEY, JSON.stringify({ version: 1, items }));
  } catch {
    // Saved strengths are a browser-local convenience only.
  }
}

function scheduleSavedStrengthsWrite() {
  if (strengthSaveTimer) clearTimeout(strengthSaveTimer);
  strengthSaveTimer = setTimeout(saveSavedStrengthsNow, 120);
}

function hasSavedStrength(name) {
  return savedStrengths.has(normalizeLoraName(name));
}

function savedStrengthFor(name, fallback = 1) {
  const entry = savedStrengths.get(normalizeLoraName(name));
  return entry ? clamp(entry.strength, MIN_STRENGTH, MAX_STRENGTH, fallback) : clamp(fallback, MIN_STRENGTH, MAX_STRENGTH, 1);
}

function rememberStrength(name, value, flush = false) {
  const normalized = normalizeLoraName(name);
  if (!normalized) return clamp(value, MIN_STRENGTH, MAX_STRENGTH, 1);
  const strength = clamp(value, MIN_STRENGTH, MAX_STRENGTH, 1);
  savedStrengths.set(normalized, { strength, updatedAt: Date.now() });
  if (savedStrengths.size > MAX_SAVED_STRENGTHS) {
    const oldest = [...savedStrengths.entries()]
      .sort((a, b) => a[1].updatedAt - b[1].updatedAt)
      .slice(0, savedStrengths.size - MAX_SAVED_STRENGTHS);
    oldest.forEach(([key]) => savedStrengths.delete(key));
  }
  if (flush) saveSavedStrengthsNow();
  else scheduleSavedStrengthsWrite();
  return strength;
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (strengthSaveTimer) saveSavedStrengthsNow();
  });
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
  document.getElementById("h3studio-custom-loras-style")?.remove();
  document.getElementById("h3studio-custom-loras-style-v2")?.remove();
  document.getElementById("h3studio-custom-loras-style-v3")?.remove();

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3s-custom-loras,.h3s-custom-loras *{box-sizing:border-box;min-width:0}
    .h3s-custom-loras{--h3l-bg:var(--h3s-bg,#202226);--h3l-surface:var(--h3s-surface,#25282c);--h3l-raised:var(--h3s-raised,#30343a);--h3l-border:var(--h3s-border,rgba(255,255,255,.13));--h3l-text:var(--h3s-text,#eceef2);--h3l-muted:var(--h3s-muted,#9ca3af);--h3l-accent:var(--h3s-accent,#34d3b5)}
    .h3s-lora-stack{display:flex;flex-direction:column;gap:6px;min-width:0}
    .h3s-lora-row{display:grid;grid-template-columns:minmax(0,1fr) 26px;gap:6px;width:100%;max-width:100%;padding:7px;border:1px solid var(--h3l-border);border-radius:6px;background:var(--h3l-bg);overflow:hidden}
    .h3s-lora-row.is-disabled{opacity:.56}.h3s-lora-main{display:flex;flex-direction:column;gap:7px;min-width:0}
    .h3s-lora-head{display:grid;grid-template-columns:22px minmax(0,1fr);gap:6px;align-items:center;min-width:0}
    .h3s-lora-enable{display:grid;place-items:center;width:22px;height:28px;margin:0;cursor:pointer}.h3s-lora-enable input{width:14px;height:14px;margin:0;accent-color:var(--h3l-accent)}
    .h3s-lora-picker-trigger{display:flex;align-items:center;justify-content:space-between;gap:7px;width:100%;height:28px;padding:4px 7px;border:1px solid var(--h3l-border);border-radius:5px;background:var(--h3l-surface);color:var(--h3l-text);cursor:pointer;text-align:left;font:620 9.3px/1.15 Inter,ui-sans-serif,system-ui;overflow:hidden}
    .h3s-lora-picker-trigger:hover{border-color:color-mix(in srgb,var(--h3l-accent) 38%,var(--h3l-border));background:color-mix(in srgb,var(--h3l-surface) 92%,white 8%)}
    .h3s-lora-picker-trigger:focus-visible,.h3s-lora-button:focus-visible,.h3s-lora-icon-button:focus-visible,.h3lp-select:focus-visible,.h3lp-star:focus-visible,.h3lp-search:focus-visible{outline:2px solid color-mix(in srgb,var(--h3l-accent,#34d3b5) 65%,transparent);outline-offset:1px}
    .h3s-lora-picker-copy{display:flex;align-items:center;min-width:0;overflow:hidden}.h3s-lora-file{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.h3lp-trigger-icon{display:grid;place-items:center;flex:none;color:var(--h3l-muted)}
    .h3s-lora-icon-button{display:grid;place-items:center;width:26px;height:26px;padding:0;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--h3l-muted);cursor:pointer}.h3s-lora-icon-button:hover:not(:disabled){border-color:var(--h3l-border);background:var(--h3l-surface);color:var(--h3l-text)}.h3s-lora-icon-button:disabled{opacity:.35;cursor:default}.h3s-lora-remove{align-self:start}.h3s-lora-remove:hover{border-color:color-mix(in srgb,#ff6b6b 45%,var(--h3l-border))!important;background:color-mix(in srgb,#ff6b6b 9%,var(--h3l-bg))!important;color:#ff9a9a!important}
    .h3s-lora-field{display:flex;flex-direction:column;gap:4px;min-width:0}.h3s-lora-field-label{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--h3l-muted);font:600 9px/1.15 Inter,ui-sans-serif,system-ui}.h3s-lora-field-hint{opacity:.72;font-size:8px;font-weight:500;font-variant-numeric:tabular-nums}
    .h3s-lora-strength-line{display:grid;grid-template-columns:minmax(0,1fr) 58px;gap:7px;align-items:center;width:100%;min-width:0}.h3s-lora-strength{position:relative;width:100%;height:20px;min-width:0;overflow:visible}.h3s-lora-strength-track{position:absolute;left:0;right:0;top:50%;height:3px;border-radius:999px;background:var(--h3l-border);transform:translateY(-50%);overflow:hidden;pointer-events:none}.h3s-lora-strength-track::before{content:'';display:block;width:var(--h3l-strength-progress,33.333%);height:100%;background:var(--h3l-accent)}.h3s-lora-strength input[type=range]{position:absolute;inset:0;z-index:1;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}.h3s-lora-strength-thumb{position:absolute;left:var(--h3l-strength-progress,33.333%);top:50%;width:12px;height:12px;border:2px solid var(--h3l-raised);border-radius:50%;background:var(--h3l-accent);box-shadow:0 1px 3px rgba(0,0,0,.35);transform:translate(-50%,-50%);pointer-events:none}
    .h3s-lora-number{width:58px;height:27px;padding:3px 5px;border:1px solid var(--h3l-border);border-radius:5px;background:var(--h3l-surface);color:var(--h3l-text);text-align:center;font:650 9px/1 ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}.h3s-lora-number:focus{outline:none;border-color:color-mix(in srgb,var(--h3l-accent) 48%,var(--h3l-border));box-shadow:0 0 0 1px color-mix(in srgb,var(--h3l-accent) 22%,transparent)}
    .h3s-lora-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;flex-wrap:wrap;padding-top:1px}.h3s-lora-toolbar-actions{display:flex;gap:5px;flex:none}.h3s-lora-button{height:27px;max-width:100%;padding:4px 8px;border:1px solid var(--h3l-border);border-radius:5px;background:var(--h3l-bg);color:var(--h3l-text);cursor:pointer;font:650 9px/1.1 Inter,ui-sans-serif,system-ui;display:inline-flex;align-items:center;justify-content:center;gap:5px}.h3s-lora-button:hover:not(:disabled){border-color:color-mix(in srgb,var(--h3l-accent) 38%,var(--h3l-border));background:var(--h3l-surface)}.h3s-lora-button:disabled{opacity:.35;cursor:default}
    .h3s-lora-button svg,.h3s-lora-icon-button svg,.h3lp-search-icon svg,.h3lp-star svg,.h3lp-trigger-icon svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
    .h3s-lora-empty{padding:11px;border:1px dashed var(--h3l-border);border-radius:6px;color:var(--h3l-muted);font-size:9px;line-height:1.45;background:var(--h3l-bg)}.h3s-lora-status{overflow:hidden;color:var(--h3l-muted);font-size:8.5px;text-overflow:ellipsis;white-space:nowrap}.h3s-lora-warning{margin:0;color:var(--h3l-muted);font-size:8.5px;line-height:1.45}
    #${PICKER_ID}{--h3lp-bg:#202226;--h3lp-surface:#25282c;--h3lp-raised:#30343a;--h3lp-text:#eceef2;--h3lp-muted:#9ca3af;--h3lp-border:rgba(255,255,255,.13);--h3lp-accent:#34d3b5;position:fixed;z-index:1000000;display:flex;flex-direction:column;width:min(430px,calc(100vw - 16px));max-width:calc(100vw - 16px);max-height:min(390px,calc(100vh - 16px));overflow:hidden;border:1px solid var(--h3lp-border);border-radius:8px;background:color-mix(in srgb,var(--h3lp-bg) 97%,black 3%);color:var(--h3lp-text);box-shadow:0 18px 55px rgba(0,0,0,.48);font:10px/1.3 Inter,ui-sans-serif,system-ui;contain:layout paint}
    .h3lp-head{padding:7px;border-bottom:1px solid var(--h3lp-border);background:var(--h3lp-surface)}.h3lp-search-wrap{position:relative;display:flex;align-items:center;width:100%}.h3lp-search-icon{position:absolute;left:8px;display:grid;place-items:center;color:var(--h3lp-muted);pointer-events:none}.h3lp-search{width:100%;height:30px;padding:5px 28px;border:1px solid var(--h3lp-border);border-radius:5px;outline:none;background:var(--h3lp-bg);color:var(--h3lp-text);font:10px/1.2 Inter,ui-sans-serif,system-ui}.h3lp-search:focus{border-color:color-mix(in srgb,var(--h3lp-accent) 48%,var(--h3lp-border));box-shadow:0 0 0 1px color-mix(in srgb,var(--h3lp-accent) 22%,transparent)}
    .h3lp-list{flex:1 1 auto;min-height:0;max-height:310px;overflow:auto;padding:5px;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--h3lp-muted) 52%,transparent) transparent}.h3lp-list::-webkit-scrollbar{width:7px;height:7px}.h3lp-list::-webkit-scrollbar-track{background:transparent}.h3lp-list::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--h3lp-muted) 52%,transparent);border:2px solid color-mix(in srgb,var(--h3lp-bg) 97%,black 3%);border-radius:999px}.h3lp-list::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,var(--h3lp-muted) 72%,transparent)}
    .h3lp-section+.h3lp-section{margin-top:6px;padding-top:6px;border-top:1px solid var(--h3lp-border)}.h3lp-section-title{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 6px 4px;color:var(--h3lp-muted);font:700 8px/1.1 Inter,ui-sans-serif,system-ui;text-transform:uppercase;letter-spacing:.08em}
    .h3lp-entry{display:grid;grid-template-columns:minmax(0,1fr) 40px;align-items:stretch;width:100%;min-height:39px;border-radius:6px;background:transparent;overflow:hidden}.h3lp-entry:hover{background:var(--h3lp-surface)}.h3lp-entry.is-current{background:var(--h3lp-surface);box-shadow:inset 2px 0 0 var(--h3lp-accent)}
    .h3lp-select{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:center;width:100%;min-height:39px;padding:6px 7px 6px 9px;border:0;background:transparent;color:var(--h3lp-text);cursor:pointer;text-align:left;font:inherit}.h3lp-select:hover,.h3lp-select:focus-visible{outline:0;color:var(--h3lp-text)}.h3lp-select:disabled{opacity:.42;cursor:not-allowed}.h3lp-copy{display:flex;flex-direction:column;gap:2px;min-width:0}.h3lp-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:9.4px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace}.h3lp-meta{display:flex;gap:5px;align-items:center;min-width:0;color:var(--h3lp-muted);font-size:7.8px}.h3lp-meta span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.h3lp-badge{flex:none;padding:1px 4px;border:1px solid var(--h3lp-border);border-radius:4px;color:var(--h3lp-muted);font-size:7px}.h3lp-detail{display:flex;align-items:center;justify-content:flex-end;gap:5px;white-space:nowrap}.h3lp-saved-strength{padding:2px 5px;border:1px solid color-mix(in srgb,var(--h3lp-accent) 28%,var(--h3lp-border));border-radius:4px;background:color-mix(in srgb,var(--h3lp-accent) 7%,transparent);color:color-mix(in srgb,var(--h3lp-accent) 68%,var(--h3lp-text));font:700 7.8px/1 ui-monospace,SFMono-Regular,Consolas,monospace}.h3lp-size{align-self:center;flex:none;color:var(--h3lp-muted);font-size:8px;white-space:nowrap}
    .h3lp-star{display:grid;place-items:center;width:40px;min-height:39px;padding:0;border:0;border-left:1px solid var(--h3lp-border);background:transparent;color:var(--h3lp-muted);cursor:pointer}.h3lp-star:hover{background:color-mix(in srgb,#d8b65c 8%,var(--h3lp-surface));color:#e2bf61}.h3lp-star.is-favorite{background:color-mix(in srgb,#d8b65c 9%,var(--h3lp-bg));color:#d8b65c}.h3lp-star.is-favorite svg{fill:currentColor;stroke:currentColor}
    .h3lp-empty{padding:21px 12px;color:var(--h3lp-muted);text-align:center;font-size:9px}.h3lp-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 9px;border-top:1px solid var(--h3lp-border);color:var(--h3lp-muted);font-size:7.8px;background:var(--h3lp-surface)}
    @media(max-width:420px){.h3s-lora-row{grid-template-columns:minmax(0,1fr) 24px}.h3s-lora-strength-line{grid-template-columns:minmax(0,1fr) 54px}.h3s-lora-number{width:54px}.h3lp-detail{gap:3px}.h3lp-size{display:none}}
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

function copyDirectorTheme(panel, anchor) {
  const director = anchor?.closest?.(".h3s-studio-panel");
  if (!director || typeof getComputedStyle !== "function") return;
  const styles = getComputedStyle(director);
  const copy = (pickerName, directorName, fallback) => {
    panel.style.setProperty(pickerName, styles.getPropertyValue(directorName).trim() || fallback);
  };
  copy("--h3lp-bg", "--h3s-bg", "#202226");
  copy("--h3lp-surface", "--h3s-surface", "#25282c");
  copy("--h3lp-raised", "--h3s-raised", "#30343a");
  copy("--h3lp-text", "--h3s-text", "#eceef2");
  copy("--h3lp-muted", "--h3s-muted", "#9ca3af");
  copy("--h3lp-border", "--h3s-border", "rgba(255,255,255,.13)");
  copy("--h3lp-accent", "--h3s-accent", "#34d3b5");
}

function openPicker(anchor, { selected = "", used = new Set(), onSelect }) {
  closePicker();

  const panel = document.createElement("div");
  panel.id = PICKER_ID;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Choose installed LoRA");
  copyDirectorTheme(panel, anchor);

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
    copyDirectorTheme(panel, anchor);
    const rect = anchor.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewLeft = viewport?.offsetLeft || 0;
    const viewTop = viewport?.offsetTop || 0;
    const viewWidth = viewport?.width || window.innerWidth;
    const viewHeight = viewport?.height || window.innerHeight;
    const margin = 8;
    const maxWidth = Math.max(240, viewWidth - margin * 2);
    const width = Math.min(430, Math.max(300, rect.width + 80), maxWidth);
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${Math.max(180, viewHeight - margin * 2)}px`;

    const measuredHeight = Math.min(panel.getBoundingClientRect().height || 370, viewHeight - margin * 2);
    const availableBelow = viewTop + viewHeight - rect.bottom - margin;
    const availableAbove = rect.top - viewTop - margin;
    const preferBelow = availableBelow >= Math.min(260, measuredHeight) || availableBelow >= availableAbove;
    const rawTop = preferBelow ? rect.bottom + 5 : rect.top - measuredHeight - 5;
    const top = Math.max(viewTop + margin, Math.min(viewTop + viewHeight - measuredHeight - margin, rawTop));
    const left = Math.max(viewLeft + margin, Math.min(viewLeft + viewWidth - width - margin, rect.left));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  };

  const makeEntry = (entry, rerender) => {
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
    const normalized = normalizeLoraName(entry.name);
    const slash = normalized.lastIndexOf("/");
    if (slash > 0) {
      const path = document.createElement("span");
      path.textContent = normalized.slice(0, slash);
      meta.append(path);
    }
    if (current || unavailable) {
      const badge = document.createElement("span");
      badge.className = "h3lp-badge";
      badge.textContent = current ? "Current" : "In stack";
      meta.append(badge);
    }
    copy.append(name);
    if (meta.childNodes.length) copy.append(meta);

    const detail = document.createElement("span");
    detail.className = "h3lp-detail";
    if (hasSavedStrength(entry.name)) {
      const saved = document.createElement("span");
      const savedValue = savedStrengthFor(entry.name);
      saved.className = "h3lp-saved-strength";
      saved.textContent = `${formatStrength(savedValue)}×`;
      saved.title = `Saved strength: ${formatStrength(savedValue)}`;
      detail.append(saved);
    }
    const size = document.createElement("span");
    size.className = "h3lp-size";
    size.textContent = formatSize(entry.size_bytes);
    if (size.textContent) detail.append(size);
    select.append(copy, detail);
    select.addEventListener("click", () => {
      if (select.disabled) return;
      onSelect(entry.name, savedStrengthFor(entry.name, 1));
      closePicker();
    });

    const favoriteNow = isFavorite(entry.name);
    const star = document.createElement("button");
    star.type = "button";
    star.className = `h3lp-star${favoriteNow ? " is-favorite" : ""}`;
    star.innerHTML = ICONS.star;
    star.title = favoriteNow ? "Remove from favorites" : "Add to favorites";
    star.setAttribute("aria-label", star.title);
    star.setAttribute("aria-pressed", String(favoriteNow));
    star.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleFavorite(entry.name);
      rerender();
    });

    entryRoot.append(select, star);
    return entryRoot;
  };

  const addSection = (title, entries, rerender) => {
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
    entries.forEach((entry) => section.append(makeEntry(entry, rerender)));
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
      addSection("Favorites", favoriteEntries, render);
      addSection(favoriteEntries.length ? "All LoRAs" : "Installed LoRAs", otherEntries, render);
    }

    const favoriteCount = catalog.filter((entry) => isFavorite(entry.name)).length;
    const savedCount = catalog.filter((entry) => hasSavedStrength(entry.name)).length;
    footer.innerHTML = `<span>${catalog.length} installed</span><span>${favoriteCount} favorite${favoriteCount === 1 ? "" : "s"} · ${savedCount} saved strength${savedCount === 1 ? "" : "s"}</span>`;
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
      onSelect: (name, strength) => onChange({ name, strength }),
    });
  });
  return trigger;
}

function strengthControl(item, onPreview, onCommit) {
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

  const paint = (raw) => {
    const value = clamp(raw, MIN_STRENGTH, MAX_STRENGTH, 1);
    const progress = ((value - MIN_STRENGTH) / (MAX_STRENGTH - MIN_STRENGTH)) * 100;
    range.value = String(value);
    wrap.style.setProperty("--h3l-strength-progress", `${progress}%`);
    return value;
  };

  range.addEventListener("input", () => onPreview?.(paint(range.value)));
  range.addEventListener("change", () => onCommit?.(paint(range.value)));
  wrap.append(track, thumb, range);
  paint(item.strength);
  return { element: wrap, setValue: paint };
}

function row(node, state, stack, item, index, rerender) {
  const root = document.createElement("div");
  root.className = `h3s-lora-row${item.enabled ? "" : " is-disabled"}`;
  const main = document.createElement("div");
  main.className = "h3s-lora-main";

  const patch = (value, shouldRerender = true) => {
    stack[index] = { ...stack[index], ...value };
    saveStack(node, state, stack);
    if (shouldRerender) rerender();
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
  checkbox.addEventListener("change", () => patch({ enabled: checkbox.checked }));
  enabled.append(checkbox);
  head.append(enabled, pickerTrigger(item, index, stack, (value) => patch(value)));

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
  const number = document.createElement("input");
  number.className = "h3s-lora-number";
  number.type = "number";
  number.min = String(MIN_STRENGTH);
  number.max = String(MAX_STRENGTH);
  number.step = String(STRENGTH_STEP);
  number.value = formatStrength(item.strength);
  number.setAttribute("aria-label", `LoRA ${index + 1} strength`);

  let slider;
  const previewStrength = (value) => {
    stack[index] = { ...stack[index], strength: value };
    number.value = formatStrength(value);
    rememberStrength(item.name, value, false);
  };
  const commitStrength = (value) => {
    number.value = formatStrength(value);
    rememberStrength(item.name, value, true);
    patch({ strength: value }, false);
  };
  slider = strengthControl(item, previewStrength, commitStrength);
  number.addEventListener("input", () => {
    const value = clamp(number.value, MIN_STRENGTH, MAX_STRENGTH, item.strength);
    stack[index] = { ...stack[index], strength: value };
    slider.setValue(value);
    rememberStrength(item.name, value, false);
  });
  number.addEventListener("change", () => {
    const value = clamp(number.value, MIN_STRENGTH, MAX_STRENGTH, item.strength);
    number.value = formatStrength(value);
    slider.setValue(value);
    rememberStrength(item.name, value, true);
    patch({ strength: value }, false);
  });
  strengthLine.append(slider.element, number);
  strengthField.append(strengthLabel, strengthLine);
  main.append(head, strengthField);

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
  section.dataset.h3studioLoraUi = UI_VERSION;

  const header = document.createElement("div");
  header.className = "h3s-section-header";
  const title = document.createElement("span");
  title.className = "h3s-section-title";
  title.textContent = "Custom LoRAs";
  const status = document.createElement("span");
  status.className = "h3s-status-pill";
  status.textContent = `${stack.filter((entry) => entry.enabled && entry.name).length}/${MAX_CUSTOM_LORAS} active`;
  header.append(title, status);

  const body = document.createElement("div");
  body.className = "h3s-section-stack";
  const warning = document.createElement("p");
  warning.className = "h3s-lora-warning";
  warning.textContent = "Speed already applies LightX/PDD acceleration. Add only compatible custom H3 LoRAs here.";

  const stackRoot = document.createElement("div");
  stackRoot.className = "h3s-lora-stack";
  const rerender = () => installLoraSection(node, true);
  if (!stack.length) {
    const empty = document.createElement("div");
    empty.className = "h3s-lora-empty";
    empty.textContent = "No custom LoRAs. Add one when you want an extra style, character or detail adapter.";
    stackRoot.append(empty);
  } else {
    stack.forEach((entry, index) => stackRoot.append(row(node, state, stack, entry, index, rerender)));
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
      savedStrengths = loadSavedStrengths();
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
    const used = new Set(stack.map((entry) => entry.name).filter(Boolean));
    openPicker(event.currentTarget, {
      used,
      onSelect: (name, strength) => {
        stack.push({ name, strength, enabled: true });
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

function authoritativeSection(panel) {
  return panel?.querySelector?.(`.h3s-custom-loras[data-h3studio-lora-ui="${UI_VERSION}"]`) || null;
}

function installLoraSection(node, replace = false) {
  const panel = node?.__h3studioPanel;
  if (!panel?.isConnected) return;
  installStyles();

  const sections = [...panel.querySelectorAll(".h3s-custom-loras")];
  const authoritative = authoritativeSection(panel);
  if (authoritative && !replace) {
    sections.filter((section) => section !== authoritative).forEach((section) => section.remove());
    return;
  }

  closePicker();
  const next = buildSection(node);
  const existing = authoritative || sections[0] || null;
  if (existing) {
    existing.replaceWith(next);
  } else {
    const host = sectionHost(panel);
    const advanced = [...host.children].find((child) => child.querySelector?.(".h3s-advanced-toggle"));
    host.insertBefore(next, advanced || null);
  }

  for (const duplicate of sections) {
    if (duplicate !== existing && duplicate.isConnected) duplicate.remove();
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
    installLoraSection(node, true);

    const observer = new MutationObserver(() => {
      if (!authoritativeSection(panel)) installLoraSection(node, true);
    });
    observer.observe(panel, { childList: true, subtree: true });
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
