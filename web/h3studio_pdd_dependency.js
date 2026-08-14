import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const TARGET = "H3StudioModelSetup";
const STATUS_URL = "/h3studio/dependencies/status";
const INSTALL_URL = "/h3studio/dependencies/pdd/install";
const className = (node) => String(node?.comfyClass || node?.type || "");

async function jsonFetch(path, options = {}) {
  const response = await api.fetchApi(path, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok || data?.ok === false) throw new Error(data?.error || text || `HTTP ${response.status}`);
  return data;
}

async function dependencyInstalled() {
  try {
    const status = await jsonFetch(STATUS_URL);
    return Boolean(status?.pdd?.installed);
  } catch {
    return false;
  }
}

function log(node, text) {
  const target = node?.__h3ModelSetup?.root?.querySelector?.("[data-log]");
  if (target) target.textContent = text;
}

function badge(node, installed) {
  const root = node?.__h3ModelSetup?.root;
  const target = root?.querySelector?.(".h3ms-pdd-links .h3ms-pdd-badge");
  if (!target || /PDD node loaded/i.test(target.textContent || "")) return;
  target.textContent = installed ? "PDD node installed · restart after downloads" : "PDD node missing";
  target.classList.toggle("ok", installed);
  target.classList.toggle("warn", !installed);
}

async function installDependency(node) {
  if (node.__h3PddDependencyReady || await dependencyInstalled()) {
    node.__h3PddDependencyReady = true;
    badge(node, true);
    return { action: "already installed" };
  }
  if (node.__h3PddDependencyPromise) return node.__h3PddDependencyPromise;

  log(node, "Installing/updating the Mamad8 PDD custom node in a background worker…");
  node.__h3PddDependencyPromise = jsonFetch(INSTALL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).then((result) => {
    node.__h3PddDependencyReady = true;
    badge(node, true);
    log(node, `PDD custom node ${result.action || "installed"}. Continuing with the selected LoRA + heads pair…`);
    return result;
  }).finally(() => {
    node.__h3PddDependencyPromise = null;
  });
  return node.__h3PddDependencyPromise;
}

function selectorFor(button) {
  if (button?.dataset?.pddInstall) return `[data-pdd-install="${CSS.escape(button.dataset.pddInstall)}"]`;
  if (button?.dataset?.pddRepair) return `[data-pdd-repair="${CSS.escape(button.dataset.pddRepair)}"]`;
  return "";
}

function resumeOriginalAction(node, selector) {
  const root = node?.__h3ModelSetup?.root;
  const fresh = selector ? root?.querySelector?.(selector) : null;
  if (!fresh) throw new Error("PDD panel was refreshed while installing the dependency. Press the pair button once more.");
  fresh.disabled = false;
  fresh.dataset.h3DependencyBypass = "1";
  // Replay on the freshly rendered button, never on the stale element that
  // initiated the async install. Capture handler consumes the bypass marker and
  // the Smart PDD panel receives the click normally exactly once.
  fresh.click();
}

function attach(node) {
  if (!node || className(node) !== TARGET || node.__h3PddDependencyHooked) return;
  const wait = () => {
    const root = node?.__h3ModelSetup?.root;
    if (!root) { setTimeout(wait, 50); return; }
    node.__h3PddDependencyHooked = true;

    dependencyInstalled().then((installed) => {
      node.__h3PddDependencyReady = installed;
      badge(node, installed);
    });

    let badgeQueued = false;
    const observer = new MutationObserver(() => {
      if (!node.__h3PddDependencyReady || badgeQueued) return;
      badgeQueued = true;
      requestAnimationFrame(() => {
        badgeQueued = false;
        badge(node, true);
      });
    });
    observer.observe(root, { childList: true, subtree: false });
    node.__h3PddDependencyObserver = observer;

    root.addEventListener("click", async (event) => {
      const button = event.target?.closest?.("[data-pdd-install],[data-pdd-repair]");
      if (!button) return;
      if (button.dataset.h3DependencyBypass === "1") {
        delete button.dataset.h3DependencyBypass;
        return;
      }
      if (node.__h3PddDependencyReady) return;

      const selector = selectorFor(button);
      event.preventDefault();
      event.stopImmediatePropagation();
      button.disabled = true;
      try {
        await installDependency(node);
        resumeOriginalAction(node, selector);
      } catch (error) {
        const fresh = selector ? root.querySelector(selector) : button;
        if (fresh) fresh.disabled = false;
        const detail = String(error?.message || error);
        log(node, `PDD custom-node install failed: ${detail}`);
        app.extensionManager?.toast?.add?.({
          severity: "error",
          summary: "PDD dependency install failed",
          detail,
          life: 7000,
        });
      }
    }, true);
  };
  setTimeout(wait, 0);
}

app.registerExtension({
  name: "H3Studio.PDDDependencyInstaller",
  afterConfigureGraph() {
    for (const node of app.graph?._nodes || []) if (className(node) === TARGET) attach(node);
  },
  nodeCreated(node) {
    if (className(node) === TARGET) attach(node);
  },
});
