import { app } from "../../scripts/app.js";

import { applyState, stateFromNode } from "./js/studio_extension.js";

const DIRECTOR = "H3StudioDirector";
const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-ui-hotfix-v9-style";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Compact chevron: no font glyph wobble when the menu opens. */
    .h3s-choice-chevron{position:relative!important;width:12px!important;height:12px!important;flex:0 0 12px!important;font-size:0!important;color:#89929b!important;transform:none!important}
    .h3s-choice-chevron::before{content:'';position:absolute;left:3px;top:2px;width:5px;height:5px;border-right:1.4px solid currentColor;border-bottom:1.4px solid currentColor;transform:rotate(45deg);transform-origin:center;transition:transform .12s ease,top .12s ease}
    .h3s-choice.is-open .h3s-choice-chevron::before{top:5px;transform:rotate(225deg)}

    /* Truncated select labels reveal themselves like native pro-app menus. */
    .h3s-choice-current,.h3s-choice-option{overflow:hidden!important}
    .h3s-choice-value,.h3s-choice-option-label{display:block!important;flex:1 1 auto!important;min-width:0!important;max-width:100%!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;transform:translateX(0)}
    .h3s-choice-value.is-h3-marquee,.h3s-choice-option-label.is-h3-marquee{overflow:visible!important;text-overflow:clip!important}
    .h3s-choice-trigger:hover .is-h3-marquee,.h3s-choice-trigger:focus-visible .is-h3-marquee,.h3s-choice-option:hover .is-h3-marquee,.h3s-choice-option:focus-visible .is-h3-marquee{animation:h3sTextReveal var(--h3s-marquee-duration,4s) ease-in-out .35s infinite}
    @keyframes h3sTextReveal{0%,12%,100%{transform:translateX(0)}45%,67%{transform:translateX(var(--h3s-marquee-shift,0px))}}

    /* MP preview follows the pointer immediately; no delayed easing behind it. */
    .h3s-megapixel-control .h3s-range-track::before,.h3s-megapixel-control .h3s-range-thumb{transition:none!important;will-change:width,left!important}

    .h3s-custom-aspect-editor{display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:5px;margin-top:3px;padding:6px;border:1px solid #2c3238;border-radius:6px;background:#15191c}
    .h3s-custom-aspect-box{display:flex;flex-direction:column;gap:3px}.h3s-custom-aspect-box span{color:#838c95;font-size:8px;font-weight:650}.h3s-custom-aspect-editor input{width:100%;height:27px;border:1px solid #333a41;border-radius:5px;background:#191d21;color:#edf0f2;padding:3px 6px;font:9px/1.2 Inter,system-ui}.h3s-custom-aspect-x{align-self:center;color:#68717a;font-size:9px}

    /* Director consumes the available node body; columns scroll internally. */
    .h3s-studio-panel{max-width:100%!important;min-width:0!important;overflow:hidden!important}
    .h3s-v6-layout{min-height:0!important;overflow:hidden!important}
    .h3s-v6-main,.h3s-v6-inspector{min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important}

    /* Smart Benchmark is clipped by Comfy's actual DOM-widget bounds, never the canvas. */
    .h3b7{width:100%!important;max-width:100%!important;min-width:0!important;overflow-x:hidden!important;box-sizing:border-box!important}
    .h3b7-body,.h3b7-fields,.h3b7-toolbar,.h3b7-list,.h3b7-scenario{max-width:100%!important;min-width:0!important}

    @media(prefers-reduced-motion:reduce){.h3s-choice-trigger:hover .is-h3-marquee,.h3s-choice-trigger:focus-visible .is-h3-marquee,.h3s-choice-option:hover .is-h3-marquee,.h3s-choice-option:focus-visible .is-h3-marquee{animation:none!important}}
  `;
  document.head.append(style);
}

function widget(node, name) {
  return (node?.widgets || []).find((item) => item?.name === name) || null;
}

function markMarquee(label) {
  if (!label?.isConnected) return;
  label.classList.remove("is-h3-marquee");
  label.style.removeProperty("--h3s-marquee-shift");
  label.style.removeProperty("--h3s-marquee-duration");
  requestAnimationFrame(() => {
    if (!label?.isConnected) return;
    const overflow = Math.ceil(label.scrollWidth - label.clientWidth);
    if (overflow <= 4) return;
    label.classList.add("is-h3-marquee");
    label.style.setProperty("--h3s-marquee-shift", `${-overflow}px`);
    label.style.setProperty("--h3s-marquee-duration", `${Math.min(7, Math.max(3.4, 3.2 + overflow / 38)).toFixed(2)}s`);
  });
}

function markChoice(choice) {
  const label = choice?.querySelector?.(".h3s-choice-value,.h3s-choice-option-label");
  if (label) markMarquee(label);
}

document.addEventListener("pointerover", (event) => {
  const choice = event.target?.closest?.(".h3s-choice-trigger,.h3s-choice-option");
  if (choice) markChoice(choice);
}, true);
document.addEventListener("focusin", (event) => {
  const choice = event.target?.closest?.(".h3s-choice-trigger,.h3s-choice-option");
  if (choice) markChoice(choice);
}, true);

function customAspectEditor(node) {
  const root = node?.__h3studioPanel;
  if (!root) return;
  const state = stateFromNode(node);
  const aspectField = Array.from(root.querySelectorAll(".h3s-field")).find(
    (field) => String(field.querySelector(".h3s-field-label")?.textContent || "").trim() === "Aspect",
  );
  if (!aspectField) return;
  aspectField.querySelector(":scope > .h3s-custom-aspect-editor")?.remove();
  if (state.generation.aspect_ratio !== "custom") return;

  const editor = document.createElement("div");
  editor.className = "h3s-custom-aspect-editor";
  const make = (labelText, value, key) => {
    const box = document.createElement("label"); box.className = "h3s-custom-aspect-box";
    const label = document.createElement("span"); label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "number"; input.min = "32"; input.max = "16384"; input.step = "32"; input.value = String(value);
    input.addEventListener("change", () => {
      const current = stateFromNode(node);
      const next = Math.max(32, Math.min(16384, Math.round((Number(input.value) || 1024) / 32) * 32));
      current.generation.aspect_ratio = "custom";
      current.generation[key] = next;
      applyState(node, current);
      node.__h3studioConfigured?.();
    });
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") input.blur(); });
    box.append(label, input); return box;
  };
  const cross = document.createElement("span"); cross.className = "h3s-custom-aspect-x"; cross.textContent = "×";
  editor.append(make("Width", state.generation.custom_width, "custom_width"), cross, make("Height", state.generation.custom_height, "custom_height"));
  aspectField.append(editor);
}

function availableDirectorHeight(node, panelWidget) {
  const total = Number(node?.size?.[1]) || 780;
  const top = Number(panelWidget?.last_y);
  if (Number.isFinite(top) && top > 20 && top < total - 120) return Math.max(260, total - top - 8);
  const visibleOther = (node?.widgets || []).reduce((sum, item) => {
    if (!item || item === panelWidget || item.hidden || item.__h3studioHidden) return sum;
    try {
      const height = Number(item.computeSize?.(Number(node.size?.[0]) || 680)?.[1]);
      return sum + (Number.isFinite(height) && height > 0 ? height + 4 : 0);
    } catch { return sum; }
  }, 34);
  return Math.max(260, total - Math.min(total - 260, visibleOther));
}

function syncDirector(node) {
  const root = node?.__h3studioPanel;
  const panelWidget = widget(node, "h3studio_controls");
  if (!root || !panelWidget) return;
  node.resizable = true;
  node.__h3studioPreferredSize = Array.isArray(node.size) ? [...node.size] : node.__h3studioPreferredSize;
  const height = availableDirectorHeight(node, panelWidget);
  panelWidget.computeSize = (width) => [Math.max(0, Number(width) || Number(node.size?.[0]) || 680), height];
  panelWidget.computedHeight = height;
  panelWidget.options ||= {};
  panelWidget.options.getMinHeight = () => 240;
  panelWidget.options.getMaxHeight = () => 900;
  root.style.setProperty("width", "100%", "important");
  root.style.setProperty("max-width", "100%", "important");
  root.style.setProperty("height", `${height}px`, "important");
  if (root.parentElement) {
    root.parentElement.style.setProperty("width", "100%", "important");
    root.parentElement.style.setProperty("max-width", "100%", "important");
    root.parentElement.style.setProperty("overflow", "hidden", "important");
  }
  customAspectEditor(node);
}

function attachDirector(node) {
  if (!node || node.comfyClass !== DIRECTOR) return;
  // v8's subtree observer also reacted to the live MP text updates. Replace it
  // with a root-only observer so dragging never schedules layout work per pixel.
  node.__h3studioPanel?.__h3InteractionObserver?.disconnect?.();
  node.__h3studioPanel && (node.__h3studioPanel.__h3InteractionObserver = null);
  syncDirector(node);
  if (node.__h3studioUiHotfixV9) return;
  node.__h3studioUiHotfixV9 = true;
  const originalResize = node.onResize;
  node.onResize = function h3StudioV9Resize(size) {
    if (Array.isArray(size)) this.__h3studioPreferredSize = [...size];
    const result = originalResize?.apply(this, arguments);
    requestAnimationFrame(() => syncDirector(this));
    return result;
  };
  const root = node.__h3studioPanel;
  if (root) {
    const observer = new MutationObserver(() => requestAnimationFrame(() => syncDirector(node)));
    observer.observe(root, { childList: true });
    root.__h3studioV9Observer = observer;
  }
}

function fitBenchmark(node) {
  const root = node?.__h3bRoot;
  const domWidget = widget(node, "h3studio_smart_benchmark");
  if (!root || !domWidget) return;
  node.resizable = true;
  root.style.setProperty("width", "100%", "important");
  root.style.setProperty("max-width", "100%", "important");
  root.style.setProperty("overflow-x", "hidden", "important");
  const parent = root.parentElement;
  if (parent) {
    parent.style.setProperty("width", "100%", "important");
    parent.style.setProperty("max-width", "100%", "important");
    parent.style.setProperty("overflow", "hidden", "important");
  }
  requestAnimationFrame(() => {
    if (!root.isConnected) return;
    const natural = Math.max(250, Math.min(540, Math.ceil(root.scrollHeight + 2)));
    domWidget.computeSize = (width) => [Math.max(0, Number(width) || Number(node.size?.[0]) || 720), natural];
    domWidget.computedHeight = natural;
    domWidget.options ||= {};
    domWidget.options.getMinHeight = () => 250;
    domWidget.options.getMaxHeight = () => 540;
    // Let LiteGraph compute title/ports/widget chrome, then fit the node to it.
    const computed = node.computeSize?.();
    if (Array.isArray(computed) && Number.isFinite(Number(computed[1]))) {
      const wanted = Math.max(340, Math.min(650, Number(computed[1])));
      const current = Number(node.size?.[1]) || wanted;
      if (Math.abs(current - wanted) > 10) node.setSize?.([Math.max(680, Number(node.size?.[0]) || 680), wanted]);
    }
  });
}

function attachBenchmark(node) {
  if (!node || node.comfyClass !== BENCHMARK) return;
  fitBenchmark(node);
  if (node.__h3studioBenchmarkV9) return;
  node.__h3studioBenchmarkV9 = true;
  const originalResize = node.onResize;
  node.onResize = function h3BenchmarkV9Resize() {
    const result = originalResize?.apply(this, arguments);
    requestAnimationFrame(() => fitBenchmark(this));
    return result;
  };
  const root = node.__h3bRoot;
  if (root) {
    const observer = new MutationObserver(() => requestAnimationFrame(() => fitBenchmark(node)));
    observer.observe(root, { childList: true, subtree: true });
    root.__h3studioBenchmarkV9Observer = observer;
  }
}

function sweep() {
  for (const node of app.graph?._nodes || []) {
    if (node?.comfyClass === DIRECTOR) attachDirector(node);
    else if (node?.comfyClass === BENCHMARK) attachBenchmark(node);
  }
}

app.registerExtension({
  name: "H3Studio.UIHotfixV9",
  setup() { installStyles(); },
  nodeCreated(node) {
    installStyles();
    if (node?.comfyClass === DIRECTOR) setTimeout(() => attachDirector(node), 90);
    else if (node?.comfyClass === BENCHMARK) setTimeout(() => attachBenchmark(node), 90);
  },
  afterConfigureGraph() { installStyles(); setTimeout(sweep, 180); },
});
