import { app } from "../../scripts/app.js";

import { applyState, stateFromNode } from "./js/studio_extension.js";

const DIRECTOR = "H3StudioDirector";
const STYLE_ID = "h3studio-interaction-restore-v11-style";
const CUSTOM_DIALOG_ID = "h3studio-custom-size-dialog";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Selected options are indicated by tone, not checklist chrome. */
    .h3s-choice-option.is-active::before,.h3s-choice-option.is-active::after{content:none!important;display:none!important}
    .h3s-choice-option.is-active{background:#252a2f!important;color:#f2f4f6!important;box-shadow:inset 2px 0 0 #7f8c99!important}
    .h3s-choice-option:hover{background:#22272b!important}

    /* Aspect ratio glyphs: immediately readable without adding visual noise. */
    .h3s-choice-current,.h3s-choice-option{display:flex!important;align-items:center!important;gap:7px!important;min-width:0!important}
    .h3s-choice-ratio-icon{position:relative;display:inline-grid!important;place-items:center!important;flex:0 0 19px;width:19px;height:17px;color:#8f9aa5}
    .h3s-choice-ratio-icon::before{content:'';display:block;width:var(--ratio-w,12px);height:var(--ratio-h,12px);max-width:16px;max-height:14px;border:1px solid currentColor;border-radius:2px;background:#20252a;box-shadow:inset 0 0 0 1px rgba(255,255,255,.018)}
    .h3s-choice-ratio-icon.is-custom::before{width:14px;height:11px;border-style:dashed}
    .h3s-choice-ratio-icon.is-custom::after{content:'';position:absolute;right:1px;bottom:1px;width:4px;height:4px;border-right:1.5px solid #b7c0c8;border-bottom:1.5px solid #b7c0c8}
    .h3s-choice-menu[aria-label='Aspect ratio']{min-width:158px!important;max-width:205px!important}

    /* Restore the old progressive MP heat without the neon look. */
    .h3s-megapixel-control .h3s-range-track::before{background:var(--h3s-mp-color,#7f91a3)!important;transition:none!important}
    .h3s-megapixel-control .h3s-range-thumb{background:var(--h3s-mp-color,#7f91a3)!important;transition:transform .1s ease!important;box-shadow:0 1px 4px rgba(0,0,0,.35)!important}
    .h3s-megapixel-control .h3s-range:hover .h3s-range-thumb{transform:translate(-50%,-50%) scale(1.12)!important}
    .h3s-megapixel-value{color:var(--h3s-mp-text,#e5e9ec)!important;transition:color .1s ease!important;font-variant-numeric:tabular-nums}

    /* v10's temporary inline custom editor is intentionally retired. */
    .h3s-custom-aspect-editor{display:none!important}

    /* Custom size is a focused body-level dialog, so it never affects node geometry. */
    #${CUSTOM_DIALOG_ID}{width:min(390px,calc(100vw - 28px));padding:0;border:1px solid #3a4148;border-radius:10px;background:#171a1d;color:#eef1f3;box-shadow:0 20px 60px rgba(0,0,0,.52);font:12px/1.4 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
    #${CUSTOM_DIALOG_ID}::backdrop{background:rgba(0,0,0,.48);backdrop-filter:blur(1.5px)}
    .h3cs-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 15px 10px;border-bottom:1px solid #292f34}.h3cs-copy{display:flex;flex-direction:column;gap:2px}.h3cs-copy strong{font-size:13px}.h3cs-copy span{color:#858e96;font-size:10px}.h3cs-close{width:27px;height:27px;border:0;border-radius:6px;background:transparent;color:#879099;cursor:pointer;font-size:17px}.h3cs-close:hover{background:#23282d;color:#eef1f3}
    .h3cs-body{padding:14px 15px}.h3cs-grid{display:grid;grid-template-columns:minmax(0,1fr) 20px minmax(0,1fr);align-items:end;gap:8px}.h3cs-field{display:flex;flex-direction:column;gap:5px}.h3cs-field span{color:#89929a;font-size:9px;font-weight:650}.h3cs-field input{width:100%;height:34px;padding:6px 9px;border:1px solid #343b42;border-radius:6px;outline:0;background:#111417;color:#f1f3f5;font:650 12px/1.2 Inter,system-ui;font-variant-numeric:tabular-nums}.h3cs-field input:focus{border-color:#667482;box-shadow:0 0 0 2px rgba(135,151,168,.11)}.h3cs-x{align-self:center;padding-top:14px;color:#69727a;text-align:center}.h3cs-hint{margin:9px 0 0;color:#737c84;font-size:9px}
    .h3cs-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 15px 14px}.h3cs-actions-left,.h3cs-actions-right{display:flex;gap:6px}.h3cs-btn{min-height:30px;padding:5px 9px;border:1px solid #343b42;border-radius:6px;background:#1c2024;color:#cdd3d8;cursor:pointer;font:650 10px/1.2 Inter,system-ui}.h3cs-btn:hover{background:#252a2f;color:#f2f4f6}.h3cs-btn.is-primary{border-color:#56626d;background:#2a3137;color:#f4f6f7}.h3cs-btn.is-primary:hover{background:#343d45}
  `;
  document.head.append(style);
}

function ratioIcon(label) {
  const text = String(label || "").trim();
  const icon = document.createElement("span");
  icon.className = "h3s-choice-ratio-icon";
  icon.setAttribute("aria-hidden", "true");
  if (text.toLowerCase().startsWith("custom")) {
    icon.classList.add("is-custom");
    return icon;
  }
  const match = text.match(/\b(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)\b/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const scale = 14 / Math.max(width, height);
  icon.style.setProperty("--ratio-w", `${Math.max(5, width * scale)}px`);
  icon.style.setProperty("--ratio-h", `${Math.max(5, height * scale)}px`);
  return icon;
}

function decorateRatioRow(row) {
  if (!row || row.querySelector(":scope > .h3s-choice-ratio-icon")) return;
  const label = row.querySelector(".h3s-choice-value,.h3s-choice-option-label")?.textContent || row.textContent || "";
  const icon = ratioIcon(label);
  if (icon) row.prepend(icon);
}

function decorateAspectMenus() {
  for (const menu of document.querySelectorAll(".h3s-choice-menu[aria-label='Aspect ratio']")) {
    for (const option of menu.querySelectorAll(".h3s-choice-option")) decorateRatioRow(option);
  }
}

function interpolateColor(stops, t) {
  const bounded = Math.max(0, Math.min(1, t));
  let left = stops[0];
  let right = stops[stops.length - 1];
  for (let index = 1; index < stops.length; index += 1) {
    if (bounded <= stops[index][0]) { left = stops[index - 1]; right = stops[index]; break; }
  }
  const span = Math.max(0.0001, right[0] - left[0]);
  const local = Math.max(0, Math.min(1, (bounded - left[0]) / span));
  const rgb = [1, 2, 3].map((i) => Math.round(left[i] + (right[i] - left[i]) * local));
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
}

function updateMegapixelHeat(input) {
  const range = input?.closest?.(".h3s-range");
  const control = input?.closest?.(".h3s-megapixel-control");
  if (!range || !control) return;
  const min = Number(input.min) || 0.2;
  const max = Number(input.max) || 8.5;
  const value = Math.max(min, Math.min(max, Number(input.value) || min));
  const t = max === min ? 0 : (value - min) / (max - min);
  const color = interpolateColor([
    [0.00, 119, 139, 158],
    [0.36, 137, 153, 126],
    [0.60, 190, 151, 91],
    [0.78, 211, 112, 76],
    [1.00, 224, 82, 90],
  ], t);
  range.style.setProperty("--h3s-mp-color", color);
  control.style.setProperty("--h3s-mp-text", t >= 0.76 ? color : "#e5e9ec");
}

function bindMegapixelHeat(node) {
  const input = node?.__h3studioPanel?.querySelector(".h3s-megapixel-control .h3s-range-native");
  if (!input) return;
  if (input.dataset.h3HeatBound !== "1") {
    input.dataset.h3HeatBound = "1";
    input.addEventListener("input", () => updateMegapixelHeat(input), { passive: true });
    input.addEventListener("change", () => updateMegapixelHeat(input));
  }
  updateMegapixelHeat(input);
}

function decorateDirector(node) {
  return;
  const root = node?.__h3studioPanel;
  if (!root) return;
  root.querySelectorAll(".h3s-custom-aspect-editor").forEach((editor) => editor.remove());
  for (const field of root.querySelectorAll(".h3s-field")) {
    if (String(field.querySelector(".h3s-field-label")?.textContent || "").trim() !== "Aspect") continue;
    decorateRatioRow(field.querySelector(".h3s-choice-current"));
  }
  bindMegapixelHeat(node);
}

function findDirectorForOpenAspect() {
  for (const node of app.graph?._nodes || []) {
    if (node?.comfyClass !== DIRECTOR || !node.__h3studioPanel) continue;
    const trigger = node.__h3studioPanel.querySelector(".h3s-choice.is-open .h3s-choice-trigger[aria-label='Aspect ratio']");
    if (trigger) return { node, choice: trigger.closest(".h3s-choice") };
  }
  return null;
}

function snapDimension(value, fallback) {
  const number = Number(value);
  const safe = Number.isFinite(number) && number > 0 ? number : fallback;
  return Math.max(32, Math.min(16384, Math.round(safe / 32) * 32));
}

function openCustomSizeDialog(node) {
  document.getElementById(CUSTOM_DIALOG_ID)?.remove();
  const state = stateFromNode(node);
  const dialog = document.createElement("dialog");
  dialog.id = CUSTOM_DIALOG_ID;
  const form = document.createElement("form");
  form.method = "dialog";

  const header = document.createElement("div"); header.className = "h3cs-head";
  const copy = document.createElement("div"); copy.className = "h3cs-copy";
  const title = document.createElement("strong"); title.textContent = "Custom aspect";
  const subtitle = document.createElement("span"); subtitle.textContent = "Enter a canvas ratio directly. Values snap to 32 px.";
  copy.append(title, subtitle);
  const close = document.createElement("button"); close.type = "button"; close.className = "h3cs-close"; close.textContent = "×"; close.setAttribute("aria-label", "Close custom aspect");
  close.addEventListener("click", () => dialog.close("cancel"));
  header.append(copy, close);

  const body = document.createElement("div"); body.className = "h3cs-body";
  const grid = document.createElement("div"); grid.className = "h3cs-grid";
  const makeField = (labelText, value) => {
    const label = document.createElement("label"); label.className = "h3cs-field";
    const caption = document.createElement("span"); caption.textContent = labelText;
    const input = document.createElement("input"); input.type = "number"; input.min = "32"; input.max = "16384"; input.step = "32"; input.value = String(value); input.inputMode = "numeric";
    label.append(caption, input); return { label, input };
  };
  const widthField = makeField("Width", state.generation.custom_width || 1024);
  const heightField = makeField("Height", state.generation.custom_height || 1024);
  const x = document.createElement("div"); x.className = "h3cs-x"; x.textContent = "×";
  grid.append(widthField.label, x, heightField.label);
  const hint = document.createElement("p"); hint.className = "h3cs-hint"; hint.textContent = "This defines the custom ratio; Target size still controls the megapixel budget.";
  body.append(grid, hint);

  const actions = document.createElement("div"); actions.className = "h3cs-actions";
  const left = document.createElement("div"); left.className = "h3cs-actions-left";
  const swap = document.createElement("button"); swap.type = "button"; swap.className = "h3cs-btn"; swap.textContent = "Swap";
  swap.addEventListener("click", () => { const value = widthField.input.value; widthField.input.value = heightField.input.value; heightField.input.value = value; });
  left.append(swap);
  const right = document.createElement("div"); right.className = "h3cs-actions-right";
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "h3cs-btn"; cancel.textContent = "Cancel"; cancel.addEventListener("click", () => dialog.close("cancel"));
  const apply = document.createElement("button"); apply.type = "submit"; apply.className = "h3cs-btn is-primary"; apply.textContent = "Use custom size";
  right.append(cancel, apply); actions.append(left, right);

  form.append(header, body, actions); dialog.append(form); document.body.append(dialog);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const next = stateFromNode(node);
    next.generation.aspect_ratio = "custom";
    next.generation.custom_width = snapDimension(widthField.input.value, next.generation.custom_width || 1024);
    next.generation.custom_height = snapDimension(heightField.input.value, next.generation.custom_height || 1024);
    applyState(node, next);
    node.__h3studioConfigured?.();
    dialog.close("apply");
  });
  dialog.addEventListener("close", () => {
    const applied = dialog.returnValue === "apply";
    dialog.remove();
    if (!applied) node.__h3studioConfigured?.();
  }, { once: true });
  dialog.showModal();
  requestAnimationFrame(() => { widthField.input.focus(); widthField.input.select(); });
}

function interceptCustomAspect(event) {
  const option = event.target?.closest?.(".h3s-choice-menu[aria-label='Aspect ratio'] .h3s-choice-option");
  if (!option) return;
  const text = String(option.querySelector(".h3s-choice-option-label")?.textContent || option.textContent || "").trim().toLowerCase();
  if (!text.startsWith("custom")) return;
  const match = findDirectorForOpenAspect();
  if (!match) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  match.choice?.__h3ChoiceClose?.();
  openCustomSizeDialog(match.node);
}

document.addEventListener("click", interceptCustomAspect, true);

function attachDirector(node) {
  if (node?.__h3studioPanel || true) return;
  if (node?.__h3studioPanel || true) return;
  if (!node || node.comfyClass !== DIRECTOR || !node.__h3studioPanel) return;
  // v10's observer only existed to re-inject transient UI. Resize ownership stays untouched.
  node.__h3studioPanel.__h3GeometryObserver?.disconnect?.();
  node.__h3studioPanel.__h3GeometryObserver = null;
  const domWidget = (node.widgets || []).find((item) => item?.name === "h3studio_controls");
  if (domWidget?.options) domWidget.options.afterResize = () => decorateDirector(node);
  decorateDirector(node);
  if (node.__h3InteractionRestoreV11) return;
  node.__h3InteractionRestoreV11 = true;
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; decorateDirector(node); });
  });
  observer.observe(node.__h3studioPanel, { childList: true, subtree: true });
  node.__h3studioPanel.__h3InteractionRestoreObserver = observer;
}

function sweep() {
  return;
  return;
  for (const node of app.graph?._nodes || []) attachDirector(node);
  decorateAspectMenus();
}

const bodyObserver = new MutationObserver((records) => {
  if (records.some((record) => [...record.addedNodes].some((node) => node?.nodeType === 1 && (node.matches?.(".h3s-choice-menu[aria-label='Aspect ratio']") || node.querySelector?.(".h3s-choice-menu[aria-label='Aspect ratio']"))))) {
    requestAnimationFrame(decorateAspectMenus);
  }
});

app.registerExtension({
  name: "H3Studio.InteractionRestoreV11",
  setup() {
    installStyles();
    if (document.body) bodyObserver.observe(document.body, { childList: true });
    else window.addEventListener("DOMContentLoaded", () => bodyObserver.observe(document.body, { childList: true }), { once: true });
  },
  nodeCreated(node) {
    installStyles();
    if (node?.comfyClass === DIRECTOR) setTimeout(() => attachDirector(node), 180);
  },
  afterConfigureGraph() { installStyles(); setTimeout(sweep, 260); },
});
