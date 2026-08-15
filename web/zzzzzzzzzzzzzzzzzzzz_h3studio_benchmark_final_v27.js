import { app } from "../../scripts/app.js";

const STYLE_ID = "h3studio-benchmark-final-v29-style";
const LEGACY_STYLE_ID = "h3studio-benchmark-final-v27-style";
const ROOT_SELECTOR = ".h3b7";

function installStyles() {
  document.getElementById(LEGACY_STYLE_ID)?.remove();
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Final Benchmark ownership: native ComfyUI surface, one MP control. */
    .h3b7,
    .h3b7.h3b21,
    .h3b7.h3b23,
    .h3b7.h3b21.h3b23{
      background:transparent!important;
      background-image:none!important;
      box-shadow:none!important;
    }
    .h3b7 .h3b7-top,
    .h3b7 .h3b7-body,
    .h3b7 .h3b15-plan,
    .h3b7 .h3b7-summary,
    .h3b7 .h3b7-list,
    .h3b7 .h3b7-scenario,
    .h3b7 .h3b7-scenario[open],
    .h3b7 .h3b7-scenario>summary,
    .h3b7 .h3b7-fields{
      background:transparent!important;
      background-image:none!important;
      box-shadow:none!important;
    }

    /* v14 is the only scenario target-size UI. v21/v22/v23 are retired. */
    .h3b7 .h3b21-mp,
    .h3b7 .h3b21-mp-help,
    .h3b7 .h3b22-mp,
    .h3b7 .h3b24-mp{
      display:none!important;
      visibility:hidden!important;
      width:0!important;
      height:0!important;
      min-width:0!important;
      min-height:0!important;
      margin:0!important;
      padding:0!important;
      border:0!important;
      overflow:hidden!important;
    }
    .h3b7 .h3b14-mp{
      display:grid!important;
      width:100%!important;
      max-width:100%!important;
      grid-template-columns:minmax(0,1fr) auto!important;
      gap:8px 12px!important;
      padding:8px 10px!important;
      border:1px solid color-mix(in srgb,var(--border-color,#3d444b) 88%,white 4%)!important;
      border-radius:7px!important;
      background:var(--comfy-input-bg,#181c20)!important;
      box-shadow:none!important;
    }
    .h3b7 .h3b14-mp-field>.h3b7-input{display:none!important}
    .h3b7 .h3b14-mp-readout strong{font-size:9px!important}
    .h3b7 .h3b14-mp-readout span{font-size:6.8px!important}

    /* No native micro spinner arrows anywhere in Benchmark. */
    .h3b7 input[type="number"]{-moz-appearance:textfield!important;appearance:textfield!important}
    .h3b7 input[type="number"]::-webkit-inner-spin-button,
    .h3b7 input[type="number"]::-webkit-outer-spin-button{-webkit-appearance:none!important;margin:0!important}

    /* Director-like scenario property rows. */
    .h3b7 .h3b7-fields{
      display:block!important;
      padding:3px 0 10px!important;
      border-top:0!important;
    }
    .h3b7 .h3b7-field{
      display:grid!important;
      grid-template-columns:118px minmax(0,1fr)!important;
      align-items:center!important;
      gap:14px!important;
      min-height:48px!important;
      padding:6px 0!important;
      border-bottom:1px solid color-mix(in srgb,var(--border-color,#3b4248) 64%,transparent)!important;
      background:transparent!important;
    }
    .h3b7 .h3b7-label{
      margin:0!important;
      color:var(--descrip-text,#7f8992)!important;
      font-size:7px!important;
      font-weight:650!important;
      text-transform:none!important;
      letter-spacing:0!important;
    }
    .h3b7 .h3b7-input,
    .h3b7 .h3b7-select,
    .h3b7 .h3b17-select{
      width:100%!important;
      height:34px!important;
      padding:4px 34px 4px 10px!important;
      border:1px solid color-mix(in srgb,var(--border-color,#3d444b) 90%,white 3%)!important;
      border-radius:7px!important;
      background-color:var(--comfy-input-bg,#181c20)!important;
      color:var(--input-text,#e7eaed)!important;
      font-size:8px!important;
      outline:none!important;
    }
    .h3b7 select.h3b7-select,
    .h3b7 select.h3b17-select{
      appearance:none!important;
      -webkit-appearance:none!important;
      background-image:
        linear-gradient(45deg,transparent 50%,#8c979f 50%),
        linear-gradient(135deg,#8c979f 50%,transparent 50%)!important;
      background-position:calc(100% - 15px) 14px,calc(100% - 10px) 14px!important;
      background-size:5px 5px,5px 5px!important;
      background-repeat:no-repeat!important;
      cursor:pointer!important;
    }
    .h3b7 .h3b7-input:hover,
    .h3b7 .h3b7-select:hover,
    .h3b7 .h3b17-select:hover{border-color:#505a63!important}
    .h3b7 .h3b7-input:focus,
    .h3b7 .h3b7-select:focus,
    .h3b7 .h3b17-select:focus{border-color:#687783!important;box-shadow:0 0 0 2px rgba(127,145,160,.10)!important}

    /* Scenario header actions are real buttons, not tiny glyphs. */
    .h3b7 .h3b7-scenario>summary{
      min-height:50px!important;
      padding:7px 0!important;
      gap:9px!important;
      border-radius:0!important;
    }
    .h3b7 .h3b20-caret,
    .h3b7 .h3b7-caret{
      display:grid!important;
      place-items:center!important;
      width:30px!important;
      height:30px!important;
      border-radius:7px!important;
      color:#929da5!important;
      transition:background .12s ease,color .12s ease,transform .12s ease!important;
    }
    .h3b7 .h3b20-caret:hover,
    .h3b7 .h3b7-caret:hover{background:color-mix(in srgb,var(--comfy-input-bg,#181c20) 75%,white 5%)!important;color:#e0e4e7!important}
    .h3b7 .h3b20-caret svg{width:15px!important;height:15px!important}
    .h3b7 .h3b7-x{
      display:grid!important;
      place-items:center!important;
      width:30px!important;
      height:30px!important;
      padding:0!important;
      border:0!important;
      border-radius:7px!important;
      background:transparent!important;
      color:#8f989f!important;
      font-size:16px!important;
      line-height:1!important;
    }
    .h3b7 .h3b7-x:hover{background:rgba(211,87,96,.11)!important;color:#e99da4!important}

    /* Custom LoRAs: flat section, large target, proper picker and strength control. */
    .h3b7 .h3b7-loras{
      display:block!important;
      width:100%!important;
      margin:7px 0 0!important;
      padding:8px 0 0!important;
      border-top:1px solid color-mix(in srgb,var(--border-color,#3b4248) 72%,transparent)!important;
    }
    .h3b7 .h3b7-loras>summary{
      display:flex!important;
      align-items:center!important;
      justify-content:space-between!important;
      gap:12px!important;
      width:100%!important;
      min-height:38px!important;
      padding:5px 9px!important;
      border:1px solid color-mix(in srgb,var(--border-color,#3d444b) 86%,transparent)!important;
      border-radius:7px!important;
      background:color-mix(in srgb,var(--comfy-input-bg,#181c20) 72%,transparent)!important;
      color:#c8ced3!important;
      font-size:8px!important;
      font-weight:700!important;
      cursor:pointer!important;
      list-style:none!important;
    }
    .h3b7 .h3b7-loras>summary::-webkit-details-marker{display:none!important}
    .h3b7 .h3b7-loras>summary::before{display:none!important;content:none!important}
    .h3b7 .h3b7-loras>summary::after{
      content:""!important;
      flex:none!important;
      width:8px!important;
      height:8px!important;
      margin-right:2px!important;
      border-right:1.5px solid #8e99a1!important;
      border-bottom:1.5px solid #8e99a1!important;
      transform:rotate(-45deg)!important;
      transition:transform .12s ease!important;
    }
    .h3b7 .h3b7-loras[open]>summary::after{transform:rotate(45deg)!important}
    .h3b7 .h3b7-lora-body{display:flex!important;flex-direction:column!important;gap:0!important;margin-top:7px!important}
    .h3b7 .h3b7-lora{
      display:grid!important;
      grid-template-columns:minmax(0,1fr) minmax(190px,.8fr) 30px!important;
      gap:12px!important;
      align-items:center!important;
      min-height:48px!important;
      padding:7px 2px!important;
      border:0!important;
      border-bottom:1px solid color-mix(in srgb,var(--border-color,#3b4248) 60%,transparent)!important;
      border-radius:0!important;
      background:transparent!important;
    }
    .h3b7 .h3b7-lora-name{
      overflow:hidden!important;
      text-overflow:ellipsis!important;
      white-space:nowrap!important;
      color:#dce0e3!important;
      font:7.8px/1.25 ui-monospace,SFMono-Regular,Consolas,monospace!important;
    }
    .h3b29-native-hidden{display:none!important}
    .h3b29-strength{
      display:grid!important;
      grid-template-columns:minmax(95px,1fr) 54px!important;
      gap:9px!important;
      align-items:center!important;
      min-width:0!important;
    }
    .h3b29-strength-track{position:relative!important;height:22px!important;min-width:0!important;--h3b29-p:62.5%}
    .h3b29-strength-track::before{
      content:""!important;position:absolute!important;left:0!important;right:0!important;top:50%!important;height:4px!important;
      border-radius:99px!important;background:#2d3338!important;transform:translateY(-50%)!important;
    }
    .h3b29-strength-track::after{
      content:""!important;position:absolute!important;left:0!important;top:50%!important;width:var(--h3b29-p)!important;height:4px!important;
      border-radius:99px!important;background:#87949f!important;transform:translateY(-50%)!important;
    }
    .h3b29-strength-track input[type="range"]{position:absolute!important;inset:0!important;z-index:2!important;width:100%!important;height:100%!important;margin:0!important;opacity:0!important;cursor:pointer!important}
    .h3b29-strength-thumb{
      position:absolute!important;z-index:1!important;left:var(--h3b29-p)!important;top:50%!important;width:13px!important;height:13px!important;
      border:2px solid #22282d!important;border-radius:50%!important;background:#a8b2ba!important;box-shadow:0 1px 3px rgba(0,0,0,.35)!important;
      transform:translate(-50%,-50%)!important;pointer-events:none!important;
    }
    .h3b29-strength-value{
      width:54px!important;height:31px!important;padding:3px 5px!important;border:1px solid var(--border-color,#3d444b)!important;border-radius:6px!important;
      background:var(--comfy-input-bg,#181c20)!important;color:var(--input-text,#e7eaed)!important;text-align:center!important;
      outline:none!important;font:650 8px/1 ui-monospace,SFMono-Regular,Consolas,monospace!important;font-variant-numeric:tabular-nums!important;
    }
    .h3b29-add-shell{
      display:grid!important;
      grid-template-columns:minmax(0,1fr) 112px!important;
      gap:8px!important;
      align-items:center!important;
      padding:9px 1px 2px!important;
    }
    .h3b29-picker-wrap{position:relative!important;min-width:0!important}
    .h3b29-picker{
      appearance:none!important;-webkit-appearance:none!important;width:100%!important;height:34px!important;padding:4px 34px 4px 10px!important;
      border:1px solid var(--border-color,#3d444b)!important;border-radius:7px!important;background:var(--comfy-input-bg,#181c20)!important;
      color:var(--input-text,#e7eaed)!important;outline:none!important;cursor:pointer!important;font:8px/1.2 Inter,ui-sans-serif,system-ui!important;
    }
    .h3b29-picker-wrap::after{
      content:""!important;pointer-events:none!important;position:absolute!important;right:13px!important;top:11px!important;width:8px!important;height:8px!important;
      border-right:1.5px solid #8d98a1!important;border-bottom:1.5px solid #8d98a1!important;transform:rotate(45deg)!important;
    }
    .h3b29-add-button{
      display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;width:112px!important;height:34px!important;
      padding:0 11px!important;border:1px solid color-mix(in srgb,var(--border-color,#434a50) 82%,white 10%)!important;border-radius:7px!important;
      background:color-mix(in srgb,var(--comfy-input-bg,#181c20) 80%,white 7%)!important;color:#e0e4e7!important;font-size:8px!important;font-weight:720!important;cursor:pointer!important;
    }
    .h3b29-add-button::before{content:"+"!important;font-size:13px!important;font-weight:500!important;line-height:1!important}
    .h3b29-add-button:hover:not(:disabled){background:color-mix(in srgb,var(--comfy-input-bg,#181c20) 70%,white 11%)!important;border-color:#5a6670!important;color:#fff!important}
    .h3b29-add-button:disabled{opacity:.36!important;cursor:default!important}

    @container (max-width:700px){
      .h3b7 .h3b7-field{grid-template-columns:92px minmax(0,1fr)!important;gap:10px!important}
      .h3b7 .h3b7-lora{grid-template-columns:minmax(0,1fr) 30px!important}
      .h3b29-strength{grid-column:1/-1!important;grid-row:2!important}
      .h3b29-add-shell{grid-template-columns:1fr!important}
      .h3b29-add-button{width:100%!important}
    }
  `;
  document.head.append(style);
}

function hideLegacyMp(root) {
  root.querySelectorAll(".h3b21-mp,.h3b21-mp-help,.h3b22-mp,.h3b24-mp").forEach((element) => {
    element.hidden = true;
    element.setAttribute("aria-hidden", "true");
    element.style.setProperty("display", "none", "important");
  });

  for (const field of root.querySelectorAll(".h3b14-mp-field")) {
    const primary = field.querySelector(":scope > .h3b14-mp");
    if (!primary) continue;
    for (const range of field.querySelectorAll("input[type='range']")) {
      if (primary.contains(range)) continue;
      let wrapper = range;
      while (wrapper.parentElement && wrapper.parentElement !== field) wrapper = wrapper.parentElement;
      if (wrapper !== primary) {
        wrapper.hidden = true;
        wrapper.setAttribute("aria-hidden", "true");
        wrapper.style.setProperty("display", "none", "important");
      }
    }
    primary.hidden = false;
    primary.removeAttribute("aria-hidden");
    primary.style.setProperty("display", "grid", "important");
  }
}

function clampStrength(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(-4, Math.min(4, number)) : 1;
}

function strengthPercent(value) {
  return `${((clampStrength(value) + 4) / 8) * 100}%`;
}

function polishStrength(row) {
  if (row.querySelector(":scope > .h3b29-strength")) return;
  const original = row.querySelector(":scope > .h3b7-strength");
  if (!original) return;
  original.classList.add("h3b29-native-hidden");

  const shell = document.createElement("div");
  shell.className = "h3b29-strength";
  const track = document.createElement("div");
  track.className = "h3b29-strength-track";
  const thumb = document.createElement("span");
  thumb.className = "h3b29-strength-thumb";
  const range = document.createElement("input");
  range.type = "range";
  range.min = "-4";
  range.max = "4";
  range.step = "0.05";
  range.value = String(clampStrength(original.value));
  range.setAttribute("aria-label", "LoRA strength");
  const value = document.createElement("input");
  value.type = "text";
  value.inputMode = "decimal";
  value.className = "h3b29-strength-value";
  value.setAttribute("aria-label", "LoRA strength value");

  const sync = (raw) => {
    const next = clampStrength(raw);
    range.value = String(next);
    value.value = next.toFixed(2);
    track.style.setProperty("--h3b29-p", strengthPercent(next));
    return next;
  };
  const commit = (raw) => {
    const next = sync(raw);
    original.value = String(next);
    original.dispatchEvent(new Event("change", { bubbles: true }));
  };
  range.addEventListener("input", () => sync(range.value), { passive: true });
  range.addEventListener("change", () => commit(range.value));
  value.addEventListener("change", () => commit(value.value));
  value.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      value.blur();
    }
  });

  track.append(thumb, range);
  shell.append(track, value);
  const remove = row.querySelector(":scope > .h3b7-x");
  row.insertBefore(shell, remove || null);
  sync(original.value);
}

function managedAcceleration(name) {
  const file = String(name || "").replaceAll("\\", "/").split("/").pop().toLowerCase();
  return file.includes("lightx") || file.includes("lightx2v") || file.includes("pdd_") || file.includes("h3_pdd") || /turbo[_-](4|8)step/.test(file);
}

function polishAddRow(add, section) {
  if (add.querySelector(":scope > .h3b29-add-shell")) return;
  const search = add.querySelector(":scope > input.h3b7-input");
  const datalist = add.querySelector(":scope > datalist");
  const originalButton = add.querySelector(":scope > button.h3b7-btn");
  if (!search || !datalist || !originalButton) return;

  search.classList.add("h3b29-native-hidden");
  datalist.classList.add("h3b29-native-hidden");
  originalButton.classList.add("h3b29-native-hidden");

  const used = new Set([...section.querySelectorAll(".h3b7-lora-name")].map((item) => String(item.textContent || "").trim()));
  const names = [...datalist.querySelectorAll("option")]
    .map((option) => String(option.value || "").trim())
    .filter((name) => name && !used.has(name) && !managedAcceleration(name))
    .sort((a, b) => a.localeCompare(b));

  const shell = document.createElement("div");
  shell.className = "h3b29-add-shell";
  const wrap = document.createElement("div");
  wrap.className = "h3b29-picker-wrap";
  const select = document.createElement("select");
  select.className = "h3b29-picker";
  select.setAttribute("aria-label", "Choose installed LoRA");
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = names.length ? "Choose installed LoRA…" : "No unused custom LoRAs available";
  placeholder.selected = true;
  select.append(placeholder);
  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name.split(/[\\/]/).pop() || name;
    option.title = name;
    select.append(option);
  }
  wrap.append(select);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "h3b29-add-button";
  button.textContent = "Add LoRA";
  button.disabled = true;
  select.addEventListener("change", () => {
    search.value = select.value;
    button.disabled = !select.value;
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!select.value) return;
    search.value = select.value;
    originalButton.click();
  });
  shell.append(wrap, button);
  add.append(shell);
}

function polishLoraSection(section) {
  const summary = section.querySelector(":scope > summary");
  const rows = [...section.querySelectorAll(":scope > .h3b7-lora-body > .h3b7-lora")];
  if (summary) {
    const next = `Custom LoRAs${rows.length ? ` · ${rows.length}` : ""}`;
    if (summary.textContent !== next) summary.textContent = next;
  }
  rows.forEach(polishStrength);
  const add = section.querySelector(":scope > .h3b7-lora-body > .h3b7-add");
  if (add) polishAddRow(add, section);
}

function polishRoot(root) {
  if (!(root instanceof HTMLElement)) return;
  root.classList.add("h3b29-final", "h3b23");
  hideLegacyMp(root);
  root.querySelectorAll(".h3b7-loras").forEach(polishLoraSection);
}

function sweep() {
  document.querySelectorAll(ROOT_SELECTOR).forEach(polishRoot);
}

let sweepQueued = false;
function queueSweep() {
  if (sweepQueued) return;
  sweepQueued = true;
  requestAnimationFrame(() => {
    sweepQueued = false;
    installStyles();
    sweep();
  });
}

function installDocumentObserver() {
  if (window.__h3studioBenchmarkFinalV29Observer) return;
  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.addedNodes.length || mutation.removedNodes.length)) queueSweep();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.__h3studioBenchmarkFinalV29Observer = observer;
}

function scheduleSweeps() {
  for (const delay of [0, 60, 160, 360, 800, 1500]) setTimeout(queueSweep, delay);
}

app.registerExtension({
  name: "H3Studio.BenchmarkFinalV29",
  setup() {
    installStyles();
    installDocumentObserver();
    scheduleSweeps();
  },
  nodeCreated(node) {
    if (node?.comfyClass === "H3StudioSmartBenchmark") scheduleSweeps();
  },
  afterConfigureGraph() {
    installStyles();
    scheduleSweeps();
  },
});
