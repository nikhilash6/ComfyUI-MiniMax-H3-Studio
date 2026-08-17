import { app } from "../../scripts/app.js";
import { renderPanel } from "./js/studio_extension.js";

const DIRECTOR = "H3StudioDirector";
const MODEL_SETUP = "H3StudioModelSetup";

function className(node) {
  return String(node?.comfyClass || node?.type || "");
}

function patchOptionalUadCopy(node) {
  if (!node || className(node) !== MODEL_SETUP) return false;
  const setup = node.__h3ModelSetup;
  const root = setup?.root;
  if (!root?.isConnected) return false;

  node.title = "Model setup · models & optional downloader";

  const sub = root.querySelector(".h3ms-sub");
  if (sub) {
    sub.textContent = "Use models already in your ComfyUI folders, or optionally use Universal Asset Downloader (UAD) for automatic verification, downloads and repair.";
  }

  const uadReady = Boolean(setup?.state?.uad?.capabilities?.install);
  const badge = root.querySelector(".h3ms-badge");
  if (badge && !uadReady) {
    badge.textContent = "UAD optional · not installed";
    badge.classList.remove("ok");
    badge.classList.add("warn");
  }

  const missing = root.querySelector(".h3ms-card.h3ms-missing");
  if (missing && !uadReady) {
    const heading = missing.querySelector("b");
    if (heading) heading.textContent = "Universal Asset Downloader (UAD) is optional.";

    let note = missing.querySelector(".h3ms-initial-uad-note");
    if (!note) {
      note = document.createElement("div");
      note.className = "h3ms-note h3ms-initial-uad-note";
      heading?.insertAdjacentElement("afterend", note);
    }
    note.textContent = "H3 Studio does not require UAD to generate images. Existing or manually installed models work normally. UAD is only a convenience helper for exact-path verification, one-click downloads and repair.";

    missing.querySelectorAll('[data-action="install-uad"]').forEach((button) => button.remove());
  }

  const controls = [
    ["metadata", "Refresh sizes · UAD", "Optional UAD helper: reads provider size/hash metadata. Not required for generation."],
    ["verify", "Verify models · UAD", "Optional UAD helper: verifies model files and exact paths. Not required for generation."],
    ["download", "Download missing · UAD", "Optional UAD helper: downloads selected missing models. Manual installation works too."],
    ["repair", "Repair selected · UAD", "Optional UAD helper: repairs selected model files. Not required for generation."],
  ];
  for (const [action, label, title] of controls) {
    const button = root.querySelector(`[data-action="${action}"]`);
    if (!button) continue;
    button.textContent = label;
    button.title = title;
  }

  const log = root.querySelector("[data-log]");
  if (log && !uadReady && /UAD|Universal Asset Downloader/i.test(log.textContent || "")) {
    log.textContent = "UAD is not connected — that's fine. H3 Studio can use models already in the normal ComfyUI folders. Install UAD only if you want automatic verification/download/repair, or use the direct model links and paths below.";
  }

  return true;
}

function scheduleOptionalUadCopy(node) {
  if (!node || className(node) !== MODEL_SETUP) return;
  for (const delay of [0, 30, 80, 160, 320, 700]) {
    setTimeout(() => patchOptionalUadCopy(node), delay);
  }
}

function stabilizeDirectorMount(node) {
  if (!node || className(node) !== DIRECTOR || node.__h3InitialShelfMountStabilized) return false;
  const panel = node.__h3studioPanel;
  const shelf = node.__h3studioShelf || panel?.querySelector?.(".h3s-demos-shelf");
  if (!panel?.isConnected || !shelf || shelf.parentNode !== panel) return false;

  // The demo shelf is built asynchronously after the Director's first render.
  // A normal later Director render already fixes the clipped first-mount header;
  // do that same canonical render once as soon as the shelf actually exists.
  node.__h3InitialShelfMountStabilized = true;
  requestAnimationFrame(() => {
    renderPanel(node);
    requestAnimationFrame(() => {
      const currentPanel = node.__h3studioPanel;
      if (currentPanel) {
        currentPanel.scrollTop = 0;
        currentPanel.scrollLeft = 0;
      }
      node.setDirtyCanvas?.(true, true);
      app.graph?.setDirtyCanvas?.(true, true);
    });
  });
  return true;
}

function scheduleDirectorStabilize(node) {
  if (!node || className(node) !== DIRECTOR) return;
  for (const delay of [0, 40, 100, 180, 320, 600, 1000, 1600]) {
    setTimeout(() => {
      if (stabilizeDirectorMount(node)) return;
    }, delay);
  }
}

function sweep() {
  for (const node of app.graph?._nodes || []) {
    scheduleOptionalUadCopy(node);
    scheduleDirectorStabilize(node);
  }
}

app.registerExtension({
  name: "H3Studio.InitialMountFixV39",
  setup() {
    setTimeout(sweep, 80);
    setTimeout(sweep, 500);
  },
  nodeCreated(node) {
    scheduleOptionalUadCopy(node);
    scheduleDirectorStabilize(node);
  },
  afterConfigureGraph() {
    setTimeout(sweep, 80);
    setTimeout(sweep, 500);
  },
});
