import { app } from "../../scripts/app.js";

const STYLE_ID = "h3studio-benchmark-surface-v29-style";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3final-benchmark{
      --h3bf-control:color-mix(in srgb,var(--comfy-input-bg,#181c20) 84%,white 16%);
      --h3bf-control-hover:color-mix(in srgb,var(--comfy-input-bg,#181c20) 78%,white 22%);
      --h3bf-card:transparent;
      --h3bf-card-head:color-mix(in srgb,var(--comfy-input-bg,#181c20) 24%,transparent);
      --h3bf-line:color-mix(in srgb,var(--border-color,#343a40) 76%,transparent);
      --h3bf-line-soft:color-mix(in srgb,var(--border-color,#343a40) 48%,transparent);
      --h3bf-muted:color-mix(in srgb,var(--descrip-text,#7f8992) 92%,white 8%);
      --h3bf-text:var(--input-text,#e7eaed);
      background:transparent!important;
      background-image:none!important;
    }

    .h3final-benchmark .h3b7-top,
    .h3final-benchmark .h3b7-body,
    .h3final-benchmark .h3b7-toolbar,
    .h3final-benchmark .h3b15-plan,
    .h3final-benchmark .h3b7-summary,
    .h3final-benchmark .h3b7-list,
    .h3final-benchmark .h3b7-fields,
    .h3final-benchmark .h3b7-field,
    .h3final-benchmark .h3b7-loras,
    .h3final-benchmark .h3b7-lora-body,
    .h3final-benchmark .h3b7-lora{
      background:transparent!important;
      background-image:none!important;
      box-shadow:none!important;
    }

    .h3final-benchmark .h3b7-top{border-bottom:1px solid var(--h3bf-line)!important}
    .h3final-benchmark .h3b7-toolbar,
    .h3final-benchmark .h3b15-plan,
    .h3final-benchmark .h3b7-summary{border-color:var(--h3bf-line)!important}

    .h3final-benchmark .h3b7-assets,
    .h3final-benchmark .h3b15-quick button,
    .h3final-benchmark .h3b7-btn,
    .h3final-benchmark .h3b17-select,
    .h3final-benchmark .h3b20-res-chip,
    .h3final-benchmark .h3b20-add{
      background-color:var(--h3bf-control)!important;
      border-color:color-mix(in srgb,var(--border-color,#41484f) 82%,white 8%)!important;
      color:#cbd1d6!important;
      box-shadow:none!important;
    }
    .h3final-benchmark .h3b7-assets:hover,
    .h3final-benchmark .h3b15-quick button:hover,
    .h3final-benchmark .h3b7-btn:hover,
    .h3final-benchmark .h3b17-select:hover,
    .h3final-benchmark .h3b20-res-chip:hover,
    .h3final-benchmark .h3b20-add:hover{
      background-color:var(--h3bf-control-hover)!important;
      border-color:#59636c!important;
      color:#f0f2f4!important;
    }
    .h3final-benchmark .h3b15-quick button.primary,
    .h3final-benchmark .h3b7-btn.primary,
    .h3final-benchmark .h3b15-seeds button.active{
      background:color-mix(in srgb,var(--h3bf-control) 84%,#566878 16%)!important;
      border-color:#56636e!important;
    }

    .h3final-benchmark .h3b15-seeds{
      padding:2px!important;
      border:1px solid var(--h3bf-line)!important;
      background:transparent!important;
    }
    .h3final-benchmark .h3b15-seeds button{
      background:transparent!important;
      border:1px solid transparent!important;
    }
    .h3final-benchmark .h3b15-seeds button:hover{background:var(--h3bf-control)!important}

    .h3final-benchmark .h3b7-list{
      display:flex!important;
      flex-direction:column!important;
      gap:8px!important;
      margin:0!important;
      padding-bottom:4px!important;
    }
    .h3final-benchmark .h3b7-list:before{
      border-bottom:0!important;
      color:#89939b!important;
      padding:13px 2px 2px!important;
    }
    .h3final-benchmark .h3b7-scenario,
    .h3final-benchmark .h3b7-scenario[open]{
      position:relative!important;
      width:100%!important;
      margin:0!important;
      padding:0!important;
      border:1px solid color-mix(in srgb,var(--border-color,#41484f) 72%,transparent)!important;
      border-radius:8px!important;
      background:transparent!important;
      background-image:none!important;
      box-shadow:none!important;
      overflow:hidden!important;
    }
    .h3final-benchmark .h3b7-scenario:before,
    .h3final-benchmark .h3b7-scenario[open]:before{
      display:none!important;
      content:none!important;
    }
    .h3final-benchmark .h3b7-scenario>summary,
    .h3final-benchmark .h3b7-scenario[open]>summary{
      min-height:48px!important;
      padding:7px 10px!important;
      border:0!important;
      border-radius:0!important;
      background:var(--h3bf-card-head)!important;
      background-image:none!important;
    }
    .h3final-benchmark .h3b7-scenario[open]>summary{border-bottom:1px solid var(--h3bf-line-soft)!important}
    .h3final-benchmark .h3b7-scenario>summary:hover,
    .h3final-benchmark .h3b7-scenario[open]>summary:hover{
      background:color-mix(in srgb,var(--h3bf-control) 22%,transparent)!important;
    }
    .h3final-benchmark .h3b7-index{
      background:transparent!important;
      border-color:color-mix(in srgb,var(--border-color,#41484f) 78%,white 7%)!important;
      color:#a6afb6!important;
    }
    .h3final-benchmark .h3b7-name{background:transparent!important;color:#edf0f2!important}
    .h3final-benchmark .h3b7-name:hover,
    .h3final-benchmark .h3b7-name:focus{background:var(--h3bf-control)!important}

    .h3final-benchmark .h3b7-fields{
      width:100%!important;
      margin:0!important;
      padding:4px 14px 12px!important;
      border:0!important;
      overflow:visible!important;
    }
    .h3final-benchmark .h3b7-field{
      display:grid!important;
      grid-template-columns:122px minmax(0,1fr)!important;
      align-items:center!important;
      gap:14px!important;
      width:100%!important;
      min-height:48px!important;
      padding:7px 2px!important;
      border:0!important;
      border-bottom:1px solid var(--h3bf-line-soft)!important;
      overflow:visible!important;
    }
    .h3final-benchmark .h3b7-field:last-of-type{border-bottom:0!important}
    .h3final-benchmark .h3b7-label{
      display:block!important;
      width:100%!important;
      min-width:0!important;
      padding-left:2px!important;
      overflow:visible!important;
      white-space:nowrap!important;
      color:#969fa7!important;
      font-size:8px!important;
      font-weight:650!important;
      line-height:1.2!important;
    }

    .h3final-benchmark .h3b7-input,
    .h3final-benchmark .h3b7-select,
    .h3final-benchmark .h3b17-select,
    .h3final-benchmark .h3final-lora-picker,
    .h3final-benchmark .h3final-strength-value{
      background-color:var(--h3bf-control)!important;
      border-color:color-mix(in srgb,var(--border-color,#41484f) 84%,white 7%)!important;
      color:var(--h3bf-text)!important;
      box-shadow:none!important;
    }
    .h3final-benchmark .h3b7-input:hover,
    .h3final-benchmark .h3b7-select:hover,
    .h3final-benchmark .h3b17-select:hover,
    .h3final-benchmark .h3final-lora-picker:hover{
      background-color:var(--h3bf-control-hover)!important;
      border-color:#59636c!important;
    }

    .h3final-benchmark .h3final-target-field{padding-top:9px!important;padding-bottom:9px!important}
    .h3final-benchmark .h3final-mp{
      display:grid!important;
      grid-template-columns:minmax(0,1fr) 78px!important;
      gap:16px!important;
      align-items:center!important;
      width:100%!important;
      min-height:42px!important;
      padding:2px 2px!important;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
      box-shadow:none!important;
    }
    .h3final-benchmark .h3final-mp-main{min-width:0!important;padding-top:2px!important}
    .h3final-benchmark .h3final-mp-track{position:relative!important;height:22px!important;--h3final-mp:0%}
    .h3final-benchmark .h3final-mp-track:before{
      content:''!important;position:absolute!important;left:0!important;right:0!important;top:50%!important;height:4px!important;
      border-radius:99px!important;background:color-mix(in srgb,var(--border-color,#343a40) 68%,black 8%)!important;transform:translateY(-50%)!important;
    }
    .h3final-benchmark .h3final-mp-track:after{
      content:''!important;position:absolute!important;left:0!important;top:50%!important;width:var(--h3final-mp)!important;height:4px!important;
      border-radius:99px!important;background:linear-gradient(90deg,#72aa9e 0%,#84aa87 28%,#b1a66c 55%,#c9855f 78%,#c76568 100%)!important;transform:translateY(-50%)!important;
    }
    .h3final-benchmark .h3final-mp-thumb{
      width:13px!important;height:13px!important;border:2px solid color-mix(in srgb,var(--comfy-input-bg,#181c20) 78%,black 22%)!important;
      background:#b8c1c7!important;box-shadow:0 1px 4px rgba(0,0,0,.30)!important;
    }
    .h3final-benchmark .h3final-mp-scale{margin-top:2px!important;color:#727d85!important;font-size:6.7px!important;font-variant-numeric:tabular-nums!important}
    .h3final-benchmark .h3final-mp-value{align-self:center!important;padding-right:2px!important;text-align:right!important;color:#f0f2f3!important;font-size:9.2px!important;font-weight:760!important;font-variant-numeric:tabular-nums!important;white-space:nowrap!important}

    .h3final-benchmark .h3b7-loras{width:100%!important;margin:0!important;padding:7px 2px 2px 138px!important;border:0!important}
    .h3final-benchmark .h3b7-loras>summary{min-height:36px!important;padding:4px 0!important;border:0!important;color:#9fa8af!important;background:transparent!important}
    .h3final-benchmark .h3b7-lora-body{margin:2px 0 0!important;padding:0!important;border-top:1px solid var(--h3bf-line-soft)!important}
    .h3final-benchmark .h3b7-lora{border:0!important;border-bottom:1px solid var(--h3bf-line-soft)!important;border-radius:0!important}
    .h3final-benchmark .h3final-add-lora{min-height:33px!important;border:1px solid color-mix(in srgb,var(--border-color,#41484f) 84%,white 7%)!important;border-radius:7px!important;background:var(--h3bf-control)!important;color:#d7dce0!important}
    .h3final-benchmark .h3final-add-lora:hover{background:var(--h3bf-control-hover)!important;border-color:#59636c!important}

    @container (max-width:700px){
      .h3final-benchmark .h3b7-fields{padding-left:10px!important;padding-right:10px!important}
      .h3final-benchmark .h3b7-field{grid-template-columns:98px minmax(0,1fr)!important;gap:10px!important}
      .h3final-benchmark .h3b7-loras{padding-left:110px!important}
      .h3final-benchmark .h3final-mp{grid-template-columns:minmax(0,1fr) 68px!important;gap:10px!important}
    }
    @container (max-width:520px){
      .h3final-benchmark .h3b7-field{grid-template-columns:1fr!important;gap:6px!important;padding:9px 2px!important}
      .h3final-benchmark .h3b7-label{padding-left:0!important}
      .h3final-benchmark .h3b7-loras{padding-left:2px!important}
      .h3final-benchmark .h3final-mp{grid-template-columns:1fr!important;gap:3px!important}
      .h3final-benchmark .h3final-mp-value{text-align:left!important}
    }
  `;
  document.head.append(style);
}

function normalizeRoot(root) {
  if (!root?.isConnected) return;

  /* v20 painted the whole embedded Benchmark with --comfy-menu-bg. Inline !important wins permanently. */
  root.style.setProperty("background", "transparent", "important");
  root.style.setProperty("background-image", "none", "important");
  root.style.setProperty("box-shadow", "none", "important");
  root.style.setProperty("--h3v20-bg", "transparent", "important");
  root.style.setProperty("--h3v20-surface", "color-mix(in srgb,var(--comfy-input-bg,#181c20) 84%,white 16%)", "important");
  root.style.setProperty("--h3v20-border", "var(--border-color,#3f464d)", "important");

  const clear = root.querySelectorAll(
    ".h3b7-top,.h3b7-body,.h3b7-toolbar,.h3b15-plan,.h3b7-summary,.h3b7-list,.h3b20-resolutions,.h3b20-res-controls,.h3b15-checks"
  );
  for (const el of clear) {
    el.style.setProperty("background", "transparent", "important");
    el.style.setProperty("background-image", "none", "important");
    el.style.setProperty("box-shadow", "none", "important");
  }
  const seeds = root.querySelector(".h3b15-seeds");
  if (seeds) seeds.style.setProperty("background", "transparent", "important");

  const parent = root.parentElement;
  if (parent) {
    parent.style.setProperty("background", "transparent", "important");
    parent.style.setProperty("background-image", "none", "important");
  }
}

function sweep() {
  return;
  return;
  installStyles();
  document.querySelectorAll(".h3b7.h3final-benchmark").forEach(normalizeRoot);
}

app.registerExtension({
  name: "H3Studio.BenchmarkSurfaceV29",
  setup() {
    installStyles();
    for (const delay of [0, 80, 180, 400, 900]) setTimeout(sweep, delay);
  },
  nodeCreated(node) {
    if (node?.comfyClass !== "H3StudioSmartBenchmark") return;
    for (const delay of [60, 180, 420]) setTimeout(() => normalizeRoot(node.__h3bRoot), delay);
  },
  afterConfigureGraph() {
    installStyles();
    for (const delay of [0, 120, 360, 800]) setTimeout(sweep, delay);
  },
});
