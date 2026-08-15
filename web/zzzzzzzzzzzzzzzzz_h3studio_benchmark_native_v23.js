import { app } from "../../scripts/app.js";

const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-benchmark-native-v23-style";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* V23 is intentionally subtractive: let the ComfyUI node own the surface. */
    .h3b7.h3b23{
      --b23-line:color-mix(in srgb,var(--border-color,#34383d) 70%,transparent);
      --b23-input:var(--comfy-input-bg,#181c20);
      --b23-input-hover:color-mix(in srgb,var(--b23-input) 90%,white 4%);
      --b23-text:var(--input-text,#e7eaed);
      --b23-muted:var(--descrip-text,#7f8992);
      background:transparent!important;
      border:0!important;
      border-radius:0!important;
      box-shadow:none!important;
      color:var(--b23-text)!important;
    }
    .h3b23,.h3b23 *{box-shadow:none!important}
    .h3b23 .h3b7-top,
    .h3b23 .h3b7-body,
    .h3b23 .h3b15-plan,
    .h3b23 .h3b7-summary,
    .h3b23 .h3b7-list,
    .h3b23 .h3b7-scenario,
    .h3b23 .h3b7-scenario[open],
    .h3b23 .h3b7-scenario>summary,
    .h3b23 .h3b7-scenario[open]>summary,
    .h3b23 .h3b7-fields{
      background:transparent!important;
      background-image:none!important;
    }

    .h3b23 .h3b7-top{padding:8px 0 9px!important;margin:0 12px!important;border-bottom:1px solid var(--b23-line)!important;min-height:44px!important}
    .h3b23 .h3b7-title-row{gap:0!important}.h3b23 .h3b7-icon{display:none!important}
    .h3b23 .h3b7-title{font-size:11px!important;font-weight:700!important;color:var(--b23-text)!important}
    .h3b23 .h3b7-sub{margin-top:2px!important;font-size:7px!important;color:var(--b23-muted)!important}
    .h3b23 .h3b7-assets{height:22px!important;padding:0 6px!important;border:1px solid var(--b23-line)!important;border-radius:5px!important;background:transparent!important;color:#7b858d!important;font-size:6.5px!important}

    .h3b23 .h3b7-body{padding:0 12px 14px!important}
    .h3b23 .h3b7-toolbar{padding:8px 0!important;margin:0!important;border-bottom:1px solid var(--b23-line)!important;gap:6px!important}
    .h3b23 .h3b15-quick{gap:3px!important}
    .h3b23 .h3b15-quick button,.h3b23 .h3b7-btn{
      height:25px!important;min-height:25px!important;padding:0 7px!important;
      border:1px solid var(--b23-line)!important;border-radius:5px!important;
      background:transparent!important;color:#8e989f!important;font-size:6.8px!important;font-weight:620!important;
    }
    .h3b23 .h3b15-quick button:hover,.h3b23 .h3b7-btn:hover{background:var(--b23-input)!important;color:#dfe4e7!important}
    .h3b23 .h3b15-quick button.primary,.h3b23 .h3b7-btn.primary{background:var(--b23-input)!important;border-color:#3a4249!important;color:#dfe4e7!important}
    .h3b23 .h3b21-button-icon{display:none!important}
    .h3b23 .h3b7-summary{padding:5px 0!important;min-height:24px!important;border-bottom:1px solid var(--b23-line)!important;color:#6e7880!important;font-size:6.4px!important}
    .h3b23 .h3b7-summary strong{font-size:6.4px!important;color:#7f8991!important}

    /* Shared run setup: native controls, no card/chip framing. */
    .h3b23 .h3b15-plan{padding:9px 0!important;border-bottom:1px solid var(--b23-line)!important}
    .h3b23 .h3b15-head{margin:0 0 7px!important}.h3b23 .h3b15-head strong{font-size:8.8px!important}.h3b23 .h3b15-head small{font-size:6.4px!important;color:#707a82!important}
    .h3b23 .h3b15-count,.h3b23 .h3b20-res-state{height:auto!important;min-height:0!important;padding:1px 5px!important;border:0!important;border-radius:0!important;background:transparent!important;color:#78828a!important;font-size:6.1px!important}
    .h3b23 .h3b20-resolutions{padding:6px 0!important;border:0!important;border-top:1px solid var(--b23-line)!important}
    .h3b23 .h3b20-res-chip{height:22px!important;border-color:var(--b23-line)!important;background:transparent!important;border-radius:5px!important}
    .h3b23 .h3b20-add{height:23px!important;border-color:var(--b23-line)!important;background:var(--b23-input)!important;border-radius:5px!important}
    .h3b23 .h3b15-seeds{margin:7px 0 0!important;padding:0!important;border:0!important;background:transparent!important;gap:2px!important}
    .h3b23 .h3b15-seeds button{min-height:31px!important;border:1px solid transparent!important;border-radius:5px!important;background:transparent!important}
    .h3b23 .h3b15-seeds button:hover{background:var(--b23-input)!important}.h3b23 .h3b15-seeds button.active{background:var(--b23-input)!important;border-color:var(--b23-line)!important}
    .h3b23 .h3b15-grid{gap:6px!important;margin-top:7px!important}.h3b23 .h3b17-select{height:28px!important;border:1px solid var(--b23-line)!important;border-radius:5px!important;background:var(--b23-input)!important}
    .h3b23 .h3b17-field-note{font-size:5.9px!important;line-height:8px!important;color:#68727a!important}.h3b23 .h3b15-checks{padding-top:7px!important;border-top:1px solid var(--b23-line)!important}.h3b23 .h3b15-check{font-size:6.3px!important}

    /* Scenarios are plain native rows, not cards. */
    .h3b23 .h3b7-list:before{padding:9px 0 5px!important;border-bottom:1px solid var(--b23-line)!important;color:#858f97!important;font-size:6.7px!important;font-weight:650!important}
    .h3b23 .h3b7-scenario{border:0!important;border-bottom:1px solid var(--b23-line)!important;border-radius:0!important;overflow:visible!important}
    .h3b23 .h3b7-scenario>summary,.h3b23 .h3b7-scenario[open]>summary{min-height:39px!important;padding:4px 0!important;border:0!important}
    .h3b23 .h3b7-index{width:20px!important;height:20px!important;border:0!important;border-radius:0!important;background:transparent!important;color:#717b83!important;font-size:6.7px!important;font-weight:650!important}
    .h3b23 .h3b7-name{height:27px!important;padding:2px 4px!important;border:0!important;background:transparent!important;color:#e4e7e9!important;font-size:8.8px!important;font-weight:680!important}
    .h3b23 .h3b7-name:hover,.h3b23 .h3b7-name:focus{border:0!important;background:var(--b23-input)!important;outline:none!important}
    .h3b23 .h3b7-tag{display:none!important}
    .h3b23 .h3b7-x{width:20px!important;height:20px!important;color:#69737b!important}.h3b23 .h3b7-x:hover{background:transparent!important;color:#ca8c92!important}

    .h3b23 .h3b7-fields{padding:2px 0 8px!important;border-top:0!important}
    .h3b23 .h3b7-field{display:grid!important;grid-template-columns:100px minmax(0,1fr)!important;align-items:center!important;gap:10px!important;min-height:38px!important;padding:4px 0!important;border-bottom:1px solid color-mix(in srgb,var(--b23-line) 72%,transparent)!important;background:transparent!important}
    .h3b23 .h3b7-label{margin:0!important;color:#758088!important;font-size:6.5px!important;font-weight:600!important}
    .h3b23 .h3b7-input,.h3b23 .h3b7-select{height:29px!important;border:1px solid var(--b23-line)!important;border-radius:5px!important;background:var(--b23-input)!important;color:#dfe3e6!important;font-size:7.7px!important}
    .h3b23 .h3b7-input:hover,.h3b23 .h3b7-select:hover{background:var(--b23-input-hover)!important;border-color:#3c444b!important}
    .h3b23 .h3b7-loras{padding:6px 0 1px 110px!important}.h3b23 .h3b7-loras>summary{font-size:6.4px!important;color:#737e86!important}

    /* Kill ALL decorative field icons. Director itself uses them sparingly; Benchmark does not need them here. */
    .h3b23 .h3b20-field-icon,.h3b23 .h3b17-field-icon,.h3b23 .h3b17-toggle-icon,.h3b23 .h3b21-field-icon{display:none!important}

    /* V22 added a second compact MP slider. Keep the existing full-width Target size control and remove this duplicate. */
    .h3b23 .h3b22-mp{display:none!important}
    .h3b23 .h3b21-mp-help{display:none!important}
    .h3b23 .h3b23-hide{display:none!important}
    .h3b23 .h3b22-mp-field{min-height:auto!important}

    @container (max-width:700px){
      .h3b23 .h3b7-field{grid-template-columns:82px minmax(0,1fr)!important}
      .h3b23 .h3b7-loras{padding-left:92px!important}
    }
  `;
  document.head.append(style);
}

function clean(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) return;
  root.classList.add("h3b23");

  for (const icon of root.querySelectorAll(".h3b20-field-icon,.h3b17-field-icon,.h3b17-toggle-icon,.h3b21-field-icon,.h3b21-button-icon")) {
    icon.setAttribute("aria-hidden", "true");
  }

  for (const el of root.querySelectorAll("small,span,div")) {
    const text = String(el.textContent || "").trim();
    if (text.startsWith("Per-scenario target")) el.classList.add("h3b23-hide");
  }
}

function observe(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) { setTimeout(() => observe(node), 100); return; }
  clean(node);
  if (root.__h3b23Observer) return;
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; clean(node); });
  });
  observer.observe(root, { childList: true, subtree: true });
  root.__h3b23Observer = observer;
}

function sweep() {
  for (const node of app.graph?._nodes || []) if (node?.comfyClass === BENCHMARK) observe(node);
}

app.registerExtension({
  name: "H3Studio.BenchmarkNativeV23",
  setup() { installStyles(); setTimeout(sweep, 340); },
  nodeCreated(node) { if (node?.comfyClass === BENCHMARK) setTimeout(() => observe(node), 340); },
  afterConfigureGraph() { installStyles(); setTimeout(sweep, 420); },
});
