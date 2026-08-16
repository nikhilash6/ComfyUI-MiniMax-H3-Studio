import { openImageLightbox } from "./js/core/lightbox.js";

const HISTORY_KEY = "h3studio-history-v2";
const HISTORY_BACKUP_KEY = "h3studio-history-v18-unbounded";
const STYLE_ID = "h3studio-history-v23-style";

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
    return `${url.pathname}?${url.searchParams.toString()}`;
  } catch {
    return String(value || "");
  }
}

function score(item) {
  const id = String(item?.id || "");
  const url = String(item?.url || item?.image || "").toLowerCase();
  return (
    (id.startsWith("gen_") ? 100 : 0)
    + (url.includes("type=output") ? 40 : 0)
    + (item?.favorite ? 10 : 0)
    + (item?.state ? 5 : 0)
    + Math.min(4, Math.max(0, Number(item?.timestamp || 0) / 1e15))
  );
}

function dedupeBrowserHistory(items) {
  const byMedia = new Map();
  const idOnly = [];
  for (const item of items || []) {
    if (!item || typeof item !== "object") continue;
    const media = canonicalUrl(item.url || item.image);
    if (!media) {
      idOnly.push(item);
      continue;
    }
    const old = byMedia.get(media);
    if (!old || score(item) > score(old)) {
      if (old?.favorite && !item.favorite) item.favorite = true;
      byMedia.set(media, item);
    } else if (item.favorite && !old.favorite) {
      old.favorite = true;
    }
  }
  const seenIds = new Set();
  return [...byMedia.values(), ...idOnly]
    .filter((item) => {
      const id = String(item?.id || "");
      if (!id || seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    })
    .sort((a, b) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0));
}

function cleanBrowserHistory() {
  const clean = dedupeBrowserHistory([
    ...parseList(localStorage.getItem(HISTORY_KEY)),
    ...parseList(localStorage.getItem(HISTORY_BACKUP_KEY)),
  ]);
  try {
    localStorage.setItem(HISTORY_BACKUP_KEY, JSON.stringify(clean));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(clean));
  } catch (error) {
    console.debug("[H3 Studio] history browser cleanup skipped:", error);
  }
  return clean;
}

let browserItems = cleanBrowserHistory();
let browserById = new Map(browserItems.map((item) => [String(item?.id || ""), item]));

function refreshBrowserMap() {
  browserItems = dedupeBrowserHistory([
    ...parseList(localStorage.getItem(HISTORY_KEY)),
    ...parseList(localStorage.getItem(HISTORY_BACKUP_KEY)),
  ]);
  browserById = new Map(browserItems.map((item) => [String(item?.id || ""), item]));
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

function previewFallback(fullUrl) {
  try {
    const url = new URL(String(fullUrl || ""), location.href);
    url.searchParams.set("preview", "webp;80");
    return `${url.pathname}?${url.searchParams.toString()}`;
  } catch {
    return String(fullUrl || "");
  }
}

const pendingImages = new WeakMap();
const imageObserver = typeof IntersectionObserver === "function"
  ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const image = entry.target;
        const source = pendingImages.get(image);
        if (source && !image.src) image.src = source;
        imageObserver.unobserve(image);
      }
    }, { root: null, rootMargin: "700px" })
  : null;

function historyItemForCard(card) {
  const id = String(card?.dataset?.demoId || "");
  const exact = browserById.get(id);
  if (exact) return exact;
  const image = card?.querySelector?.("img.h3s-demo-thumb");
  const wanted = canonicalUrl(image?.dataset?.fullSrc || image?.src || "");
  if (!wanted) return null;
  return browserItems.find((item) => canonicalUrl(item?.url || item?.image) === wanted) || null;
}

function optimizeImage(card) {
  const image = card.querySelector("img.h3s-demo-thumb");
  if (!image || image.dataset.h3sV23 === "1") return;
  const item = historyItemForCard(card);
  const fullSrc = String(item?.url || image.currentSrc || image.src || "");
  if (!fullSrc) return;

  image.dataset.h3sV23 = "1";
  image.dataset.fullSrc = fullSrc;
  image.loading = "lazy";
  image.decoding = "async";
  try { image.fetchPriority = "low"; } catch {}

  const thumb = thumbnailUrl(fullSrc) || previewFallback(fullSrc);
  image.removeAttribute("src");
  image.removeAttribute("srcset");
  image.onerror = () => {
    if (image.dataset.h3sFallback === "1") return;
    image.dataset.h3sFallback = "1";
    image.src = previewFallback(fullSrc);
  };

  pendingImages.set(image, thumb);
  if (imageObserver) imageObserver.observe(image);
  else image.src = thumb;
}

function optimizeCards() {
  refreshBrowserMap();
  for (const card of document.querySelectorAll(".h3s-demo-card[data-kind='history']")) {
    optimizeImage(card);
  }
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3s-demo-card[data-kind='history']{contain:layout paint style;content-visibility:auto;contain-intrinsic-size:288px 188px}
    .h3s-demo-card[data-kind='history'] .h3s-demo-thumb{background:#101416}
    .h3s-demo-card[data-kind='history'] .h3s-demo-category-tag,
    .h3s-demo-card[data-kind='history'] .h3s-demo-badge-specs,
    .h3s-demo-card[data-kind='history'] .h3s-history-favorite{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    .h3s-demo-card[data-kind='history'] .h3s-history-favorite{
      display:grid!important;visibility:visible!important;opacity:.92!important;
      width:24px!important;height:24px!important;right:7px!important;top:7px!important;
      border:1px solid rgba(255,255,255,.14)!important;border-radius:7px!important;
      background:rgba(12,15,17,.88)!important;color:#d7dee2!important;
      box-shadow:0 2px 8px rgba(0,0,0,.25)!important
    }
    .h3s-demo-card[data-kind='history'] .h3s-history-favorite:hover{opacity:1!important;color:#fff!important;background:#1a2024!important}
    .h3s-demo-card[data-kind='history'] .h3s-history-favorite.is-favorite{opacity:1!important;color:#f0c36f!important;border-color:rgba(240,195,111,.42)!important;background:#211c14!important}
    .h3s-demo-card[data-kind='history'] .h3s-history-favorite svg{width:13px!important;height:13px!important}
  `;
  document.head.append(style);
}

window.addEventListener("click", (event) => {
  const expand = event.target?.closest?.(".h3s-strip-expand");
  if (!expand) return;
  const card = expand.closest(".h3s-demo-card[data-kind='history']");
  if (!card) return;
  const image = card.querySelector("img.h3s-demo-thumb");
  const item = historyItemForCard(card);
  const fullSrc = image?.dataset?.fullSrc || item?.url || "";
  if (!fullSrc) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  openImageLightbox(fullSrc, image?.alt || "H3 Studio image");
}, true);

installStyles();
optimizeCards();

let queued = false;
new MutationObserver(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    optimizeCards();
  });
}).observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("storage", (event) => {
  if (event.key === HISTORY_KEY || event.key === HISTORY_BACKUP_KEY) optimizeCards();
});

setTimeout(() => {
  cleanBrowserHistory();
  optimizeCards();
}, 250);
