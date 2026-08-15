import { app } from "../../scripts/app.js";

const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-benchmark-final-v27-style";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* v14 is the only visible per-scenario MP control. */
    .h3b7 .h3b14-mp{
      display:grid!important;
      width:100%!important;
      max-width:100%!important;
      grid-template-columns:minmax(0,1fr) auto!important;
      gap:7px 10px!important;
      padding:7px 8px!important;
      border:1px solid color-mix(in srgb,var(--border-color,#3d444b) 88%,white 4%)!important;
      border-radius:6px!important;
      background:var(--comfy-input-bg,#181c20)!important;
      box-shadow:none!important;
    }
    .h3b7 .h3b14-mp-field>.h3b7-input{display:none!important}

    /* Keep the native Benchmark surface even if older decorators rerun. */
    .h3b7.h3b23,
    .h3b7.h3b21.h3b23{
      background:transparent!important;
      background-image:none!important;
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

    /* Final control pass: readable Director-like controls, no tiny native arrows. */
    .h3b7 input[type="number"]{-moz-appearance:textfield!important;appearance:textfield!important}
    .h3b7 input[type="number"]::-webkit-inner-spin-button,
    .h3b7 input[type="number"]::-webkit-outer-spin-button{-webkit-appearance:none!important;margin:0!important}
    .h3b23 .h3b17-select{height:32px!important;padding-right:32px!important;font-size:8.2px!important}
    .h3b23 .h3b17-chevron{right:11px!important;width:8px!important;height:8px!important;border-width:0 1.5px 1.5px 0!important}
    .h3b23 .h3b17-help{width:16px!important;height:16px!important;font-size:8px!important}
    .h3b23 .h3b20-caret{width:24px!important;height:24px!important;color:#8d98a1!important}
    .h3b23 .h3b20-caret svg{width:14px!important;height:14px!important}
    .h3b23 .h3b7-x{width:28px!important;height:28px!important;border-radius:6px!important;font-size:15px!important;color:#8f989f!important}
    .h3b23 .h3b7-x:hover{background:rgba(211,87,96,.11)!important;color:#e89aa1!important}

    /* LoRAs are a flat property section, not a tiny nested card/editor. */
    .h3b23 .h3b7-loras{
      grid-column:1/-1!important;
      width:100%!important;
      margin:4px 0 0!important;
      padding:7px 0 0!important;
      border-top:1px solid color-mix(in srgb,var(--border-color,#3b4248) 70%,transparent)!important;
    }
    .h3b23 .h3b7-loras>summary{
      display:flex!important;
      align-items:center!important;
      justify-content:space-between!important;
      gap:8px!important;
      min-height:31px!important;
      padding:3px 2px!important;
      color:#a8b0b7!important;
      font-size:7.8px!important;
      font-weight:680!important;
      cursor:pointer!important;
      list-style:none!important;
    }
    .h3b23 .h3b7-loras>summary::before{display:none!important;content:none!important}
    .h3b23 .h3b7-loras>summary::after{
      content:""!important;
      flex:none!important;
      width:7px!important;
      height:7px!important;
      margin-right:7px!important;
      border-right:1.5px solid #85909a!important;
      border-bottom:1.5px solid #85909a!important;
      transform:rotate(-45deg)!important;
      transition:transform .12s ease!important;
    }
    .h3b23 .h3b7-loras[open]>summary::after{transform:rotate(45deg)!important}
    .h3b23 .h3b7-lora-body{gap:0!important;margin-top:3px!important;border-top:1px solid color-mix(in srgb,var(--border-color,#3b4248) 58%,transparent)!important}
    .h3b23 .h3b7-lora{
      display:grid!important;
      grid-template-columns:minmax(0,1fr) minmax(150px,.8fr) 28px!important;
      gap:10px!important;
      align-items:center!important;
      min-height:42px!important;
      padding:6px 2px!important;
      border:0!important;
      border-bottom:1px solid color-mix(in srgb,var(--border-color,#3b4248) 58%,transparent)!important;
      border-radius:0!important;
      background:transparent!important;
    }
    .h3b23 .h3b7-lora-name{
      color:#d9dde0!important;
      font:7.6px/1.25 ui-monospace,SFMono-Regular,Consolas,monospace!important;
    }
    .h3b28-strength{
      display:grid!important;
      grid-template-columns:minmax(80px,1fr) 50px!important;
      gap:8px!important;
      align-items:center!important;
      min-width:0!important;
    }
    .h3b28-strength-track{position:relative!important;height:20px!important;min-width:0!important;--h3b28-strength:62.5%}
    .h3b28-strength-track::before{
      content:""!important;position:absolute!important;left:0!important;right:0!important;top:50%!important;height:4px!important;
      border-radius:99px!important;background:#2d3338!important;transform:translateY(-50%)!important;
    }
    .h3b28-strength-track::after{
      content:""!important;position:absolute!important;left:0!important;top:50%!important;width:var(--h3b28-strength)!important;height:4px!important;
      border-radius:99px!important;background:#87949f!important;transform:translateY(-50%)!important;
    }
    .h3b28-strength-range{position:absolute!important;inset:0!important;z-index:2!important;width:100%!important;height:100%!important;margin:0!important;opacity:0!important;cursor:pointer!important}
    .h3b28-strength-thumb{
      position:absolute!important;z-index:1!important;left:var(--h3b28-strength)!important;top:50%!important;width:12px!important;height:12px!important;
      border:2px solid #22282d!important;border-radius:50%!important;background:#a5afb7!important;box-shadow:0 1px 3px rgba(0,0,0,.35)!important;
      transform:translate(-50%,-50%)!important;pointer-events:none!important;
    }
    .h3b28-strength-value{
      width:50px!important;height:29px!important;padding:3px 5px!important;border:1px solid var(--border-color,#3c4349)!important;border-radius:6px!important;
      background:var(--comfy-input-bg,#181c20)!important;color:var(--input-text,#e7eaed)!important;text-align:center!important;
      outline:none!important;font:650 8px/1 ui-monospace,SFMono-Regular,Consolas,monospace!important;font-variant-numeric:tabular-nums!important;
    }
    .h3b28-strength-value:focus{border-color:#65717b!important;box-shadow:0 0 0 2px rgba(127,145,160,.10)!important}

    .h3b23 .h3b7-add{
      display:grid!important;
      grid-template-columns:minmax(0,1fr) 96px!important;
      gap:7px!important;
      align-items:center!important;
      padding:8px 1px 2px!important;
    }
    .h3b28-lora-picker-wrap{position:relative!important;min-width:0!important}
    .h3b28-lora-picker{
      appearance:none!important;-webkit-appearance:none!important;width:100%!important;height:31px!important;padding:4px 30px 4px 9px!important;
      border:1px solid var(--border-color,#3c4349)!important;border-radius:6px!important;background:var(--comfy-input-bg,#181c20)!important;
      color:var(--input-text,#e7eaed)!important;outline:none!important;cursor:pointer!important;font:7.8px/1.2 Inter,ui-sans-serif,system-ui!important;
    }
    .h3b28-lora-picker:hover{border-color:#56616a!important}
    .h3b28-lora-picker:focus{border-color:#65717b!important;box-shadow:0 0 0 2px rgba(127,145,160,.10)!important}
    .h3b28-lora-picker-wrap::after{
      content:""!important;pointer-events:none!important;position:absolute!important;right:11px!important;top:10px!important;width:8px!important;height:8px!important;
      border-right:1.5px solid #89949d!important;border-bottom:1.5px solid #89949d!important;transform:rotate(45deg)!important;
    }
    .h3b28-add-lora{
      display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;width:96px!important;height:31px!important;
      padding:0 10px!important;border:1px solid color-mix(in srgb,var(--border-color,#434a50) 82%,white 10%)!important;border-radius:6px!important;
      background:color-mix(in srgb,var(--comfy-input-bg,#181c20) 82%,white 6%)!important;color:#dfe3e6!important;font-size:7.7px!important;font-weight:700!important;
    }
    .h3b28-add-lora::before{content:"+"!important;font-size:12px!important;font-weight:500!important;line-height:1!important}
    .h3b28-add-lora:hover:not(:disabled){background:color-mix(in srgb,var(--comfy-input-bg,#181c20) 72%,white 10%)!important;border-color:#59656f!important;color:#fff!important}
    .h3b28-add-lora:disabled{opacity:.38!important;cursor:default!important}

    @container (max-width:620px){
      .h3b23 .h3b7-lora{grid-template-columns:minmax(0,1fr) 28px!important}
      .h3b28-strength{grid-column:1/-1!important;grid-row:2!important}
      .h3b23 .h3b7-add{grid-template-columns:1fr!important}
      .h3b28-add-lora{width:100%!important}
    }
  `;
  document.head.append(style);
}

function forceHide(element) {
  if (!element) return;
  element.hidden = true;
  element.setAttribute("aria-hidden", "true");
  element.tabIndex = -1;
  element.style.setProperty("display", "none", "important");
  element.style.setProperty("visibility", "hidden", "important");
  element.style.setProperty("width", "0", "important");
  element.style.setProperty("height", "0", "important");
  element.style.setProperty("min-width", "0", "important");
  element.style.setProperty("min-height", "0", "important");
  element.style.setProperty("margin", "0", "important");
  element.style.setProperty("padding", "0", "important");
  element.style.setProperty("border", "0", "important");
  element.style.setProperty("overflow", "hidden", "important");
}

function directChildContaining(field, element) {
  let current = element;
  while (current?.parentElement && current.parentElement !== field) current = current.parentElement;
  return current?.parentElement === field ? current : element;
}

function enforceSingleMpSlider(field) {
  const primary = field.querySelector(":scope > .h3b14-mp");
  if (!primary) return;

  /* Several retired Benchmark decorators can still append their own range
     controls to this exact field. Do not depend on their versioned class names:
     keep v14 and collapse every other direct child that owns a range input. */
  for (const range of field.querySelectorAll("input[type='range']")) {
    if (primary.contains(range)) continue;
    const wrapper = directChildContaining(field, range);
    if (wrapper !== primary) forceHide(wrapper);
  }

  /* Known legacy controls are also hidden before/after their range exists. */
  field.querySelectorAll(":scope > .h3b21-mp,:scope > .h3b21-mp-help,:scope > .h3b22-mp,:scope > .h3b24-mp").forEach(forceHide);

  primary.hidden = false;
  primary.removeAttribute("aria-hidden");
  primary.style.setProperty("display", "grid", "important");
  primary.style.removeProperty("visibility");
  primary.style.removeProperty("width");
  primary.style.removeProperty("height");
  primary.style.removeProperty("min-width");
  primary.style.removeProperty("min-height");
  primary.style.removeProperty("margin");
  primary.style.removeProperty("padding");
  primary.style.removeProperty("border");
  primary.style.removeProperty("overflow");
}

function managedLora(name) {
  const value = String(name || "").replaceAll("\\", "/").split("/").pop().toLowerCase();
  return value.includes("h3_pdd") || value.includes("pdd_") || value.includes("lightx") || value.includes("lightx2v") || /turbo[_-](4|8)step/.test(value);
}

function clampStrength(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(-4, Math.min(4, number)) : 1;
}

function strengthProgress(value) {
  return `${((clampStrength(value) + 4) / 8) * 100}%`;
}

function commitStrength(original, value) {
  const next = clampStrength(value);
  original.value = String(next);
  original.dispatchEvent(new Event("change", { bubbles: true }));
}

function polishLoraRow(row) {
  if (!row || row.dataset.h3b28 === "1") return;
  const original = row.querySelector(":scope > .h3b7-strength");
  if (!original) return;
  row.dataset.h3b28 = "1";

  const control = document.createElement("div");
  control.className = "h3b28-strength";
  const track = document.createElement("div");
  track.className = "h3b28-strength-track";
  const thumb = document.createElement("span");
  thumb.className = "h3b28-strength-thumb";
  const range = document.createElement("input");
  range.type = "range";
  range.className = "h3b28-strength-range";
  range.min = "-4";
  range.max = "4";
  range.step = "0.05";
  range.value = String(clampStrength(original.value));
  range.setAttribute("aria-label", "LoRA strength");
  const value = document.createElement("input");
  value.type = "text";
  value.inputMode = "decimal";
  value.className = "h3b28-strength-value";
  value.value = Number(range.value).toFixed(2);
  value.setAttribute("aria-label", "LoRA strength value");

  const sync = (next) => {
    const number = clampStrength(next);
    range.value = String(number);
    value.value = number.toFixed(2);
    track.style.setProperty("--h3b28-strength", strengthProgress(number));
    return number;
  };
  range.addEventListener("input", () => sync(range.value), { passive: true });
  range.addEventListener("change", () => commitStrength(original, sync(range.value)));
  value.addEventListener("change", () => commitStrength(original, sync(value.value)));
  value.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      value.blur();
    }
  });

  track.append(thumb, range);
  control.append(track, value);
  forceHide(original);
  const remove = row.querySelector(":scope > .h3b7-x");
  row.insertBefore(control, remove || null);
  sync(original.value);
}

function polishLoraAdd(add, loraRoot) {
  if (!add || add.dataset.h3b28 === "1") return;
  const search = add.querySelector(":scope > input.h3b7-input");
  const datalist = add.querySelector(":scope > datalist");
  const button = add.querySelector(":scope > button.h3b7-btn");
  if (!search || !datalist || !button) return;
  add.dataset.h3b28 = "1";

  const used = new Set([...loraRoot.querySelectorAll(".h3b7-lora-name")].map((item) => String(item.textContent || "").trim()));
  const names = [...datalist.querySelectorAll("option")]
    .map((option) => String(option.value || "").trim())
    .filter((name) => name && !used.has(name) && !managedLora(name))
    .sort((a, b) => a.localeCompare(b));

  const wrap = document.createElement("div");
  wrap.className = "h3b28-lora-picker-wrap";
  const select = document.createElement("select");
  select.className = "h3b28-lora-picker";
  select.setAttribute("aria-label", "Choose installed LoRA");
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = names.length ? "Choose installed LoRA…" : "No unused LoRAs available";
  placeholder.selected = true;
  select.append(placeholder);
  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name.split(/[\\/]/).pop() || name;
    option.title = name;
    select.append(option);
  }
  select.disabled = names.length === 0;
  select.addEventListener("change", () => {
    search.value = select.value;
    button.disabled = !select.value;
  });
  wrap.append(select);

  forceHide(search);
  button.textContent = "Add LoRA";
  button.classList.add("h3b28-add-lora");
  button.disabled = true;
  add.prepend(wrap);
}

function polishLoras(root) {
  for (const loras of root.querySelectorAll(".h3b7-loras")) {
    for (const row of loras.querySelectorAll(".h3b7-lora")) polishLoraRow(row);
    polishLoraAdd(loras.querySelector(".h3b7-add"), loras);
  }
}

function clean(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) return;
  root.classList.add("h3b23");

  /* Hide already-known retired controls anywhere in the Benchmark without
     removing them; their old observers therefore have nothing to recreate. */
  root.querySelectorAll(".h3b21-mp,.h3b21-mp-help,.h3b22-mp,.h3b24-mp").forEach(forceHide);

  for (const field of root.querySelectorAll(".h3b14-mp-field")) enforceSingleMpSlider(field);
  polishLoras(root);
}

function observe(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) {
    setTimeout(() => observe(node), 100);
    return;
  }
  clean(node);
  if (root.__h3BenchmarkFinalV27Observer) return;

  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (root.isConnected) clean(node);
    });
  });
  observer.observe(root, { childList: true, subtree: true });
  root.__h3BenchmarkFinalV27Observer = observer;
}

function sweep() {
  for (const node of app.graph?._nodes || []) {
    if (node?.comfyClass === BENCHMARK) observe(node);
  }
}

function scheduleSweep() {
  for (const delay of [0, 120, 360, 800, 1500]) setTimeout(sweep, delay);
}

app.registerExtension({
  name: "H3Studio.BenchmarkFinalV27",
  setup() {
    installStyles();
    scheduleSweep();
  },
  nodeCreated(node) {
    if (node?.comfyClass === BENCHMARK) {
      for (const delay of [80, 300, 700, 1400]) setTimeout(() => observe(node), delay);
    }
  },
  afterConfigureGraph() {
    installStyles();
    scheduleSweep();
  },
});
