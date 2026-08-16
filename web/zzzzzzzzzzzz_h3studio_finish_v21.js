import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { applyState, renderPanel } from "./js/studio_extension.js";
import { isNodeDownstream } from "./js/core/final_output.js";
import { fetchStudioPngMetadata } from "./js/features/png_metadata.js";

const TARGET = "H3StudioDirector";
const HISTORY_KEY = "h3studio-history-v2";
const HISTORY_BACKUP_KEY = "h3studio-history-v18-unbounded";
const LINKS_PROPERTY = "h3studio_virtual_media_links";
const STYLE_ID = "h3studio-finish-v21-style";

function parseList(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function canonicalUrl(value) {
  try {
    const url = new URL(String(value || ""), location.href);
    url.searchParams.delete("rand");
    url.searchParams.delete("preview");
    if (url.pathname === "/view") {
      const filename = url.searchParams.get("filename") || "";
      const subfolder = url.searchParams.get("subfolder") || "";
      const type = url.searchParams.get("type") || "output";
      return `/view?${new URLSearchParams({ filename, subfolder, type }).toString()}`;
    }
    return `${url.pathname}${url.search ? `?${url.searchParams.toString()}` : ""}`;
  } catch {
    return String(value || "").replace(/[?&](?:rand|preview)=[^&]*/g, "");
  }
}

function rawHistoryItems() {
  const map = new Map();
  for (const item of [
    ...parseList(localStorage.getItem(HISTORY_KEY)),
    ...parseList(localStorage.getItem(HISTORY_BACKUP_KEY)),
  ]) {
    const id = String(item?.id || "");
    if (id && !map.has(id)) map.set(id, item);
  }
  return [...map.values()];
}

function historyItemForCard(card) {
  const id = String(card?.dataset?.demoId || "");
  const items = rawHistoryItems();
  const exact = items.find((item) => String(item?.id || "") === id);
  if (exact) return exact;
  const image = card?.querySelector?.("img.h3s-demo-thumb");
  const wanted = canonicalUrl(image?.dataset?.fullSrc || image?.src || "");
  return wanted ? items.find((item) => canonicalUrl(item?.url || item?.image) === wanted) || null : null;
}

function historyUrlForCard(card, item = null) {
  const image = card?.querySelector?.("img.h3s-demo-thumb");
  for (const candidate of [item?.url, item?.image, image?.dataset?.fullSrc, image?.currentSrc, image?.src]) {
    const value = String(candidate || "").trim();
    if (!value || value.includes("/h3studio/thumbnail?")) continue;
    return value;
  }
  return "";
}

function plainFilename(value) {
  const candidate = typeof value === "object" ? value?.filename || value?.name : value;
  const text = String(candidate || "").trim().replace(/ \[(input|output|temp)\]$/i, "");
  if (!text || /^(data:|blob:|https?:)/i.test(text)) return "";
  return text.split(/[\\/]/).pop() || "";
}

function sourceFilename(source) {
  for (const widget of source?.widgets || []) {
    const filename = plainFilename(widget?.value);
    if (/\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(filename)) return filename;
  }
  return plainFilename(source?.properties?.filename);
}

function liveSourceFor(reference, node) {
  const requested = Number(reference?.source_node_id);
  if (Number.isFinite(requested)) {
    const exact = app.graph?.getNodeById?.(requested);
    if (exact) return exact;
  }
  const wanted = plainFilename(reference?.storage_name || reference?.filename);
  if (!wanted) return null;
  for (const source of app.graph?._nodes || []) {
    if (source === node) continue;
    if (sourceFilename(source) === wanted) return source;
  }
  return null;
}

function setPromptSurfaces(node, text) {
  const value = String(text || "");
  node.properties ||= {};
  node.properties.h3_prompt_doc = null;
  const widget = node.widgets?.find((entry) => entry.name === "prompt");
  if (widget) {
    widget.value = value;
    if (widget._state) widget._state.value = value;
  }
  try { node.__h3sDomWidget?.setValue?.(value); } catch {}
  if (node.__h3sEditor) {
    try {
      node.__h3sEditor.textContent = value;
      node.__h3sEditor.dispatchEvent(new Event("input", { bubbles: true }));
    } catch {}
  }
}

function toast(severity, summary, detail) {
  app.extensionManager?.toast?.add?.({ severity, summary, detail, life: 5500 });
}

function highlightRestored(card, item) {
  const shelf = card.closest(".h3s-demos-shelf");
  if (!shelf) return;
  shelf.dataset.selectedId = String(item?.id || card.dataset.demoId || "");
  for (const sibling of shelf.querySelectorAll(".h3s-demo-card[data-kind='history']")) {
    const selected = sibling === card;
    sibling.classList.toggle("is-selected", selected);
    const label = sibling.querySelector(".h3s-demo-apply-btn");
    if (label) label.textContent = selected ? "Restored ✓" : "Restore →";
  }
}

async function restoreHistoryCard(card) {
  const shelf = card.closest(".h3s-demos-shelf");
  const node = app.graph?.getNodeById?.(Number(shelf?.dataset?.directorId));
  if (!node || node.comfyClass !== TARGET) return;

  const item = historyItemForCard(card);
  const imageUrl = historyUrlForCard(card, item);
  let metadata = null;
  if (imageUrl) {
    try {
      metadata = await fetchStudioPngMetadata(imageUrl);
    } catch (error) {
      console.warn("[H3 Studio] Could not read history PNG metadata; using cached state:", error);
    }
  }
  const sourceState = metadata?.state || item?.state;
  if (!sourceState || typeof sourceState !== "object") {
    throw new Error("History image contains no restorable H3 Studio metadata.");
  }

  const next = clone(sourceState);
  next.ui = { ...(next.ui || {}), director_node_id: String(node.id) };
  const references = Array.isArray(next.references) ? next.references : [];
  const links = [];
  const unresolved = [];
  next.references = references.map((saved, index) => {
    const reference = { ...saved, ordinal: index + 1 };
    const source = liveSourceFor(reference, node);
    if (source) {
      const sourceSlot = Math.max(0, Number(reference.source_slot) || 0);
      reference.source_node_id = String(source.id);
      reference.source_slot = sourceSlot;
      links.push({ source_id: Number(source.id), source_slot: sourceSlot, media_type: "image", order: index + 1 });
    } else if (!String(reference.storage_name || "").trim()) {
      unresolved.push(reference.filename || `@Image${index + 1}`);
    }
    return reference;
  });

  node.properties ||= {};
  node.properties[LINKS_PROPERTY] = links;
  setPromptSurfaces(node, next.prompt);
  applyState(node, next, true);
  node.__h3studioFaceRefineTelemetry = null;
  try { renderPanel(node); } catch (error) { console.warn("[H3 Studio] history restore render error:", error); }
  app.graph?.setDirtyCanvas?.(true, true);
  highlightRestored(card, item || { id: card.dataset.demoId });

  if (unresolved.length) {
    toast("warn", "History restored", `State restored from PNG metadata. Reconnect only: ${unresolved.join(", ")}.`);
  } else {
    toast("success", "History restored", references.length ? `Restored state and ${references.length} saved reference${references.length === 1 ? "" : "s"}.` : "Restored saved Director state.");
  }
}

function installHistoryRestoreCapture() {
  if (window.__h3sV21HistoryCapture) return;
  window.__h3sV21HistoryCapture = true;
  window.addEventListener("click", (event) => {
    if (event.target?.closest?.(".h3s-strip-expand,.h3s-history-favorite")) return;
    const card = event.target?.closest?.(".h3s-demo-card[data-kind='history']");
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    restoreHistoryCard(card).catch((error) => {
      console.error("[H3 Studio] history metadata restore failed:", error);
      toast("error", "Could not restore history", String(error?.message || error));
    });
  }, true);
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3s-strip-expand{left:6px!important;right:auto!important;top:auto!important;bottom:6px!important;width:18px!important;height:18px!important;padding:2px!important;border:0!important;border-radius:4px!important;background:transparent!important;box-shadow:none!important;backdrop-filter:none!important;color:rgba(244,247,249,.72)!important;opacity:0!important;transform:none!important;transition:opacity .12s ease,background .12s ease!important}
    .h3s-strip-expand svg{display:block;width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.35;stroke-linecap:round;stroke-linejoin:round}
    .h3s-demo-card:hover .h3s-strip-expand,.h3s-strip-expand:focus-visible{opacity:.58!important}
    .h3s-strip-expand:hover{opacity:1!important;background:rgba(7,10,12,.46)!important}
  `;
  document.head.append(style);
}

const expandSvg = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3H3v3M10 3h3v3M6 13H3v-3M10 13h3v-3"/></svg>`;
function polishExpandButtons() {
  for (const button of document.querySelectorAll(".h3s-strip-expand")) {
    if (button.dataset.v21 === "1") continue;
    button.dataset.v21 = "1";
    button.innerHTML = expandSvg;
    button.title = "Open image";
    button.setAttribute("aria-label", "Open image");
  }
}

const previewRuns = new Map();
function previewRecord(nodeId) {
  const key = String(nodeId || "");
  if (!previewRuns.has(key)) previewRuns.set(key, { lastElapsed: null, lastStep: null, perStep: [], sampling: null });
  return previewRuns.get(key);
}
api.addEventListener("execution_start", () => previewRuns.clear());
api.addEventListener("h3studio-preview", ({ detail }) => {
  if (!detail?.node_id) return;
  const key = String(detail.node_id);
  if (detail.reset) {
    previewRuns.set(key, { lastElapsed: null, lastStep: null, perStep: [], sampling: null });
    return;
  }
  const elapsed = Number(detail.elapsed_seconds);
  const step = Number(detail.step);
  if (!Number.isFinite(elapsed) || !Number.isFinite(step)) return;
  const record = previewRecord(key);
  if (Number.isFinite(record.lastElapsed) && Number.isFinite(record.lastStep) && step > record.lastStep) {
    const perStep = (elapsed - record.lastElapsed) / (step - record.lastStep);
    if (Number.isFinite(perStep) && perStep > 0 && perStep < 300) record.perStep.push(perStep);
  }
  record.lastElapsed = elapsed;
  record.lastStep = step;
});
api.addEventListener("h3studio-preview-timing", ({ detail }) => {
  if (!detail?.node_id) return;
  const seconds = Number(detail.sampling_seconds);
  if (Number.isFinite(seconds) && seconds >= 0) previewRecord(detail.node_id).sampling = seconds;
  setTimeout(applyTimingUi, 0);
});
api.addEventListener("execution_success", () => setTimeout(applyTimingUi, 0));
function directorRecord(node) {
  let fallback = null;
  for (const [previewId, record] of previewRuns.entries()) {
    if (!fallback) fallback = record;
    if (!/^\d+$/.test(previewId)) continue;
    if (isNodeDownstream(app.graph?.links, node.id, Number(previewId))) return record;
  }
  return previewRuns.size === 1 ? fallback : null;
}
function duration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return null;
  if (value < 60) return `${value.toFixed(value < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(value / 60);
  return `${minutes}m ${String(Math.round(value - minutes * 60)).padStart(2, "0")}s`;
}
function applyTimingUi() {
  for (const node of app.graph?._nodes || []) {
    if (node?.comfyClass !== TARGET) continue;
    const record = directorRecord(node);
    if (!record) continue;
    const steady = record.perStep.length ? record.perStep.reduce((sum, value) => sum + value, 0) / record.perStep.length : null;
    node.__h3studioRunTiming ||= {};
    if (Number.isFinite(record.sampling)) node.__h3studioRunTiming.samplingSeconds = record.sampling;
    if (Number.isFinite(steady)) node.__h3studioRunTiming.steadyStepSeconds = steady;
    const panel = node.__h3studioPanel;
    if (!panel?.isConnected) continue;
    for (const card of panel.querySelectorAll(".h3s-run-time")) {
      const label = card.querySelector("b")?.textContent?.trim();
      const value = card.querySelector("span");
      if (!value) continue;
      if (label === "Sampling" && Number.isFinite(record.sampling)) value.textContent = duration(record.sampling) || "—";
      if (label === "Average step" && Number.isFinite(steady)) value.textContent = `${steady.toFixed(2)}s/step`;
    }
  }
}

installHistoryRestoreCapture();
installStyles();
let queued = false;
new MutationObserver(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    polishExpandButtons();
    applyTimingUi();
  });
}).observe(document.documentElement, { childList: true, subtree: true });
queueMicrotask(() => {
  polishExpandButtons();
  applyTimingUi();
});
app.registerExtension({ name: "H3Studio.FinishV21" });
