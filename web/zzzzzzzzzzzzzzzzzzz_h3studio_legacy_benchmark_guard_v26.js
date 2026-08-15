import { app } from "../../scripts/app.js";

const BENCHMARK = "H3StudioSmartBenchmark";
const WIDGET_NAME = "h3studio_smart_benchmark";
const STYLE_ID = "h3studio-legacy-benchmark-guard-v26-style";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Classic Nodes only. The ComfyUI node owns the surface; Benchmark owns controls. */
    .h3b7.h3b21.h3b23,
    .h3b7.h3b23{
      background:transparent!important;
      background-image:none!important;
      border:0!important;
      border-radius:0!important;
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

    /* Expanded scenarios follow Director's property-sheet language instead of a 4-column dashboard. */
    .h3b7.h3b23 .h3b7-scenario{
      border:0!important;
      border-bottom:1px solid color-mix(in srgb,var(--border-color,#343a40) 72%,transparent)!important;
      border-radius:0!important;
      overflow:visible!important;
    }
    .h3b7.h3b23 .h3b7-scenario>summary{
      min-height:42px!important;
      padding:5px 0!important;
    }
    .h3b7.h3b23 .h3b7-tag{display:none!important}
    .h3b7.h3b23 .h3b7-fields{
      display:flex!important;
      flex-direction:column!important;
      gap:0!important;
      padding:3px 0 10px!important;
      border-top:1px solid color-mix(in srgb,var(--border-color,#343a40) 62%,transparent)!important;
    }
    .h3b7.h3b23 .h3b7-field{
      display:grid!important;
      grid-template-columns:112px minmax(0,1fr)!important;
      align-items:center!important;
      gap:12px!important;
      width:100%!important;
      min-height:43px!important;
      padding:5px 0!important;
      border-bottom:1px solid color-mix(in srgb,var(--border-color,#343a40) 50%,transparent)!important;
      background:transparent!important;
    }
    .h3b7.h3b23 .h3b7-label{
      margin:0!important;
      color:var(--descrip-text,#7f8992)!important;
      font-size:7.4px!important;
      font-weight:620!important;
      text-transform:none!important;
      letter-spacing:0!important;
    }
    .h3b7.h3b23 .h3b7-input,
    .h3b7.h3b23 .h3b7-select{
      display:block!important;
      width:100%!important;
      min-width:0!important;
      height:32px!important;
      padding:0 9px!important;
      border:1px solid color-mix(in srgb,var(--border-color,#3d444b) 88%,white 4%)!important;
      border-radius:6px!important;
      background:var(--comfy-input-bg,#181c20)!important;
      color:var(--input-text,#e7eaed)!important;
      font-size:8px!important;
      text-overflow:ellipsis!important;
    }
    .h3b7.h3b23 .h3b7-input:hover,
    .h3b7.h3b23 .h3b7-select:hover{
      border-color:color-mix(in srgb,var(--border-color,#4a535b) 72%,white 16%)!important;
    }

    /* Exactly one scenario MP control: keep v21's full-width slider, kill later fallback copies. */
    .h3b7.h3b23 .h3b21-mp{
      display:grid!important;
      width:100%!important;
      height:32px!important;
      grid-template-columns:minmax(0,1fr) 62px!important;
      gap:10px!important;
      align-items:center!important;
      padding:0 9px!important;
      border:1px solid color-mix(in srgb,var(--border-color,#3d444b) 88%,white 4%)!important;
      border-radius:6px!important;
      background:var(--comfy-input-bg,#181c20)!important;
    }
    .h3b7.h3b23 .h3b21-mp-help{display:none!important}
    .h3b7.h3b23 .h3b7-field.h3b24-mp-field > .h3b24-mp{display:none!important}
    .h3b7.h3b23 .h3b24-mp-original{display:none!important}

    .h3b7.h3b23 .h3b7-loras{
      width:100%!important;
      padding:7px 0 3px 124px!important;
      margin:0!important;
    }

    /* Keep actions legible but quiet, matching Director rather than oversized cards. */
    .h3b7.h3b23 .h3b15-quick button,
    .h3b7.h3b23 .h3b7-btn,
    .h3b7.h3b23 .h3b20-add,
    .h3b7.h3b23 .h3b20-res-chip{
      border-color:color-mix(in srgb,var(--border-color,#3d444b) 88%,white 5%)!important;
      background:color-mix(in srgb,var(--comfy-input-bg,#181c20) 72%,transparent)!important;
    }
    .h3b7.h3b23 .h3b15-quick button:hover,
    .h3b7.h3b23 .h3b7-btn:hover,
    .h3b7.h3b23 .h3b20-add:hover,
    .h3b7.h3b23 .h3b20-res-chip:hover{
      background:var(--comfy-input-bg,#181c20)!important;
      border-color:color-mix(in srgb,var(--border-color,#4a535b) 72%,white 18%)!important;
      color:var(--input-text,#e7eaed)!important;
    }

    @container (max-width:700px){
      .h3b7.h3b23 .h3b7-field{grid-template-columns:88px minmax(0,1fr)!important;gap:9px!important}
      .h3b7.h3b23 .h3b7-loras{padding-left:97px!important}
    }
  `;
  document.head.append(style);
}

function widget(node, name) {
  return (node?.widgets || []).find((item) => item?.name === name) || null;
}

function nativeSurface(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) return;

  root.classList.add("h3b23");
  root.style.setProperty("background", "transparent", "important");
  root.style.setProperty("background-image", "none", "important");
  root.style.setProperty("box-shadow", "none", "important");
  root.style.setProperty("height", "100%", "important");
  root.style.setProperty("max-height", "100%", "important");
  root.style.setProperty("min-height", "0", "important");
  root.style.setProperty("overflow-y", "auto", "important");
  root.style.setProperty("overflow-x", "hidden", "important");

  const surfaces = [
    root.querySelector(":scope > .h3b7-top"),
    root.querySelector(":scope > .h3b7-body"),
    ...root.querySelectorAll(
      ".h3b15-plan,.h3b7-summary,.h3b7-list,.h3b7-scenario,.h3b7-scenario>summary,.h3b7-fields"
    ),
  ];
  for (const surface of surfaces) {
    if (!surface) continue;
    surface.style.setProperty("background", "transparent", "important");
    surface.style.setProperty("background-image", "none", "important");
    surface.style.setProperty("box-shadow", "none", "important");
  }

  const parent = root.parentElement;
  if (parent) {
    parent.style.setProperty("max-width", "100%", "important");
    parent.style.setProperty("max-height", "100%", "important");
    parent.style.setProperty("min-height", "0", "important");
    parent.style.setProperty("overflow", "hidden", "important");
    parent.style.setProperty("background", "transparent", "important");
  }
}

function boundClassicWidget(node) {
  const dom = widget(node, WIDGET_NAME);
  if (!dom) return;
  dom.options ||= {};

  /* Classic Benchmark stays bounded and scrolls internally. */
  dom.computedHeight = undefined;
  dom.options.getMinHeight = () => 330;
  dom.options.getMaxHeight = () => 560;

  if (!dom.options.__h3ClassicBoundV26) {
    dom.options.__h3ClassicBoundV26 = true;
    const previous = dom.options.afterResize;
    dom.options.afterResize = function h3ClassicBenchmarkResize(...args) {
      const result = previous?.apply(this, args);
      requestAnimationFrame(() => nativeSurface(node));
      return result;
    };
  }
}

function apply(node) {
  if (!node || node.comfyClass !== BENCHMARK) return;
  const root = node.__h3bRoot;
  if (!root?.isConnected) {
    setTimeout(() => apply(node), 100);
    return;
  }

  boundClassicWidget(node);
  nativeSurface(node);

  if (!root.__h3ClassicBenchmarkObserverV26) {
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (node.__h3bRoot?.isConnected) {
          boundClassicWidget(node);
          nativeSurface(node);
        }
      });
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    root.__h3ClassicBenchmarkObserverV26 = observer;
  }

  const size = Array.isArray(node.size) ? [Number(node.size[0]), Number(node.size[1])] : null;
  if (size && !node.__h3ClassicBenchmarkRelayoutV26) {
    node.__h3ClassicBenchmarkRelayoutV26 = true;
    requestAnimationFrame(() => {
      if (!node.graph) return;
      node.setSize?.(size);
      node.setDirtyCanvas?.(true, true);
    });
  }
}

function sweep() {
  for (const node of app.graph?._nodes || []) if (node?.comfyClass === BENCHMARK) apply(node);
}

app.registerExtension({
  name: "H3Studio.LegacyBenchmarkGuardV26",
  setup() {
    installStyles();
    setTimeout(sweep, 460);
  },
  nodeCreated(node) {
    if (node?.comfyClass === BENCHMARK) setTimeout(() => apply(node), 460);
  },
  afterConfigureGraph() {
    installStyles();
    setTimeout(sweep, 520);
  },
});
