import { app } from "../../scripts/app.js";

const DIRECTOR = "H3StudioDirector";
const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-ui-cleanup-v1";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* The Smart Benchmark header used an "AB" placeholder badge. It added
       visual noise and looked like a broken icon, so the title now stands alone. */
    .h3b7 .h3b7-icon{display:none!important}
    .h3b7 .h3b7-title-row{gap:0!important}

    /* Keep the restored v6 Director panel bounded. The underlying DOM widget
       has a fixed 640px computeSize; this prevents stylesheet interactions from
       stretching the panel beyond that contract. */
    .h3s-studio-panel:has(>.h3s-v6-layout){
      height:auto!important;
      max-height:640px!important;
      overflow:auto!important;
    }
  `;
  document.head.append(style);
}

function removeDuplicatePresetSections(node) {
  const panel = node?.__h3studioPanel;
  if (!panel?.isConnected) return;
  const sections = [...panel.querySelectorAll(".h3s-share-section")];
  if (sections.length <= 1) return;
  const preferred = sections.find((section) =>
    String(section.querySelector(".h3s-section-title")?.textContent || "").trim() === "Preset"
  ) || sections.at(-1);
  for (const section of sections) if (section !== preferred) section.remove();
}

function clean(node) {
  installStyles();
  if (node?.comfyClass === DIRECTOR) removeDuplicatePresetSections(node);
  if (node?.comfyClass === BENCHMARK) {
    node.__h3bRoot?.querySelector?.(".h3b7-icon")?.remove?.();
  }
}

app.registerExtension({
  name: "H3Studio.UICleanup",
  setup() { installStyles(); },
  nodeCreated(node) { queueMicrotask(() => clean(node)); },
  afterConfigureGraph() {
    setTimeout(() => {
      for (const node of app.graph?._nodes || []) clean(node);
    }, 120);
  },
});
