import { app } from "../../scripts/app.js";

const TARGET = "H3StudioDirector";
const STYLE_ID = "h3studio-mp-slider-v13-style";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Restore the useful pre-redesign risk visualization: the filled portion
       always reveals the green -> amber -> orange -> red scale. */
    .h3s-megapixel-control{gap:5px!important}
    .h3s-megapixel-control .h3s-range{height:16px!important}
    .h3s-megapixel-control .h3s-range-track{
      height:4px!important;
      background:#2a3035!important;
      box-shadow:inset 0 1px 1px rgba(0,0,0,.28)!important;
    }
    .h3s-megapixel-control .h3s-range-track::before{
      background:linear-gradient(90deg,#54bfa3 0%,#73bd82 20%,#c2a25f 48%,#d8784f 72%,#d9575e 100%)!important;
      transition:none!important;
    }
    .h3s-megapixel-control .h3s-range-thumb{
      width:13px!important;height:13px!important;
      border:2px solid #252b30!important;
      background:#83a697!important;
      box-shadow:0 1px 4px rgba(0,0,0,.4),0 0 0 1px rgba(255,255,255,.05)!important;
      transition:transform .1s ease,background .12s ease!important;
    }
    .h3s-megapixel-control .h3s-range:hover .h3s-range-thumb{transform:translate(-50%,-50%) scale(1.13)!important}
    .h3s-megapixel-control .h3s-range[data-tier='experimental'] .h3s-range-thumb{background:#d8784f!important}
    .h3s-megapixel-control .h3s-range[data-tier='extreme'] .h3s-range-thumb{background:#d9575e!important}
    .h3s-megapixel-control .h3s-megapixel-value{color:#e8ebed!important;font-size:10px!important;font-weight:760!important}
    .h3s-megapixel-control .h3s-range[data-tier='experimental']~* .h3s-megapixel-value{color:#e5a078!important}
    .h3s-megapixel-control .h3s-range[data-tier='extreme']~* .h3s-megapixel-value{color:#e47b81!important}
  `;
  document.head.append(style);
}

function refresh(node) {
  const range = node?.__h3studioPanel?.querySelector(".h3s-megapixel-control .h3s-range");
  const input = range?.querySelector(".h3s-range-native");
  if (!range || !input) return;
  const classify = () => {
    const value = Number(input.value) || 0;
    range.dataset.tier = value >= 6 ? "extreme" : value >= 4 ? "experimental" : "normal";
  };
  if (input.dataset.h3MpTierV13 !== "1") {
    input.dataset.h3MpTierV13 = "1";
    input.addEventListener("input", classify, { passive: true });
    input.addEventListener("change", classify);
  }
  classify();
}

function sweep() {
  return;
  installStyles();
  for (const node of app.graph?._nodes || []) if (node?.comfyClass === TARGET) refresh(node);
}

app.registerExtension({
  name: "H3Studio.MegapixelSliderV13",
  setup() { installStyles(); setTimeout(sweep, 180); },
  nodeCreated(node) { if (node?.comfyClass === TARGET) setTimeout(() => refresh(node), 180); },
  afterConfigureGraph() { setTimeout(sweep, 240); },
});
