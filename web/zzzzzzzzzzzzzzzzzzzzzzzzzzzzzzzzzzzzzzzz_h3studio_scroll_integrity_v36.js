import { app } from "../../scripts/app.js";

const TARGET = "H3StudioDirector";
const STYLE_ID = "h3studio-scroll-integrity-v36-style";
let observer = null;
let queued = false;

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3s-studio-panel{
      min-height:0!important;
      overflow:hidden!important;
    }
    .h3s-studio-panel .h3s-workspace{
      flex:1 1 auto!important;
      height:auto!important;
      min-height:0!important;
      overflow:hidden!important;
      align-items:stretch!important;
    }
    .h3s-studio-panel .h3s-col{
      height:100%!important;
      max-height:none!important;
      min-height:0!important;
      overflow-y:auto!important;
      overflow-x:hidden!important;
      padding-bottom:64px!important;
      scroll-padding-bottom:64px!important;
      overscroll-behavior:contain!important;
    }
    .h3s-studio-panel .h3s-col > :last-child{
      margin-bottom:20px!important;
    }
  `;
  document.head.append(style);
}

function fixColumn(column) {
  if (!column) return;
  // Keep wheel events inside the Studio column without allowing LiteGraph to
  // steal the final scroll delta when the user approaches the bottom.
  if (!column.__h3studioBottomScrollGuard) {
    column.__h3studioBottomScrollGuard = true;
    column.addEventListener("wheel", (event) => {
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      const max = Math.max(0, column.scrollHeight - column.clientHeight);
      if (max <= 0) return;
      const next = Math.max(0, Math.min(max, column.scrollTop + event.deltaY));
      if (next !== column.scrollTop) {
        column.scrollTop = next;
        event.preventDefault();
        event.stopPropagation();
      }
    }, { capture: true, passive: false });
  }
}

function applyNode(node) {
  const root = node?.__h3studioPanel;
  if (!root?.isConnected) return;
  fixColumn(root.querySelector(".h3s-col-left"));
  fixColumn(root.querySelector(".h3s-col-right"));
}

function sweep() {
  queued = false;
  installStyles();
  for (const node of app.graph?._nodes || []) {
    if (node?.comfyClass === TARGET) applyNode(node);
  }
}

function queueSweep() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(sweep);
}

app.registerExtension({
  name: "H3Studio.ScrollIntegrityV36",
  setup() {
    installStyles();
    queueSweep();
    if (!observer && document.body) {
      observer = new MutationObserver(queueSweep);
      observer.observe(document.body, { childList: true, subtree: true });
    }
  },
});
