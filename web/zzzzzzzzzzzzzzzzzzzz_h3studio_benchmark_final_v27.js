import { app } from "../../scripts/app.js";

const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-benchmark-final-v27-style";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Final classic-nodes Benchmark rule: exactly ONE per-scenario MP slider.
       v14 owns it; v21/v23 controls stay mounted but are hidden so their
       observers do not recreate them and fight this final layer. */
    .h3b7.h3b21 .h3b21-mp,
    .h3b7.h3b21 .h3b21-mp-help,
    .h3b7.h3b23 .h3b7-field.h3b24-mp-field > .h3b24-mp,
    .h3b7.h3b23 .h3b24-mp-original{
      display:none!important;
    }
    .h3b7 .h3b14-mp{
      display:grid!important;
      width:100%!important;
      max-width:100%!important;
      grid-template-columns:minmax(0,1fr) auto!important;
      gap:7px 10px!important;
      padding:7px 8px!important;
      border:1px solid color-mix(in srgb,var(--border-color,#3d444b) 88%,white 4%)!important;
      border-radius:6px!important;
      background:var(--comfy-input-bg,#181c20)!important;
      box-shadow:none!important;
    }
    .h3b7 .h3b14-mp-field>.h3b7-input{display:none!important}

    /* Keep the final native surface even if older benchmark decorators rerun. */
    .h3b7.h3b23,
    .h3b7.h3b21.h3b23{
      background:transparent!important;
      background-image:none!important;
      box-shadow:none!important;
    }
    .h3b7.h3b23 .h3b7-top,
    .h3b7.h3b23 .h3b7-body,
    .h3b7.h3b23 .h3b15-plan,
    .h3b7.h3b23 .h3b7-summary,
    .h3b7.h3b23 .h3b7-list,
    .h3b7.h3b23 .h3b7-scenario,
    .h3b7.h3b23 .h3b7-scenario>summary,
    .h3b7.h3b23 .h3b7-fields{
      background:transparent!important;
      background-image:none!important;
      box-shadow:none!important;
    }
  `;
  document.head.append(style);
}

function clean(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) return;
  root.classList.add("h3b23");

  /* Do NOT remove v21/v23 MP controls here. Their own MutationObservers will
     recreate missing controls. Keeping them mounted-but-hidden prevents the
     observer loop and leaves v14 as the only visible scenario MP slider. */
  for (const field of root.querySelectorAll(".h3b14-mp-field")) {
    const slider = field.querySelector(":scope > .h3b14-mp");
    if (slider) slider.style.removeProperty("display");
  }
}

function observe(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) {
    setTimeout(() => observe(node), 100);
    return;
  }
  clean(node);
  if (root.__h3BenchmarkFinalV27Observer) return;
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (root.isConnected) clean(node);
    });
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  root.__h3BenchmarkFinalV27Observer = observer;
}

function sweep() {
  for (const node of app.graph?._nodes || []) {
    if (node?.comfyClass === BENCHMARK) observe(node);
  }
}

app.registerExtension({
  name: "H3Studio.BenchmarkFinalV27",
  setup() {
    installStyles();
    setTimeout(sweep, 560);
  },
  nodeCreated(node) {
    if (node?.comfyClass === BENCHMARK) setTimeout(() => observe(node), 560);
  },
  afterConfigureGraph() {
    installStyles();
    setTimeout(sweep, 620);
  },
});
