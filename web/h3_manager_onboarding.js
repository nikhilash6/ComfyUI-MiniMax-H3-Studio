import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const SETUP = "H3StudioModelSetup";
const UAD_SLUG = "comfyui-universal-asset-downloader";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function className(node) {
  return String(node?.comfyClass || node?.type || "");
}

async function fetchJson(path, options = {}) {
  const response = await api.fetchApi(path, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const error = new Error(data?.error || text || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function uadReady() {
  try {
    const status = await fetchJson("/uad/status");
    return Boolean(status?.capabilities?.install);
  } catch {
    return false;
  }
}

function controlLabel(element) {
  return [
    element?.textContent,
    element?.getAttribute?.("aria-label"),
    element?.getAttribute?.("title"),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findExtensionsButton() {
  if (typeof document === "undefined") return null;
  const controls = document.querySelectorAll('button,[role="button"]');
  for (const control of controls) {
    if (control.closest?.(".h3ms")) continue;
    const label = controlLabel(control);
    if (label === "extensions" || label.startsWith("extensions ")) return control;
  }
  return null;
}

function extensionsUiAvailable() {
  return Boolean(findExtensionsButton());
}

function openExtensions() {
  const button = findExtensionsButton();
  if (button) {
    button.click();
    return true;
  }
  toast(
    "Open Extensions",
    "Use the Extensions button in the ComfyUI toolbar to install Universal Asset Downloader.",
    "info",
  );
  return false;
}

async function managerSnapshot() {
  try {
    const installed = await fetchJson("/customnode/installed");
    return {
      available: true,
      apiAvailable: true,
      source: "installed-api",
      installed,
      hasUad: JSON.stringify(installed || {}).toLowerCase().includes(UAD_SLUG),
    };
  } catch {}

  try {
    await fetchJson("/manager/queue/status");
    return {
      available: true,
      apiAvailable: true,
      source: "queue-api",
      installed: null,
      hasUad: false,
    };
  } catch {}

  const uiAvailable = extensionsUiAvailable();
  return {
    available: uiAvailable,
    apiAvailable: false,
    source: uiAvailable ? "extensions-ui" : "unavailable",
    installed: null,
    hasUad: false,
  };
}

async function nativeConfirm() {
  const message = "Universal Asset Downloader is not installed. H3 Studio uses it for safe model verification, exact paths and one-click downloads. Install it now with ComfyUI-Manager?";
  try {
    return await app.extensionManager.dialog.confirm({
      title: "H3 Studio setup",
      message,
    });
  } catch {
    return window.confirm(message);
  }
}

function toast(summary, detail, severity = "info") {
  try {
    app.extensionManager.toast.add({ severity, summary, detail, life: 6000 });
  } catch {
    console.log(`[H3 Studio] ${summary}: ${detail}`);
  }
}

function packageHaystack(key, item) {
  return `${key} ${JSON.stringify(item || {})}`.toLowerCase();
}

async function findUadPackage() {
  const data = await fetchJson("/customnode/getlist?mode=default&skip_update=true");
  const packs = data?.node_packs || {};
  for (const [key, item] of Object.entries(packs)) {
    const haystack = packageHaystack(key, item);
    if (
      haystack.includes("thaakeno/comfyui-universal-asset-downloader") ||
      haystack.includes(UAD_SLUG) ||
      haystack.includes("universal asset downloader")
    ) {
      return { key, item: { ...item }, channel: data?.channel || "default" };
    }
  }
  return null;
}

async function waitForManagerQueue() {
  let sawProcessing = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await sleep(500);
    try {
      const status = await fetchJson("/manager/queue/status");
      if (status?.is_processing) sawProcessing = true;
      if (sawProcessing && !status?.is_processing) return;
    } catch {
      return;
    }
  }
}

async function installViaRegistry(setStatus) {
  const match = await findUadPackage();
  if (!match) throw Object.assign(new Error("UAD was not found in the current ComfyUI-Manager catalog."), { code: "not-found" });

  const payload = { ...match.item };
  payload.ui_id ||= payload.id || match.key;
  payload.id ||= match.key;
  payload.channel ||= match.channel;
  payload.mode ||= "default";

  if (!payload.version) payload.version = "unknown";
  if (payload.version === "unknown") {
    throw Object.assign(new Error("Manager found UAD only as an unregistered Git package, so the safe registry installer cannot be used."), { code: "unsafe-fallback" });
  }

  setStatus("Found UAD in ComfyUI-Manager. Queueing the latest registry version…");
  const installResponse = await api.fetchApi("/manager/queue/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!installResponse.ok) {
    const text = await installResponse.text();
    const error = new Error(text || `Manager install failed with HTTP ${installResponse.status}`);
    error.status = installResponse.status;
    throw error;
  }

  const startResponse = await api.fetchApi("/manager/queue/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!startResponse.ok && startResponse.status !== 201) {
    const text = await startResponse.text();
    throw new Error(text || `Manager queue start failed with HTTP ${startResponse.status}`);
  }

  setStatus("ComfyUI-Manager is installing UAD…");
  await waitForManagerQueue();

  const snapshot = await managerSnapshot();
  if (!snapshot.hasUad) {
    throw new Error("Manager finished, but UAD could not be confirmed in the installed package list. Open Extensions and check the install result.");
  }
}

function setPanelStatus(node, text) {
  const log = node?.__h3ModelSetup?.root?.querySelector?.("[data-log]");
  if (log) log.textContent = text;
}

function managerNote(snapshot) {
  if (snapshot.apiAvailable) {
    return "ComfyUI-Manager detected. In current ComfyUI builds, Manager is opened from the Extensions button.";
  }
  return "ComfyUI Extensions is available. This Manager build does not expose its install queue API to H3 Studio, so install Universal Asset Downloader from Extensions.";
}

function enhanceMissingPanel(node, snapshot) {
  const setup = node?.__h3ModelSetup;
  const root = setup?.root;
  if (!root || !snapshot?.available) return;

  if (setup.state) {
    setup.state.manager = true;
    setup.state.managerHasUad = Boolean(snapshot.hasUad);
    setup.state.managerApiAvailable = Boolean(snapshot.apiAvailable);
  }

  const card = root.querySelector(".h3ms-card.h3ms-missing");
  if (!card) return;

  for (const note of card.querySelectorAll(".h3ms-note")) {
    if (
      note.textContent?.includes("ComfyUI-Manager was not detected") ||
      note.textContent?.includes("ComfyUI Extensions is available") ||
      note.textContent?.includes("ComfyUI-Manager detected")
    ) {
      note.textContent = managerNote(snapshot);
    }
  }

  const actions = card.querySelector(".h3ms-actions");
  if (!actions || snapshot.hasUad) return;

  actions.querySelectorAll('[data-action="install-uad"]').forEach((button) => button.remove());
  actions.querySelectorAll(".h3ms-smart-install-uad,.h3ms-open-extensions").forEach((button) => button.remove());

  const button = document.createElement("button");
  button.type = "button";

  if (snapshot.apiAvailable) {
    button.className = "h3ms-btn h3ms-primary h3ms-smart-install-uad";
    button.textContent = "Install UAD now";
    button.title = "Install Universal Asset Downloader through ComfyUI-Manager's registry queue";
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      await runInstall(node, false);
    });
  } else {
    button.className = "h3ms-btn h3ms-primary h3ms-open-extensions";
    button.textContent = "Open Extensions";
    button.title = "Open the current ComfyUI Extensions manager";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openExtensions();
    });
  }

  actions.prepend(button);
}

