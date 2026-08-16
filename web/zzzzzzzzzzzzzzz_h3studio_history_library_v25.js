import { api } from "../../scripts/api.js";

const HISTORY_KEY = "h3studio-history-v2";
const BACKUP_KEY = "h3studio-history-v18-unbounded";
const HIDDEN_KEY = "h3studio-history-v18-hidden";
const PREFS_KEY = "h3studio-history-library-v25-prefs";
const ENDPOINT = "/h3studio/history";
const STYLE_ID = "h3studio-history-library-v25-style";
const MAX_LOCAL_ITEMS = 1200;
const MAX_LOCAL_BYTES = 1_500_000;

let suppressStorageSync = false;
let pushTimer = 0;
let refreshTimer = 0;
let allItems = [];
let viewItems = [];
let allByUrl = new Map();
let allById = new Map();
let samplers = [];
let totalIndexed = 0;
let serverAvailable = true;

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

function compactState(state) {
  const source = state && typeof state === "object" ? state : {};
  const generation = source.generation && typeof source.generation === "object" ? source.generation : {};
  const ui = source.ui && typeof source.ui === "object" ? source.ui : {};
  return {
    prompt: String(source.prompt || "").replace(/\s+/g, " ").trim().slice(0, 220),
    generation: {
      aspect_ratio: generation.aspect_ratio || "",
      megapixels: generation.megapixels ?? null,
      sampling_profile: generation.sampling_profile || "",
      seed: generation.seed ?? null,
    },
    ui: { director_node_id: ui.director_node_id ?? "" },
  };
}

function compactItem(item) {
  return {
    id: String(item?.id || ""),
    url: String(item?.url || item?.image || ""),
    timestamp: Number(item?.timestamp || Date.now()),
    title: String(item?.title || "H3 Studio generation").slice(0, 160),
    favorite: Boolean(item?.favorite),
    sampling_seconds: Number.isFinite(Number(item?.sampling_seconds)) ? Number(item.sampling_seconds) : undefined,
    total_seconds: Number.isFinite(Number(item?.total_seconds)) ? Number(item.total_seconds) : undefined,
    ref_count: Number.isFinite(Number(item?.ref_count)) ? Number(item.ref_count) : undefined,
    state: compactState(item?.state),
  };
}

function compactList(items) {
  const byMedia = new Map();
  const idOnly = new Map();
  for (const raw of items || []) {
    if (!raw || typeof raw !== "object") continue;
    const item = compactItem(raw);
    const media = canonicalUrl(item.url);
    if (media) {
      const old = byMedia.get(media);
      if (!old || item.timestamp > old.timestamp) byMedia.set(media, item);
      continue;
    }
    if (item.id && !idOnly.has(item.id)) idOnly.set(item.id, item);
  }
  let result = [...byMedia.values(), ...idOnly.values()]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_LOCAL_ITEMS);
  let encoded = JSON.stringify(result);
  while (encoded.length > MAX_LOCAL_BYTES && result.length > 50) {
    result = result.slice(0, Math.max(50, Math.floor(result.length * 0.8)));
    encoded = JSON.stringify(result);
  }
  return { items: result, encoded };
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

async function upsertChunks(items) {
  const valid = (items || []).filter((item) => item && typeof item === "object" && (item.url || item.image));
  for (let i = 0; i < valid.length; i += 20) {
    await jsonRequest(`${ENDPOINT}/upsert`, {
      method: "POST",
      body: JSON.stringify({ items: valid.slice(i, i + 20) }),
    });
  }
}

function scheduleUpsert(items) {
  clearTimeout(pushTimer);
  const snapshot = Array.isArray(items) ? items : [];
  pushTimer = setTimeout(async () => {
    try {
      await upsertChunks(snapshot);
      serverAvailable = true;
      await refreshLibrary({ refreshCache: true, rerender: true });
    } catch (error) {
      serverAvailable = false;
      console.debug("[H3 Studio] history SQLite sync skipped:", error);
    }
  }, 180);
}

