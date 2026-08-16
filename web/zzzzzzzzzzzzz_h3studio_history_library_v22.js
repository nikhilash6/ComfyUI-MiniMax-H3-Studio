import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const HISTORY_KEY = "h3studio-history-v2";
const HISTORY_BACKUP_KEY = "h3studio-history-v18-unbounded";
const PREFS_KEY = "h3studio-history-library-v22-prefs";
const STYLE_ID = "h3studio-history-library-v22-style";
const ENDPOINT = "/h3studio/history";

let serverItems = [];
let serverById = new Map();
let serverByUrl = new Map();
let samplers = [];
let totalIndexed = 0;
let syncing = false;
let syncTimer = 0;
let filterTimer = 0;
let serverAvailable = true;
let observerQueued = false;

function parseList(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
    return String(value || "");
  }
}

function thumbnailUrl(fullUrl) {
  try {
    const url = new URL(String(fullUrl || ""), location.href);
    if (url.pathname !== "/view") return "";
    const filename = url.searchParams.get("filename") || "";
    const subfolder = (url.searchParams.get("subfolder") || "").replace(/^\/+|\/+$/g, "");
    const type = url.searchParams.get("type") || "output";
    if (!filename) return "";
    const storage = `${subfolder ? `${subfolder}/` : ""}${filename} [${type}]`;
    return `/h3studio/thumbnail?${new URLSearchParams({ storage, size: "256" }).toString()}`;
  } catch {
    return "";
  }
}

function prefs() {
  try {
    return {
      q: "",
      favorite: false,
      sampler: "",
      sort: "newest",
      ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"),
    };
  } catch {
    return { q: "", favorite: false, sampler: "", sort: "newest" };
  }
}

function savePrefs(next) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(next));
}

function historyItems() {
  const merged = [
    ...parseList(localStorage.getItem(HISTORY_KEY)),
    ...parseList(localStorage.getItem(HISTORY_BACKUP_KEY)),
  ];
  const byUrl = new Map();
  const idOnly = new Map();
  for (const item of merged) {
    if (!item || typeof item !== "object") continue;
    const url = canonicalUrl(item.url || item.image);
    if (url) {
      const old = byUrl.get(url);
      if (!old || Number(item.timestamp || 0) > Number(old.timestamp || 0)) {
        byUrl.set(url, old?.favorite && !item.favorite ? { ...item, favorite: true } : item);
      } else if (item.favorite && !old.favorite) {
        old.favorite = true;
      }
      continue;
    }
    const id = String(item.id || "");
    if (id && !idOnly.has(id)) idOnly.set(id, item);
  }
  return [...byUrl.values(), ...idOnly.values()]
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
}

function directorTiming(item) {
  const id = Number(item?.state?.ui?.director_node_id);
  const node = app.graph?.getNodeById?.(id);
  const timing = node?.__h3studioRunTiming || {};
  return {
    sampling_seconds: Number.isFinite(Number(timing.samplingSeconds)) ? Number(timing.samplingSeconds) : undefined,
    total_seconds: Number.isFinite(Number(timing.totalSeconds)) ? Number(timing.totalSeconds) : undefined,
  };
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function pushLocalHistory() {
  if (syncing) return;
  const items = historyItems().map((item) => ({ ...item, ...directorTiming(item) }));
  if (!items.length) return;
  syncing = true;
  try {
    await jsonRequest(`${ENDPOINT}/upsert`, { method: "POST", body: JSON.stringify({ items }) });
    serverAvailable = true;
  } catch (error) {
    serverAvailable = false;
    console.debug("[H3 Studio] persistent history sync unavailable:", error);
  } finally {
    syncing = false;
  }
}

function schedulePush() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => pushLocalHistory().then(() => refreshLibrary()), 180);
}

function installStorageSync() {
  if (Storage.prototype.__h3sHistoryLibraryV22) return;
  Storage.prototype.__h3sHistoryLibraryV22 = true;
  const previousSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function h3studioLibrarySetItem(key, value) {
    const result = previousSet.call(this, key, value);
    if (!syncing && this === localStorage && (key === HISTORY_KEY || key === HISTORY_BACKUP_KEY)) schedulePush();
    return result;
  };
}

