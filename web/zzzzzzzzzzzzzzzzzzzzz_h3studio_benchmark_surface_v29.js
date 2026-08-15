import { app } from "../../scripts/app.js";

const STYLE_ID = "h3studio-benchmark-surface-v29-style";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3final-benchmark{
      --h3bf-control:color-mix(in srgb,var(--comfy-input-bg,#181c20) 90%,white 10%);
      --h3bf-control-hover:color-mix(in srgb,var(--comfy-input-bg,#181c20) 84%,white 16%);
      --h3bf-line:color-mix(in srgb,var(--border-color,#343a40) 72%,transparent);
      --h3bf-line-soft:color-mix(in srgb,var(--border-color,#343a40) 48%,transparent);
      --h3bf-muted:color-mix(in srgb,var(--descrip-text,#7f8992) 92%,white 8%);
      --h3bf-text:var(--input-text,#e7eaed);
      background:transparent!important;
      background-image:none!important;
    }

    /* One continuous node surface. Never paint a second app/card inside ComfyUI. */
    .h3final-benchmark .h3b7-top,
    .h3final-benchmark .h3b7-body,
    .h3final-benchmark .h3b7-toolbar,
    .h3final-benchmark .h3b15-plan,
    .h3final-benchmark .h3b7-summary,
    .h3final-benchmark .h3b7-list,
    .h3final-benchmark .h3b7-scenario,
    .h3final-benchmark .h3b7-scenario[open],
    .h3final-benchmark .h3b7-scenario>summary,
    .h3final-benchmark .h3b7-scenario[open]>summary,
    .h3final-benchmark .h3b7-fields,
    .h3final-benchmark .h3b7-field,
    .h3final-benchmark .h3b7-loras,
    .h3final-benchmark .h3b7-lora-body,
    .h3final-benchmark .h3b7-lora{
      background:transparent!important;
      background-image:none!important;
      box-shadow:none!important;
    }

    /* Header/setup use the exact same graphite language as the scenario controls. */
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

    /* Scenario = a property sheet, not the light-gray card seen in the old UI. */
    .h3final-benchmark .h3b7-list:before{
      border-bottom:1px solid var(--h3bf-line)!important;
      color:#89939b!important;
      padding:12px 0 7px!important;
    }
    .h3final-benchmark .h3b7-scenario,
    .h3final-benchmark .h3b7-scenario[open]{
      margin:0!important;
      padding:0!important;
      border:0!important;
      border-bottom:1px solid var(--h3bf-line)!important;
      border-radius:0!important;
      overflow:visible!important;
    }
    .h3final-benchmark .h3b7-scenario[open]:before{
      left:-1px!important;
      top:9px!important;
      bottom:10px!important;
      width:2px!important;
      background:#718391!important;
      opacity:.75!important;
    }
    .h3final-benchmark .h3b7-scenario>summary,
    .h3final-benchmark .h3b7-scenario[open]>summary{
      min-height:48px!important;
      padding:6px 4px 6px 8px!important;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
    }
    .h3final-benchmark .h3b7-scenario>summary:hover,
    .h3final-benchmark .h3b7-scenario[open]>summary:hover{
      background:color-mix(in srgb,var(--h3bf-control) 28%,transparent)!important;
    }
    .h3final-benchmark .h3b7-index{
      background:transparent!important;
      border-color:color-mix(in srgb,var(--border-color,#41484f) 78%,white 7%)!important;
      color:#a2abb2!important;
    }
    .h3final-benchmark .h3b7-name{
      background:transparent!important;
      color:#edf0f2!important;
    }
    .h3final-benchmark .h3b7-name:hover,
    .h3final-benchmark .h3b7-name:focus{background:var(--h3bf-control)!important}

    .h3final-benchmark .h3b7-fields{
      margin:0!important;
      padding:2px 4px 12px 8px!important;
      border-top:1px solid var(--h3bf-line-soft)!important;
    }
    .h3final-benchmark .h3b7-field{
      grid-template-columns:112px minmax(0,1fr)!important;
      gap:14px!important;
      min-height:47px!important;
      padding:6px 0!important;
      border:0!important;
      border-bottom:1px solid var(--h3bf-line-soft)!important;
    }
    .h3final-benchmark .h3b7-label{
      color:#939ca4!important;
      font-size:7.8px!important;
      font-weight:650!important;
    }

    /* Inputs should be graphite, not pitch black. */
    .h3final-benchmark .h3b7-input,
    .h3final-benchmark .h3b7-select,
    .h3final-benchmark .h3b17-select,
    .h3final-benchmark .h3final-mp,
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
    .h3final-benchmark .h3final-mp:hover,
    .h3final-benchmark .h3final-lora-picker:hover{
      background-color:var(--h3bf-control-hover)!important;
      border-color:#59636c!important;
    }

    /* Target size belongs to its row; no inset card look. */
    .h3final-benchmark .h3final-target-field{padding-top:7px!important;padding-bottom:7px!important}
    .h3final-benchmark .h3final-mp{
      min-height:36px!important;
      padding:5px 10px!important;
      border-radius:7px!important;
    }

    /* LoRA editor follows the same flat rows and never becomes a gray sub-card. */
    .h3final-benchmark .h3b7-loras{
      width:100%!important;
      margin:0!important;
      padding:7px 0 0 126px!important;
      border:0!important;
    }
    .h3final-benchmark .h3b7-loras>summary{
      min-height:34px!important;
      padding:4px 0!important;
      border:0!important;
      color:#9da6ad!important;
      background:transparent!important;
    }
    .h3final-benchmark .h3b7-lora-body{
      margin:2px 0 0!important;
      padding:0!important;
      border-top:1px solid var(--h3bf-line-soft)!important;
    }
    .h3final-benchmark .h3b7-lora{
      border:0!important;
      border-bottom:1px solid var(--h3bf-line-soft)!important;
      border-radius:0!important;
    }
    .h3final-benchmark .h3final-add-lora{
      min-height:32px!important;
      border:1px solid color-mix(in srgb,var(--border-color,#41484f) 84%,white 7%)!important;
      border-radius:7px!important;
      background:var(--h3bf-control)!important;
      color:#d7dce0!important;
    }
    .h3final-benchmark .h3final-add-lora:hover{background:var(--h3bf-control-hover)!important;border-color:#59636c!important}

    @container (max-width:700px){
      .h3final-benchmark .h3b7-field{grid-template-columns:92px minmax(0,1fr)!important;gap:10px!important}
      .h3final-benchmark .h3b7-loras{padding-left:102px!important}
    }
  `;
  document.head.append(style);
}

app.registerExtension({
  name: "H3Studio.BenchmarkSurfaceV29",
  setup() { installStyles(); },
  afterConfigureGraph() { installStyles(); },
});