function installCompactStorage() {
  if (Storage.prototype.__h3sHistoryV25) return;
  Storage.prototype.__h3sHistoryV25 = true;
  const previousSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function h3studioCompactHistorySet(key, value) {
    if (this !== localStorage || (key !== HISTORY_KEY && key !== BACKUP_KEY)) {
      return previousSet.call(this, key, value);
    }
    const full = parseList(value);
    if (!suppressStorageSync && key === HISTORY_KEY && full.length) scheduleUpsert(full);
    const { encoded } = compactList(full);
    return previousSet.call(this, key, encoded);
  };
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

function libraryParams() {
  const state = prefs();
  const query = new URLSearchParams({ limit: "1200", sort: state.sort || "newest" });
  if (state.q?.trim()) query.set("q", state.q.trim());
  if (state.favorite) query.set("favorite", "1");
  if (state.sampler) query.set("sampler", state.sampler);
  return query;
}

function rebuildMaps() {
  allByUrl = new Map();
  allById = new Map();
  for (const item of allItems) {
    if (item?.id) allById.set(String(item.id), item);
    const key = canonicalUrl(item?.url);
    if (key) allByUrl.set(key, item);
  }
}

function writeLocalCache(items) {
  const { encoded } = compactList(items);
  suppressStorageSync = true;
  try {
    localStorage.removeItem(BACKUP_KEY);
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(HIDDEN_KEY);
    localStorage.setItem(HISTORY_KEY, encoded);
  } catch (error) {
    console.warn("[H3 Studio] compact history cache write failed:", error);
  } finally {
    suppressStorageSync = false;
  }
}

async function refreshLibrary({ refreshCache = false, rerender = false } = {}) {
  try {
    const filtered = await jsonRequest(`${ENDPOINT}/library?${libraryParams().toString()}`);
    viewItems = Array.isArray(filtered.items) ? filtered.items : [];
    samplers = Array.isArray(filtered.samplers) ? filtered.samplers : [];
    totalIndexed = Number(filtered.total || 0);
    serverAvailable = true;

    if (refreshCache || !allItems.length) {
      const full = await jsonRequest(`${ENDPOINT}/library?limit=1200&sort=newest`);
      allItems = Array.isArray(full.items) ? full.items : [];
      totalIndexed = Number(full.total || totalIndexed || 0);
      samplers = Array.isArray(full.samplers) ? full.samplers : samplers;
      rebuildMaps();
      writeLocalCache(allItems);
    }
  } catch (error) {
    serverAvailable = false;
    const local = parseList(localStorage.getItem(HISTORY_KEY));
    allItems = compactList(local).items;
    viewItems = [...allItems];
    totalIndexed = allItems.length;
    rebuildMaps();
    console.debug("[H3 Studio] history library using compact local cache:", error);
  }
  if (rerender) rerenderActiveHistory();
  else decorateActiveShelves();
}

function starSvg() {
  return `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m8 2 1.75 3.55 3.92.57-2.84 2.77.67 3.91L8 10.96 4.5 12.8l.67-3.91-2.84-2.77 3.92-.57L8 2Z"/></svg>`;
}

function searchSvg() {
  return `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>`;
}

function refreshSvg() {
  return `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 5V2.8l-1.45 1.4A5.2 5.2 0 1 0 13 9"/></svg>`;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3s-history-library-v25{display:none;grid-template-columns:minmax(150px,1fr) auto auto auto auto auto;gap:6px;align-items:center;padding:7px 10px;border-bottom:1px solid #242a2f;background:#101416}
    .h3s-history-library-v25.is-active{display:grid}.h3s-h25-search-wrap{position:relative;min-width:0}.h3s-h25-search-wrap>svg{position:absolute;left:8px;top:50%;transform:translateY(-50%);width:12px;height:12px;fill:none;stroke:#66737a;stroke-width:1.5;pointer-events:none}
    .h3s-h25-search,.h3s-h25-sort,.h3s-h25-sampler{box-sizing:border-box;height:27px;border:1px solid #2b3237;border-radius:6px;background:#151a1e;color:#cbd4d9;font:600 8.5px/1 inherit;outline:none}.h3s-h25-search{width:100%;padding:0 9px 0 27px}.h3s-h25-search:focus,.h3s-h25-sort:focus,.h3s-h25-sampler:focus{border-color:#596871}.h3s-h25-sort,.h3s-h25-sampler{max-width:132px;padding:0 8px;cursor:pointer}
    .h3s-h25-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:27px;padding:0 8px;border:1px solid #2b3237;border-radius:6px;background:#151a1e;color:#87949c;font:700 8px/1 inherit;cursor:pointer;white-space:nowrap}.h3s-h25-btn:hover{border-color:#4a565e;color:#d4dce0}.h3s-h25-btn.is-active{border-color:#6b5940;background:#211d17;color:#e2bd7e}.h3s-h25-btn svg{width:11px;height:11px;fill:none;stroke:currentColor;stroke-width:1.45;stroke-linecap:round;stroke-linejoin:round}.h3s-h25-count{min-width:52px;text-align:right;color:#66737a;font-size:7.5px;white-space:nowrap}
    .h3s-demo-card[data-kind='history'] .h3s-history-favorite{position:absolute;z-index:20;right:7px;top:7px;display:grid;place-items:center;width:24px;height:24px;padding:0;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:rgba(12,15,17,.88);color:#d7dee2;cursor:pointer;opacity:.9;pointer-events:auto;transition:opacity .12s ease,color .12s ease,background .12s ease,transform .12s ease}.h3s-demo-card[data-kind='history'] .h3s-history-favorite:hover{opacity:1;transform:scale(1.06);background:rgba(20,25,29,.94);color:#fff}.h3s-demo-card[data-kind='history'] .h3s-history-favorite.is-favorite{color:#e7bd70;border-color:rgba(231,189,112,.42);background:#211c14}.h3s-history-favorite svg{width:13px;height:13px;stroke:currentColor;stroke-width:1.45;fill:transparent;stroke-linejoin:round}.h3s-history-favorite.is-favorite svg{fill:currentColor}
    @media(max-width:760px){.h3s-history-library-v25{grid-template-columns:minmax(120px,1fr) auto auto auto}.h3s-h25-sampler,.h3s-h25-count{display:none}}
  `;
  document.head.append(style);
}

function itemForCard(card) {
  const image = card?.querySelector?.("img.h3s-demo-thumb");
  const key = canonicalUrl(image?.dataset?.fullSrc || image?.src || "");
  return (key && allByUrl.get(key)) || allById.get(String(card?.dataset?.demoId || "")) || null;
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

async function toggleFavorite(event, card, button) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  if (button.dataset.busy === "1") return;
  const item = itemForCard(card);
  if (!item) return;
  button.dataset.busy = "1";
  const previous = Boolean(item.favorite);
  const next = !previous;
  item.favorite = next;
  button.classList.toggle("is-favorite", next);
  try {
    const result = await jsonRequest(`${ENDPOINT}/favorite`, {
      method: "POST",
      body: JSON.stringify({ id: item.id, favorite: next }),
    });
    if (!result?.ok) throw new Error("Favorite update failed");
    await refreshLibrary({ refreshCache: true, rerender: Boolean(prefs().favorite) });
  } catch (error) {
    item.favorite = previous;
    button.classList.toggle("is-favorite", previous);
    console.warn("[H3 Studio] favorite update failed:", error);
  } finally {
    delete button.dataset.busy;
  }
}

function decorateCard(card) {
  const item = itemForCard(card);
  const image = card.querySelector("img.h3s-demo-thumb");
  const thumbBox = card.querySelector(".h3s-demo-thumb-box");
  if (!image || !thumbBox) return;
  const full = String(item?.url || image.dataset.fullSrc || image.src || "");
  if (full && !image.dataset.fullSrc) image.dataset.fullSrc = full;
  if (full && image.dataset.h3sThumbV25 !== "1") {
    const thumb = thumbnailUrl(full);
    image.dataset.h3sThumbV25 = "1";
    image.loading = "lazy";
    image.decoding = "async";
    try { image.fetchPriority = "low"; } catch {}
    if (thumb) image.src = thumb;
  }

  let star = thumbBox.querySelector(".h3s-history-favorite");
  if (!star) {
    star = document.createElement("button");
    star.type = "button";
    star.className = "h3s-history-favorite";
    star.setAttribute("aria-label", "Favorite generation");
    star.innerHTML = starSvg();
    star.addEventListener("pointerdown", (event) => event.stopPropagation());
    star.addEventListener("click", (event) => toggleFavorite(event, card, star));
    thumbBox.append(star);
  }
  star.classList.toggle("is-favorite", Boolean(item?.favorite));
  star.title = item?.favorite ? "Remove from favorites" : "Add to favorites";
}

function applyView(shelf) {
  const body = shelf.querySelector(".h3s-demos-body");
  if (!body) return;
  const cards = [...body.querySelectorAll(".h3s-demo-card[data-kind='history']")];
  const byUrl = new Map();
  const byId = new Map();
  for (const card of cards) {
    decorateCard(card);
    const image = card.querySelector("img.h3s-demo-thumb");
    const key = canonicalUrl(image?.dataset?.fullSrc || image?.src || "");
    if (key && !byUrl.has(key)) byUrl.set(key, card);
    byId.set(String(card.dataset.demoId || ""), card);
  }
  const allowed = new Set(viewItems.map((item) => canonicalUrl(item.url)).filter(Boolean));
  const allowedIds = new Set(viewItems.map((item) => String(item.id || "")));
  for (const card of cards) {
    const image = card.querySelector("img.h3s-demo-thumb");
    const key = canonicalUrl(image?.dataset?.fullSrc || image?.src || "");
    card.style.display = (key && allowed.has(key)) || allowedIds.has(String(card.dataset.demoId || "")) ? "" : "none";
  }
  for (const item of viewItems) {
    const card = byUrl.get(canonicalUrl(item.url)) || byId.get(String(item.id || ""));
    if (card && body.lastElementChild !== card) body.append(card);
  }
}

function buildToolbar(shelf) {
  let bar = shelf.querySelector(":scope > .h3s-history-library-v25");
  if (bar) return bar;
  bar = document.createElement("div");
  bar.className = "h3s-history-library-v25";

  const searchWrap = document.createElement("label");
  searchWrap.className = "h3s-h25-search-wrap";
  searchWrap.innerHTML = searchSvg();
  const search = document.createElement("input");
  search.type = "search";
  search.className = "h3s-h25-search";
  search.placeholder = "Search prompt, seed, reference…";
  search.value = prefs().q || "";
  searchWrap.append(search);

  const favorite = document.createElement("button");
  favorite.type = "button";
  favorite.className = "h3s-h25-btn h3s-h25-favorites";
  favorite.innerHTML = `${starSvg()}<span>Favorites</span>`;
  favorite.classList.toggle("is-active", Boolean(prefs().favorite));

  const sampler = document.createElement("select");
  sampler.className = "h3s-h25-sampler";
  const sort = document.createElement("select");
  sort.className = "h3s-h25-sort";
  sort.innerHTML = `<option value="newest">Newest</option><option value="oldest">Oldest</option><option value="favorites">Favorites first</option><option value="largest">Largest</option><option value="fastest">Fastest</option>`;
  sort.value = prefs().sort || "newest";

  const rebuild = document.createElement("button");
  rebuild.type = "button";
  rebuild.className = "h3s-h25-btn h3s-h25-rebuild";
  rebuild.innerHTML = `${refreshSvg()}<span>Re-index</span>`;

  const count = document.createElement("span");
  count.className = "h3s-h25-count";

  search.addEventListener("input", () => {
    savePrefs({ ...prefs(), q: search.value });
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshLibrary({ rerender: false }), 130);
  });
  favorite.addEventListener("click", () => {
    const next = { ...prefs(), favorite: !prefs().favorite };
    savePrefs(next);
    favorite.classList.toggle("is-active", next.favorite);
    refreshLibrary();
  });
  sampler.addEventListener("change", () => {
    savePrefs({ ...prefs(), sampler: sampler.value });
    refreshLibrary();
  });
  sort.addEventListener("change", () => {
    savePrefs({ ...prefs(), sort: sort.value });
    refreshLibrary();
  });
  rebuild.addEventListener("click", async () => {
    rebuild.disabled = true;
    rebuild.querySelector("span").textContent = "Indexing…";
    try {
      await jsonRequest(`${ENDPOINT}/rebuild`, { method: "POST", body: "{}" });
      await refreshLibrary({ refreshCache: true, rerender: true });
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

function updateToolbar(shelf) {
  const bar = buildToolbar(shelf);
  const active = shelf.querySelector(".h3s-shelf-tab:nth-child(2)")?.classList.contains("is-active");
  bar.classList.toggle("is-active", Boolean(active));
  if (!active) return;
  const sampler = bar.querySelector(".h3s-h25-sampler");
  const current = prefs().sampler || "";
  sampler.replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All samplers";
  sampler.append(all);
  for (const value of samplers) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = String(value).replace(/^lightx_v1_fl2v_/, "LightX ").replace(/_/g, " ");
    sampler.append(option);
  }
  sampler.value = current;
  bar.querySelector(".h3s-h25-favorites")?.classList.toggle("is-active", Boolean(prefs().favorite));
  const count = bar.querySelector(".h3s-h25-count");
  count.textContent = serverAvailable ? `${viewItems.length}/${totalIndexed}` : `${allItems.length} local`;
}

function decorateShelf(shelf) {
  updateToolbar(shelf);
  const historyActive = shelf.querySelector(".h3s-shelf-tab:nth-child(2)")?.classList.contains("is-active");
  if (!historyActive) return;
  applyView(shelf);
}

function decorateActiveShelves() {
  for (const shelf of document.querySelectorAll(".h3s-demos-shelf")) decorateShelf(shelf);
}

let rerendering = false;
function rerenderActiveHistory() {
  if (rerendering) return;
  rerendering = true;
  for (const shelf of document.querySelectorAll(".h3s-demos-shelf")) {
    const tab = shelf.querySelector(".h3s-shelf-tab:nth-child(2)");
    if (tab?.classList.contains("is-active")) tab.click();
  }
  requestAnimationFrame(() => {
    rerendering = false;
    decorateActiveShelves();
  });
}

document.addEventListener("click", (event) => {
  const tab = event.target?.closest?.(".h3s-shelf-tab");
  if (!tab) return;
  const shelf = tab.closest(".h3s-demos-shelf");
  if (!shelf) return;
  requestAnimationFrame(() => decorateShelf(shelf));
}, true);

new MutationObserver((mutations, observer) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes || []) {
      if (!(node instanceof Element)) continue;
      const shelves = [];
      if (node.matches?.(".h3s-demos-shelf")) shelves.push(node);
      shelves.push(...(node.querySelectorAll?.(".h3s-demos-shelf") || []));
      for (const shelf of shelves) requestAnimationFrame(() => decorateShelf(shelf));
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true });

api.addEventListener("execution_success", () => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refreshLibrary({ refreshCache: true, rerender: true }), 450);
});

installStyles();
installCompactStorage();

(async () => {
  const legacy = [
    ...parseList(localStorage.getItem(BACKUP_KEY)),
    ...parseList(localStorage.getItem(HISTORY_KEY)),
  ];
  if (legacy.length) {
    try { await upsertChunks(legacy); } catch (error) { console.debug("[H3 Studio] legacy history migration skipped:", error); }
  }
  writeLocalCache(legacy);
  await refreshLibrary({ refreshCache: true, rerender: true });
})();
