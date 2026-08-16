import { app } from "../../scripts/app.js";
import { applyState, renderPanel } from "./js/studio_extension.js";

const TARGET = "H3StudioDirector";
const HISTORY_KEY = "h3studio-history-v2";
const HISTORY_BACKUP_KEY = "h3studio-history-v18-unbounded";
const LINKS_PROPERTY = "h3studio_virtual_media_links";

function parseList(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function historyItems() {
  const primary = parseList(localStorage.getItem(HISTORY_KEY));
  const backup = parseList(localStorage.getItem(HISTORY_BACKUP_KEY));
  const seen = new Set();
  const result = [];
  for (const item of [...primary, ...backup]) {
    const key = String(item?.id || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function plainFilename(value) {
  const candidate = typeof value === "object" ? value?.filename || value?.name : value;
  const text = String(candidate || "").trim();
  if (!text || /^(data:|blob:|https?:)/i.test(text)) return "";
  return text.split(/[\\/]/).pop() || "";
}

function sourceFilename(source) {
  const preferred = ["image", "filename", "file", "upload"];
  for (const name of preferred) {
    const value = source?.widgets?.find((widget) => String(widget.name).toLowerCase() === name)?.value;
    const filename = plainFilename(value);
    if (filename) return filename;
  }
  for (const widget of source?.widgets || []) {
    const filename = plainFilename(widget.value);
    if (/\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(filename)) return filename;
  }
  return plainFilename(source?.properties?.filename);
}

function currentLinks(node) {
  return Array.isArray(node?.properties?.[LINKS_PROPERTY]) ? node.properties[LINKS_PROPERTY] : [];
}

function liveSourceForReference(node, reference) {
  const requestedId = Number(reference?.source_node_id);
  if (Number.isFinite(requestedId)) {
    const exact = app.graph?.getNodeById?.(requestedId);
    if (exact) return exact;
  }

  const wanted = plainFilename(reference?.filename);
  if (!wanted) return null;
  for (const link of currentLinks(node)) {
    const source = app.graph?.getNodeById?.(Number(link?.source_id));
    if (source && sourceFilename(source) === wanted) return source;
  }
  return null;
}

function setPromptSurfaces(node, text) {
  const value = String(text || "");
  node.properties ||= {};
  node.properties.h3_prompt_doc = null;
  const promptWidget = node.widgets?.find((widget) => widget.name === "prompt");
  if (promptWidget) {
    promptWidget.value = value;
    if (promptWidget._state) promptWidget._state.value = value;
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
  app.extensionManager?.toast?.add?.({ severity, summary, detail, life: 6000 });
}

function restoreHistoryState(node, item, card) {
  const next = clone(item?.state || {});
  next.ui = { ...(next.ui || {}), director_node_id: String(node.id) };
  const references = Array.isArray(next.references) ? next.references : [];
  const restored = [];
  const links = [];
  const missing = [];

  for (const [index, original] of references.entries()) {
    const reference = { ...original };
    const storageName = String(reference.storage_name || "").trim();
    if (storageName) {
      restored.push({ ...reference, ordinal: restored.length + 1 });
      continue;
    }

    const source = liveSourceForReference(node, reference);
    if (!source) {
      missing.push(reference.filename || `@Image${index + 1}`);
      continue;
    }
    const sourceSlot = Number(reference.source_slot) || 0;
    reference.source_node_id = String(source.id);
    reference.source_slot = sourceSlot;
    reference.ordinal = restored.length + 1;
    restored.push(reference);
    links.push({
      source_id: Number(source.id),
      source_slot: sourceSlot,
      media_type: "image",
      order: restored.length,
    });
  }

  next.references = restored;
  node.properties ||= {};
  node.properties[LINKS_PROPERTY] = links;
  setPromptSurfaces(node, next.prompt);
  applyState(node, next, true);
  node.__h3studioFaceRefineTelemetry = null;
  try { renderPanel(node); } catch (error) { console.warn("[H3 Studio] history render restore error:", error); }

  const shelf = card.closest(".h3s-demos-shelf");
  if (shelf) {
    shelf.dataset.selectedId = String(item.id || "");
    for (const sibling of shelf.querySelectorAll(".h3s-demo-card[data-kind='history']")) {
      const selected = sibling === card;
      sibling.classList.toggle("is-selected", selected);
      const label = sibling.querySelector(".h3s-demo-apply-btn");
      if (label) label.textContent = selected ? "Restored ✓" : "Restore →";
    }
  }
  app.graph?.setDirtyCanvas?.(true, true);

  if (missing.length) {
    toast(
      "warn",
      "History restored with missing references",
      `${restored.length} reference${restored.length === 1 ? "" : "s"} restored. Reconnect: ${missing.join(", ")}.`,
    );
  } else if (references.length) {
    toast(
      "success",
      "History restored",
      `Restored the saved Director state with all ${references.length} reference image${references.length === 1 ? "" : "s"}.`,
    );
  }
}

function interceptHistoryRestore(event) {
  const card = event.target?.closest?.(".h3s-demo-card[data-kind='history']");
  if (!card) return;
  const shelf = card.closest(".h3s-demos-shelf");
  const node = app.graph?.getNodeById?.(Number(shelf?.dataset?.directorId));
  if (!node || node.comfyClass !== TARGET) return;
  const item = historyItems().find((candidate) => String(candidate?.id || "") === String(card.dataset.demoId || ""));
  if (!item?.state) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  try {
    restoreHistoryState(node, item, card);
  } catch (error) {
    console.error("[H3 Studio] history restore failed:", error);
    toast("error", "Could not restore history", String(error?.message || error));
  }
}

document.addEventListener("click", interceptHistoryRestore, true);

app.registerExtension({ name: "H3Studio.HistoryReferenceRestoreV19" });
