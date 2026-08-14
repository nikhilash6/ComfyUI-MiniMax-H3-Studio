import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const TARGET = "H3StudioModelSetup";
const STATUS_URL = "/h3studio/dependencies/status";
const DEPENDENCY_INSTALL_URL = "/h3studio/dependencies/pdd/install";
const UAD_INSTALL_URL = "/uad/install";
const UAD_VERIFY_URL = "/uad/verify-fast";
const PDD_SOURCE = "https://huggingface.co/Mamad8/MiniMaxH3_R2V-PDD-Turbo-LoRA-Mamad8";
const className = (node) => String(node?.comfyClass || node?.type || "");

async function jsonFetch(path, options = {}) {
  const response = await api.fetchApi(path, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok || data?.ok === false) throw new Error(data?.error || text || `HTTP ${response.status}`);
  return data;
}

function postJson(path, payload) {
  return jsonFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function rootFor(node) {
  return node?.__h3ModelSetup?.root || null;
}

function log(node, text) {
  const target = rootFor(node)?.querySelector?.("[data-log]");
  if (target) target.textContent = text;
}

function badge(node, installed) {
  const target = rootFor(node)?.querySelector?.(".h3ms-pdd-links .h3ms-pdd-badge");
  if (!target || /PDD node loaded/i.test(target.textContent || "")) return;
  target.textContent = installed ? "PDD node installed · restart after downloads" : "PDD node missing · auto-installs with pair";
  target.classList.toggle("ok", installed);
  target.classList.toggle("warn", !installed);
}

async function dependencyInstalled() {
  try {
    const status = await jsonFetch(STATUS_URL, { cache: "no-store" });
    return Boolean(status?.pdd?.installed);
  } catch {
    return false;
  }
}

async function ensureDependency(node) {
  if (node.__h3PddDependencyReady || await dependencyInstalled()) {
    node.__h3PddDependencyReady = true;
    badge(node, true);
    return { action: "already installed", restart_required: false };
  }
  if (node.__h3PddDependencyPromise) return node.__h3PddDependencyPromise;

  log(node, "Installing/updating the Mamad8 PDD custom node in a background worker… ComfyUI stays responsive.");
  node.__h3PddDependencyPromise = postJson(DEPENDENCY_INSTALL_URL, {})
    .then((result) => {
      node.__h3PddDependencyReady = true;
      badge(node, true);
      return result;
    })
    .finally(() => {
      node.__h3PddDependencyPromise = null;
    });
  return node.__h3PddDependencyPromise;
}

function pairFor(node, step) {
  return node?.__h3SmartPdd?.state?.pairs?.get?.(String(step)) || null;
}

function pairItems(pair) {
  const values = [pair?.lora, pair?.head].filter(Boolean);
  if (values.length !== 2) throw new Error("PDD pair metadata is incomplete. Press Refresh PDD and try again.");
  return values.map((item) => ({
    ...item,
    provider: item.provider || "huggingface",
    destination: item.pdd_role === "head" ? "pdd_heads" : "loras",
    filename: item.filename,
    download_url: item.download_url,
    source_url: item.source_url || PDD_SOURCE,
  }));
}

function actionFrom(button) {
  if (button?.dataset?.pddRepair) return { step: button.dataset.pddRepair, force: true };
  if (button?.dataset?.pddInstall) return { step: button.dataset.pddInstall, force: false };
  return null;
}

async function installOrRepairPair(node, step, force) {
  if (node.__h3PddPairFlowBusy) return;
  const smart = node?.__h3SmartPdd;
  const pair = pairFor(node, step);
  const items = pairItems(pair);
  node.__h3PddPairFlowBusy = true;
  if (smart?.state) smart.state.busy = true;

  try {
    const dependency = await ensureDependency(node);
    const dependencyNote = dependency?.restart_required
      ? " PDD node installed; restart ComfyUI after the weights finish so its execution nodes register."
      : "";
    log(node, `${force ? "Repairing" : "Installing"} PDD step ${step} LoRA + heads through UAD.${dependencyNote}`);

    await postJson(UAD_INSTALL_URL, {
      items,
      node_id: String(node.id),
      force: Boolean(force),
    });

    const verification = await postJson(UAD_VERIFY_URL, { items });
    const checks = verification?.results || [];
    if (smart?.state?.checks?.set) smart.state.checks.set(String(step), checks);
    const good = checks.filter((item) => item?.ok).length;
    log(node, `PDD step ${step} complete · ${good}/2 files verified.${node.__h3PddDependencyReady ? " Restart ComfyUI if the PDD node was just installed." : ""}`);

    // Ask the current Smart PDD panel to rebuild from fresh provider/verification
    // state. This is a normal refresh action, not a replay of the install click.
    setTimeout(() => rootFor(node)?.querySelector?.("[data-pdd-refresh]")?.click(), 0);
  } finally {
    if (smart?.state) smart.state.busy = false;
    node.__h3PddPairFlowBusy = false;
  }
}

function showError(node, error) {
  const detail = String(error?.message || error);
  log(node, `PDD install/repair failed: ${detail}`);
  app.extensionManager?.toast?.add?.({
    severity: "error",
    summary: "PDD setup failed",
    detail,
    life: 7000,
  });
}

function attach(node) {
  if (!node || className(node) !== TARGET || node.__h3PddDependencyHooked) return;
  const wait = () => {
    const root = rootFor(node);
    if (!root) { setTimeout(wait, 50); return; }
    node.__h3PddDependencyHooked = true;

    dependencyInstalled().then((installed) => {
      node.__h3PddDependencyReady = installed;
      badge(node, installed);
    });

    let badgeQueued = false;
    const observer = new MutationObserver(() => {
      if (badgeQueued) return;
      badgeQueued = true;
      requestAnimationFrame(() => {
        badgeQueued = false;
        badge(node, Boolean(node.__h3PddDependencyReady));
      });
    });
    observer.observe(root, { childList: true, subtree: false });
    node.__h3PddDependencyObserver = observer;

    // Own pair install/repair in one capture-phase transaction. The old flow
    // installed the dependency, rerendered the panel, then synthetically clicked
    // a stale/replaced button. That race plus blocking git calls could freeze the
    // browser. This flow never replays the action and never opens a confirm popup.
    root.addEventListener("click", (event) => {
      const button = event.target?.closest?.("[data-pdd-install],[data-pdd-repair]");
      const action = actionFrom(button);
      if (!button || !action) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (node.__h3PddPairFlowBusy) return;
      installOrRepairPair(node, action.step, action.force).catch((error) => showError(node, error));
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
