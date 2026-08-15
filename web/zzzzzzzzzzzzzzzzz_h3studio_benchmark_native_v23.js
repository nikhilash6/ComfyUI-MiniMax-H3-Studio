import { app } from "../../scripts/app.js";

const BENCHMARK = "H3StudioSmartBenchmark";
const STYLE_ID = "h3studio-benchmark-native-v23-style";
const MP_MIN = 0.2;
const MP_MAX = 8.5;
const MP_STEP = 0.05;

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Final Benchmark surface: inherit the ComfyUI node instead of drawing an app inside it. */
    .h3b7.h3b23{
      --b23-line:color-mix(in srgb,var(--border-color,#34383d) 76%,transparent);
      --b23-line-strong:color-mix(in srgb,var(--border-color,#41474d) 92%,white 4%);
      --b23-input:var(--comfy-input-bg,#181c20);
      --b23-input-hover:color-mix(in srgb,var(--b23-input) 88%,white 5%);
      --b23-button:color-mix(in srgb,var(--b23-input) 78%,transparent);
      --b23-button-hover:color-mix(in srgb,var(--b23-input) 86%,white 6%);
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
    .h3b23 .h3b7-assets{height:23px!important;padding:0 7px!important;border:1px solid var(--b23-line-strong)!important;border-radius:5px!important;background:var(--b23-button)!important;color:#909aa2!important;font-size:6.5px!important}

    .h3b23 .h3b7-body{padding:0 12px 14px!important}
    .h3b23 .h3b7-toolbar{padding:8px 0!important;margin:0!important;border-bottom:1px solid var(--b23-line)!important;gap:6px!important}
    .h3b23 .h3b15-quick{gap:4px!important}.h3b23 .h3b7-actions{gap:4px!important}
    .h3b23 .h3b15-quick button,.h3b23 .h3b7-btn{
      height:26px!important;min-height:26px!important;padding:0 8px!important;
      border:1px solid var(--b23-line-strong)!important;border-radius:5px!important;
      background:var(--b23-button)!important;color:#a5aeb5!important;font-size:6.9px!important;font-weight:650!important;
      transition:background .12s ease,border-color .12s ease,color .12s ease!important;
    }
    .h3b23 .h3b15-quick button:hover,.h3b23 .h3b7-btn:hover{background:var(--b23-button-hover)!important;border-color:#4b545c!important;color:#f0f2f4!important}
    .h3b23 .h3b15-quick button.primary,.h3b23 .h3b7-btn.primary{background:#252d34!important;border-color:#4a5660!important;color:#edf1f4!important}
    .h3b23 .h3b15-quick button.primary:hover,.h3b23 .h3b7-btn.primary:hover{background:#2c3740!important;border-color:#5a6975!important}
    .h3b23 .h3b21-button-icon{display:none!important}
    .h3b23 .h3b7-summary{padding:5px 0!important;min-height:24px!important;border-bottom:1px solid var(--b23-line)!important;color:#6e7880!important;font-size:6.4px!important}
    .h3b23 .h3b7-summary strong{font-size:6.4px!important;color:#7f8991!important}

    /* Shared run setup. */
    .h3b23 .h3b15-plan{padding:9px 0!important;border-bottom:1px solid var(--b23-line)!important}
    .h3b23 .h3b15-head{margin:0 0 7px!important}.h3b23 .h3b15-head strong{font-size:8.8px!important}.h3b23 .h3b15-head small{font-size:6.4px!important;color:#707a82!important}
    .h3b23 .h3b15-count,.h3b23 .h3b20-res-state{height:auto!important;min-height:0!important;padding:1px 5px!important;border:0!important;border-radius:0!important;background:transparent!important;color:#78828a!important;font-size:6.1px!important}
    .h3b23 .h3b20-resolutions{padding:6px 0!important;border:0!important;border-top:1px solid var(--b23-line)!important}
    .h3b23 .h3b20-res-chip{height:23px!important;border:1px solid var(--b23-line-strong)!important;background:var(--b23-button)!important;border-radius:5px!important}
    .h3b23 .h3b20-add{height:24px!important;border:1px solid var(--b23-line-strong)!important;background:var(--b23-input)!important;border-radius:5px!important}
    .h3b23 .h3b15-seeds{margin:7px 0 0!important;padding:2px!important;border:1px solid var(--b23-line)!important;background:transparent!important;gap:3px!important;border-radius:6px!important}
    .h3b23 .h3b15-seeds button{min-height:32px!important;border:1px solid transparent!important;border-radius:5px!important;background:var(--b23-button)!important;color:#929ca4!important}
    .h3b23 .h3b15-seeds button:hover{background:var(--b23-button-hover)!important;border-color:var(--b23-line)!important;color:#dfe3e6!important}
    .h3b23 .h3b15-seeds button.active{background:#252d34!important;border-color:#4a5660!important;color:#e9edef!important}
    .h3b23 .h3b15-grid{gap:6px!important;margin-top:7px!important}.h3b23 .h3b17-select{height:29px!important;border:1px solid var(--b23-line-strong)!important;border-radius:5px!important;background:var(--b23-input)!important}
    .h3b23 .h3b17-field-note{font-size:5.9px!important;line-height:8px!important;color:#68727a!important}.h3b23 .h3b15-checks{padding-top:7px!important;border-top:1px solid var(--b23-line)!important}.h3b23 .h3b15-check{font-size:6.3px!important}

    /* Scenarios are native rows, not cards. */
    .h3b23 .h3b7-list:before{padding:9px 0 5px!important;border-bottom:1px solid var(--b23-line)!important;color:#858f97!important;font-size:6.7px!important;font-weight:650!important}
    .h3b23 .h3b7-scenario{border:0!important;border-bottom:1px solid var(--b23-line)!important;border-radius:0!important;overflow:visible!important}
    .h3b23 .h3b7-scenario>summary,.h3b23 .h3b7-scenario[open]>summary{min-height:40px!important;padding:4px 0!important;border:0!important}
    .h3b23 .h3b7-scenario>summary:hover{background:color-mix(in srgb,var(--b23-input) 38%,transparent)!important}
    .h3b23 .h3b7-index{width:21px!important;height:21px!important;border:1px solid var(--b23-line)!important;border-radius:5px!important;background:transparent!important;color:#7c8790!important;font-size:6.7px!important;font-weight:650!important}
    .h3b23 .h3b7-name{height:27px!important;padding:2px 4px!important;border:0!important;background:transparent!important;color:#e4e7e9!important;font-size:8.8px!important;font-weight:680!important}
    .h3b23 .h3b7-name:hover,.h3b23 .h3b7-name:focus{border:0!important;background:var(--b23-input)!important;outline:none!important}
    .h3b23 .h3b7-tag{display:none!important}
    .h3b23 .h3b7-x{width:20px!important;height:20px!important;color:#69737b!important}.h3b23 .h3b7-x:hover{background:transparent!important;color:#ca8c92!important}

    .h3b23 .h3b7-fields{padding:2px 0 8px!important;border-top:0!important}
    .h3b23 .h3b7-field{display:grid!important;grid-template-columns:100px minmax(0,1fr)!important;align-items:center!important;gap:10px!important;min-height:38px!important;padding:4px 0!important;border-bottom:1px solid color-mix(in srgb,var(--b23-line) 72%,transparent)!important;background:transparent!important}
    .h3b23 .h3b7-label{margin:0!important;color:#758088!important;font-size:6.5px!important;font-weight:600!important}
    .h3b23 .h3b7-input,.h3b23 .h3b7-select{height:30px!important;border:1px solid var(--b23-line-strong)!important;border-radius:5px!important;background:var(--b23-input)!important;color:#dfe3e6!important;font-size:7.7px!important}
    .h3b23 .h3b7-input:hover,.h3b23 .h3b7-select:hover{background:var(--b23-input-hover)!important;border-color:#4a535b!important}
    .h3b23 .h3b7-loras{padding:6px 0 1px 110px!important}.h3b23 .h3b7-loras>summary{font-size:6.4px!important;color:#737e86!important}

    /* Kill decorative field icons from old enhancement layers. */
    .h3b23 .h3b20-field-icon,.h3b23 .h3b17-field-icon,.h3b23 .h3b17-toggle-icon,.h3b23 .h3b21-field-icon{display:none!important}

    /* One persistent scenario MP control owned by this final layer. */
    .h3b23 .h3b21-mp,.h3b23 .h3b22-mp,.h3b23 .h3b21-mp-help{display:none!important}
    .h3b23 .h3b24-mp-original{display:none!important}
    .h3b7.h3b23 .h3b7-field.h3b24-mp-field>.h3b24-mp{
      display:grid!important;grid-template-columns:minmax(0,1fr) 60px!important;gap:9px!important;align-items:center!important;
      width:100%!important;height:30px!important;padding:0 8px!important;border:1px solid var(--b23-line-strong)!important;border-radius:5px!important;background:var(--b23-input)!important;
    }
    .h3b23 .h3b24-mp-track{position:relative!important;height:18px!important;min-width:0!important}
    .h3b23 .h3b24-mp-track:before{content:'';position:absolute;left:0;right:0;top:50%;height:4px;border-radius:99px;background:#2b3136;transform:translateY(-50%)}
    .h3b23 .h3b24-mp-track:after{content:'';position:absolute;left:0;top:50%;width:var(--h3b24-p,0%);height:4px;border-radius:99px;background:linear-gradient(90deg,#68ad9e 0%,#83ad7b 24%,#b29f62 50%,#c87d58 72%,#cb5d64 100%);transform:translateY(-50%)}
    .h3b23 .h3b24-mp-track input{position:absolute!important;inset:0!important;z-index:2!important;width:100%!important;height:100%!important;margin:0!important;opacity:0!important;cursor:pointer!important}
    .h3b23 .h3b24-mp-thumb{position:absolute;left:var(--h3b24-p,0%);top:50%;width:12px;height:12px;border:2px solid #1b2024;border-radius:50%;background:#b2bbc2;transform:translate(-50%,-50%);pointer-events:none}
    .h3b23 .h3b24-mp-value{text-align:right;color:#e1e5e8;font-size:7.5px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}

    @container (max-width:700px){
      .h3b23 .h3b7-field{grid-template-columns:82px minmax(0,1fr)!important}
      .h3b23 .h3b7-loras{padding-left:92px!important}
    }
  `;
  document.head.append(style);
}

function clampMp(value) {
  return Math.max(MP_MIN, Math.min(MP_MAX, Number(value) || 1));
}

function bodyFor(node) {
  return node?.__h3bRoot?.querySelector?.(".h3b7-body") || null;
}

function captureUi(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) return null;
  const body = bodyFor(node);
  const ancestors = [];
  let current = root.parentElement;
  for (let depth = 0; current && current !== document.body && depth < 6; depth += 1, current = current.parentElement) {
    ancestors.push({ depth, top: Number(current.scrollTop || 0), left: Number(current.scrollLeft || 0) });
  }
  return {
    bodyTop: Number(body?.scrollTop || 0),
    rootTop: Number(root.scrollTop || 0),
    ancestors,
    open: [...root.querySelectorAll(".h3b7-scenario")].map((item, index) => item.open ? index : -1).filter((index) => index >= 0),
    loras: [...root.querySelectorAll(".h3b7-scenario")].map((item) => Boolean(item.querySelector(".h3b7-loras[open]"))),
  };
}

function applyUi(node, state) {
  if (!state) return;
  const root = node?.__h3bRoot;
  if (!root?.isConnected) return;
  [...root.querySelectorAll(".h3b7-scenario")].forEach((item, index) => {
    item.open = state.open.includes(index);
    const lora = item.querySelector(".h3b7-loras");
    if (lora) lora.open = Boolean(state.loras?.[index]);
  });
  const body = bodyFor(node);
  if (body) body.scrollTop = state.bodyTop;
  root.scrollTop = state.rootTop;
  let current = root.parentElement;
  for (let depth = 0; current && current !== document.body && depth < 6; depth += 1, current = current.parentElement) {
    const saved = state.ancestors?.find((item) => item.depth === depth);
    if (saved) {
      current.scrollTop = saved.top;
      current.scrollLeft = saved.left;
    }
  }
}

function restoreUi(node) {
  const state = node?.__h3b24Restore;
  if (!state) return;
  applyUi(node, state);
  requestAnimationFrame(() => {
    applyUi(node, state);
    requestAnimationFrame(() => applyUi(node, state));
  });
  setTimeout(() => applyUi(node, state), 35);
  setTimeout(() => {
    applyUi(node, state);
    if (node.__h3b24Restore === state) node.__h3b24Restore = null;
  }, 90);
}

function bindPreservation(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected || root.dataset.h3B24Preserve === "1") return;
  root.dataset.h3B24Preserve = "1";
  root.addEventListener("change", (event) => {
    if (!event.target?.closest?.(".h3b7-scenario")) return;
    node.__h3b24Restore = captureUi(node);
  }, true);
}

function findMpField(details) {
  return [...details.querySelectorAll(":scope > .h3b7-fields > .h3b7-field")].find((field) => {
    const label = String(field.querySelector(":scope > .h3b7-label")?.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    return label === "mp" || label.includes("resolution") || label.includes("target size");
  }) || null;
}

function ensureMpControl(node, details) {
  const field = findMpField(details);
  if (!field) return;
  const original = field.querySelector("input[type='number']");
  if (!original) return;
  field.classList.add("h3b24-mp-field");
  original.classList.add("h3b24-mp-original");
  const label = field.querySelector(":scope > .h3b7-label");
  if (label) label.textContent = "Target size";

  let control = field.querySelector(":scope > .h3b24-mp");
  if (!control) {
    control = document.createElement("div");
    control.className = "h3b24-mp";
    const track = document.createElement("div");
    track.className = "h3b24-mp-track";
    const thumb = document.createElement("span");
    thumb.className = "h3b24-mp-thumb";
    const range = document.createElement("input");
    range.type = "range";
    range.min = String(MP_MIN);
    range.max = String(MP_MAX);
    range.step = String(MP_STEP);
    range.setAttribute("aria-label", "Scenario target size in megapixels");
    const value = document.createElement("span");
    value.className = "h3b24-mp-value";
    track.append(thumb, range);
    control.append(track, value);
    field.append(control);

    const sync = () => {
      const n = clampMp(range.value);
      const progress = ((n - MP_MIN) / (MP_MAX - MP_MIN)) * 100;
      track.style.setProperty("--h3b24-p", `${progress}%`);
      value.textContent = `${n.toFixed(2)} MP`;
    };
    range.addEventListener("input", sync, { passive: true });
    range.addEventListener("change", () => {
      node.__h3b24Restore = captureUi(node);
      original.value = String(clampMp(range.value));
      original.dispatchEvent(new Event("change", { bubbles: true }));
    });
    control.__h3Sync = sync;
  }

  const range = control.querySelector("input[type='range']");
  if (range && document.activeElement !== range) range.value = String(clampMp(original.value));
  control.__h3Sync?.();
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

  for (const details of root.querySelectorAll(".h3b7-scenario")) ensureMpControl(node, details);
  bindPreservation(node);
  restoreUi(node);
}

function observe(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) { setTimeout(() => observe(node), 100); return; }
  clean(node);
  /* Do not share an observer flag with the other v23 compatibility layer. */
  if (root.__h3b23NativeObserver) return;
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
  root.__h3b23NativeObserver = observer;
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