function mergeServerIntoLocal(items) {
  const byUrl = new Map();
  for (const local of historyItems()) {
    const key = canonicalUrl(local.url || local.image) || `id:${local.id}`;
    byUrl.set(key, local);
  }
  for (const item of items || []) {
    const key = canonicalUrl(item?.url) || `id:${item?.id || ""}`;
    if (!key || key === "id:") continue;
    const existing = byUrl.get(key);
    byUrl.set(key, existing ? { ...item, ...existing, favorite: Boolean(item.favorite) } : item);
  }
  const merged = [...byUrl.values()].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  syncing = true;
  try {
    localStorage.setItem(HISTORY_BACKUP_KEY, JSON.stringify(merged));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(merged));
  } finally {
    syncing = false;
  }
}

function libraryParams() {
  const state = prefs();
  const query = new URLSearchParams({ limit: "5000", sort: state.sort || "newest" });
  if (state.q?.trim()) query.set("q", state.q.trim());
  if (state.favorite) query.set("favorite", "1");
  if (state.sampler) query.set("sampler", state.sampler);
  return query;
}

function rebuildServerMaps() {
  serverById = new Map(serverItems.map((item) => [String(item.id || ""), item]));
  serverByUrl = new Map();
  for (const item of serverItems) {
    const key = canonicalUrl(item?.url);
    if (key) serverByUrl.set(key, item);
  }
}

async function refreshLibrary({ merge = false } = {}) {
  try {
    const payload = await jsonRequest(`${ENDPOINT}/library?${libraryParams().toString()}`);
    serverItems = Array.isArray(payload.items) ? payload.items : [];
    samplers = Array.isArray(payload.samplers) ? payload.samplers : [];
    totalIndexed = Number(payload.total || 0);
    serverAvailable = true;
    rebuildServerMaps();
    if (merge) {
      const all = await jsonRequest(`${ENDPOINT}/library?limit=5000&sort=newest`);
      mergeServerIntoLocal(Array.isArray(all.items) ? all.items : []);
      for (const tab of document.querySelectorAll(".h3s-shelf-tab:nth-child(2).is-active")) tab.click();
    }
  } catch (error) {
    serverAvailable = false;
    serverItems = historyItems();
    totalIndexed = serverItems.length;
    rebuildServerMaps();
    console.debug("[H3 Studio] history library server unavailable; using browser history:", error);
  }
  decorateAll();
}

function formatDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return "";
  if (value < 60) return `${Math.round(value)}s`;
  const minutes = Math.floor(value / 60);
  return `${minutes}m ${String(Math.round(value - minutes * 60)).padStart(2, "0")}s`;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3s-history-library{display:grid;grid-template-columns:minmax(150px,1fr) auto auto auto auto auto;gap:6px;align-items:center;padding:7px 10px;border-bottom:1px solid #242a2f;background:#101416}
    .h3s-history-search-wrap{position:relative;min-width:0}.h3s-history-search-icon{position:absolute;left:8px;top:50%;transform:translateY(-50%);width:12px;height:12px;opacity:.46;pointer-events:none}.h3s-history-search-icon svg{display:block;width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.5}
    .h3s-history-search,.h3s-history-sort,.h3s-history-sampler{box-sizing:border-box;height:27px;border:1px solid #2b3237;border-radius:6px;background:#151a1e;color:#cbd4d9;font:600 8.5px/1 inherit;outline:none}.h3s-history-search{width:100%;padding:0 9px 0 27px}.h3s-history-search::placeholder{color:#68737b}.h3s-history-search:focus,.h3s-history-sort:focus,.h3s-history-sampler:focus{border-color:#596871}
    .h3s-history-sort,.h3s-history-sampler{max-width:128px;padding:0 22px 0 8px;cursor:pointer}.h3s-history-sampler{max-width:142px}
    .h3s-history-library-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:27px;padding:0 8px;border:1px solid #2b3237;border-radius:6px;background:#151a1e;color:#87949c;font:700 8px/1 inherit;cursor:pointer;white-space:nowrap}.h3s-history-library-btn:hover{border-color:#4a565e;color:#d4dce0}.h3s-history-library-btn.is-active{border-color:#6b5940;background:#211d17;color:#e2bd7e}.h3s-history-library-btn svg{width:11px;height:11px;fill:none;stroke:currentColor;stroke-width:1.45;stroke-linecap:round;stroke-linejoin:round}
    .h3s-history-count{min-width:52px;text-align:right;color:#66737a;font-size:7.5px;white-space:nowrap}.h3s-history-count.is-local{color:#9b795f}
    .h3s-history-favorite{position:absolute;z-index:20;right:7px;top:7px;display:grid!important;place-items:center;width:24px;height:24px;padding:0;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:rgba(12,15,17,.88);backdrop-filter:blur(5px);color:#d7dee2;cursor:pointer;opacity:.88;pointer-events:auto!important;transition:opacity .12s ease,color .12s ease,background .12s ease,transform .12s ease}.h3s-history-favorite:hover{opacity:1;transform:scale(1.06);background:rgba(20,25,29,.94);color:#fff}.h3s-history-favorite.is-favorite{opacity:1;color:#e7bd70;border-color:rgba(231,189,112,.42);background:#211c14}.h3s-history-favorite svg{width:13px;height:13px;stroke:currentColor;stroke-width:1.45;fill:transparent;stroke-linejoin:round}.h3s-history-favorite.is-favorite svg{fill:currentColor}
    .h3s-history-runtime{color:#75838b!important}.h3s-history-no-results{flex:1 0 100%;padding:25px 14px;text-align:center;color:#66737a;font-size:9px}
    .h3s-demos-shelf:has(.h3s-shelf-tab:nth-child(2).is-active) .h3s-history-clear-btn:not(.h3s-history-restore-btn){display:none!important}
    @media(max-width:760px){.h3s-history-library{grid-template-columns:minmax(120px,1fr) auto auto auto}.h3s-history-sampler,.h3s-history-count{display:none}}
  `;
  document.head.append(style);
}

function searchIcon() {
  return `<span class="h3s-history-search-icon"><svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg></span>`;
}

function starSvg() {
  return `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m8 2 1.75 3.55 3.92.57-2.84 2.77.67 3.91L8 10.96 4.5 12.8l.67-3.91-2.84-2.77 3.92-.57L8 2Z"/></svg>`;
}

function refreshSvg() {
  return `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 5V2.8l-1.45 1.4A5.2 5.2 0 1 0 13 9"/></svg>`;
}

function buildToolbar(shelf) {
  let bar = shelf.querySelector(":scope > .h3s-history-library");
  if (bar) return bar;
  bar = document.createElement("div");
  bar.className = "h3s-history-library";

  const searchWrap = document.createElement("label");
  searchWrap.className = "h3s-history-search-wrap";
  searchWrap.innerHTML = searchIcon();
  const search = document.createElement("input");
  search.className = "h3s-history-search";
  search.type = "search";
  search.placeholder = "Search prompt, seed, reference…";
  search.autocomplete = "off";
  searchWrap.append(search);

  const favorite = document.createElement("button");
  favorite.type = "button";
  favorite.className = "h3s-history-library-btn h3s-history-favorites-filter";
  favorite.innerHTML = `${starSvg()}<span>Favorites</span>`;

  const sampler = document.createElement("select");
  sampler.className = "h3s-history-sampler";
  const sort = document.createElement("select");
  sort.className = "h3s-history-sort";
  sort.innerHTML = `<option value="newest">Newest</option><option value="oldest">Oldest</option><option value="favorites">Favorites first</option><option value="largest">Largest</option><option value="fastest">Fastest</option>`;

  const rebuild = document.createElement("button");
  rebuild.type = "button";
  rebuild.className = "h3s-history-library-btn h3s-history-rebuild";
  rebuild.title = "Re-index H3 Studio PNGs from ComfyUI output";
  rebuild.innerHTML = `${refreshSvg()}<span>Re-index</span>`;

  const count = document.createElement("span");
  count.className = "h3s-history-count";

  const state = prefs();
  search.value = state.q || "";
  favorite.classList.toggle("is-active", Boolean(state.favorite));
  sort.value = state.sort || "newest";

  search.addEventListener("input", () => {
    savePrefs({ ...prefs(), q: search.value });
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => refreshLibrary(), 130);
  });
  favorite.addEventListener("click", () => {
    const next = { ...prefs(), favorite: !prefs().favorite };
    savePrefs(next);
    favorite.classList.toggle("is-active", next.favorite);
    refreshLibrary();
  });
  sort.addEventListener("change", () => {
    savePrefs({ ...prefs(), sort: sort.value });
    refreshLibrary();
  });
  sampler.addEventListener("change", () => {
    savePrefs({ ...prefs(), sampler: sampler.value });
    refreshLibrary();
  });
  rebuild.addEventListener("click", async () => {
    rebuild.disabled = true;
    rebuild.querySelector("span").textContent = "Indexing…";
    try {
      await jsonRequest(`${ENDPOINT}/rebuild`, { method: "POST", body: "{}" });
      await refreshLibrary({ merge: true });
    } catch (error) {
      console.warn("[H3 Studio] history re-index failed:", error);
    } finally {
      rebuild.disabled = false;
      rebuild.querySelector("span").textContent = "Re-index";
    }
  });

  bar.append(searchWrap, favorite, sampler, sort, rebuild, count);
  shelf.querySelector(".h3s-demos-header")?.after(bar);
  return bar;
}

function refreshToolbar(bar) {
  const state = prefs();
  const sampler = bar.querySelector(".h3s-history-sampler");
  const current = state.sampler || "";
  sampler.replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All samplers";
  sampler.append(all);
  for (const value of samplers) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value.replace(/^lightx_v1_fl2v_/, "LightX ").replace(/_/g, " ");
    sampler.append(option);
  }
  sampler.value = current;
  const count = bar.querySelector(".h3s-history-count");
  count.textContent = serverAvailable ? `${serverItems.length}/${totalIndexed}` : `${totalIndexed} local`;
  count.classList.toggle("is-local", !serverAvailable);
  bar.querySelector(".h3s-history-favorites-filter")?.classList.toggle("is-active", Boolean(state.favorite));
}

function itemForCard(card) {
  const image = card?.querySelector?.("img.h3s-demo-thumb");
  const key = canonicalUrl(image?.dataset?.fullSrc || image?.src || "");
  if (key && serverByUrl.has(key)) return serverByUrl.get(key);
  return serverById.get(String(card?.dataset?.demoId || "")) || null;
}

async function toggleFavorite(event, card, button) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  if (button.dataset.busy === "1") return;
  const item = itemForCard(card);
  if (!item) {
    console.warn("[H3 Studio] favorite skipped: history card has no indexed media match");
    return;
  }
  button.dataset.busy = "1";
  const prior = Boolean(item.favorite);
  const next = !prior;
  item.favorite = next;
  button.classList.toggle("is-favorite", next);
  button.setAttribute("aria-pressed", String(next));
  try {
    const result = await jsonRequest(`${ENDPOINT}/favorite`, {
      method: "POST",
      body: JSON.stringify({ id: item.id, favorite: next }),
    });
    if (!result?.ok) throw new Error("Favorite update was not accepted.");
    await refreshLibrary();
  } catch (error) {
    item.favorite = prior;
    button.classList.toggle("is-favorite", prior);
    button.setAttribute("aria-pressed", String(prior));
    console.warn("[H3 Studio] favorite update failed:", error);
  } finally {
    delete button.dataset.busy;
  }
}

function optimizeHistoryThumbnail(card, item) {
  const image = card.querySelector("img.h3s-demo-thumb");
  if (!image || image.dataset.h3sLibraryThumb === "1") return;
  const full = String(item?.url || image.currentSrc || image.src || "");
  if (!full) return;
  image.dataset.h3sLibraryThumb = "1";
  image.dataset.fullSrc = full;
  image.loading = "lazy";
  image.decoding = "async";
  try { image.fetchPriority = "low"; } catch {}
  const thumb = thumbnailUrl(full);
  if (thumb) image.src = thumb;
}

function decorateCard(card) {
  const item = itemForCard(card);
  const thumb = card.querySelector(".h3s-demo-thumb-box");
  if (!thumb) return;
  optimizeHistoryThumbnail(card, item);

  let favorite = thumb.querySelector(".h3s-history-favorite");
  if (!favorite) {
    favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = "h3s-history-favorite";
    favorite.setAttribute("aria-label", "Favorite generation");
    favorite.innerHTML = starSvg();
    favorite.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    favorite.addEventListener("click", (event) => toggleFavorite(event, card, favorite));
    thumb.append(favorite);
  }
  favorite.classList.toggle("is-favorite", Boolean(item?.favorite));
  favorite.setAttribute("aria-pressed", String(Boolean(item?.favorite)));
  favorite.title = item?.favorite ? "Remove from favorites" : "Add to favorites";

  const action = card.querySelector(".h3s-demo-card-action");
  if (action && item) {
    let runtime = action.querySelector(".h3s-history-runtime");
    if (!runtime) {
      runtime = document.createElement("span");
      runtime.className = "h3s-history-runtime";
      action.insertBefore(runtime, action.lastElementChild);
    }
    const pieces = [];
    if (Number(item.ref_count) > 0) pieces.push(`${item.ref_count} ref${Number(item.ref_count) === 1 ? "" : "s"}`);
    const total = formatDuration(item.total_seconds);
    if (total) pieces.push(total);
    runtime.textContent = pieces.join(" · ");
  }
}

function cardMediaKey(card) {
  const image = card.querySelector("img.h3s-demo-thumb");
  return canonicalUrl(image?.dataset?.fullSrc || image?.src || "");
}

function applyFilterAndOrder(shelf) {
  const body = shelf.querySelector(".h3s-demos-body");
  if (!body) return;
  const cards = [...body.querySelectorAll(".h3s-demo-card[data-kind='history']")];
  const byUrl = new Map();
  const byId = new Map();
  for (const card of cards) {
    const key = cardMediaKey(card);
    if (key) {
      if (byUrl.has(key)) {
        card.remove();
        continue;
      }
      byUrl.set(key, card);
    }
    byId.set(String(card.dataset.demoId || ""), card);
  }

  const allowedUrls = new Set(serverItems.map((item) => canonicalUrl(item.url)).filter(Boolean));
  const allowedIds = new Set(serverItems.map((item) => String(item.id || "")));
  for (const card of byId.values()) {
    const key = cardMediaKey(card);
    card.style.display = (key && allowedUrls.has(key)) || allowedIds.has(String(card.dataset.demoId || "")) ? "" : "none";
  }
  for (const item of serverItems) {
    const card = byUrl.get(canonicalUrl(item.url)) || byId.get(String(item.id || ""));
    if (card) body.append(card);
  }

  let empty = body.querySelector(".h3s-history-no-results");
  const visible = [...body.querySelectorAll(".h3s-demo-card[data-kind='history']")]
    .filter((card) => card.style.display !== "none").length;
  if (!visible && cards.length) {
    if (!empty) {
      empty = document.createElement("div");
      empty.className = "h3s-history-no-results";
      body.append(empty);
    }
    empty.textContent = "No generations match this library view.";
  } else {
    empty?.remove();
  }
}

function decorateShelf(shelf) {
  const historyTab = shelf.querySelector(".h3s-shelf-tab:nth-child(2)");
  const active = historyTab?.classList.contains("is-active");
  const existing = shelf.querySelector(":scope > .h3s-history-library");
  if (!active) {
    if (existing) existing.style.display = "none";
    return;
  }
  const bar = buildToolbar(shelf);
  bar.style.display = "grid";
  refreshToolbar(bar);
  for (const card of shelf.querySelectorAll(".h3s-demo-card[data-kind='history']")) decorateCard(card);
  applyFilterAndOrder(shelf);
  if (historyTab && serverAvailable) historyTab.textContent = `History ${totalIndexed}`;
}

function decorateAll() {
  for (const shelf of document.querySelectorAll(".h3s-demos-shelf")) decorateShelf(shelf);
}

function relevantMutation(mutation) {
  for (const node of mutation.addedNodes || []) {
    if (!(node instanceof Element)) continue;
    if (node.matches?.(".h3s-demos-shelf,.h3s-demo-card,.h3s-demos-body") || node.querySelector?.(".h3s-demos-shelf,.h3s-demo-card")) return true;
  }
  return false;
}

installStorageSync();
installStyles();
api.addEventListener("execution_success", schedulePush);

new MutationObserver((mutations) => {
  if (!mutations.some(relevantMutation) || observerQueued) return;
  observerQueued = true;
  requestAnimationFrame(() => {
    observerQueued = false;
    decorateAll();
  });
}).observe(document.documentElement, { childList: true, subtree: true });

(async () => {
  await pushLocalHistory();
  await refreshLibrary({ merge: true });
  decorateAll();
})();
