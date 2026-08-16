import { app } from "../../scripts/app.js";

const STYLE_ID = "h3studio-scroll-integrity-v36-style";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /*
     * Keep Director scrolling boring and native.
     *
     * Earlier compatibility layers already stop wheel propagation at the
     * Studio boundary so LiteGraph does not zoom/pan underneath the controls.
     * Do not synthesize scrollTop or preventDefault() here: doing that made the
     * sidebars dependent on percentage-height resolution inside ComfyUI's DOM
     * widget and could leave them completely unscrollable.
     */
    .h3s-studio-panel {
      min-height: 0 !important;
      overflow: hidden !important;
    }

    .h3s-studio-panel .h3s-workspace {
      display: grid !important;
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) !important;
      align-items: start !important;
      width: 100% !important;
      height: auto !important;
      min-height: 0 !important;
      overflow: visible !important;
    }

    .h3s-studio-panel .h3s-col {
      display: flex !important;
      flex-direction: column !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: 385px !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      padding-bottom: 56px !important;
      scroll-padding-bottom: 56px !important;
      overscroll-behavior: contain !important;
      scrollbar-gutter: stable !important;
      touch-action: pan-y !important;
      pointer-events: auto !important;
    }

    .h3s-studio-panel .h3s-col > :last-child {
      margin-bottom: 16px !important;
    }
  `;
  document.head.append(style);
}

app.registerExtension({
  name: "H3Studio.ScrollIntegrityV36",
  setup() {
    installStyles();
  },
});
