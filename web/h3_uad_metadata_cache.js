const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();
const inflight = new Map();

function isAnalyzeFast(input, init) {
  const url = typeof input === "string" ? input : input?.url;
  const method = String(init?.method || (typeof input !== "string" ? input?.method : "GET") || "GET").toUpperCase();
  return method === "POST" && url === "/uad/analyze-fast";
}

function cacheKey(init) {
  return String(init?.body || "");
}

function responseFrom(record) {
  return new Response(record.body, {
    status: record.status,
    statusText: record.statusText,
    headers: record.headers,
  });
}

if (!window.__h3studioUadMetadataCacheInstalled) {
  window.__h3studioUadMetadataCacheInstalled = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async function patchedFetch(input, init = {}) {
    if (!isAnalyzeFast(input, init)) return originalFetch(input, init);

    const key = cacheKey(init);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) return responseFrom(cached);
    if (cached) cache.delete(key);

    if (inflight.has(key)) return responseFrom(await inflight.get(key));

    const pending = (async () => {
      const response = await originalFetch(input, init);
      const body = await response.clone().text();
      const record = {
        body,
        status: response.status,
        statusText: response.statusText,
        headers: { "Content-Type": response.headers.get("content-type") || "application/json" },
        savedAt: Date.now(),
      };
      if (response.ok) cache.set(key, record);
      return record;
    })();

    inflight.set(key, pending);
    try {
      return responseFrom(await pending);
    } finally {
      inflight.delete(key);
    }
  };

  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.('.h3ms [data-action="metadata"]');
    if (!button) return;
    cache.clear();
  }, true);
}
