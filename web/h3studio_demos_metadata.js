import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { applyState, renderPanel, stateFromNode } from "./js/studio_extension.js";
import {
  fetchStudioPngMetadata,
  generationBadge,
  shortSamplingLabel,
} from "./js/features/png_metadata.js";

const TARGET = "H3StudioDirector";
const STYLE_ID = "h3studio-demos-metadata-v2-style";
const STORAGE_EXPANDED_KEY = "h3studio-demos-expanded-v2";
const STORAGE_HISTORY_KEY = "h3studio-history-v2";
const EXT_PATH = "/extensions/ComfyUI-MiniMax-H3-Studio/demos";
const MANIFEST_URL = `${EXT_PATH}/manifest.json`;
const MAX_HISTORY = 30;

let manifestCache = null;
const metadataCache = new Map();
let activeTab = "demos";
let activeFilter = "ALL";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3s-demos-shelf{margin:0 0 14px!important;border:1px solid #272d32!important;border-radius:10px!important;background:#121619!important;overflow:hidden!important;width:100%!important;box-sizing:border-box!important}
    .h3s-demos-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 11px;background:#15191c;border-bottom:1px solid transparent;user-select:none}
    .h3s-demos-shelf.is-open .h3s-demos-header{border-bottom-color:#242a2f}
    .h3s-demos-title-group{display:flex;align-items:center;gap:9px;min-width:0;flex-wrap:wrap}
    .h3s-shelf-tabs{display:flex;gap:2px;padding:2px;background:#0d1012;border:1px solid #252b30;border-radius:7px}
    .h3s-shelf-tab,.h3s-demos-filter-pill,.h3s-history-clear-btn{appearance:none;border:0;cursor:pointer;font-family:inherit}
    .h3s-shelf-tab{padding:4px 9px;border-radius:5px;background:transparent;color:#7e8991;font-size:9px;font-weight:680}
    .h3s-shelf-tab:hover{color:#d2d8dc}.h3s-shelf-tab.is-active{background:#252c32;color:#eef2f4;box-shadow:0 1px 2px rgba(0,0,0,.25)}
    .h3s-demos-filter-pills{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
    .h3s-demos-filter-pill,.h3s-history-clear-btn{padding:3px 6px;border:1px solid #2a3136;border-radius:5px;background:#171c20;color:#818c94;font-size:7.5px;font-weight:650;letter-spacing:.025em}
    .h3s-demos-filter-pill:hover,.h3s-demos-filter-pill.is-active{border-color:#58646d;color:#d5dce0}.h3s-demos-filter-pill.is-active{background:#22292e}
    .h3s-history-clear-btn:hover{border-color:#744944;color:#d89188}
    .h3s-demos-toggle-btn{display:flex;align-items:center;gap:5px;padding:3px 4px;color:#7d878e;font-size:8px;cursor:pointer;white-space:nowrap}
    .h3s-demos-chevron{transition:transform .15s}.h3s-demos-shelf.is-open .h3s-demos-chevron{transform:rotate(180deg)}
    .h3s-demos-body{display:none;padding:10px;gap:10px;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;scrollbar-color:#353c42 transparent}
    .h3s-demos-shelf.is-open .h3s-demos-body{display:flex}
    .h3s-demo-card{position:relative;flex:0 0 216px;overflow:hidden;border:1px solid #282f34;border-radius:9px;background:#101416;cursor:pointer;transition:transform .14s ease,border-color .14s ease,box-shadow .14s ease}
    .h3s-demo-card:hover{transform:translateY(-2px);border-color:#59656e;box-shadow:0 5px 15px rgba(0,0,0,.34)}
    .h3s-demo-card.is-selected{border-color:#71808a;box-shadow:0 0 0 1px #71808a,0 5px 15px rgba(0,0,0,.32)}
    .h3s-demo-card.is-loading{cursor:progress;opacity:.86}.h3s-demo-card.is-unavailable{cursor:not-allowed}
    .h3s-demo-thumb-box{position:relative;width:100%;height:108px;overflow:hidden;background:#090c0e}
    .h3s-demo-thumb{display:block;width:100%;height:100%;object-fit:cover;transition:transform .22s ease}.h3s-demo-card:hover .h3s-demo-thumb{transform:scale(1.025)}
    .h3s-demo-category-tag,.h3s-demo-badge-specs,.h3s-demo-source-tag{position:absolute;border:1px solid rgba(255,255,255,.13);background:rgba(13,16,18,.84);backdrop-filter:blur(5px);color:#d0d7db;border-radius:4px;font-size:7px;font-weight:680}
    .h3s-demo-category-tag{top:6px;left:6px;padding:2px 5px;text-transform:uppercase;letter-spacing:.05em}.h3s-demo-badge-specs{right:6px;bottom:6px;padding:2px 5px;max-width:188px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .h3s-demo-source-tag{top:6px;right:6px;padding:2px 5px;color:#9dc6ae}.h3s-demo-source-tag.is-missing{color:#d39a91}
    .h3s-demo-content{display:flex;flex-direction:column;gap:3px;padding:8px 9px 9px}.h3s-demo-card-title{font-size:10px;font-weight:700;color:#e5eaed;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .h3s-demo-card-sub{min-height:11px;color:#808b92;font-size:8.2px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .h3s-demo-card-action{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:5px;padding-top:5px;border-top:1px solid #20262a;color:#6f7b82;font-size:7.3px}.h3s-demo-apply-btn{color:#a8b4bc;font-weight:680}
    .h3s-demo-card.is-selected .h3s-demo-apply-btn{color:#8fc2a1}.h3s-demo-error{color:#c88880}
    .h3s-empty-history{box-sizing:border-box;width:100%;padding:22px 14px;text-align:center;color:#6f7a82;font-size:9px}
  `;
  document.head.append(style);
}

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

async function loadManifest() {
  if (manifestCache) return manifestCache;
  try {
    const response = await fetch(`${MANIFEST_URL}?_t=${Date.now()}`, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    manifestCache = Array.isArray(payload) ? payload : [];
  } catch (error) {
    console.warn("[H3 Studio] Demo catalog unavailable:", error);
    manifestCache = [];
  }
  return manifestCache;
}

function demoMetadataUrl(demo) {
  const file = demo?.metadata_file || demo?.file || demo?.thumbnail;
  return file ? `${EXT_PATH}/${file}` : "";
}

function demoThumbnailUrl(demo) {
  const file = demo?.thumbnail || demo?.file || demo?.metadata_file;
  return file ? `${EXT_PATH}/${file}` : "";
}

async function loadDemoMetadata(demo, { retry = false } = {}) {
  const key = String(demo?.id || demo?.metadata_file || "");
  if (!retry && metadataCache.has(key)) return metadataCache.get(key);
  const url = demoMetadataUrl(demo);
  if (!url) throw new Error("Demo catalog entry has no metadata_file.");
  const promise = fetchStudioPngMetadata(url).catch((error) => {
    metadataCache.delete(key);
    throw error;
  });
  metadataCache.set(key, promise);
  return promise;
}

function cleanImageUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url, "http://localhost");
    parsed.searchParams.delete("rand");
    return `${parsed.pathname}?${parsed.searchParams.toString()}`;
  } catch {
    return String(url).replace(/[?&]rand=\d+/, "");
  }
}

function isPermanentImage(item) {
  const url = String(item?.url || item?.image || "").toLowerCase();
  return url.includes("type=output") || (!url.includes("type=temp") && !url.includes("comfyui_temp_"));
}

function itemSignature(item) {
  if (!item) return "";
  const prompt = String(item.state?.prompt ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const timeBucket = Math.floor(Number(item.timestamp || 0) / (3 * 60 * 1000));
  const dirId = item.state?.ui?.director_node_id ?? "";
  if (prompt) {
    return `run:${dirId}:${prompt.slice(0, 80)}:${timeBucket}`;
  }
  const seed = item.state?.generation?.seed;
  if (seed != null && Number.isFinite(Number(seed)) && Number(seed) >= 0) {
    return `seed:${dirId}:${Math.trunc(Number(seed))}`;
  }
  const cleanUrl = cleanImageUrl(item.url || item.image || "");
  return cleanUrl || String(item.id || "");
}

function deduplicateHistory(items) {
  const map = new Map();
  for (const item of items) {
    if (!item) continue;
    const sig = itemSignature(item);
    if (!sig) continue;
    const existing = map.get(sig);
    if (!existing) {
      map.set(sig, item);
    } else {
      if (!isPermanentImage(existing) && isPermanentImage(item)) {
        map.set(sig, item);
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
}

function history() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_HISTORY_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    const deduplicated = deduplicateHistory(raw);
    if (deduplicated.length !== raw.length) {
      saveHistory(deduplicated);
    }
    return deduplicated;
  } catch {
    return [];
  }
}

function saveHistory(items) {
  try {
    const deduplicated = deduplicateHistory(items);
    localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(deduplicated.slice(0, MAX_HISTORY)));
  } catch (error) {
    console.warn("[H3 Studio] Could not persist generation history:", error);
  }
}

function addHistory(entry) {
  const sig = itemSignature(entry);
  const items = history().filter((item) => itemSignature(item) !== sig && item.id !== entry.id);
  saveHistory([entry, ...items].slice(0, MAX_HISTORY));
  updateActiveShelves();
}

function timeAgo(timestamp) {
  const seconds = Math.max(0, Math.floor((Date.now() - Number(timestamp || Date.now())) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function setPromptSurfaces(node, text) {
  if (!node) return;
  node.properties ||= {};
  node.properties.h3_prompt_doc = null;
  const promptWidget = node.widgets?.find((item) => item.name === "prompt");
  if (promptWidget) {
    promptWidget.value = text;
    if (promptWidget._state) promptWidget._state.value = text;
  }
  try {
    node.__h3sDomWidget?.setValue?.(text);
  } catch (err) {
    console.warn("[H3 Studio] DomWidget setValue error:", err);
  }
  if (node.__h3sEditor) {
    try {
      node.__h3sEditor.textContent = text;
      node.__h3sEditor.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (err) {
      console.warn("[H3 Studio] Editor dispatch error:", err);
    }
  }
}

function exactStateForCurrentDirector(node, state) {
  const next = clone(state);
  next.ui = { ...(next.ui || {}), director_node_id: String(node.id) };
  return next;
}

function highlightSelection(shelf, id) {
  shelf.dataset.selectedId = String(id || "");
  for (const card of shelf.querySelectorAll(".h3s-demo-card")) {
    const selected = card.dataset.demoId === String(id || "");
    card.classList.toggle("is-selected", selected);
    const button = card.querySelector(".h3s-demo-apply-btn");
    if (button) button.textContent = selected ? "Applied ✓" : (card.dataset.kind === "history" ? "Restore →" : "Apply →");
  }
}

function applyExactState(node, state, id, shelf) {
  if (!node || !state || typeof state !== "object") return;
  const next = exactStateForCurrentDirector(node, state);
  const references = Array.isArray(next.references) ? next.references : [];
  if (references.length) {
    throw new Error(
      "This demo contains reference-image state, but its source reference assets are not bundled with the shelf. " +
      "H3 Studio refuses to apply a partial state that could change the result."
    );
  }
  const prompt = String(next.prompt || "");
  setPromptSurfaces(node, prompt);
  applyState(node, next, true);
  node.__h3studioFaceRefineTelemetry = null;
  try {
    renderPanel(node);
  } catch (err) {
    console.warn("[H3 Studio] renderPanel error during applyExactState:", err);
  }
  highlightSelection(shelf, id);
  try {
    app.graph?.setDirtyCanvas?.(true, true);
  } catch {}
}

function showToast(severity, summary, detail) {
  app.extensionManager?.toast?.add?.({ severity, summary, detail, life: 6500 });
}

function badgeText(badge) {
  if (!badge) return "Reading embedded metadata…";
  const pieces = [badge.aspect, badge.resolution, shortSamplingLabel(badge.profile)];
  if (badge.seed != null) pieces.push(`seed ${badge.seed}`);
  return pieces.filter(Boolean).join(" · ");
}

function cardShell({ id, kind, title, subtitle, imageUrl, category, selected }) {
  const card = document.createElement("article");
  card.className = `h3s-demo-card${selected ? " is-selected" : ""}`;
  card.dataset.demoId = String(id);
  card.dataset.kind = kind;

  const thumbBox = document.createElement("div");
  thumbBox.className = "h3s-demo-thumb-box";
  const image = document.createElement("img");
  image.className = "h3s-demo-thumb";
  image.loading = "lazy";
  image.src = imageUrl;
  image.alt = title || "H3 Studio generation";
  image.onerror = () => {
    image.style.display = "none";
    thumbBox.style.background = "linear-gradient(135deg, #181d21 0%, #0d1012 100%)";
  };
  thumbBox.appendChild(image);

  const cat = document.createElement("span");
  cat.className = "h3s-demo-category-tag";
  cat.textContent = category || (kind === "history" ? "HISTORY" : "DEMO");
  thumbBox.appendChild(cat);

  const specs = document.createElement("span");
  specs.className = "h3s-demo-badge-specs";
  specs.textContent = kind === "history" ? "Saved run" : "Reading metadata…";
  thumbBox.appendChild(specs);

  const content = document.createElement("div");
  content.className = "h3s-demo-content";
  const name = document.createElement("div");
  name.className = "h3s-demo-card-title";
  name.textContent = title || "H3 Studio generation";
  const sub = document.createElement("div");
  sub.className = "h3s-demo-card-sub";
  sub.textContent = subtitle || "";
  const action = document.createElement("div");
  action.className = "h3s-demo-card-action";
  const provenance = document.createElement("span");
  provenance.textContent = kind === "history" ? "Restore saved run" : "Restore generation settings";
  const apply = document.createElement("span");
  apply.className = "h3s-demo-apply-btn";
  apply.textContent = selected ? "Applied ✓" : (kind === "history" ? "Restore →" : "Apply →");
  action.append(provenance, apply);
  content.append(name, sub, action);
  card.append(thumbBox, content);
  return { card, specs, sub, apply };
}

async function hydrateDemoCard(demo, parts) {
  try {
    const metadata = await loadDemoMetadata(demo);
    parts.specs.textContent = badgeText(generationBadge(metadata));
    parts.card.dataset.metadataReady = "true";
  } catch (error) {
    parts.card.dataset.metadataReady = "false";
    parts.card.classList.add("is-unavailable");
    parts.specs.textContent = "Metadata missing";
    parts.sub.title = String(error?.message || error);
  }
}

async function applyDemo(node, demo, parts, shelf) {
  if (parts.card.classList.contains("is-loading")) return;
  parts.card.classList.add("is-loading");
  const old = parts.apply.textContent;
  parts.apply.textContent = "Reading PNG…";
  try {
    const metadata = await loadDemoMetadata(demo, { retry: parts.card.dataset.metadataReady === "false" });
    applyExactState(node, metadata.state, demo.id, shelf);
    parts.apply.textContent = "Applied ✓";
  } catch (error) {
    parts.card.classList.add("is-unavailable");
    parts.apply.textContent = "Metadata required";
    showToast(
      "error",
      "Demo metadata unavailable",
      `${demo.title}: ${String(error?.message || error)} The thumbnail is intentionally not allowed to fall back to a hand-authored prompt.`
    );
    if (old === "Applied ✓") highlightSelection(shelf, demo.id);
  } finally {
    parts.card.classList.remove("is-loading");
  }
}

function renderHistory(node, body, shelf) {
  const items = history();
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "h3s-empty-history";
    empty.textContent = "No generated images in local history yet. Completed H3 Studio runs appear here with their saved Director state.";
    body.appendChild(empty);
    return;
  }
  for (const item of items) {
    const state = item.state || {};
    const generation = state.generation || {};
    const parts = cardShell({
      id: item.id,
      kind: "history",
      title: item.title || "H3 Studio generation",
      subtitle: `${timeAgo(item.timestamp)} · ${String(state.prompt || "").replace(/\s+/g, " ").slice(0, 72)}`,
      imageUrl: item.url,
      category: "HISTORY",
      selected: shelf.dataset.selectedId === String(item.id),
    });
    parts.specs.textContent = [
      generation.aspect_ratio || "custom",
      Number(generation.megapixels || 0) > 0 ? `${Number(generation.megapixels).toFixed(2)} MP` : "",
      shortSamplingLabel(generation.sampling_profile),
      Number.isFinite(Number(generation.seed)) ? `seed ${generation.seed}` : "",
    ].filter(Boolean).join(" · ");
    parts.card.addEventListener("click", () => {
      try {
        applyExactState(node, state, item.id, shelf);
      } catch (error) {
        showToast("error", "Could not restore history", String(error?.message || error));
      }
    });
    body.appendChild(parts.card);
  }
}

function renderDemos(node, body, shelf, demos) {
  const filtered = activeFilter === "ALL" ? demos : demos.filter((item) => item.category === activeFilter);
  for (const demo of filtered) {
    const parts = cardShell({
      id: demo.id,
      kind: "demo",
      title: demo.title,
      subtitle: demo.subtitle,
      imageUrl: demoThumbnailUrl(demo),
      category: demo.category,
      selected: shelf.dataset.selectedId === String(demo.id),
    });
    parts.card.addEventListener("click", () => applyDemo(node, demo, parts, shelf));
    body.appendChild(parts.card);
    hydrateDemoCard(demo, parts);
  }
}

function renderShelfContent(node, shelf, demos) {
  const body = shelf.querySelector(".h3s-demos-body");
  if (!body) return;
  body.replaceChildren();
  if (activeTab === "history") renderHistory(node, body, shelf);
  else renderDemos(node, body, shelf, demos);
}

async function buildDemoShelf(node, selectedId = "") {
  const demos = await loadManifest();
  const shelf = document.createElement("section");
  shelf.className = "h3s-demos-shelf";
  shelf.dataset.directorId = String(node.id);
  shelf.dataset.selectedId = String(selectedId || "");
  const storedOpen = localStorage.getItem(STORAGE_EXPANDED_KEY);
  if (storedOpen !== "false") shelf.classList.add("is-open");

  const header = document.createElement("header");
  header.className = "h3s-demos-header";
  const left = document.createElement("div");
  left.className = "h3s-demos-title-group";
  const tabs = document.createElement("div");
  tabs.className = "h3s-shelf-tabs";
  const demosTab = document.createElement("button");
  demosTab.type = "button";
  demosTab.className = `h3s-shelf-tab${activeTab === "demos" ? " is-active" : ""}`;
  demosTab.textContent = `✦ Demos (${demos.length})`;
  const historyTab = document.createElement("button");
  historyTab.type = "button";
  historyTab.className = `h3s-shelf-tab${activeTab === "history" ? " is-active" : ""}`;
  historyTab.textContent = `⏱ History (${history().length})`;
  tabs.append(demosTab, historyTab);
  left.appendChild(tabs);

  const controls = document.createElement("div");
  controls.className = "h3s-demos-filter-pills";
  left.appendChild(controls);

  const refreshControls = () => {
    controls.replaceChildren();
    if (activeTab === "demos") {
      const categories = ["ALL", ...new Set(demos.map((item) => item.category).filter(Boolean))];
      for (const category of categories) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `h3s-demos-filter-pill${category === activeFilter ? " is-active" : ""}`;
        const count = category === "ALL" ? demos.length : demos.filter((item) => item.category === category).length;
        button.textContent = `${category} ${count}`;
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          activeFilter = category;
          refreshControls();
          renderShelfContent(node, shelf, demos);
        });
        controls.appendChild(button);
      }
    } else if (history().length) {
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "h3s-history-clear-btn";
      clear.textContent = "Clear history";
      clear.addEventListener("click", (event) => {
        event.stopPropagation();
        saveHistory([]);
        historyTab.textContent = "History 0";
        refreshControls();
        renderShelfContent(node, shelf, demos);
      });
      controls.appendChild(clear);
    }
  };

  const selectTab = (tab) => {
    activeTab = tab;
    demosTab.classList.toggle("is-active", tab === "demos");
    historyTab.classList.toggle("is-active", tab === "history");
    refreshControls();
    renderShelfContent(node, shelf, demos);
  };
  demosTab.addEventListener("click", (event) => { event.stopPropagation(); selectTab("demos"); });
  historyTab.addEventListener("click", (event) => { event.stopPropagation(); selectTab("history"); });
  refreshControls();

  const toggle = document.createElement("div");
  toggle.className = "h3s-demos-toggle-btn";
  const label = document.createElement("span");
  label.textContent = "Shelf";
  const chevron = document.createElement("span");
  chevron.className = "h3s-demos-chevron";
  chevron.textContent = "▾";
  toggle.append(label, chevron);
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = shelf.classList.toggle("is-open");
    localStorage.setItem(STORAGE_EXPANDED_KEY, String(open));
  });
  header.append(left, toggle);

  const body = document.createElement("div");
  body.className = "h3s-demos-body";
  body.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      body.scrollLeft += event.deltaY;
      event.stopPropagation();
    }
  }, { passive: true });
  shelf.append(header, body);
  renderShelfContent(node, shelf, demos);
  return shelf;
}

async function installDemosShelf(node) {
  const panel = node?.__h3studioPanel;
  if (!panel?.isConnected) return null;
  let shelf = node.__h3studioShelf;
  if (!shelf) {
    shelf = await buildDemoShelf(node);
    node.__h3studioShelf = shelf;
  }
  if (shelf.parentNode === panel) return shelf;
  if (panel.querySelector(".h3s-demos-shelf")) return shelf;
  const workspace = panel.querySelector(".h3s-workspace, .h3s-v6-layout, .h3s-v7-layout, .h3s-layout");
  const header = panel.querySelector(".h3s-studio-header");
  if (workspace?.parentNode === panel) panel.insertBefore(shelf, workspace);
  else if (header?.parentNode === panel) panel.insertBefore(shelf, header.nextSibling);
  else panel.prepend(shelf);
  return shelf;
}

function updateActiveShelves() {
  for (const shelf of document.querySelectorAll(".h3s-demos-shelf")) {
    const node = app.graph?.getNodeById?.(Number(shelf.dataset.directorId));
    if (!node) continue;
    const historyTab = shelf.querySelector(".h3s-shelf-tab:nth-child(2)");
    if (historyTab) historyTab.textContent = `History ${history().length}`;
    if (activeTab === "history") {
      loadManifest().then((demos) => renderShelfContent(node, shelf, demos));
    }
  }
}

function executedImageUrl(item) {
  if (!item?.filename) return "";
  return `/view?${new URLSearchParams({
    filename: item.filename,
    type: item.type || "output",
    subfolder: item.subfolder || "",
  }).toString()}`;
}

function findDirectorForOutput(executedNodeId) {
  const graph = app.graph;
  if (!graph?._nodes) return null;
  const queue = [String(executedNodeId ?? "")];
  const visited = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    const node = graph._nodes.find((candidate) => String(candidate.id) === id);
    if (!node) continue;
    if (node.comfyClass === TARGET) return node;
    for (const input of node.inputs || []) {
      if (input.link == null) continue;
      const link = graph.links?.[input.link];
      const sourceId = link?.origin_id ?? link?.source_id;
      if (sourceId != null) queue.push(String(sourceId));
    }
  }
  // Never guess the first Director in multi-Director workflows.
  return null;
}

const recordedPromptRuns = new Map();

api.addEventListener("executed", ({ detail }) => {
  const imageItem = detail?.output?.images?.[0];
  const url = executedImageUrl(imageItem);
  if (!url) return;
  const director = findDirectorForOutput(detail?.node);
  if (!director) return;

  const promptId = String(detail?.prompt_id || "");
  const isOutput = String(imageItem?.type || "") === "output";

  if (promptId) {
    const prior = recordedPromptRuns.get(promptId);
    if (prior) {
      if (isOutput && !prior.isOutput) {
        const list = history();
        const existing = list.find((it) => it.id === prior.historyId);
        if (existing) {
          existing.url = url;
          saveHistory(list);
          updateActiveShelves();
        }
        recordedPromptRuns.set(promptId, { timestamp: Date.now(), isOutput: true, historyId: prior.historyId });
      }
      return;
    }
  }

  // The main Director output listener is registered earlier and records the
  // backend-reported execution seed. Prefer that exact value over the UI's next
  // reserved seed, which may already have advanced after queueing.
  const current = stateFromNode(director);
  const saved = clone(current);
  const exactSeed = Number(director.__h3studioFinalImage?.seed);
  if (Number.isFinite(exactSeed) && exactSeed >= 0) saved.generation.seed = Math.trunc(exactSeed);
  saved.ui = { ...(saved.ui || {}), director_node_id: String(director.id) };

  const historyId = `gen_${Date.now()}_${String(detail?.node ?? "")}`;
  if (promptId) {
    recordedPromptRuns.set(promptId, { timestamp: Date.now(), isOutput, historyId });
    if (recordedPromptRuns.size > 50) {
      const oldestKey = recordedPromptRuns.keys().next().value;
      recordedPromptRuns.delete(oldestKey);
    }
  }

  addHistory({
    id: historyId,
    url,
    timestamp: Date.now(),
    state: saved,
    title: `Generation ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
  });
});

function watchDirector(node) {
  const wait = () => {
    if (!node.graph) return;
    if (node.__h3studioPanel?.isConnected) installDemosShelf(node);
    else setTimeout(wait, 60);
  };
  setTimeout(wait, 0);
}

app.registerExtension({
  name: "H3Studio.DemosMetadataShelf",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== TARGET) return;
    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function h3studioMetadataShelfCreated() {
      const result = created?.apply(this, arguments);
      installStyles();
      watchDirector(this);
      return result;
    };
    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function h3studioMetadataShelfConfigured() {
      const result = configured?.apply(this, arguments);
      installStyles();
      watchDirector(this);
      return result;
    };
  },
});

export {
  applyExactState,
  buildDemoShelf,
  findDirectorForOutput,
  installDemosShelf,
  loadDemoMetadata,
  renderShelfContent,
};
