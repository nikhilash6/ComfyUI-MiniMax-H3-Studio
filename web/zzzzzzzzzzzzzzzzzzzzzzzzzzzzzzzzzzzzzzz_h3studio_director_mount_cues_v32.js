import { app } from "../../scripts/app.js";

const TARGET = "H3StudioDirector";
const STYLE_ID = "h3studio-director-mount-cues-v32-style";
const ADDON_SELECTORS = [
  ".h3s-runtime-section",
  ".h3s-custom-loras",
  ".h3s-share-section",
];

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Restore the exact pre-two-panel AI-analysis cue. Product UI v6 changed
       --h3s-accent to blue-gray, so keep the historical cue green locally. */
    .h3s-studio-panel .h3s-auto-role {
      width: fit-content !important;
      max-width: 100% !important;
      padding: 2px 6px !important;
      border: 0 !important;
      border-radius: 999px !important;
      color: #34d3b5 !important;
      background: color-mix(in srgb, #34d3b5 10%, transparent) !important;
      font-size: 8px !important;
      font-weight: 650 !important;
      line-height: 1.35 !important;
    }
    .h3s-studio-panel .h3s-reference-card-auto {
      border-color: color-mix(in srgb, #34d3b5 45%, #22272b) !important;
      box-shadow: inset 2px 0 0 color-mix(in srgb, #34d3b5 75%, transparent) !important;
    }
  `;
  document.head.append(style);
}

function collectAddon(node, selector) {
  if (!(node instanceof Element)) return null;
  if (node.matches?.(selector)) return node;
  return node.querySelector?.(selector) || null;
}

function attachAddonMountGuard(node) {
  const panel = node?.__h3studioPanel;
  if (!panel?.isConnected || panel.__h3studioAddonMountV32) return;
  panel.__h3studioAddonMountV32 = true;

  const stash = new Map();
  let moving = false;

  const place = () => {
    if (moving || !panel.isConnected) return;
    const host = panel.querySelector(".h3s-col-right");
    if (!host) return;
    moving = true;
    try {
      for (const selector of ADDON_SELECTORS) {
        const current = panel.querySelector(selector) || stash.get(selector);
        if (!current) continue;
        if (current.parentElement !== host) host.append(current);
        stash.delete(selector);
      }
    } finally {
      moving = false;
    }
  };

  const observer = new MutationObserver((records) => {
    if (moving) return;
    for (const record of records) {
      for (const removed of record.removedNodes || []) {
        for (const selector of ADDON_SELECTORS) {
          const addon = collectAddon(removed, selector);
          if (addon) stash.set(selector, addon);
        }
      }
    }
    queueMicrotask(place);
    requestAnimationFrame(place);
  });
  observer.observe(panel, { childList: true });
  node.__h3studioAddonMountV32Observer = observer;

  // Runtime/Share/LoRA extensions mount asynchronously after node creation.
  // Sweep briefly so their first mount is moved into the current right column,
  // then the observer preserves the exact DOM nodes across Director rerenders.
  let sweeps = 0;
  const sweep = () => {
    place();
    sweeps += 1;
    if (sweeps < 40 && panel.isConnected) setTimeout(sweep, 75);
  };
  sweep();
}

function watchNode(node) {
  let attempts = 0;
  const wait = () => {
    if (!node.graph) return;
    if (node.__h3studioPanel?.isConnected) {
      attachAddonMountGuard(node);
      return;
    }
    attempts += 1;
    if (attempts < 400) setTimeout(wait, 25);
  };
  setTimeout(wait, 0);
}

installStyles();

app.registerExtension({
  name: "H3Studio.DirectorMountCuesV32",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TARGET) return;
    const originalCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function h3studioMountCuesCreated() {
      const result = originalCreated?.apply(this, arguments);
      installStyles();
      watchNode(this);
      return result;
    };
    const originalConfigured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function h3studioMountCuesConfigured() {
      const result = originalConfigured?.apply(this, arguments);
      installStyles();
      watchNode(this);
      return result;
    };
  },
});
