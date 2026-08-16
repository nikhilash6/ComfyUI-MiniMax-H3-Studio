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
    "Use the Extensions button in the ComfyUI toolbar if you want to install the optional Universal Asset Downloader helper.",
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

  setStatus("Found the optional UAD helper in ComfyUI-Manager. Queueing the latest registry version…");
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

  setStatus("ComfyUI-Manager is installing the optional UAD helper…");
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

function setText(element, text) {
  if (element && element.textContent !== text) element.textContent = text;
}

function setTitle(element, text) {
  if (element && element.title !== text) element.title = text;
}

function managerNote(snapshot) {
  if (snapshot?.hasUad) {
    return "An older UAD install was detected. Update it only if you want H3 Studio's automatic verification/download tools; generation itself does not require UAD.";
  }
  if (snapshot?.apiAvailable) {
    return "UAD is optional. ComfyUI-Manager is available if you want automatic model verification, downloads and repair; otherwise use your existing models or the manual paths below.";
  }
  if (snapshot?.available) {
    return "UAD is optional. Install it from Extensions only if you want automatic verification/download/repair; existing or manually installed models work without it.";
  }
  return "UAD is optional. No downloader integration is active, and that is fine: existing or manually installed models work normally using the paths and links below.";
}

function optionalButtonCopy(root) {
  const controls = [
    ["metadata", "Refresh sizes · UAD", "Optional UAD helper: loads provider size/hash metadata. Not required for generation."],
    ["verify", "Verify models · UAD", "Optional UAD helper: verifies exact model files and paths. Not required for generation."],
    ["download", "Download missing · UAD", "Optional UAD helper: downloads selected missing models. You can install models manually instead."],
    ["repair", "Repair selected · UAD", "Optional UAD helper: repairs selected model files. Not required for generation."],
  ];
  for (const [action, label, title] of controls) {
    const button = root.querySelector(`[data-action="${action}"]`);
    setText(button, label);
    setTitle(button, title);
  }
}

function enhanceMissingPanel(node, snapshot = {}) {
  const setup = node?.__h3ModelSetup;
  const root = setup?.root;
  if (!root) return;

  node.title = "Model setup · models & optional downloader";

  if (setup.state) {
    setup.state.manager = Boolean(snapshot.available);
    setup.state.managerHasUad = Boolean(snapshot.hasUad);
    setup.state.managerApiAvailable = Boolean(snapshot.apiAvailable);
  }

  setText(
    root.querySelector(".h3ms-sub"),
    "Use models already in your ComfyUI folders, or optionally use UAD for automatic verification and one-click downloads.",
  );

  const ready = Boolean(setup.state?.uad?.capabilities?.install);
  const badge = root.querySelector(".h3ms-badge");
  if (!ready && badge) {
    setText(badge, "UAD optional · not installed");
    badge.classList.remove("ok");
    badge.classList.add("warn");
  }

  optionalButtonCopy(root);

  if (!ready) {
    setText(
      root.querySelector("[data-log]"),
      "UAD is not connected — that's fine. H3 Studio can use models already in the normal ComfyUI folders. Install UAD only if you want automatic verification/download/repair, or use the direct model links and paths below.",
    );
  }

  const card = root.querySelector(".h3ms-card.h3ms-missing");
  if (!card) return;

  setText(card.querySelector("b"), "Universal Asset Downloader (UAD) is optional.");

  let explainer = card.querySelector(".h3ms-uad-optional-note");
  if (!explainer) {
    explainer = document.createElement("div");
    explainer.className = "h3ms-note h3ms-uad-optional-note";
    const heading = card.querySelector("b");
    heading?.insertAdjacentElement("afterend", explainer);
  }
  setText(
    explainer,
    "H3 Studio does not need UAD to generate images. UAD is only a helper for model verification, exact-path checks, one-click downloads and repair. If your models are already installed, you can ignore this helper or remove this Model Setup node.",
  );

  let manager = card.querySelector(".h3ms-uad-manager-note");
  if (!manager) {
    manager = document.createElement("div");
    manager.className = "h3ms-note h3ms-uad-manager-note";
    explainer?.insertAdjacentElement("afterend", manager);
  }
  setText(manager, managerNote(snapshot));

  for (const note of card.querySelectorAll(".h3ms-note")) {
    if (note === explainer || note === manager) continue;
    if (
      note.textContent?.includes("It stays a separate package") ||
      note.textContent?.includes("ComfyUI-Manager was not detected") ||
      note.textContent?.includes("ComfyUI Extensions is available") ||
      note.textContent?.includes("ComfyUI-Manager detected") ||
      note.textContent?.includes("Update UAD")
    ) {
      note.remove();
    }
  }

  const actions = card.querySelector(".h3ms-actions");
  if (!actions) return;

  actions.querySelectorAll('[data-action="install-uad"]').forEach((button) => button.remove());

  let smartButton = actions.querySelector(".h3ms-smart-install-uad");
  let openButton = actions.querySelector(".h3ms-open-extensions");

  if (snapshot.apiAvailable) {
    openButton?.remove();
    openButton = null;
    if (!smartButton) {
      smartButton = document.createElement("button");
      smartButton.type = "button";
      smartButton.className = "h3ms-btn h3ms-primary h3ms-smart-install-uad";
      smartButton.addEventListener("click", async (event) => {
        event.stopPropagation();
        await runInstall(node);
      });
      actions.prepend(smartButton);
    }
    setText(smartButton, snapshot.hasUad ? "Update optional UAD helper" : "Install optional UAD helper");
    setTitle(smartButton, "Optional: install Universal Asset Downloader through ComfyUI-Manager for automatic model management");
  } else if (snapshot.available) {
    smartButton?.remove();
    smartButton = null;
    if (!openButton) {
      openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "h3ms-btn h3ms-primary h3ms-open-extensions";
      openButton.addEventListener("click", (event) => {
        event.stopPropagation();
        openExtensions();
      });
      actions.prepend(openButton);
    }
    setText(openButton, "Optional UAD helper · Extensions");
    setTitle(openButton, "Optional: open Extensions if you want automatic model verification/download/repair");
  } else {
    smartButton?.remove();
    openButton?.remove();
  }
}

async function runInstall(node) {
  if (node.__h3UadInstalling) return;

  node.__h3UadInstalling = true;
  const button = node?.__h3ModelSetup?.root?.querySelector?.(".h3ms-smart-install-uad");
  if (button) button.disabled = true;
  const setStatus = (text) => setPanelStatus(node, text);

  try {
    setStatus("Looking up the optional Universal Asset Downloader helper in ComfyUI-Manager…");
    await installViaRegistry(setStatus);
    const message = "Optional UAD helper installed successfully. Restart ComfyUI, then hard refresh/reload this workflow so its backend and UI are registered.";
    setStatus(message);
    toast("Optional UAD helper installed", "Restart ComfyUI, then hard refresh the browser.", "success");
  } catch (error) {
    const detail = error?.status === 403
      ? "Manager blocked the install because of its security policy. You can ignore UAD and install models manually, or open Extensions and install the optional helper there."
      : `${error.message} UAD is optional; you can also ignore it and use manually installed models.`;
    setStatus(`Optional UAD install failed: ${detail}`);
    toast("Optional UAD install failed", detail, "error");
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
      const snapshot = await managerSnapshot();
      enhanceMissingPanel(node, snapshot);
    });
    observer.observe(root, { childList: true, subtree: true });
    node.__h3ManagerObserver = observer;
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const ready = await uadReady();
    const snapshot = await managerSnapshot();
    enhanceMissingPanel(node, snapshot);
    if (ready || snapshot.available) return;
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
