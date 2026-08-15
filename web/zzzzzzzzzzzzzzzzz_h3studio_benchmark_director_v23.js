import { app } from "../../scripts/app.js";

const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-benchmark-director-v23-style";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Benchmark v23: intentionally boring in the same good way as Director.
       One visual language, no dashboard chrome, no decorative icon soup. */
    .h3b7.h3b23{
      --v23-bg:#101214;
      --v23-panel:#15191d;
      --v23-panel-hover:#181d21;
      --v23-border:#2d3338;
      --v23-line:#22282d;
      --v23-text:#e9edef;
      --v23-muted:#7f8992;
      --v23-dim:#67717a;
      background:var(--v23-bg)!important;
      border:1px solid var(--v23-border)!important;
      border-radius:9px!important;
      box-shadow:none!important;
      color:var(--v23-text)!important;
    }

    /* Header */
    .h3b23 .h3b7-top{
      position:sticky!important;top:0!important;z-index:20!important;
      min-height:46px!important;padding:9px 12px!important;
      background:#111416!important;border-bottom:1px solid var(--v23-line)!important;
      backdrop-filter:none!important;
    }
    .h3b23 .h3b7-title-row{gap:0!important}
    .h3b23 .h3b7-icon{display:none!important}
    .h3b23 .h3b7-title{font-size:11px!important;font-weight:730!important;letter-spacing:0!important}
    .h3b23 .h3b7-sub{margin-top:2px!important;font-size:7.2px!important;color:#717b84!important}
    .h3b23 .h3b7-assets{
      width:auto!important;min-width:0!important;height:23px!important;min-height:23px!important;
      padding:0 7px!important;border:1px solid var(--v23-border)!important;border-radius:6px!important;
      background:transparent!important;color:#79838c!important;font-size:6.7px!important;font-weight:600!important;
      box-shadow:none!important;
    }

    .h3b23 .h3b7-body{padding:0 12px 14px!important;background:transparent!important}

    /* Quick compare + actions: same scale as Director buttons. */
    .h3b23 .h3b7-toolbar{
      display:flex!important;align-items:center!important;justify-content:space-between!important;
      gap:8px!important;margin:0!important;padding:8px 0!important;border-bottom:1px solid var(--v23-line)!important;
    }
    .h3b23 .h3b7-toolbar:before{display:none!important}
    .h3b23 .h3b15-quick,.h3b23 .h3b7-actions{display:flex!important;align-items:center!important;gap:4px!important;flex-wrap:wrap!important}
    .h3b23 .h3b15-quick button,.h3b23 .h3b7-btn{
      width:auto!important;height:25px!important;min-height:25px!important;
      padding:0 8px!important;border:1px solid var(--v23-border)!important;border-radius:6px!important;
      background:var(--v23-panel)!important;color:#929ca5!important;
      font-size:7px!important;font-weight:640!important;line-height:1!important;box-shadow:none!important;
    }
    .h3b23 .h3b15-quick button:hover,.h3b23 .h3b7-btn:hover{background:var(--v23-panel-hover)!important;color:#dfe4e7!important;border-color:#414950!important}
    .h3b23 .h3b15-quick button.primary,.h3b23 .h3b7-btn.primary{background:#20262b!important;border-color:#3d4851!important;color:#dce2e6!important}
    .h3b23 .h3b21-button-icon,.h3b23 .h3b17-button-icon,.h3b23 .h3b15-button-icon{display:none!important}

    /* No large floating pills. */
    .h3b23 .h3b7-summary{
      display:flex!important;align-items:center!important;min-height:25px!important;
      margin:0!important;padding:5px 0!important;border:0!important;border-bottom:1px solid var(--v23-line)!important;
      border-radius:0!important;background:transparent!important;color:#68727a!important;font-size:6.5px!important;
    }
    .h3b23 .h3b7-summary strong{margin-left:auto!important;color:#78828a!important;font-size:6.5px!important;font-weight:650!important}
    .h3b23 .h3b15-count,.h3b23 .h3b20-res-state{
      width:auto!important;min-width:0!important;height:20px!important;min-height:20px!important;
      padding:2px 6px!important;border:1px solid var(--v23-border)!important;border-radius:999px!important;
      background:transparent!important;color:#7c868e!important;font-size:6.2px!important;font-weight:650!important;
    }

    /* Shared run setup */
    .h3b23 .h3b15-plan{margin:0!important;padding:9px 0!important;border:0!important;border-bottom:1px solid var(--v23-line)!important;background:transparent!important}
    .h3b23 .h3b15-head{margin:0 0 7px!important;padding:0!important}
    .h3b23 .h3b15-head strong{font-size:8.8px!important;font-weight:690!important;color:#cfd5d9!important}
    .h3b23 .h3b15-head small{margin-top:2px!important;font-size:6.5px!important;color:#68727a!important}
    .h3b23 .h3b20-resolutions{padding:6px 0!important;border-top:1px solid var(--v23-line)!important;border-bottom:0!important}
    .h3b23 .h3b20-res-title{font-size:7.1px!important;color:#969fa7!important}.h3b23 .h3b20-res-title svg{display:none!important}
    .h3b23 .h3b20-res-copy{font-size:6.2px!important;color:#646e76!important}
    .h3b23 .h3b20-res-chip,.h3b23 .h3b20-add{height:23px!important;background:var(--v23-panel)!important;border-color:var(--v23-border)!important;border-radius:5px!important;font-size:6.7px!important}
    .h3b23 .h3b15-seeds{margin:7px 0 0!important;padding:2px!important;border:1px solid var(--v23-border)!important;border-radius:6px!important;background:#121518!important}
    .h3b23 .h3b15-seeds button{min-height:31px!important;padding:4px 7px!important;border-radius:5px!important}
    .h3b23 .h3b15-seeds button.active{background:#20262b!important}
    .h3b23 .h3b17-seed-title{font-size:7px!important}.h3b23 .h3b17-seed-sub{font-size:5.9px!important;color:#68727a!important}
    .h3b23 .h3b15-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:6px!important;margin-top:7px!important}
    .h3b23 .h3b17-field-head{min-height:13px!important;font-size:6.3px!important;color:#747e87!important}
    .h3b23 .h3b17-help{display:none!important}
    .h3b23 .h3b17-select{height:27px!important;background:var(--v23-panel)!important;border:1px solid var(--v23-border)!important;border-radius:6px!important;color:#d4dade!important;font-size:7.2px!important}
    .h3b23 .h3b17-field-note{min-height:13px!important;font-size:5.8px!important;line-height:8px!important;color:#5f6971!important}
    .h3b23 .h3b15-checks{margin-top:7px!important;padding:7px 0 0!important;border-top:1px solid var(--v23-line)!important;gap:4px 12px!important}
    .h3b23 .h3b15-check{min-height:18px!important;font-size:6.2px!important;color:#77818a!important}
    .h3b23 .h3b15-check svg,.h3b23 .h3b17-toggle-icon{display:none!important}
    .h3b23 .h3b15-note,.h3b23 .h3b22-noise{display:none!important}

    /* Kill every decorator icon inserted by previous benchmark layers. */
    .h3b23 .h3b20-field-icon,
    .h3b23 .h3b21-field-icon,
    .h3b23 .h3b17-field-icon,
    .h3b23 .h3b17-toggle-icon,
    .h3b23 .h3b-v16-icon,
    .h3b23 .h3b-v17-icon{display:none!important}

    /* Scenario list: simple Director sections, not cards. */
    .h3b23 .h3b7-list{display:flex!important;flex-direction:column!important;gap:0!important;margin:0!important;border:0!important}
    .h3b23 .h3b7-list:before{
      content:'Scenarios'!important;display:block!important;padding:9px 0 6px!important;
      border-bottom:1px solid var(--v23-line)!important;color:#8c959d!important;
      font-size:7px!important;font-weight:690!important;letter-spacing:0!important;text-transform:none!important;
    }
    .h3b23 .h3b7-scenario{
      margin:0!important;border:0!important;border-bottom:1px solid var(--v23-line)!important;
      border-radius:0!important;background:transparent!important;overflow:visible!important;box-shadow:none!important;
    }
    .h3b23 .h3b7-scenario:before{display:none!important}
    .h3b23 .h3b7-scenario>summary{
      display:grid!important;grid-template-columns:26px minmax(0,1fr) 18px 20px!important;
      gap:6px!important;align-items:center!important;min-height:40px!important;padding:5px 0!important;
      border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;
    }
    .h3b23 .h3b7-scenario>summary:hover{background:transparent!important}
    .h3b23 .h3b7-index{
      display:grid!important;place-items:center!important;width:22px!important;height:22px!important;
      border:1px solid var(--v23-border)!important;border-radius:5px!important;background:#15191d!important;
      color:#8e98a0!important;font-size:6.7px!important;font-weight:700!important;
    }
    .h3b23 .h3b7-name{
      width:100%!important;height:27px!important;padding:3px 4px!important;border:1px solid transparent!important;border-radius:5px!important;
      background:transparent!important;color:#e1e5e8!important;font-size:8.8px!important;font-weight:670!important;
    }
    .h3b23 .h3b7-name:hover,.h3b23 .h3b7-name:focus{background:var(--v23-panel)!important;border-color:var(--v23-border)!important;outline:none!important}
    .h3b23 .h3b7-tag{display:none!important}
    .h3b23 .h3b20-caret,.h3b23 .h3b21-caret{display:grid!important;place-items:center!important;width:18px!important;height:18px!important;color:#68727a!important}
    .h3b23 .h3b20-caret svg,.h3b23 .h3b21-caret svg{width:11px!important;height:11px!important}
    .h3b23 .h3b7-x{width:20px!important;height:20px!important;border:0!important;background:transparent!important;color:#68727a!important;font-size:11px!important}
    .h3b23 .h3b7-x:hover{background:#251d20!important;color:#c88d94!important}

    /* Expanded scenario: Director-style inspector rows. */
    .h3b23 .h3b7-fields{
      display:flex!important;flex-direction:column!important;gap:0!important;
      padding:3px 0 8px!important;border:0!important;border-top:1px solid #1e2327!important;
      background:transparent!important;box-shadow:none!important;
    }
    .h3b23 .h3b7-field{
      display:grid!important;grid-template-columns:96px minmax(0,1fr)!important;align-items:center!important;
      gap:10px!important;min-height:38px!important;padding:4px 0!important;border:0!important;border-bottom:1px solid #1d2226!important;
      background:transparent!important;
    }
    .h3b23 .h3b7-label{
      display:block!important;margin:0!important;padding:0!important;color:#78828a!important;
      font-size:6.8px!important;font-weight:620!important;text-transform:none!important;letter-spacing:0!important;
    }
    .h3b23 .h3b7-input,.h3b23 .h3b7-select{
      width:100%!important;height:30px!important;padding:4px 8px!important;
      border:1px solid var(--v23-border)!important;border-radius:6px!important;
      background:var(--v23-panel)!important;color:#dce1e4!important;font-size:7.7px!important;box-shadow:none!important;
    }
    .h3b23 .h3b7-input:hover,.h3b23 .h3b7-select:hover{background:var(--v23-panel-hover)!important;border-color:#414950!important}
    .h3b23 .h3b7-input:focus,.h3b23 .h3b7-select:focus{outline:none!important;border-color:#4b5660!important;box-shadow:none!important}

    .h3b23 .h3b7-loras{display:block!important;margin:0!important;padding:6px 0 2px 106px!important;border:0!important;background:transparent!important}
    .h3b23 .h3b7-loras>summary{font-size:6.5px!important;color:#707a82!important}
    .h3b23 .h3b7-loras>summary:before,.h3b23 .h3b7-loras>summary svg{display:none!important}
    .h3b23 .h3b7-lora{background:var(--v23-panel)!important;border:1px solid var(--v23-border)!important;border-radius:6px!important}

    /* One MP control only. */
    .h3b23 .h3b22-mp-field>:not(.h3b7-label):not(.h3b22-mp):not(.h3b22-origin){display:none!important}
    .h3b23 .h3b22-origin{display:none!important}
    .h3b23 .h3b22-mp{
      display:grid!important;grid-template-columns:minmax(0,1fr) 56px!important;align-items:center!important;gap:8px!important;
      width:100%!important;height:30px!important;padding:0 8px!important;border:1px solid var(--v23-border)!important;border-radius:6px!important;
      background:var(--v23-panel)!important;
    }
    .h3b23 .h3b22-mp-track{position:relative!important;height:18px!important}
    .h3b23 .h3b22-mp-track:before{content:'';position:absolute;left:0;right:0;top:50%;height:4px;border-radius:99px;background:#2b3136;transform:translateY(-50%)}
    .h3b23 .h3b22-mp-track:after{content:'';position:absolute;left:0;top:50%;width:var(--h3b22-p,10%);height:4px;border-radius:99px;background:linear-gradient(90deg,#68ad9e 0%,#83ad7b 24%,#b29f62 50%,#c87d58 72%,#cb5d64 100%);transform:translateY(-50%)}
    .h3b23 .h3b22-mp-track input{position:absolute!important;inset:0!important;z-index:2!important;width:100%!important;height:100%!important;margin:0!important;opacity:0!important;cursor:pointer!important}
    .h3b23 .h3b22-mp-thumb{position:absolute!important;left:var(--h3b22-p,10%);top:50%;width:11px!important;height:11px!important;border:2px solid #1c2125!important;border-radius:50%!important;background:#aeb8bf!important;transform:translate(-50%,-50%)!important;pointer-events:none!important}
    .h3b23 .h3b22-mp-value{text-align:right!important;color:#dce1e4!important;font-size:7.4px!important;font-weight:690!important;font-variant-numeric:tabular-nums!important;white-space:nowrap!important}

    @container (max-width:700px){
      .h3b23 .h3b7-toolbar{align-items:flex-start!important;flex-direction:column!important}
      .h3b23 .h3b15-grid{grid-template-columns:1fr 1fr!important}
      .h3b23 .h3b7-field{grid-template-columns:82px minmax(0,1fr)!important}
      .h3b23 .h3b7-loras{padding-left:92px!important}
    }
  `;
  document.head.append(style);
}

function sanitize(root) {
  root.classList.add("h3b23");

  /* Previous layers inserted icon wrappers rather than owning the source UI.
     Remove those wrappers so their geometry cannot leak through at any zoom. */
  root.querySelectorAll(
    ".h3b20-field-icon,.h3b21-field-icon,.h3b17-field-icon,.h3b17-toggle-icon,.h3b21-button-icon"
  ).forEach((node) => node.remove());

  /* Keep the actual label text intact after decorators are removed. */
  for (const field of root.querySelectorAll(".h3b7-field")) {
    const label = field.querySelector(":scope > .h3b7-label");
    if (!label) continue;
    const text = String(label.textContent || "").replace(/\s+/g, " ").trim();
    if (/transformer/i.test(text)) label.textContent = "Transformer";
    else if (/sampling/i.test(text)) label.textContent = "Sampling";
    else if (/runtime/i.test(text)) label.textContent = "Runtime";
    else if (/^(mp|resolution|target size)/i.test(text)) label.textContent = "Target size";
  }

  /* The old header/action icons are decorative and looked especially bad at node zoom. */
  root.querySelectorAll(".h3b7-actions svg,.h3b15-quick svg").forEach((node) => node.remove());

  const head = root.querySelector(".h3b15-head");
  if (head) {
    const title = head.querySelector("strong");
    const sub = head.querySelector("small");
    if (title) title.textContent = "Run setup";
    if (sub) sub.textContent = "Shared settings for the comparison.";
  }
}

function observe(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) { setTimeout(() => observe(node), 100); return; }
  sanitize(root);
  if (root.__h3b23Observer) return;
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; if (root.isConnected) sanitize(root); });
  });
  observer.observe(root, { childList: true, subtree: true });
  root.__h3b23Observer = observer;
}

function sweep() {
  for (const node of app.graph?._nodes || []) if (node?.comfyClass === BENCHMARK) observe(node);
}

app.registerExtension({
  name: "H3Studio.BenchmarkDirectorV23",
  setup() { installStyles(); setTimeout(sweep, 360); },
  nodeCreated(node) { if (node?.comfyClass === BENCHMARK) setTimeout(() => observe(node), 360); },
  afterConfigureGraph() { installStyles(); setTimeout(sweep, 420); },
});
