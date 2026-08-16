const STYLE_ID = "h3studio-history-interactions-v24-style";
const ENDPOINT = "/h3studio/history";

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

function fullUrlForCard(card) {
  const image = card?.querySelector?.("img.h3s-demo-thumb");
  for (const candidate of [image?.dataset?.fullSrc, image?.currentSrc, image?.src]) {
    const value = String(candidate || "").trim();
    if (!value || value.includes("/h3studio/thumbnail?")) continue;
    return value;
  }
  return "";
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

async function serverItemForCard(card) {
  const wanted = canonicalUrl(fullUrlForCard(card));
  const id = String(card?.dataset?.demoId || "");
  const payload = await jsonRequest(`${ENDPOINT}/library?limit=5000&sort=newest`);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.find((item) => canonicalUrl(item?.url) === wanted)
    || items.find((item) => String(item?.id || "") === id)
    || null;
}

async function toggleFavorite(card, button) {
  if (button.dataset.busy === "1") return;
  button.dataset.busy = "1";
  const prior = button.classList.contains("is-favorite");
  const next = !prior;
  button.classList.toggle("is-favorite", next);
  button.setAttribute("aria-pressed", String(next));
  button.title = next ? "Remove from favorites" : "Add to favorites";
  try {
    const item = await serverItemForCard(card);
    if (!item) throw new Error("History item is not indexed yet.");
    const result = await jsonRequest(`${ENDPOINT}/favorite`, {
      method: "POST",
      body: JSON.stringify({ id: item.id, favorite: next }),
    });
    if (!result?.ok) throw new Error("Favorite update was not accepted.");
  } catch (error) {
    button.classList.toggle("is-favorite", prior);
    button.setAttribute("aria-pressed", String(prior));
    button.title = prior ? "Remove from favorites" : "Add to favorites";
    console.warn("[H3 Studio] favorite update failed:", error);
  } finally {
    delete button.dataset.busy;
  }
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3s-demo-card[data-kind='history']{
      contain:none!important;
      content-visibility:visible!important;
      transition:transform .14s ease,border-color .14s ease,box-shadow .14s ease!important;
    }
    .h3s-demo-card[data-kind='history']:hover{
      transform:translateY(-2px)!important;
      border-color:#59656e!important;
      box-shadow:0 5px 15px rgba(0,0,0,.34)!important;
    }
    .h3s-demo-card[data-kind='history'] .h3s-demo-thumb{
      transition:transform .22s ease!important;
      transform:scale(1)!important;
    }
    .h3s-demo-card[data-kind='history']:hover .h3s-demo-thumb{
      transform:scale(1.025)!important;
    }
    .h3s-demo-card[data-kind='history'] .h3s-history-favorite{
      pointer-events:auto!important;
      display:grid!important;
      visibility:visible!important;
      opacity:.92!important;
      z-index:20!important;
      cursor:pointer!important;
    }
    .h3s-demo-card[data-kind='history'] .h3s-history-favorite:hover{opacity:1!important}
  `;
  document.head.append(style);
}

window.addEventListener("click", (event) => {
  const button = event.target?.closest?.(".h3s-history-favorite");
  if (!button) return;
  const card = button.closest(".h3s-demo-card[data-kind='history']");
  if (!card) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  toggleFavorite(card, button);
}, true);

installStyles();
