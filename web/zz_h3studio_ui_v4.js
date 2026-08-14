import { app } from "../../scripts/app.js";

const DIRECTOR = "H3StudioDirector";
const STYLE_ID = "h3studio-ui-v4-style";
const VISIBLE_NATIVE = new Set(["prompt", "h3_prompt_mentions", "h3studio_controls"]);

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* H3 Studio v4: use current Comfy theme tokens, but give the Director a
       deliberate product UI instead of a pile of browser-native form fields. */
    .h3s-studio-panel{
      --h3s-bg:color-mix(in srgb,var(--comfy-menu-bg,#11171b) 95%,black 5%)!important;
      --h3s-surface:color-mix(in srgb,var(--comfy-input-bg,#181f24) 92%,white 2%)!important;
      --h3s-raised:color-mix(in srgb,var(--comfy-input-bg,#181f24) 82%,white 7%)!important;
      --h3s-border:color-mix(in srgb,var(--border-default,rgba(255,255,255,.15)) 78%,transparent)!important;
      --h3s-text:var(--input-text,#edf3f5)!important;
      --h3s-muted:color-mix(in srgb,var(--input-text,#edf3f5) 56%,transparent)!important;
      --h3s-accent:#39d6b7!important;
      gap:9px!important;padding:11px!important;border:1px solid var(--h3s-border)!important;border-radius:14px!important;
      background:linear-gradient(180deg,color-mix(in srgb,var(--h3s-bg) 96%,white 2%),var(--h3s-bg))!important;
      box-shadow:inset 0 1px rgba(255,255,255,.025),0 8px 30px rgba(0,0,0,.10)!important;
      font-size:11px!important;line-height:1.4!important;scrollbar-gutter:stable;
    }
    .h3s-studio-panel::-webkit-scrollbar{width:8px}.h3s-studio-panel::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--h3s-muted) 35%,transparent);border-radius:999px}
    .h3s-studio-header{top:-11px!important;min-height:36px!important;padding:7px 2px!important;background:linear-gradient(180deg,var(--h3s-bg) 82%,color-mix(in srgb,var(--h3s-bg) 92%,transparent))!important;border-bottom:1px solid color-mix(in srgb,var(--h3s-border) 60%,transparent)!important}
    .h3s-studio-mark{width:5px!important;height:19px!important;box-shadow:0 0 16px color-mix(in srgb,var(--h3s-accent) 55%,transparent)}
    .h3s-studio-title{font-size:12px!important;font-weight:760!important;letter-spacing:.005em!important}.h3s-status-pill{padding:3px 7px!important;border-radius:999px!important;font-size:8px!important;letter-spacing:.04em!important}
    .h3s-section{gap:8px!important;padding:10px!important;border:1px solid var(--h3s-border)!important;border-radius:11px!important;background:linear-gradient(145deg,var(--h3s-surface),color-mix(in srgb,var(--h3s-bg) 97%,white 1%))!important;box-shadow:inset 0 1px rgba(255,255,255,.018)!important}
    .h3s-section-header{min-height:20px!important}.h3s-section-title{font-size:8.5px!important;font-weight:780!important;letter-spacing:.105em!important}.h3s-section-description{margin:0!important;font-size:9px!important;line-height:1.45!important}.h3s-section-stack{gap:8px!important}.h3s-context-help{font-size:8.8px!important;line-height:1.5!important}
    .h3s-grid{gap:8px!important}.h3s-field{gap:4px!important}.h3s-field-label{margin-left:1px;color:var(--h3s-muted)!important;font-size:8.5px!important;font-weight:650!important;text-transform:uppercase;letter-spacing:.045em}.h3s-field-hint{font-size:8px!important}
    .h3s-control,.h3s-number,.h3s-writer-instruction,.h3s-reference-description{border:1px solid var(--h3s-border)!important;border-radius:8px!important;background:color-mix(in srgb,var(--h3s-bg) 94%,black 2%)!important;color:var(--h3s-text)!important;box-shadow:inset 0 1px rgba(255,255,255,.015)!important}.h3s-control{height:30px!important;padding:5px 8px!important}.h3s-control:hover,.h3s-number:hover,.h3s-writer-instruction:hover,.h3s-reference-description:hover{border-color:color-mix(in srgb,var(--h3s-accent) 40%,var(--h3s-border))!important}.h3s-control:focus,.h3s-number:focus,.h3s-writer-instruction:focus,.h3s-reference-description:focus{outline:none!important;border-color:color-mix(in srgb,var(--h3s-accent) 60%,var(--h3s-border))!important;box-shadow:0 0 0 2px color-mix(in srgb,var(--h3s-accent) 7%,transparent)!important}

    /* Custom choice control used by every main Director selector. */
    .h3s-choice{position:relative;width:100%;min-width:0}.h3s-choice-trigger{display:grid;grid-template-columns:minmax(0,1fr) 17px;align-items:center;gap:5px;width:100%;height:31px;padding:5px 7px 5px 9px;border:1px solid var(--h3s-border);border-radius:8px;background:color-mix(in srgb,var(--h3s-bg) 94%,black 2%);color:var(--h3s-text);cursor:pointer;text-align:left;font:inherit;transition:120ms ease}.h3s-choice-trigger:hover,.h3s-choice.is-open .h3s-choice-trigger{border-color:color-mix(in srgb,var(--h3s-accent) 55%,var(--h3s-border));background:color-mix(in srgb,var(--h3s-accent) 4%,var(--h3s-bg))}.h3s-choice-trigger:focus-visible{outline:2px solid color-mix(in srgb,var(--h3s-accent) 20%,transparent);outline-offset:1px}.h3s-choice-trigger:disabled{opacity:.4;cursor:default}.h3s-choice-value{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9.5px}.h3s-choice-chevron{display:grid;place-items:center;color:var(--h3s-muted);font-size:13px;transition:transform .12s}.h3s-choice.is-open .h3s-choice-chevron{transform:rotate(180deg)}
    .h3s-choice-menu{position:fixed;z-index:1000000;overflow:auto;padding:5px;border:1px solid color-mix(in srgb,var(--border-default,rgba(255,255,255,.15)) 90%,transparent);border-radius:10px;background:color-mix(in srgb,var(--comfy-menu-bg,#10171b) 96%,black 4%);box-shadow:0 16px 45px rgba(0,0,0,.48),inset 0 1px rgba(255,255,255,.03);color:var(--input-text,#edf3f5);font:10px/1.25 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;backdrop-filter:blur(14px)}.h3s-choice-option{display:block;width:100%;min-height:31px;padding:6px 8px;border:0;border-radius:7px;background:transparent;color:inherit;text-align:left;cursor:pointer;font:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.h3s-choice-option:hover,.h3s-choice-option:focus{outline:none;background:rgba(255,255,255,.055)}.h3s-choice-option.is-active{background:rgba(57,214,183,.12);color:#dffff7}.h3s-choice-option.is-active::before{content:'✓';display:inline-block;width:17px;color:#39d6b7}

    .h3s-resolution-presets{gap:4px!important}.h3s-resolution-preset,.h3s-resolution-mode{min-height:25px!important;border-radius:7px!important;padding:4px 7px!important;font-size:8px!important}.h3s-resolution-preset.is-active,.h3s-resolution-mode.is-active{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--h3s-accent) 10%,transparent)}
    .h3s-resolution-preview{min-height:48px!important;border:1px solid color-mix(in srgb,var(--h3s-border) 60%,transparent);border-radius:9px!important;background:color-mix(in srgb,var(--h3s-bg) 95%,black 2%)!important}
    .h3s-switch{min-height:28px!important}.h3s-switch-track{width:32px!important;height:18px!important}.h3s-switch-track::after{width:12px!important;height:12px!important}.h3s-switch input:checked + .h3s-switch-track::after{transform:translateX(14px)!important}
    .h3s-reference-card{border-radius:10px!important;border-color:color-mix(in srgb,var(--h3s-border) 80%,transparent)!important;background:color-mix(in srgb,var(--h3s-bg) 94%,black 2%)!important}.h3s-reference-card-auto{border-color:color-mix(in srgb,var(--h3s-accent) 35%,var(--h3s-border))!important}.h3s-reference-description{min-height:58px!important;padding:7px 8px!important;font-size:9px!important;line-height:1.45!important}.h3s-add-image{min-height:28px!important;border-radius:8px!important;padding:5px 9px!important}
    .h3s-prompt-studio{border-top:1px solid color-mix(in srgb,var(--h3s-border) 65%,transparent)!important;padding-top:6px!important}.h3s-prompt-studio>summary{font-size:9px!important;color:var(--h3s-muted)!important}.h3s-writer-instruction{min-height:58px!important;padding:7px 8px!important}
    .h3s-custom-loras,.h3s-share-section,.h3s-runtime-section{border-radius:11px!important}.h3s-share-section button{min-height:30px!important;border-radius:8px!important}.h3s-share-section .h3s-section-description{max-width:640px}
    .h3s-advanced-toggle{border-radius:8px!important}

    /* Keep DOM widget containers from clipping the new bounded internal scrollers. */
    .h3b4{contain:layout paint style}.h3b4-parent-fix{overflow:visible!important;max-width:100%!important;width:100%!important}
    @media(max-width:720px){.h3s-grid{grid-template-columns:1fr!important}.h3s-studio-panel{padding:9px!important}}
  `;
  document.head.append(style);
}

function forceHideNativeWidgets(node) {
  if (!node || node.comfyClass !== DIRECTOR) return;
  for (const widget of node.widgets || []) {
    if (!widget?.name || VISIBLE_NATIVE.has(widget.name)) continue;
    if (!widget.__h3studioV4Hidden) {
      widget.__h3studioV4Hidden = true;
      widget.__h3studioV4OriginalCompute = widget.computeSize;
      widget.__h3studioV4OriginalType = widget.type;
    }
    widget.hidden = true;
    widget.type = "hidden";
    widget.computeSize = () => [0, -4];
    if (widget.inputEl?.style) widget.inputEl.style.display = "none";
    if (widget.element?.style && widget.name !== "h3studio_controls") widget.element.style.display = "none";
  }
}

function fixBenchmarkParent(node) {
  if (node?.comfyClass !== "H3StudioSmartBenchmark") return;
  const root = node.__h3bRoot;
  if (root?.parentElement) root.parentElement.classList.add("h3b4-parent-fix");
}

function attachDirector(node) {
  if (!node || node.comfyClass !== DIRECTOR) return;
  forceHideNativeWidgets(node);
  if (node.__h3studioV4NativeGuard) return;
  node.__h3studioV4NativeGuard = true;
  const originalDraw = node.onDrawForeground;
  node.onDrawForeground = function h3studioV4DrawForeground() {
    forceHideNativeWidgets(this);
    return originalDraw?.apply(this, arguments);
  };
  const originalResize = node.onResize;
  node.onResize = function h3studioV4Resize() {
    const result = originalResize?.apply(this, arguments);
    forceHideNativeWidgets(this);
    return result;
  };
}

function sweep() {
  for (const node of app.graph?._nodes || []) {
    if (node?.comfyClass === DIRECTOR) attachDirector(node);
    else if (node?.comfyClass === "H3StudioSmartBenchmark") fixBenchmarkParent(node);
  }
}

app.registerExtension({
  name: "H3Studio.UIV4",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== DIRECTOR) return;
    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function h3studioV4Created() {
      const result = created?.apply(this, arguments);
      queueMicrotask(() => attachDirector(this));
      return result;
    };
    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function h3studioV4Configured() {
      const result = configured?.apply(this, arguments);
      queueMicrotask(() => attachDirector(this));
      return result;
    };
  },
  setup() { installStyles(); },
  afterConfigureGraph() { installStyles(); setTimeout(sweep, 120); },
  nodeCreated(node) { installStyles(); if (node?.comfyClass === DIRECTOR) queueMicrotask(() => attachDirector(node)); setTimeout(() => fixBenchmarkParent(node), 80); },
});
