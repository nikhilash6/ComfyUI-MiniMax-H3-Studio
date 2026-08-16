import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const HISTORY_KEY = "h3studio-history-v2";
const HISTORY_BACKUP_KEY = "h3studio-history-v18-unbounded";
const PREFS_KEY = "h3studio-history-library-v22-prefs";
const STYLE_ID = "h3studio-history-library-v22-style";
const ENDPOINT = "/h3studio/history";

let serverItems = [];
let serverById = new Map();
let samplers = [];
let totalIndexed = 0;
let syncing = false;
let syncTimer = 0;
let filterTimer = 0;
let serverAvailable = true;

function parseList(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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
  const seen = new Set();
  const result = [];
  for (const item of merged) {
    const id = String(item?.id || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(item);
  }
  return result;
}

function directorTiming(item) {
  const id = Number(item?.state?.ui?.director_node_id);
  const node = app.graph?.getNodeById?.(id);
  const timing = node?.__h3studioRunTiming || {};
  return {
    sampling_seconds: Number.isFinite(Number(timing.samplingSeconds))
      ? Number(timing.samplingSeconds)
      : undefined,
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
  const local = historyItems();
  const byId = new Map(local.map((item) => [String(item.id), item]));
  for (const item of items || []) {
    const id = String(item?.id || "");
    if (!id) continue;
    const existing = byId.get(id);
    byId.set(id, existing ? { ...item, ...existing, favorite: item.favorite } : item);
  }
  const merged = [...byId.values()].sort((a, b) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0));
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

async function refreshLibrary({ merge = false } = {}) {
  try {
    const payload = await jsonRequest(`${ENDPOINT}/library?${libraryParams().toString()}`);
    serverItems = Array.isArray(payload.items) ? payload.items : [];
    serverById = new Map(serverItems.map((item) => [String(item.id), item]));
    samplers = Array.isArray(payload.samplers) ? payload.samplers : [];
    totalIndexed = Number(payload.total || 0);
    serverAvailable = true;
    if (merge) {
      const all = await jsonRequest(`${ENDPOINT}/library?limit=5000&sort=newest`);
      mergeServerIntoLocal(Array.isArray(all.items) ? all.items : []);
      for (const tab of document.querySelectorAll(".h3s-shelf-tab:nth-child(2).is-active")) tab.click();
    }
  } catch (error) {
    serverAvailable = false;
    serverItems = historyItems();
    serverById = new Map(serverItems.map((item) => [String(item.id), item]));
    totalIndexed = serverItems.length;
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
    .h3s-history-favorite{position:absolute;z-index:7;right:7px;top:7px;display:grid;place-items:center;width:21px;height:21px;padding:0;border:0;border-radius:6px;background:rgba(7,10,12,.48);backdrop-filter:blur(6px);color:rgba(235,240,243,.58);cursor:pointer;opacity:.15;transition:opacity .12s ease,color .12s ease,background .12s ease}.h3s-demo-card:hover .h3s-history-favorite,.h3s-history-favorite.is-favorite{opacity:1}.h3s-history-favorite:hover{background:rgba(10,13,15,.78);color:#fff}.h3s-history-favorite.is-favorite{color:#e7bd70}.h3s-history-favorite svg{width:12px;height:12px;stroke:currentColor;stroke-width:1.45;fill:transparent;stroke-linejoin:round}.h3s-history-favorite.is-favorite svg{fill:currentColor}
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

async function toggleFavorite(event, card, button) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  const id = String(card.dataset.demoId || "");
  const item = serverById.get(id);
  const next = !Boolean(item?.favorite);
  button.classList.toggle("is-favorite", next);
  if (item) item.favorite = next;
  try {
    await jsonRequest(`${ENDPOINT}/favorite`, {
      method: "POST",
      body: JSON.stringify({ id, favorite: next }),
    });
    await refreshLibrary();
  } catch (error) {
    button.classList.toggle("is-favorite", !next);
    if (item) item.favorite = !next;
    console.warn("[H3 Studio] favorite update failed:", error);
  }
}

function decorateCard(card) {
  const id = String(card.dataset.demoId || "");
  const item = serverById.get(id);
  const thumb = card.querySelector(".h3s-demo-thumb-box");
  if (!thumb) return;
  let favorite = thumb.querySelector(".h3s-history-favorite");
  if (!favorite) {
    favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = "h3s-history-favorite";
    favorite.title = "Favorite";
    favorite.setAttribute("aria-label", "Favorite generation");
    favorite.innerHTML = starSvg();
    favorite.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    favorite.addEventListener("click", (event) => toggleFavorite(event, card, favorite));
    thumb.append(favorite);
  }
  favorite.classList.toggle("is-favorite", Boolean(item?.favorite));

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

function applyFilterAndOrder(shelf) {
  const body = shelf.querySelector(".h3s-demos-body");
  if (!body) return;
  const cards = [...body.querySelectorAll(".h3s-demo-card[data-kind='history']")];
  const byId = new Map(cards.map((card) => [String(card.dataset.demoId || ""), card]));
  const allowed = new Set(serverItems.map((item) => String(item.id || "")));
  for (const card of cards) card.style.display = allowed.has(String(card.dataset.demoId || "")) ? "" : "none";
  for (const item of serverItems) {
    const card = byId.get(String(item.id || ""));
    if (card) body.append(card);
  }
  let empty = body.querySelector(".h3s-history-no-results");
  const visible = cards.filter((card) => card.style.display !== "none").length;
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

installStorageSync();
installStyles();
api.addEventListener("execution_success", schedulePush);

let observerQueued = false;
new MutationObserver(() => {
  if (observerQueued) return;
  observerQueued = true;
  requestAnimationFrame(() => {
    observerQueued = false;
    decorateAll();
  });
}).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["class"],
});

(async () => {
  await pushLocalHistory();
  await refreshLibrary({ merge: true });
  decorateAll();
})();
