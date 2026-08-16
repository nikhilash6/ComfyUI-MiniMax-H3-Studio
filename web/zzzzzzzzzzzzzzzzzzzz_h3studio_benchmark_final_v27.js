import { app } from "../../scripts/app.js";


if (!globalThis.__H3_STUDIO_CANONICAL_UI__) {
const BENCHMARK = "H3StudioSmartBenchmark";
const WIDGET_NAME = "h3studio_smart_benchmark";
const STYLE_ID = "h3studio-benchmark-final-v28-style";
const PENDING = new WeakMap();
let documentObserver = null;
let sweepQueued = false;

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3b7,.h3b7 *{box-sizing:border-box!important;min-width:0}
    .h3b7{
      width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;
      overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scrollbar-gutter:stable!important;
      border:0!important;border-radius:0!important;background:transparent!important;background-image:none!important;box-shadow:none!important;
      color:var(--input-text,#e7eaed)!important;font:10px/1.4 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif!important;
    }
    .h3b7::-webkit-scrollbar{width:8px}.h3b7::-webkit-scrollbar-thumb{border:2px solid transparent;border-radius:999px;background:color-mix(in srgb,var(--descrip-text,#737d85) 72%,transparent);background-clip:padding-box}
    .h3b7 .h3b7-top,.h3b7 .h3b7-body,.h3b7 .h3b15-plan,.h3b7 .h3b7-summary,.h3b7 .h3b7-list,.h3b7 .h3b7-scenario,.h3b7 .h3b7-scenario>summary,.h3b7 .h3b7-fields{background:transparent!important;background-image:none!important;box-shadow:none!important}

    /* Header: no mystery badge/icon, just a clean product title. */
    .h3b7 .h3b7-top{position:static!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;min-height:52px!important;margin:0 14px!important;padding:9px 0!important;border-bottom:1px solid color-mix(in srgb,var(--border-color,#343a40) 72%,transparent)!important}
    .h3b7 .h3b7-icon{display:none!important}
    .h3b7 .h3b7-title-row{display:flex!important;align-items:center!important;gap:0!important}
    .h3b7 .h3b7-title{font-size:12px!important;line-height:1.2!important;font-weight:760!important;letter-spacing:-.015em!important;color:var(--input-text,#edf0f2)!important}
    .h3b7 .h3b7-sub{margin-top:3px!important;font-size:7.8px!important;line-height:1.35!important;color:var(--descrip-text,#7f8992)!important}
    .h3b7 .h3b7-assets{height:28px!important;padding:0 9px!important;border:1px solid color-mix(in srgb,var(--border-color,#3b4248) 86%,white 5%)!important;border-radius:7px!important;background:color-mix(in srgb,var(--comfy-input-bg,#181c20) 72%,transparent)!important;color:#949ea6!important;font-size:7.5px!important;font-weight:650!important;cursor:pointer!important}
    .h3b7 .h3b7-assets:hover{border-color:#525d66!important;color:#d9dee2!important}

    .h3b7 .h3b7-body{padding:0 14px 18px!important}
    .h3b7 .h3b7-toolbar{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;flex-wrap:wrap!important;margin:0!important;padding:10px 0!important;border-bottom:1px solid color-mix(in srgb,var(--border-color,#343a40) 68%,transparent)!important}
    .h3b7 .h3b15-quick,.h3b7 .h3b7-actions{display:flex!important;align-items:center!important;gap:6px!important;flex-wrap:wrap!important}
    .h3b7 .h3b15-quick button,.h3b7 .h3b7-btn{
      display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;height:32px!important;min-height:32px!important;
      padding:0 11px!important;border:1px solid color-mix(in srgb,var(--border-color,#3d444b) 88%,white 5%)!important;border-radius:7px!important;
      background:color-mix(in srgb,var(--comfy-input-bg,#181c20) 72%,transparent)!important;color:#aeb6bd!important;font-size:8.5px!important;font-weight:680!important;cursor:pointer!important;box-shadow:none!important;
    }
    .h3b7 .h3b15-quick button:hover,.h3b7 .h3b7-btn:hover{background:var(--comfy-input-bg,#181c20)!important;border-color:#56616a!important;color:#f1f3f4!important}
    .h3b7 .h3b15-quick button.primary,.h3b7 .h3b7-btn.primary{background:#273039!important;border-color:#46535e!important;color:#edf1f4!important}
    .h3final-action-icon{display:grid;place-items:center;width:14px;height:14px;flex:none;color:#9ca7b0}.h3final-action-icon svg{width:13px;height:13px;display:block}
    .h3b7 .h3b21-button-icon,.h3b7 .h3b25-icon,.h3b7 .h3b17-quick-icon{display:none!important}

    .h3b7 .h3b7-summary{display:flex!important;align-items:center!important;min-height:30px!important;padding:6px 0!important;margin:0!important;border:0!important;border-bottom:1px solid color-mix(in srgb,var(--border-color,#343a40) 58%,transparent)!important;border-radius:0!important;color:#768089!important;font-size:7.4px!important}.h3b7 .h3b7-summary strong{margin-left:auto!important;color:#8f99a1!important;font-size:7.2px!important}

    /* Global benchmark setup stays compact but readable. */
    .h3b7 .h3b15-plan{padding:11px 0!important;margin:0!important;border:0!important;border-bottom:1px solid color-mix(in srgb,var(--border-color,#343a40) 68%,transparent)!important}
    .h3b7 .h3b15-head{margin:0 0 9px!important}.h3b7 .h3b15-head strong{font-size:9.5px!important;color:#e3e7ea!important}.h3b7 .h3b15-head small{font-size:7.2px!important;color:#77818a!important}
    .h3b7 .h3b15-seeds{gap:4px!important;padding:3px!important;border:1px solid color-mix(in srgb,var(--border-color,#343a40) 70%,transparent)!important;border-radius:7px!important;background:transparent!important}
    .h3b7 .h3b15-seeds button{min-height:38px!important;border-radius:6px!important;background:color-mix(in srgb,var(--comfy-input-bg,#181c20) 52%,transparent)!important}.h3b7 .h3b15-seeds button.active{background:#273039!important}
    .h3b7 .h3b17-seed-title{font-size:7.8px!important}.h3b7 .h3b17-seed-sub{font-size:6.6px!important}
    .h3b7 .h3b17-select{appearance:none!important;-webkit-appearance:none!important;height:33px!important;padding:0 35px 0 10px!important;border:1px solid color-mix(in srgb,var(--border-color,#3d444b) 88%,white 4%)!important;border-radius:7px!important;background-color:var(--comfy-input-bg,#181c20)!important;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5 6 6.5 11 1.5' fill='none' stroke='%239aa4ad' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")!important;background-repeat:no-repeat!important;background-position:right 12px center!important;background-size:12px 8px!important;color:#dfe3e6!important;font-size:8.2px!important}
    .h3b7 .h3b17-chevron{display:none!important}.h3b7 .h3b17-help{width:17px!important;height:17px!important;font-size:8px!important}

    /* Scenarios: flat property sheets like Director, not nested cards. */
    .h3b7 .h3b7-list{gap:0!important;margin:0!important;border:0!important}
    .h3b7 .h3b7-list:before{content:'SCENARIOS'!important;display:block!important;padding:11px 0 6px!important;border-bottom:1px solid color-mix(in srgb,var(--border-color,#343a40) 66%,transparent)!important;color:#78828a!important;font-size:6.8px!important;font-weight:760!important;letter-spacing:.08em!important}
    .h3b7 .h3b7-scenario{position:relative!important;border:0!important;border-bottom:1px solid color-mix(in srgb,var(--border-color,#343a40) 66%,transparent)!important;border-radius:0!important;overflow:visible!important}
    .h3b7 .h3b7-scenario[open]:before{content:'';position:absolute;left:-14px;top:8px;bottom:8px;width:2px;border-radius:99px;background:#718697}
    .h3b7 .h3b7-scenario>summary{display:grid!important;grid-template-columns:32px minmax(150px,1fr) 30px 30px!important;align-items:center!important;gap:8px!important;min-height:48px!important;padding:6px 0!important;border:0!important;border-radius:0!important;list-style:none!important;cursor:pointer!important}
    .h3b7 .h3b7-scenario>summary::-webkit-details-marker{display:none!important}.h3b7 .h3b7-scenario>summary:hover{background:color-mix(in srgb,var(--comfy-input-bg,#181c20) 26%,transparent)!important}
    .h3b7 .h3b7-index{display:grid!important;place-items:center!important;width:25px!important;height:25px!important;border:1px solid color-mix(in srgb,var(--border-color,#3b4248) 86%,white 4%)!important;border-radius:7px!important;background:transparent!important;color:#9aa4ac!important;font-size:7.4px!important;font-weight:750!important;font-variant-numeric:tabular-nums!important}
    .h3b7 .h3b7-name{width:100%!important;height:32px!important;padding:0 7px!important;border:1px solid transparent!important;border-radius:6px!important;background:transparent!important;color:#e7eaed!important;font-size:9.3px!important;font-weight:720!important;outline:none!important}.h3b7 .h3b7-name:hover,.h3b7 .h3b7-name:focus{border-color:#434c54!important;background:var(--comfy-input-bg,#181c20)!important}
    .h3b7 .h3b7-tag{display:none!important}.h3b7 .h3b20-caret,.h3b7 .h3b7-caret{display:none!important}
    .h3final-caret{display:grid!important;place-items:center!important;width:28px!important;height:28px!important;border-radius:6px!important;color:#8f9aa3!important;pointer-events:none!important}.h3final-caret svg{width:15px;height:15px;transition:transform .14s ease}.h3b7-scenario[open] .h3final-caret svg{transform:rotate(180deg)}
    .h3b7 .h3b7-x{display:grid!important;place-items:center!important;width:28px!important;height:28px!important;padding:0!important;border:0!important;border-radius:6px!important;background:transparent!important;color:#818b93!important;font-size:16px!important;cursor:pointer!important}.h3b7 .h3b7-x:hover{background:rgba(211,87,96,.11)!important;color:#e99ba2!important}

    .h3b7 .h3b7-fields{display:flex!important;flex-direction:column!important;gap:0!important;padding:4px 0 12px!important;border-top:1px solid color-mix(in srgb,var(--border-color,#343a40) 50%,transparent)!important}
    .h3b7 .h3b7-field{display:grid!important;grid-template-columns:120px minmax(0,1fr)!important;align-items:center!important;gap:14px!important;width:100%!important;min-height:46px!important;padding:6px 0!important;border-bottom:1px solid color-mix(in srgb,var(--border-color,#343a40) 45%,transparent)!important;background:transparent!important}
    .h3b7 .h3b7-label{display:flex!important;align-items:center!important;gap:0!important;margin:0!important;color:#7f8992!important;font-size:7.7px!important;font-weight:650!important;text-transform:none!important;letter-spacing:0!important}.h3b7 .h3b20-field-icon,.h3b7 .h3b17-field-icon,.h3b7 .h3b17-toggle-icon,.h3b7 .h3b21-field-icon{display:none!important}
    .h3b7 .h3b7-input,.h3b7 .h3b7-select{appearance:none!important;-webkit-appearance:none!important;display:block!important;width:100%!important;height:34px!important;padding:0 11px!important;border:1px solid color-mix(in srgb,var(--border-color,#3d444b) 88%,white 4%)!important;border-radius:7px!important;background-color:var(--comfy-input-bg,#181c20)!important;color:var(--input-text,#e7eaed)!important;font-size:8.7px!important;outline:none!important;text-overflow:ellipsis!important}
    .h3b7 select.h3b7-select{padding-right:38px!important;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5 6 6.5 11 1.5' fill='none' stroke='%239aa4ad' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")!important;background-repeat:no-repeat!important;background-position:right 13px center!important;background-size:12px 8px!important}
    .h3b7 .h3b7-input:hover,.h3b7 .h3b7-select:hover{border-color:#515c65!important}.h3b7 .h3b7-input:focus,.h3b7 .h3b7-select:focus{border-color:#66737e!important;box-shadow:0 0 0 2px rgba(126,143,158,.10)!important}
    .h3b7 input[type='number']{-moz-appearance:textfield!important;appearance:textfield!important}.h3b7 input[type='number']::-webkit-inner-spin-button,.h3b7 input[type='number']::-webkit-outer-spin-button{-webkit-appearance:none!important;margin:0!important}

    /* One MP control, owned here. Every historical slider is permanently hidden. */
    .h3b7 .h3b14-mp,.h3b7 .h3b21-mp,.h3b7 .h3b21-mp-help,.h3b7 .h3b22-mp,.h3b7 .h3b24-mp,.h3b7 .h3b21-mp-original,.h3b7 .h3b24-mp-original{display:none!important;visibility:hidden!important;width:0!important;height:0!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important}
    .h3final-target-field>.h3b7-input[type='number']{display:none!important}
    .h3final-mp{display:grid!important;grid-template-columns:minmax(0,1fr) 70px!important;gap:12px!important;align-items:center!important;width:100%!important;min-height:38px!important;padding:6px 10px!important;border:1px solid color-mix(in srgb,var(--border-color,#3d444b) 88%,white 4%)!important;border-radius:7px!important;background:var(--comfy-input-bg,#181c20)!important}
    .h3final-mp-main{min-width:0!important}.h3final-mp-track{position:relative!important;height:18px!important;--h3final-mp:0%}.h3final-mp-track:before{content:'';position:absolute;left:0;right:0;top:50%;height:4px;border-radius:99px;background:#2d3439;transform:translateY(-50%)}.h3final-mp-track:after{content:'';position:absolute;left:0;top:50%;width:var(--h3final-mp);height:4px;border-radius:99px;background:linear-gradient(90deg,#69ad9f 0%,#77b18b 24%,#b0aa66 48%,#ce8b55 70%,#d65e61 100%);transform:translateY(-50%)}
    .h3final-mp-range{position:absolute!important;inset:0!important;z-index:3!important;width:100%!important;height:100%!important;margin:0!important;opacity:0!important;cursor:pointer!important}.h3final-mp-thumb{position:absolute;z-index:2;left:var(--h3final-mp);top:50%;width:13px;height:13px;border:2px solid #20262b;border-radius:50%;background:#b7c0c7;box-shadow:0 1px 3px rgba(0,0,0,.4);transform:translate(-50%,-50%);pointer-events:none}.h3final-mp-scale{display:flex;justify-content:space-between;margin-top:1px;color:#66717a;font-size:6.5px;font-variant-numeric:tabular-nums}.h3final-mp-value{text-align:right;color:#e7eaed;font-size:8.5px;font-weight:750;font-variant-numeric:tabular-nums;white-space:nowrap}

    /* Custom LoRAs: one clean section, no native datalist/add-button mashup. */
    .h3b7 .h3b7-loras{width:100%!important;margin:5px 0 0!important;padding:5px 0 0 134px!important;border-top:1px solid color-mix(in srgb,var(--border-color,#343a40) 48%,transparent)!important}
    .h3b7 .h3b7-loras>summary{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;min-height:36px!important;padding:4px 1px!important;list-style:none!important;color:#aab2b9!important;font-size:8px!important;font-weight:700!important;cursor:pointer!important}.h3b7 .h3b7-loras>summary::-webkit-details-marker{display:none!important}.h3b7 .h3b7-loras>summary:before{display:none!important;content:none!important}.h3final-lora-summary-right{display:inline-flex;align-items:center;gap:8px;color:#78838b;font-size:7px;font-weight:600}.h3final-lora-summary-right svg{width:13px;height:13px;transition:transform .14s ease}.h3b7-loras[open] .h3final-lora-summary-right svg{transform:rotate(180deg)}
    .h3b7 .h3b7-lora-body{display:flex!important;flex-direction:column!important;gap:0!important;margin:2px 0 0!important;border-top:1px solid color-mix(in srgb,var(--border-color,#343a40) 44%,transparent)!important}
    .h3b7 .h3b7-lora{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(170px,.8fr) 30px!important;gap:12px!important;align-items:center!important;min-height:46px!important;padding:7px 1px!important;border:0!important;border-bottom:1px solid color-mix(in srgb,var(--border-color,#343a40) 42%,transparent)!important;border-radius:0!important;background:transparent!important}.h3b7 .h3b7-lora-name{overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;color:#d8dde0!important;font:8px/1.25 ui-monospace,SFMono-Regular,Consolas,monospace!important}
    .h3b7 .h3b7-strength{display:none!important}
    .h3final-strength{display:grid!important;grid-template-columns:minmax(90px,1fr) 52px!important;gap:9px!important;align-items:center!important}.h3final-strength-track{position:relative;height:20px;--h3final-strength:62.5%}.h3final-strength-track:before{content:'';position:absolute;left:0;right:0;top:50%;height:4px;border-radius:99px;background:#2d3439;transform:translateY(-50%)}.h3final-strength-track:after{content:'';position:absolute;left:0;top:50%;width:var(--h3final-strength);height:4px;border-radius:99px;background:#8996a1;transform:translateY(-50%)}.h3final-strength-range{position:absolute;inset:0;z-index:3;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}.h3final-strength-thumb{position:absolute;left:var(--h3final-strength);top:50%;width:12px;height:12px;border:2px solid #20262b;border-radius:50%;background:#b3bdc5;transform:translate(-50%,-50%);pointer-events:none}.h3final-strength-value{width:52px;height:30px;padding:0 5px;border:1px solid color-mix(in srgb,var(--border-color,#3d444b) 88%,white 4%);border-radius:6px;background:var(--comfy-input-bg,#181c20);color:#e5e8ea;text-align:center;outline:none;font:700 8px/1 ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}.h3final-strength-value:focus{border-color:#66737e;box-shadow:0 0 0 2px rgba(126,143,158,.10)}
    .h3b7 .h3b7-lora>.h3b7-x{width:30px!important;height:30px!important}
    .h3b7 .h3b7-add{display:block!important;padding:9px 0 2px!important}.h3b7 .h3b7-add>.h3b7-input,.h3b7 .h3b7-add>.h3b7-btn,.h3b7 .h3b7-add>datalist{display:none!important}
    .h3final-lora-addbtn{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;width:100%!important;height:34px!important;padding:0 12px!important;border:1px dashed color-mix(in srgb,var(--border-color,#465058) 82%,white 6%)!important;border-radius:7px!important;background:transparent!important;color:#a7b0b7!important;font-size:8.3px!important;font-weight:700!important;cursor:pointer!important}.h3final-lora-addbtn:hover{border-style:solid!important;border-color:#58646e!important;background:color-mix(in srgb,var(--comfy-input-bg,#181c20) 64%,transparent)!important;color:#edf0f2!important}.h3final-lora-addbtn svg{width:14px;height:14px}
    .h3final-lora-picker{display:none;margin-top:7px;padding:7px;border:1px solid color-mix(in srgb,var(--border-color,#3d444b) 88%,white 4%);border-radius:8px;background:var(--comfy-input-bg,#181c20)}.h3final-lora-picker.open{display:block}.h3final-lora-search{width:100%;height:32px;padding:0 10px;border:1px solid #424b53;border-radius:6px;background:#11161a;color:#edf0f2;outline:none;font-size:8.4px}.h3final-lora-search:focus{border-color:#66737e}.h3final-lora-list{max-height:170px;overflow:auto;margin-top:6px}.h3final-lora-option{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:32px;padding:5px 7px;border:0;border-radius:5px;background:transparent;color:#d6dbdf;text-align:left;cursor:pointer;font-size:8px}.h3final-lora-option:hover{background:#252c31;color:#fff}.h3final-lora-option span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.h3final-lora-empty{padding:11px 7px;color:#78838b;text-align:center;font-size:7.8px}

    @container (max-width:700px){.h3b7 .h3b7-field{grid-template-columns:92px minmax(0,1fr)!important;gap:10px!important}.h3b7 .h3b7-loras{padding-left:102px!important}.h3b7 .h3b7-scenario>summary{grid-template-columns:28px minmax(120px,1fr) 28px 28px!important}}
    @container (max-width:520px){.h3b7 .h3b7-field{grid-template-columns:1fr!important;gap:5px!important;padding:8px 0!important}.h3b7 .h3b7-loras{padding-left:0!important}.h3b7 .h3b7-lora{grid-template-columns:minmax(0,1fr) 30px!important}.h3final-strength{grid-column:1/-1!important}.h3b7 .h3b7-toolbar{align-items:flex-start!important;flex-direction:column!important}}
  `;
  document.head.append(style);
}

function svg(kind) {
  const ns = "http://www.w3.org/2000/svg";
  const root = document.createElementNS(ns, "svg");
  root.setAttribute("viewBox", "0 0 24 24");
  root.setAttribute("aria-hidden", "true");
  const paths = {
    plus: ["M12 5v14", "M5 12h14"],
    copy: ["M9 9h10v10H9z", "M5 15H4V5h10v1"],
    import: ["M12 4v11", "m8 11 4 4 4-4", "M5 20h14"],
    trash: ["M5 7h14", "M9 7V4h6v3", "M8 10v9", "M12 10v9", "M16 10v9"],
    chevron: ["m6 9 6 6 6-6"],
  };
  for (const d of paths[kind] || paths.chevron) {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "1.7");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    root.append(p);
  }
  return root;
}

function widget(node, name) {
  return (node?.widgets || []).find((item) => item?.name === name) || null;
}

function captureState(root) {
  return {
    rootTop: Number(root.scrollTop || 0),
    bodyTop: Number(root.querySelector(".h3b7-body")?.scrollTop || 0),
    open: [...root.querySelectorAll(".h3b7-scenario")].map((item, i) => item.open ? i : -1).filter((i) => i >= 0),
    loras: [...root.querySelectorAll(".h3b7-scenario")].map((item) => Boolean(item.querySelector(".h3b7-loras[open]"))),
  };
}

function remember(root) {
  if (root?.isConnected) PENDING.set(root, captureState(root));
}

function restore(root) {
  const state = PENDING.get(root);
  if (!state || !root?.isConnected) return;
  const apply = () => {
    if (!root.isConnected) return;
    [...root.querySelectorAll(".h3b7-scenario")].forEach((item, i) => {
      item.open = state.open.includes(i);
      const loras = item.querySelector(".h3b7-loras");
      if (loras) loras.open = Boolean(state.loras[i]);
    });
    root.scrollTop = state.rootTop;
    const body = root.querySelector(".h3b7-body");
    if (body) body.scrollTop = state.bodyTop;
  };
  requestAnimationFrame(apply);
  setTimeout(apply, 40);
  setTimeout(() => { apply(); PENDING.delete(root); }, 100);
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function fieldLabel(field) {
  return String(field?.querySelector(":scope > .h3b7-label")?.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function syncMp(control, value) {
  const n = clamp(value, 0.2, 8.5, 1);
  const progress = ((n - 0.2) / 8.3) * 100;
  control.querySelector(".h3final-mp-track")?.style.setProperty("--h3final-mp", `${progress}%`);
  const range = control.querySelector(".h3final-mp-range");
  if (range && document.activeElement !== range) range.value = String(n);
  const out = control.querySelector(".h3final-mp-value");
  if (out) out.textContent = `${n.toFixed(2)} MP`;
  return n;
}

function ensureMp(root, field) {
  const label = fieldLabel(field);
  if (!(label === "mp" || label.includes("resolution") || label.includes("target size"))) return;
  if (field.querySelector("[data-h3-director-mp='1'], .h3s-megapixel-control")) return;
  const original = field.querySelector("input[type='number']");
  if (!original) return;
  field.classList.add("h3final-target-field");
  const caption = field.querySelector(":scope > .h3b7-label");
  if (caption && caption.textContent !== "Target size") caption.textContent = "Target size";

  let control = field.querySelector(":scope > .h3final-mp");
  if (!control) {
    control = document.createElement("div");
    control.className = "h3final-mp";
    const main = document.createElement("div");
    main.className = "h3final-mp-main";
    const track = document.createElement("div");
    track.className = "h3final-mp-track";
    const thumb = document.createElement("span");
    thumb.className = "h3final-mp-thumb";
    const range = document.createElement("input");
    range.type = "range";
    range.className = "h3final-mp-range";
    range.min = "0.2"; range.max = "8.5"; range.step = "0.05";
    range.setAttribute("aria-label", "Target size in megapixels");
    const scale = document.createElement("div");
    scale.className = "h3final-mp-scale";
    for (const text of ["0.2", "2 MP", "4 MP", "8.5"]) { const item = document.createElement("span"); item.textContent = text; scale.append(item); }
    const value = document.createElement("div");
    value.className = "h3final-mp-value";
    track.append(thumb, range);
    main.append(track, scale);
    control.append(main, value);
    range.addEventListener("input", () => syncMp(control, range.value), { passive: true });
    range.addEventListener("change", () => {
      remember(root);
      original.value = String(syncMp(control, range.value));
      original.dispatchEvent(new Event("change", { bubbles: true }));
    });
    field.append(control);
  }
  syncMp(control, original.value);
}

function strengthProgress(value) {
  return `${((clamp(value, -4, 4, 1) + 4) / 8) * 100}%`;
}

function ensureStrength(root, row) {
  const original = row.querySelector(":scope > .h3b7-strength");
  if (!original || row.querySelector(":scope > .h3final-strength")) return;
  const control = document.createElement("div");
  control.className = "h3final-strength";
  const track = document.createElement("div");
  track.className = "h3final-strength-track";
  const thumb = document.createElement("span");
  thumb.className = "h3final-strength-thumb";
  const range = document.createElement("input");
  range.type = "range"; range.className = "h3final-strength-range"; range.min = "-4"; range.max = "4"; range.step = "0.05";
  const value = document.createElement("input");
  value.type = "text"; value.inputMode = "decimal"; value.className = "h3final-strength-value";
  const sync = (next) => {
    const n = clamp(next, -4, 4, 1);
    range.value = String(n); value.value = n.toFixed(2); track.style.setProperty("--h3final-strength", strengthProgress(n));
    return n;
  };
  const commit = (next) => {
    remember(root);
    original.value = String(sync(next));
    original.dispatchEvent(new Event("change", { bubbles: true }));
  };
  range.addEventListener("input", () => sync(range.value), { passive: true });
  range.addEventListener("change", () => commit(range.value));
  value.addEventListener("change", () => commit(value.value));
  value.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); value.blur(); } });
  track.append(thumb, range); control.append(track, value);
  const remove = row.querySelector(":scope > .h3b7-x");
  row.insertBefore(control, remove || null);
  sync(original.value);
}

function managedLora(name) {
  const value = String(name || "").replaceAll("\\", "/").split("/").pop().toLowerCase();
  return value.includes("h3_pdd") || value.includes("pdd_") || value.includes("lightx") || value.includes("lightx2v") || /turbo[_-](4|8)step/.test(value);
}

function shortName(name) {
  const value = String(name || "").replaceAll("\\", "/");
  return value.split("/").pop() || value;
}

function ensureLoraAdd(root, loraRoot) {
  const add = loraRoot.querySelector(".h3b7-add");
  if (!add || add.querySelector(":scope > .h3final-lora-addbtn")) return;
  const legacyInput = add.querySelector(":scope > input.h3b7-input");
  const legacyButton = add.querySelector(":scope > button.h3b7-btn");
  const datalist = add.querySelector(":scope > datalist");
  if (!legacyInput || !legacyButton || !datalist) return;

  const button = document.createElement("button");
  button.type = "button"; button.className = "h3final-lora-addbtn";
  button.append(svg("plus"), document.createTextNode("Add custom LoRA"));
  const picker = document.createElement("div"); picker.className = "h3final-lora-picker";
  const search = document.createElement("input"); search.type = "search"; search.className = "h3final-lora-search"; search.placeholder = "Search installed custom/style LoRAs…"; search.autocomplete = "off";
  const list = document.createElement("div"); list.className = "h3final-lora-list";
  picker.append(search, list);

  const render = () => {
    const used = new Set([...loraRoot.querySelectorAll(".h3b7-lora-name")].map((item) => String(item.textContent || "").trim()));
    const query = search.value.trim().toLowerCase();
    const names = [...datalist.querySelectorAll("option")].map((option) => String(option.value || "").trim()).filter((name) => name && !used.has(name) && !managedLora(name) && (!query || name.toLowerCase().includes(query))).sort((a, b) => a.localeCompare(b));
    list.replaceChildren();
    if (!names.length) {
      const empty = document.createElement("div"); empty.className = "h3final-lora-empty"; empty.textContent = query ? "No matching custom LoRAs" : "No unused custom LoRAs available"; list.append(empty); return;
    }
    for (const name of names) {
      const option = document.createElement("button"); option.type = "button"; option.className = "h3final-lora-option"; option.title = name;
      const label = document.createElement("span"); label.textContent = shortName(name); option.append(label);
      option.addEventListener("click", (event) => {
        event.preventDefault(); event.stopPropagation(); remember(root); legacyInput.value = name; legacyButton.click();
      });
      list.append(option);
    }
  };
  button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); picker.classList.toggle("open"); if (picker.classList.contains("open")) { render(); requestAnimationFrame(() => search.focus()); } });
  search.addEventListener("input", render, { passive: true });
  add.append(button, picker);
}

function ensureLoras(root, section) {
  const summary = section.querySelector(":scope > summary");
  if (summary && summary.dataset.h3Final !== "1") {
    summary.dataset.h3Final = "1";
    const count = section.querySelectorAll(".h3b7-lora").length;
    summary.replaceChildren();
    const title = document.createElement("span"); title.textContent = "Custom LoRAs";
    const right = document.createElement("span"); right.className = "h3final-lora-summary-right";
    const countText = document.createElement("span"); countText.textContent = count ? `${count} active` : "Optional";
    right.append(countText, svg("chevron")); summary.append(title, right);
  }
  section.querySelectorAll(".h3b7-lora").forEach((row) => ensureStrength(root, row));
  ensureLoraAdd(root, section);
}

function decorateActions(root) {
  const actions = [...root.querySelectorAll(".h3b7-actions .h3b7-btn")];
  const meta = [["plus", "Add scenario"], ["copy", "Copy preset"], ["import", "Import"], ["trash", "Clear"]];
  actions.slice(0, 4).forEach((button, index) => {
    if (button.dataset.h3FinalAction === "1") return;
    button.dataset.h3FinalAction = "1";
    const [kind, text] = meta[index];
    button.replaceChildren();
    const icon = document.createElement("span"); icon.className = "h3final-action-icon"; icon.append(svg(kind));
    const label = document.createElement("span"); label.textContent = text;
    button.append(icon, label);
  });
}

function decorateScenario(details, index) {
  const root = details.closest(".h3b7");
  const badge = details.querySelector(":scope > summary .h3b7-index");
  if (badge) badge.textContent = String(index + 1).padStart(2, "0");
  const summary = details.querySelector(":scope > summary");
  if (summary && !summary.querySelector(":scope > .h3final-caret")) {
    const caret = document.createElement("span"); caret.className = "h3final-caret"; caret.append(svg("chevron"));
    const remove = summary.querySelector(":scope > .h3b7-x"); summary.insertBefore(caret, remove || null);
  }
  details.querySelectorAll(":scope > .h3b7-fields > .h3b7-field").forEach((field) => ensureMp(root, field));
  const loras = details.querySelector(":scope > .h3b7-fields .h3b7-loras");
  if (loras) ensureLoras(root, loras);
}

function polishRoot(root) {
  if (!root?.isConnected) return;
  root.classList.add("h3final-benchmark");
  const title = root.querySelector(".h3b7-title");
  if (title && title.textContent !== "Benchmark") title.textContent = "Benchmark";
  const sub = root.querySelector(".h3b7-sub");
  const subtitle = "Controlled comparisons across model, sampling, runtime and LoRAs.";
  if (sub && sub.textContent !== subtitle) sub.textContent = subtitle;
  decorateActions(root);
  [...root.querySelectorAll(".h3b7-scenario")].forEach(decorateScenario);
  restore(root);
}

function boundClassicWidget(node) {
  const dom = widget(node, WIDGET_NAME);
  if (!dom) return;
  dom.options ||= {};
  dom.computedHeight = undefined;
  dom.options.getMinHeight = () => 330;
  dom.options.getMaxHeight = () => 560;
  const root = node.__h3bRoot;
  if (root?.isConnected) {
    root.style.setProperty("height", "100%", "important");
    root.style.setProperty("max-height", "100%", "important");
    root.style.setProperty("min-height", "0", "important");
    root.style.setProperty("overflow-y", "auto", "important");
    root.style.setProperty("overflow-x", "hidden", "important");
    const parent = root.parentElement;
    if (parent) { parent.style.setProperty("max-height", "100%", "important"); parent.style.setProperty("min-height", "0", "important"); parent.style.setProperty("overflow", "hidden", "important"); }
  }
}

function applyNode(node) {
  if (!node || node.comfyClass !== BENCHMARK) return;
  if (node.title !== "Benchmark") node.title = "Benchmark";
  boundClassicWidget(node);
  const root = node.__h3bRoot;
  if (root?.isConnected) polishRoot(root);
}

function sweep() {
  sweepQueued = false;
  installStyles();
  for (const node of app.graph?._nodes || []) if (node?.comfyClass === BENCHMARK) applyNode(node);
  document.querySelectorAll(".h3b7").forEach(polishRoot);
}

function scheduleSweep() {
  if (sweepQueued) return;
  sweepQueued = true;
  requestAnimationFrame(sweep);
}

function observeDocument() {
  if (documentObserver || !document.body) return;
  documentObserver = new MutationObserver(scheduleSweep);
  documentObserver.observe(document.body, { childList: true, subtree: true });
}

app.registerExtension({
  name: "H3Studio.BenchmarkFinalV28",
  setup() {
    installStyles();
    observeDocument();
    for (const delay of [0, 120, 350, 800]) setTimeout(scheduleSweep, delay);
  },
  nodeCreated(node) {
    if (node?.comfyClass === BENCHMARK) for (const delay of [40, 160, 420]) setTimeout(() => applyNode(node), delay);
  },
  afterConfigureGraph() {
    installStyles(); observeDocument();
    for (const delay of [0, 160, 500]) setTimeout(scheduleSweep, delay);
  },
});

}
