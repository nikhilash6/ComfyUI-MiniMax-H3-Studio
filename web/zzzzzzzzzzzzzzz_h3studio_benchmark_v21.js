import { app } from "../../scripts/app.js";

const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-benchmark-v21-style";

function svg(kind) {
  const ns = "http://www.w3.org/2000/svg";
  const root = document.createElementNS(ns, "svg");
  root.setAttribute("viewBox", "0 0 24 24");
  root.setAttribute("aria-hidden", "true");
  const paths = {
    compare: ["M7 7h11", "m15 4 3 3-3 3", "M17 17H6", "m9 14-3 3 3 3"],
    bolt: ["m13 2-9 12h7l-1 8 9-12h-7l1-8Z"],
    gauge: ["M5 19a8 8 0 1 1 14 0", "M12 13l4-3"],
    memory: ["M7 3h10v18H7z", "M9 7h6", "M9 11h6", "M9 15h6"],
    plus: ["M12 5v14", "M5 12h14"],
    copy: ["M9 9h11v11H9z", "M4 4h11v11"],
    import: ["M12 3v12", "m8 11 4 4 4-4", "M5 21h14"],
    trash: ["M5 7h14", "M9 7V4h6v3", "M8 11v7", "M12 11v7", "M16 11v7"],
    target: ["M4 9V4h5", "M15 4h5v5", "M20 15v5h-5", "M9 20H4v-5"],
    seed: ["M12 21V10", "M12 14c-4 0-7-2.5-7-6 4 0 7 2 7 6Z", "M12 11c3.6 0 6-2.2 6-5-3.6 0-6 2.2-6 5Z"],
    shield: ["M12 3 5 6v5c0 4.5 2.7 8 7 10 4.3-2 7-5.5 7-10V6l-7-3Z"],
    eye: ["M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"],
    chevron: ["m9 6 6 6-6 6"],
    model: ["M12 3 5 6v6l7 4 7-4V6l-7-3Z", "m5 6 7 4 7-4", "M12 10v8"],
    sampling: ["M5 18 9 9", "M15 5l4 4", "M13 7l4 4", "M4 20l5-1 10-10-4-4L5 15l-1 5Z"],
    runtime: ["M12 3v3", "M12 18v3", "M3 12h3", "M18 12h3", "M12 12l4-2"],
    lora: ["m12 3 8 4-8 4-8-4 8-4Z", "m4 12 8 4 8-4"],
    info: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 10v6", "M12 7h.01"],
  };
  for (const d of paths[kind] || paths.info) {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "1.65");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    root.append(p);
  }
  return root;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3b7.h3b21{
      --b21-bg:var(--comfy-menu-bg,#17191c);
      --b21-panel:var(--comfy-input-bg,#22252a);
      --b21-panel2:color-mix(in srgb,var(--b21-panel) 86%,white 4%);
      --b21-line:color-mix(in srgb,var(--border-color,#3a3f45) 82%,transparent);
      --b21-text:var(--input-text,#edf0f2);
      --b21-muted:var(--descrip-text,#858e97);
      --b21-soft:#a7b0b8;
      --b21-accent:#8094a8;
      border:1px solid var(--b21-line)!important;border-radius:9px!important;background:var(--b21-bg)!important;
      box-shadow:0 10px 28px rgba(0,0,0,.16)!important;color:var(--b21-text)!important;
    }
    .h3b21 .h3b7-top{position:sticky!important;top:0!important;z-index:20!important;padding:12px 14px 10px!important;border-bottom:1px solid var(--b21-line)!important;background:color-mix(in srgb,var(--b21-bg) 96%,white 2%)!important;backdrop-filter:blur(10px)}
    .h3b21 .h3b7-title-row{gap:9px!important}.h3b21 .h3b7-icon{display:grid!important;place-items:center!important;width:28px!important;height:28px!important;border:1px solid var(--b21-line)!important;border-radius:7px!important;background:var(--b21-panel)!important;color:#a9b7c4!important;font-size:0!important}.h3b21 .h3b7-icon svg{width:16px;height:16px}
    .h3b21 .h3b7-title{font-size:12px!important;font-weight:760!important;letter-spacing:-.015em!important}.h3b21 .h3b7-sub{margin-top:1px!important;font-size:7.7px!important;color:var(--b21-muted)!important}
    .h3b21 .h3b7-assets{height:25px!important;padding:0 8px!important;border:1px solid var(--b21-line)!important;border-radius:6px!important;background:transparent!important;color:#8f99a2!important;font-size:7px!important}

    .h3b21 .h3b7-body{padding:0 14px 18px!important;overflow-y:auto!important;overflow-x:hidden!important;scrollbar-gutter:stable!important;overscroll-behavior:contain!important}
    .h3b21 .h3b7-toolbar{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:12px!important;align-items:end!important;margin:0!important;padding:12px 0 10px!important;border-bottom:1px solid var(--b21-line)!important}
    .h3b21 .h3b7-toolbar:before{content:'QUICK COMPARES';grid-column:1/-1;color:#69737c;font-size:6.4px;font-weight:780;letter-spacing:.09em;margin-bottom:-5px}
    .h3b21 .h3b15-quick{display:flex!important;align-items:center!important;gap:5px!important;flex-wrap:wrap!important}
    .h3b21 .h3b15-quick button{display:inline-flex!important;align-items:center!important;gap:6px!important;height:31px!important;padding:0 10px!important;border:1px solid var(--b21-line)!important;border-radius:6px!important;background:transparent!important;color:#aeb7bf!important;font-size:7.7px!important;font-weight:680!important}.h3b21 .h3b15-quick button:hover{background:var(--b21-panel)!important;color:#f0f2f4!important}.h3b21 .h3b15-quick button.primary{background:#2b343d!important;border-color:#44515d!important;color:#e7edf2!important}
    .h3b21 .h3b7-actions{display:flex!important;gap:4px!important;flex-wrap:nowrap!important}.h3b21 .h3b7-btn{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;height:30px!important;min-height:30px!important;padding:0 8px!important;border:1px solid var(--b21-line)!important;border-radius:6px!important;background:transparent!important;color:#929ca5!important;font-size:7.4px!important;font-weight:650!important}.h3b21 .h3b7-btn:hover{background:var(--b21-panel)!important;color:#e7eaed!important}.h3b21 .h3b7-btn.primary{background:#313b45!important;border-color:#485765!important;color:#eef2f5!important}.h3b21 .h3b21-button-icon{display:grid;place-items:center;width:13px;height:13px}.h3b21 .h3b21-button-icon svg{width:12px;height:12px}
    .h3b21 .h3b7-summary{display:flex!important;align-items:center!important;min-height:30px!important;margin:0!important;padding:7px 1px!important;border:0!important;border-bottom:1px solid var(--b21-line)!important;border-radius:0!important;background:transparent!important;color:#76818a!important;font-size:7.1px!important}.h3b21 .h3b7-summary strong{margin-left:auto!important;color:#929ca4!important;font-size:6.9px!important;font-weight:680!important}

    .h3b21 .h3b15-plan{margin:0!important;padding:12px 0 11px!important;border:0!important;border-bottom:1px solid var(--b21-line)!important;background:transparent!important}.h3b21 .h3b15-head{display:flex!important;align-items:flex-start!important;padding:0!important;margin:0 0 10px!important}.h3b21 .h3b15-head strong{font-size:10px!important;font-weight:740!important;color:#e4e8eb!important}.h3b21 .h3b15-head small{margin-top:2px!important;font-size:7px!important;color:#77818a!important}.h3b21 .h3b15-count{height:22px!important;padding:3px 7px!important;border:1px solid var(--b21-line)!important;border-radius:999px!important;background:transparent!important;color:#9ba5ad!important;font-size:6.8px!important;font-variant-numeric:tabular-nums!important}.h3b21 .h3b15-count.warn{border-color:#5f4446!important;color:#d29da2!important;background:#261d1f!important}
    .h3b21 .h3b20-resolutions{grid-template-columns:minmax(0,1fr) auto!important;gap:5px 10px!important;padding:0 0 10px!important;border-bottom:1px solid var(--b21-line)!important}.h3b21 .h3b20-res-title{font-size:7.9px!important;color:#bec6cc!important}.h3b21 .h3b20-res-title svg{width:13px!important;height:13px!important}.h3b21 .h3b20-res-copy{font-size:6.7px!important;color:#737d86!important}.h3b21 .h3b20-res-state{font-size:6.3px!important}.h3b21 .h3b20-res-controls{gap:4px!important;margin-top:3px!important}.h3b21 .h3b20-res-chip{height:23px!important;background:transparent!important;border-color:var(--b21-line)!important}.h3b21 .h3b20-add{height:24px!important;background:var(--b21-panel)!important;border-color:var(--b21-line)!important}
    .h3b21 .h3b15-seeds{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:3px!important;margin:10px 0 0!important;padding:3px!important;border:1px solid var(--b21-line)!important;border-radius:7px!important;background:color-mix(in srgb,var(--b21-panel) 58%,transparent)!important}.h3b21 .h3b15-seeds button{min-height:39px!important;padding:5px 8px!important;border:0!important;border-radius:5px!important}.h3b21 .h3b15-seeds button.active{background:#303943!important}.h3b21 .h3b17-seed-title{font-size:7.5px!important}.h3b21 .h3b17-seed-sub{font-size:6.2px!important;color:#76808a!important}
    .h3b21 .h3b15-grid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:8px!important;margin-top:11px!important}.h3b21 .h3b17-field-head{min-height:15px!important;font-size:6.8px!important;color:#828c95!important}.h3b21 .h3b17-help{width:13px!important;height:13px!important;border-color:var(--b21-line)!important;font-size:7px!important}.h3b21 .h3b17-select{height:30px!important;border:1px solid var(--b21-line)!important;border-radius:6px!important;background:var(--b21-panel)!important;color:#dfe4e7!important;font-size:8px!important}.h3b21 .h3b17-field-note{min-height:19px!important;font-size:6.3px!important;line-height:9px!important;color:#69737c!important}
    .h3b21 .h3b15-checks{display:flex!important;align-items:center!important;gap:6px 14px!important;flex-wrap:wrap!important;margin-top:10px!important;padding:9px 1px 0!important;border-top:1px solid var(--b21-line)!important}.h3b21 .h3b15-check{min-height:20px!important;color:#8f99a2!important;font-size:6.8px!important}.h3b21 .h3b15-check:hover{color:#d1d6da!important}

    .h3b21 .h3b7-list{display:flex!important;flex-direction:column!important;gap:0!important;margin-top:0!important;border-top:0!important}.h3b21 .h3b7-list:before{content:'SCENARIOS';display:block;padding:12px 0 7px;color:#69737c;font-size:6.4px;font-weight:780;letter-spacing:.09em;border-bottom:1px solid var(--b21-line)}
    .h3b21 .h3b7-scenario{position:relative!important;border:0!important;border-bottom:1px solid var(--b21-line)!important;border-radius:0!important;background:transparent!important;overflow:visible!important}.h3b21 .h3b7-scenario:before{content:'';position:absolute;left:-14px;top:8px;bottom:8px;width:2px;border-radius:9px;background:transparent}.h3b21 .h3b7-scenario[open]:before{background:#71879a}
    .h3b21 .h3b7-scenario>summary{display:grid!important;grid-template-columns:28px minmax(150px,1fr) auto auto auto 18px 24px!important;gap:7px!important;align-items:center!important;min-height:52px!important;padding:7px 2px!important;border-radius:0!important;background:transparent!important;cursor:pointer!important}.h3b21 .h3b7-scenario>summary:hover{background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--b21-panel) 45%,transparent),transparent)!important}
    .h3b21 .h3b7-index{display:grid!important;place-items:center!important;width:24px!important;height:24px!important;border:1px solid var(--b21-line)!important;border-radius:6px!important;background:var(--b21-panel)!important;color:#aab4bc!important;font-size:7px!important;font-weight:760!important;font-variant-numeric:tabular-nums!important}.h3b21 .h3b7-name{height:30px!important;padding:4px 6px!important;border:1px solid transparent!important;border-radius:5px!important;background:transparent!important;color:#edf0f2!important;font-size:9.4px!important;font-weight:710!important}.h3b21 .h3b7-name:hover,.h3b21 .h3b7-name:focus{border-color:var(--b21-line)!important;background:var(--b21-panel)!important}.h3b21 .h3b7-tag{max-width:145px!important;padding:3px 6px!important;border:1px solid var(--b21-line)!important;border-radius:999px!important;background:transparent!important;color:#818b94!important;font-size:6.5px!important}.h3b21 .h3b20-caret{color:#727d86!important}.h3b21 .h3b7-scenario[open] .h3b20-caret{color:#a7b2bb!important}
    .h3b21 .h3b7-fields{display:grid!important;grid-template-columns:minmax(190px,1.45fr) minmax(140px,1fr) minmax(130px,1fr) minmax(150px,.9fr)!important;gap:9px!important;padding:10px 28px 13px!important;border-top:1px solid color-mix(in srgb,var(--b21-line) 72%,transparent)!important;background:linear-gradient(180deg,color-mix(in srgb,var(--b21-panel) 36%,transparent),transparent)!important}.h3b21 .h3b7-field{gap:5px!important}.h3b21 .h3b7-label{display:flex!important;align-items:center!important;gap:5px!important;color:#7f8992!important;font-size:6.6px!important;font-weight:690!important;text-transform:none!important;letter-spacing:0!important}.h3b21 .h3b7-input,.h3b21 .h3b7-select{height:31px!important;border:1px solid var(--b21-line)!important;border-radius:6px!important;background:var(--b21-panel)!important;color:#e2e6e9!important;font-size:8px!important}.h3b21 .h3b7-input:focus,.h3b21 .h3b7-select:focus{border-color:#556675!important;box-shadow:0 0 0 2px rgba(113,135,154,.12)!important}
    .h3b21 .h3b21-mp-original{display:none!important}.h3b21 .h3b21-mp{display:grid;grid-template-columns:minmax(0,1fr) 50px;gap:7px;align-items:center;height:31px;padding:0 7px;border:1px solid var(--b21-line);border-radius:6px;background:var(--b21-panel)}.h3b21 .h3b21-mp-range{position:relative;height:16px}.h3b21 .h3b21-mp-range:before{content:'';position:absolute;left:0;right:0;top:50%;height:4px;border-radius:99px;background:#30363c;transform:translateY(-50%)}.h3b21 .h3b21-mp-range:after{content:'';position:absolute;left:0;top:50%;width:var(--mp-p,10%);height:4px;border-radius:99px;background:linear-gradient(90deg,#6aa99a,#8baa78,#b69f5f,#c77d56,#c75d61);transform:translateY(-50%)}.h3b21 .h3b21-mp-range input{position:absolute;inset:0;z-index:2;width:100%;margin:0;opacity:0;cursor:pointer}.h3b21 .h3b21-mp-thumb{position:absolute;z-index:1;left:var(--mp-p,10%);top:50%;width:11px;height:11px;border:2px solid #20252a;border-radius:50%;background:#aeb8c0;transform:translate(-50%,-50%);pointer-events:none}.h3b21 .h3b21-mp-value{text-align:right;color:#d9dee2;font-size:7.6px;font-weight:720;font-variant-numeric:tabular-nums;white-space:nowrap}.h3b21 .h3b21-mp-help{grid-column:1/-1;margin-top:-1px;color:#69737c;font-size:6.1px;line-height:1.25}
    .h3b21 .h3b7-loras{grid-column:1/-1!important;padding-top:2px!important}.h3b21 .h3b7-loras>summary{display:inline-flex!important;align-items:center!important;gap:5px!important;color:#818c95!important;font-size:6.9px!important}.h3b21 .h3b7-lora{border:1px solid var(--b21-line)!important;border-radius:6px!important;background:var(--b21-panel)!important}
    .h3b21 .h3b21-field-icon{display:grid;place-items:center;width:13px;height:13px;color:#78858f}.h3b21 .h3b21-field-icon svg{width:12px;height:12px}
    .h3b21 .h3b7-empty{margin:10px 0!important;padding:18px!important;border:1px dashed var(--b21-line)!important;border-radius:7px!important;background:transparent!important;color:#7b858e!important}

    @container (max-width:760px){.h3b21 .h3b7-toolbar{grid-template-columns:1fr!important}.h3b21 .h3b7-actions{justify-self:start!important}.h3b21 .h3b15-grid{grid-template-columns:1fr 1fr!important}.h3b21 .h3b7-fields{grid-template-columns:1fr 1fr!important;padding-left:12px!important;padding-right:12px!important}.h3b21 .h3b7-scenario>summary{grid-template-columns:26px minmax(130px,1fr) auto 18px 24px!important}.h3b21 .h3b7-scenario>summary .h3b7-tag:nth-of-type(n+2){display:none!important}}
  `;
  document.head.append(style);
}

function setIconButton(button, kind, label = null) {
  if (!button || button.dataset.h3B21Icon === kind) return;
  button.dataset.h3B21Icon = kind;
  const text = label ?? String(button.textContent || "").trim();
  button.replaceChildren();
  const mark = document.createElement("span"); mark.className = "h3b21-button-icon"; mark.append(svg(kind));
  button.append(mark);
  if (text) button.append(document.createTextNode(text));
}

function captureUi(node) {
  const root = node?.__h3bRoot;
  const body = root?.querySelector?.(".h3b7-body");
  if (!root || !body) return null;
  return {
    scrollTop: body.scrollTop,
    open: [...root.querySelectorAll(".h3b7-scenario")].map((item, index) => item.open ? index : -1).filter((index) => index >= 0),
    loras: [...root.querySelectorAll(".h3b7-scenario")].map((item) => Boolean(item.querySelector(":scope > .h3b7-fields .h3b7-loras[open]"))),
  };
}

function restoreUi(node) {
  const state = node?.__h3b21Restore;
  const root = node?.__h3bRoot;
  const body = root?.querySelector?.(".h3b7-body");
  if (!state || !body) return;
  const rows = [...root.querySelectorAll(".h3b7-scenario")];
  rows.forEach((row, index) => { row.open = state.open.includes(index); const lora = row.querySelector(":scope > .h3b7-fields .h3b7-loras"); if (lora && state.loras?.[index]) lora.open = true; });
  body.scrollTop = state.scrollTop;
  requestAnimationFrame(() => {
    const nextBody = node?.__h3bRoot?.querySelector?.(".h3b7-body");
    if (nextBody) nextBody.scrollTop = state.scrollTop;
    requestAnimationFrame(() => {
      const finalBody = node?.__h3bRoot?.querySelector?.(".h3b7-body");
      if (finalBody) finalBody.scrollTop = state.scrollTop;
      node.__h3b21Restore = null;
    });
  });
}

function bindStatePreservation(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected || root.dataset.h3B21Preserve === "1") return;
  root.dataset.h3B21Preserve = "1";
  const save = (event) => {
    if (!event.target?.closest?.(".h3b7-scenario")) return;
    node.__h3b21Restore = captureUi(node);
  };
  root.addEventListener("change", save, true);
  root.addEventListener("click", (event) => {
    if (!event.target?.closest?.(".h3b7-scenario .h3b7-x")) return;
    node.__h3b21Restore = captureUi(node);
  }, true);
}

function decorateMp(details) {
  const fields = details.querySelector(":scope > .h3b7-fields");
  if (!fields) return;
  const mpField = [...fields.querySelectorAll(":scope > .h3b7-field")].find((field) => String(field.querySelector(".h3b7-label")?.textContent || "").trim().toLowerCase() === "mp");
  const original = mpField?.querySelector("input[type='number']");
  if (!mpField || !original || mpField.querySelector(".h3b21-mp")) return;
  original.classList.add("h3b21-mp-original");
  const label = mpField.querySelector(".h3b7-label");
  if (label) label.lastChild && (label.lastChild.nodeValue = " Resolution");

  const control = document.createElement("div"); control.className = "h3b21-mp";
  const rangeWrap = document.createElement("div"); rangeWrap.className = "h3b21-mp-range";
  const thumb = document.createElement("span"); thumb.className = "h3b21-mp-thumb";
  const range = document.createElement("input"); range.type = "range"; range.min = ".2"; range.max = "8.5"; range.step = ".05"; range.value = original.value || "1"; range.setAttribute("aria-label", "Scenario megapixels");
  rangeWrap.append(thumb, range);
  const value = document.createElement("span"); value.className = "h3b21-mp-value";
  const sync = () => { const n = Math.max(.2, Math.min(8.5, Number(range.value) || 1)); const p = ((n - .2) / 8.3) * 100; rangeWrap.style.setProperty("--mp-p", `${p}%`); value.textContent = `${n.toFixed(2)} MP`; const tag = details.querySelector(":scope > summary .h3b7-tag:nth-last-of-type(1)"); if (tag) tag.textContent = `${n.toFixed(2)} MP`; };
  range.addEventListener("input", sync, { passive:true });
  range.addEventListener("change", () => { original.value = range.value; original.dispatchEvent(new Event("change", { bubbles:true })); });
  control.append(rangeWrap, value);
  mpField.append(control);
  const help = document.createElement("div"); help.className = "h3b21-mp-help"; help.textContent = "Per-scenario target · ignored only when Resolution sweep is ON."; mpField.append(help);
  sync();
}

const FIELD_KIND = { transformer:"model", sampling:"sampling", runtime:"runtime", resolution:"target", mp:"target" };
function decorateFieldIcons(details) {
  for (const field of details.querySelectorAll(".h3b7-field")) {
    const label = field.querySelector(":scope > .h3b7-label");
    if (!label || label.querySelector(".h3b21-field-icon")) continue;
    const key = String(label.textContent || "").trim().toLowerCase();
    const kind = FIELD_KIND[key];
    if (!kind) continue;
    const mark = document.createElement("span"); mark.className = "h3b21-field-icon"; mark.append(svg(kind)); label.prepend(mark);
  }
}

function decorateScenario(details, index) {
  const badge = details.querySelector(":scope > summary .h3b7-index");
  if (badge) badge.textContent = String(index + 1).padStart(2, "0");
  decorateMp(details);
  decorateFieldIcons(details);
  const loras = details.querySelector(".h3b7-loras > summary");
  if (loras && !loras.querySelector(".h3b21-field-icon")) { const mark=document.createElement("span"); mark.className="h3b21-field-icon"; mark.append(svg("lora")); loras.prepend(mark); }
}

function decorateToolbar(root) {
  const quick = root.querySelectorAll(".h3b15-quick button");
  setIconButton(quick[0], "bolt", "Base 20 ↔ LightX 8");
  setIconButton(quick[1], "gauge", "Runtime");
  setIconButton(quick[2], "memory", "Memory");
  const actions = root.querySelectorAll(".h3b7-actions .h3b7-btn");
  setIconButton(actions[0], "plus", "Scenario");
  setIconButton(actions[1], "copy", "Copy");
  setIconButton(actions[2], "import", "Import");
  setIconButton(actions[3], "trash", "Clear");
}

function decorateHeader(root) {
  root.classList.add("h3b21");
  const iconHost = root.querySelector(".h3b7-icon");
  if (iconHost && iconHost.dataset.h3B21 !== "1") { iconHost.dataset.h3B21="1"; iconHost.replaceChildren(svg("compare")); }
  const title = root.querySelector(".h3b7-title"); if (title) title.textContent = "Smart Benchmark";
  const sub = root.querySelector(".h3b7-sub"); if (sub) sub.textContent = "Controlled scenario comparisons · same prompt, measurable changes.";
  const planTitle = root.querySelector(".h3b15-head strong"); if (planTitle) planTitle.textContent = "Comparison setup";
  const planSub = root.querySelector(".h3b15-head small"); if (planSub) planSub.textContent = "Choose what changes, keep everything else controlled.";
}

function decorate(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) return;
  decorateHeader(root);
  decorateToolbar(root);
  [...root.querySelectorAll(".h3b7-scenario")].forEach(decorateScenario);
  bindStatePreservation(node);
  if (node.__h3b21Restore) restoreUi(node);
}

function observe(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) { setTimeout(() => observe(node), 80); return; }
  decorate(node);
  if (root.__h3B21Observer) return;
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; decorate(node); });
  });
  observer.observe(root, { childList:true, subtree:true });
  root.__h3B21Observer = observer;
}

function sweep() {
  for (const node of app.graph?._nodes || []) if (node?.comfyClass === BENCHMARK) observe(node);
}

app.registerExtension({
  name:"H3Studio.BenchmarkV21",
  setup(){ installStyles(); setTimeout(sweep,360); },
  nodeCreated(node){ if(node?.comfyClass===BENCHMARK) setTimeout(()=>observe(node),360); },
  afterConfigureGraph(){ installStyles(); setTimeout(sweep,420); },
});