async function runInstall(node, askFirst = true) {
  if (node.__h3UadInstalling) return;
  if (askFirst && !(await nativeConfirm())) return;

  node.__h3UadInstalling = true;
  const button = node?.__h3ModelSetup?.root?.querySelector?.(".h3ms-smart-install-uad");
  if (button) button.disabled = true;
  const setStatus = (text) => setPanelStatus(node, text);

  try {
    setStatus("Looking up Universal Asset Downloader in ComfyUI-Manager…");
    await installViaRegistry(setStatus);
    const message = "UAD installed successfully. Restart ComfyUI, then hard refresh/reload this workflow so the UAD backend and UI are registered.";
    setStatus(message);
    toast("UAD installed", "Restart ComfyUI, then hard refresh the browser.", "success");
  } catch (error) {
    const detail = error?.status === 403
      ? "Manager blocked the install because of its security policy. Open Extensions and install Universal Asset Downloader there."
      : `${error.message} You can also open Extensions and install Universal Asset Downloader manually.`;
    setStatus(`UAD install failed: ${detail}`);
    toast("UAD install failed", detail, "error");
  } finally {
    node.__h3UadInstalling = false;
    if (button) button.disabled = false;
  }
}

async function onboardNode(node) {
  if (!node || className(node) !== SETUP || node.__h3ManagerOnboardingStarted) return;
  node.__h3ManagerOnboardingStarted = true;

  const root = node?.__h3ModelSetup?.root;
  if (root && typeof MutationObserver !== "undefined") {
    const observer = new MutationObserver(async () => {
      if (await uadReady()) return;
      const snapshot = await managerSnapshot();
      enhanceMissingPanel(node, snapshot);
    });
    observer.observe(root, { childList: true, subtree: true });
    node.__h3ManagerObserver = observer;
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (await uadReady()) return;
    const snapshot = await managerSnapshot();
    if (snapshot.available) {
      enhanceMissingPanel(node, snapshot);
      if (snapshot.apiAvailable && !snapshot.hasUad && !node.__h3UadPrompted) {
        node.__h3UadPrompted = true;
        await sleep(250);
        await runInstall(node, true);
      }
      return;
    }
    await sleep(750);
  }
}

function findSetupNode() {
  return (app.graph?._nodes || []).find((node) => className(node) === SETUP) || null;
}

app.registerExtension({
  name: "H3Studio.ManagerOnboarding",
  afterConfigureGraph() {
    setTimeout(() => onboardNode(findSetupNode()), 50);
  },
  async nodeCreated(node) {
    if (className(node) === SETUP) setTimeout(() => onboardNode(node), 50);
  },
});
