import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { openImageLightbox } from "./js/core/lightbox.js";

const EXTENSION_NAME = "H3Studio.FaceRefine";
const STYLE_ID = "h3studio-face-refine-style-v2";
const TARGET = "H3StudioDirector";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3s-fr{border:1px solid #2a3035;border-radius:9px;background:#121619;overflow:hidden;color:#dbe1e5}
    .h3s-fr-head{display:flex;align-items:center;justify-content:space-between;padding:9px 10px 7px;gap:10px}
    .h3s-fr-heading{display:flex;align-items:center;gap:7px;min-width:0}
    .h3s-fr-dot{width:7px;height:7px;border-radius:50%;background:#68747d;box-shadow:0 0 0 3px rgba(104,116,125,.11);flex:none}
    .h3s-fr.is-auto .h3s-fr-dot{background:#c9a75e;box-shadow:0 0 0 3px rgba(201,167,94,.12)}
    .h3s-fr.is-strong .h3s-fr-dot{background:#c78263;box-shadow:0 0 0 3px rgba(199,130,99,.12)}
    .h3s-fr-title{font-size:10px;font-weight:720;letter-spacing:.015em;color:#eef2f4}
    .h3s-fr-kicker{font-size:8px;color:#7f8a92;white-space:nowrap}
    .h3s-fr-badge{font-size:8px;line-height:1;padding:4px 6px;border-radius:5px;border:1px solid #30373d;background:#1a1f23;color:#9ca6ad;white-space:nowrap}
    .h3s-fr-modes{display:grid;grid-template-columns:1fr 1.18fr 1fr;gap:3px;margin:0 9px 8px;padding:2px;background:#0c0f11;border:1px solid #242a2f;border-radius:7px}
    .h3s-fr-mode{appearance:none;border:0;border-radius:5px;background:transparent;color:#78848d;font-size:8.5px;font-weight:650;padding:5px 6px;cursor:pointer}
    .h3s-fr-mode:hover{color:#c9d0d5;background:#151a1e}
    .h3s-fr-mode.is-active{background:#242a30;color:#f0f3f5;box-shadow:0 1px 2px rgba(0,0,0,.28)}
    .h3s-fr-copy{margin:0 10px 9px;font-size:8px;line-height:1.48;color:#929da5}
    .h3s-fr-copy strong{color:#c7cfd4;font-weight:650}
    .h3s-fr-note{display:flex;gap:6px;margin:0 10px 9px;padding:6px 7px;border-radius:6px;background:#171b1e;border:1px solid #252b30;font-size:7.7px;line-height:1.4;color:#87929a}
    .h3s-fr-note b{color:#b4bec5;font-weight:650}
    .h3s-fr-advanced{margin:0 9px 9px;border-top:1px solid #242a2f;padding-top:7px}
    .h3s-fr-advanced>summary{display:flex;align-items:center;justify-content:space-between;list-style:none;cursor:pointer;color:#8d989f;font-size:8px;font-weight:620;user-select:none}
    .h3s-fr-advanced>summary::-webkit-details-marker{display:none}
    .h3s-fr-advanced>summary:after{content:'+';font-size:11px;color:#68747d}
    .h3s-fr-advanced[open]>summary:after{content:'−'}
    .h3s-fr-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px 9px;margin-top:7px;padding:8px;background:#0d1113;border:1px solid #20262a;border-radius:7px}
    .h3s-fr-control{min-width:0}
    .h3s-fr-label{display:flex;align-items:center;justify-content:space-between;gap:5px;margin-bottom:4px;color:#858f96;font-size:7.5px;font-weight:610}
    .h3s-fr-value{color:#bcc4c9;font-variant-numeric:tabular-nums}
    .h3s-fr-range{width:100%;height:3px;margin:0;display:block;accent-color:#7f8b93;cursor:pointer}
    .h3s-fr-select{box-sizing:border-box;width:100%;height:24px;border:1px solid #2a3136;border-radius:5px;background:#151a1d;color:#c5cdd2;font-size:8px;padding:2px 5px;outline:none}
    .h3s-fr-switch{display:flex;align-items:center;justify-content:space-between;gap:8px;height:24px;color:#9aa4ab;font-size:8px}
    .h3s-fr-switch input{accent-color:#87939b}
    .h3s-fr-proof{margin:0 9px 9px;border:1px solid #293035;border-radius:8px;background:#0d1113;overflow:hidden}
    .h3s-fr-proof-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 8px;border-bottom:1px solid #242a2f}
    .h3s-fr-proof-title{font-size:8px;font-weight:680;color:#cbd2d6}
    .h3s-fr-proof-meta{font-size:7.4px;color:#7f8a91;text-align:right}
    .h3s-fr-proof-img{display:block;width:100%;max-height:310px;object-fit:contain;background:#090c0e;cursor:zoom-in}
    .h3s-fr-status{display:flex;align-items:flex-start;gap:7px;padding:7px 8px;font-size:7.8px;line-height:1.42;color:#929ca3}
    .h3s-fr-status-dot{width:6px;height:6px;border-radius:50%;margin-top:2px;background:#6f7a82;flex:none}
    .h3s-fr-status.is-running .h3s-fr-status-dot{background:#c9a75e;animation:h3s-fr-pulse 1.2s ease-in-out infinite}
    .h3s-fr-status.is-done .h3s-fr-status-dot{background:#6e9b80}
    .h3s-fr-status.is-skipped .h3s-fr-status-dot{background:#7d888f}
    .h3s-fr-status.is-error .h3s-fr-status-dot{background:#b86d65}
    .h3s-fr-status strong{display:block;color:#cbd2d6;font-size:8px;margin-bottom:1px}
    .h3s-fr-empty{margin:0 9px 9px;padding:7px 8px;border:1px dashed #293036;border-radius:7px;font-size:7.7px;line-height:1.4;color:#748087}
    @keyframes h3s-fr-pulse{0%,100%{opacity:.45}50%{opacity:1}}
  `;
  document.head.append(style);
}

function previewUrl(item) {
  if (!item?.filename) return "";
  const params = new URLSearchParams({
    filename: item.filename,
    subfolder: item.subfolder || "",
    type: item.type || "temp",
  });
  return `/view?${params.toString()}`;
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function ensureAdvanced(state) {
  state.ui ||= {};
  const current = state.ui.face_refine && typeof state.ui.face_refine === "object"
    ? state.ui.face_refine
    : {};
  state.ui.face_refine = {
    blend_feather: Math.round(clampNumber(current.blend_feather, 16, 2, 96)),
    max_faces: Math.round(clampNumber(current.max_faces, 4, 1, 16)),
    min_face_size: Math.round(clampNumber(current.min_face_size, 16, 8, 96)),
    auto_max_face_px: Math.round(clampNumber(current.auto_max_face_px, 160, 48, 320)),
    color_match: current.color_match !== false,
    mask_mode: ["feather", "sam_auto"].includes(String(current.mask_mode)) ? String(current.mask_mode) : "feather",
    adaptive_denoise: current.adaptive_denoise !== false,
  };
  return state.ui.face_refine;
}

function statusTitle(data) {
  if (!data) return "No Face Refine run yet";
  if (data.status === "running") return "Inspecting selected still";
  if (data.status === "error") return "Face Refine failed safely";
  if (data.status === "skipped") return data.detected > 0 ? "No face needed refinement" : "No target face found";
  return data.refined > 0 ? `Refined ${data.refined} face${data.refined === 1 ? "" : "s"}` : "Face Refine completed";
}

function statusMeta(data) {
  if (!data) return "";
  const parts = [];
  if (data.detector) parts.push(data.detector);
  if (Number.isFinite(Number(data.detected))) parts.push(`${data.detected} detected`);
  if (Number.isFinite(Number(data.selected))) parts.push(`${data.selected} selected`);
  if (data.mask) parts.push(data.mask);
  if (Number(data.duration_ms) > 0) parts.push(`${(Number(data.duration_ms) / 1000).toFixed(1)}s`);
  return parts.join(" · ");
}

function renderTelemetry(node, container) {
  const slot = container?.querySelector?.(".h3s-fr-live");
  if (!slot) return;
  const data = node.__h3studioFaceRefineTelemetry;
  slot.replaceChildren();

  if (!data) {
    const empty = document.createElement("div");
    empty.className = "h3s-fr-empty";
    empty.textContent = "After a run, this area shows the exact face detector, selected face count, mask path and a before/after inspection image with the affected faces marked.";
    slot.appendChild(empty);
    return;
  }

  const proofUrl = previewUrl(data.preview);
  if (proofUrl) {
    const proof = document.createElement("div");
    proof.className = "h3s-fr-proof";
    const head = document.createElement("div");
    head.className = "h3s-fr-proof-head";
    const title = document.createElement("span");
    title.className = "h3s-fr-proof-title";
    title.textContent = "Visual inspection";
    const meta = document.createElement("span");
    meta.className = "h3s-fr-proof-meta";
    meta.textContent = `${data.selected ?? 0} selected · ${data.refined ?? 0} refined`;
    head.append(title, meta);
    const img = document.createElement("img");
    img.className = "h3s-fr-proof-img";
    img.src = proofUrl;
    img.alt = "Face Refine before and after inspection";
    img.title = "Click to inspect at full size";
    img.addEventListener("click", (event) => {
      event.stopPropagation();
      openImageLightbox(proofUrl, "H3 Face Refine · before / after");
    });
    proof.append(head, img);
    slot.appendChild(proof);
  }

  const status = document.createElement("div");
  status.className = `h3s-fr-status is-${data.status || "skipped"}`;
  const dot = document.createElement("span");
  dot.className = "h3s-fr-status-dot";
  const copy = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = statusTitle(data);
  const detail = document.createElement("span");
  const summary = statusMeta(data);
  detail.textContent = [summary, data.message].filter(Boolean).join(" — ");
  copy.append(strong, detail);
  status.append(dot, copy);
  slot.appendChild(status);
}

function rangeControl(labelText, value, min, max, step, format, onInput) {
  const box = document.createElement("div");
  box.className = "h3s-fr-control";
  const label = document.createElement("div");
  label.className = "h3s-fr-label";
  const name = document.createElement("span");
  name.textContent = labelText;
  const display = document.createElement("span");
  display.className = "h3s-fr-value";
  display.textContent = format(value);
  label.append(name, display);
  const input = document.createElement("input");
  input.type = "range";
  input.className = "h3s-fr-range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener("input", () => {
    const next = Number(input.value);
    display.textContent = format(next);
    onInput(next);
  });
  box.append(label, input);
  return box;
}

function selectBox(labelText, value, options, onChange) {
  const box = document.createElement("div");
  box.className = "h3s-fr-control";
  const label = document.createElement("div");
  label.className = "h3s-fr-label";
  label.textContent = labelText;
  const select = document.createElement("select");
  select.className = "h3s-fr-select";
  for (const [key, text] of options) {
    const option = document.createElement("option");
    option.value = String(key);
    option.textContent = text;
    option.selected = String(key) === String(value);
    select.appendChild(option);
  }
  select.addEventListener("change", () => onChange(select.value));
  box.append(label, select);
  return box;
}

function switchBox(labelText, checked, onChange) {
  const label = document.createElement("label");
  label.className = "h3s-fr-switch";
  const text = document.createElement("span");
  text.textContent = labelText;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(checked);
  input.addEventListener("change", () => onChange(input.checked));
  label.append(text, input);
  return label;
}

function createFaceRefineSection(node, state, applyCallback) {
  installStyles();
  state.generation ||= {};
  const generation = state.generation;
  const advanced = ensureAdvanced(state);
  let mode = String(generation.face_refine_mode || "off").toLowerCase();
  if (!new Set(["off", "auto", "strong"]).has(mode)) mode = "off";
  generation.face_refine_mode = mode;
  generation.face_refine_crop_factor = clampNumber(generation.face_refine_crop_factor, 2.5, 1.2, 5.0);
  generation.face_refine_guide_size = Math.round(clampNumber(generation.face_refine_guide_size, 768, 256, 1536));
  generation.face_refine_denoise = clampNumber(generation.face_refine_denoise, 0.22, 0.05, 0.8);

  const commit = () => applyCallback?.(state);
  const container = document.createElement("div");
  container.className = `h3s-fr is-${mode}`;
  container.dataset.nodeId = String(node?.id ?? "");
  node.__h3studioFaceRefineSection = container;

  const head = document.createElement("div");
  head.className = "h3s-fr-head";
  const heading = document.createElement("div");
  heading.className = "h3s-fr-heading";
  const dot = document.createElement("span");
  dot.className = "h3s-fr-dot";
  const title = document.createElement("span");
  title.className = "h3s-fr-title";
  title.textContent = "Face Refine";
  const kicker = document.createElement("span");
  kicker.className = "h3s-fr-kicker";
  kicker.textContent = "selected-still post-process";
  heading.append(dot, title, kicker);
  const badge = document.createElement("span");
  badge.className = "h3s-fr-badge";
  const modeLabel = (value) => value === "auto" ? "Auto · small faces" : value === "strong" ? "Strong · all faces" : "Off";
  badge.textContent = modeLabel(mode);
  head.append(heading, badge);
  container.appendChild(head);

  const modes = document.createElement("div");
  modes.className = "h3s-fr-modes";
  const buttons = new Map();
  for (const [key, text] of [["off", "Off"], ["auto", "Auto · recommended"], ["strong", "Strong"]]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `h3s-fr-mode${key === mode ? " is-active" : ""}`;
    button.textContent = text;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      mode = key;
      generation.face_refine_mode = key;
      container.classList.remove("is-off", "is-auto", "is-strong");
      container.classList.add(`is-${key}`);
      badge.textContent = modeLabel(key);
      for (const [otherKey, otherButton] of buttons) otherButton.classList.toggle("is-active", otherKey === key);
      controls.hidden = key === "off";
      commit();
    });
    buttons.set(key, button);
    modes.appendChild(button);
  }
  container.appendChild(modes);

  const copy = document.createElement("p");
  copy.className = "h3s-fr-copy";
  copy.innerHTML = "<strong>Runs after H3 has chosen the final still.</strong> Auto detects only small/distant faces, crops them with context, rerenders those crops through H3's real FL2VA path, then blends them back. Close faces are left untouched.";
  container.appendChild(copy);

  const controls = document.createElement("div");
  controls.hidden = mode === "off";

  const note = document.createElement("div");
  note.className = "h3s-fr-note";
  note.innerHTML = "<span>i</span><span><b>Detector order:</b> YOLOv8-Face when a local face model is installed, then MediaPipe, then the bundled Haar fallback. Feathered masks are dependency-free; SAM is optional and falls back safely. Each selected face adds another H3 sampling pass.</span>";
  controls.appendChild(note);

  const details = document.createElement("details");
  details.className = "h3s-fr-advanced";
  const summary = document.createElement("summary");
  summary.textContent = "Advanced face-refine controls";
  details.appendChild(summary);
  const grid = document.createElement("div");
  grid.className = "h3s-fr-grid";

  grid.append(
    rangeControl("Crop context", generation.face_refine_crop_factor, 1.5, 4.0, 0.1, (v) => `${v.toFixed(1)}×`, (v) => { generation.face_refine_crop_factor = v; commit(); }),
    selectBox("Refine canvas", String(generation.face_refine_guide_size), [["512", "512 px · faster"], ["768", "768 px · recommended"], ["1024", "1024 px · expensive"]], (v) => { generation.face_refine_guide_size = Number(v); commit(); }),
    rangeControl("Base denoise", generation.face_refine_denoise, 0.10, 0.60, 0.01, (v) => v.toFixed(2), (v) => { generation.face_refine_denoise = v; commit(); }),
    rangeControl("Max faces", advanced.max_faces, 1, 12, 1, (v) => String(Math.round(v)), (v) => { advanced.max_faces = Math.round(v); commit(); }),
    rangeControl("Auto face ceiling", advanced.auto_max_face_px, 48, 240, 8, (v) => `${Math.round(v)} px`, (v) => { advanced.auto_max_face_px = Math.round(v); commit(); }),
    rangeControl("Blend feather", advanced.blend_feather, 4, 48, 2, (v) => `${Math.round(v)} px`, (v) => { advanced.blend_feather = Math.round(v); commit(); }),
    selectBox("Mask", advanced.mask_mode, [["feather", "Feathered face box · default"], ["sam_auto", "SAM if installed · fallback safe"]], (v) => { advanced.mask_mode = v; commit(); }),
    switchBox("Adaptive denoise", advanced.adaptive_denoise, (v) => { advanced.adaptive_denoise = v; commit(); }),
    switchBox("Color-match patch", advanced.color_match, (v) => { advanced.color_match = v; commit(); }),
  );
  details.appendChild(grid);
  controls.appendChild(details);
  container.appendChild(controls);

  const live = document.createElement("div");
  live.className = "h3s-fr-live";
  container.appendChild(live);
  renderTelemetry(node, container);
  return container;
}

api.addEventListener("h3studio-face-refine", ({ detail }) => {
  const nodeId = String(detail?.node_id ?? "");
  if (!nodeId) return;
  const node = (app.graph?._nodes || []).find((candidate) => candidate.comfyClass === TARGET && String(candidate.id) === nodeId);
  if (!node) return;
  node.__h3studioFaceRefineTelemetry = detail;
  renderTelemetry(node, node.__h3studioFaceRefineSection);
});

app.registerExtension({ name: EXTENSION_NAME });

export { createFaceRefineSection, previewUrl, renderTelemetry };