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
    .h3s-fr{border:1px solid #23282c;border-radius:8px;background:#131619;padding:8px 10px;color:#dbe1e5;margin-top:6px}
    .h3s-fr-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;gap:8px}
    .h3s-fr-heading{display:flex;align-items:center;gap:6px;min-width:0}
    .h3s-fr-sparkle{color:#e05b88;font-size:10px;line-height:1;flex:none}
    .h3s-fr-title{font-size:10.5px;font-weight:700;letter-spacing:.01em;color:#f0f3f5}
    .h3s-fr-kicker{font-size:9px;color:#6d7982;white-space:nowrap}
    .h3s-fr-badge{font-size:8.5px;line-height:1;padding:3px 6px;border-radius:4px;border:1px solid #2d3339;background:#181d21;color:#8d98a0;white-space:nowrap}
    .h3s-fr.is-auto .h3s-fr-badge{color:#d4b36a;border-color:#4a3f28;background:#201c13}
    .h3s-fr.is-strong .h3s-fr-badge{color:#d68a68;border-color:#4d3226;background:#221813}
    .h3s-fr-modes{display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:3px;padding:2px;background:#0c0f11;border:1px solid #1f2428;border-radius:6px}
    .h3s-fr-mode{appearance:none;border:0;border-radius:4px;background:transparent;color:#737f88;font-size:9px;font-weight:650;padding:5px 4px;cursor:pointer;text-align:center;transition:all .15s}
    .h3s-fr-mode:hover{color:#c9d0d5;background:#161b1e}
    .h3s-fr-mode.is-active{background:#262c33;color:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,.35)}
    .h3s-fr-advanced{margin-top:7px;border-top:1px solid #1e2327;padding-top:6px}
    .h3s-fr-advanced>summary{display:flex;align-items:center;justify-content:space-between;list-style:none;cursor:pointer;color:#737f88;font-size:8px;font-weight:620;user-select:none}
    .h3s-fr-advanced>summary::-webkit-details-marker{display:none}
    .h3s-fr-advanced>summary:after{content:'+';font-size:10px;color:#5a656e}
    .h3s-fr-advanced[open]>summary:after{content:'−'}
    .h3s-fr-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 8px;margin-top:6px;padding:7px;background:#0d1113;border:1px solid #1e2327;border-radius:6px}
    .h3s-fr-control{min-width:0}
    .h3s-fr-label{display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:3px;color:#7b858d;font-size:7.5px;font-weight:600}
    .h3s-fr-value{color:#bcc4c9;font-variant-numeric:tabular-nums}
    .h3s-fr-range{width:100%;height:3px;margin:0;display:block;accent-color:#7f8b93;cursor:pointer}
    .h3s-fr-select{box-sizing:border-box;width:100%;height:22px;border:1px solid #262c31;border-radius:4px;background:#14181b;color:#c5cdd2;font-size:8px;padding:2px 4px;outline:none}
    .h3s-fr-switch{display:flex;align-items:center;justify-content:space-between;gap:6px;height:22px;color:#8d979f;font-size:8px}
    .h3s-fr-switch input{accent-color:#87939b}
    .h3s-fr-live{margin-top:6px}
    .h3s-fr-status{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:5px;background:#0d1113;border:1px solid #1e2327;font-size:7.8px;color:#8b969e}
    .h3s-fr-status-dot{width:5px;height:5px;border-radius:50%;background:#6f7a82;flex:none}
    .h3s-fr-status.is-running .h3s-fr-status-dot{background:#c9a75e}
    .h3s-fr-status.is-done .h3s-fr-status-dot{background:#6e9b80}
    .h3s-fr-status.is-error .h3s-fr-status-dot{background:#b86d65}
    .h3s-fr-warning{font-size:7.5px;line-height:1.35;color:#b89565;background:#1a150d;border:1px solid #362916;border-radius:4px;padding:4px 6px;margin-top:6px}
    .h3s-fr-mp-control{grid-column:1 / -1;display:flex;flex-direction:column;gap:5px;min-width:0;padding:7px 8px;border:1px solid #262c31;border-radius:6px;background:#101316}
    .h3s-fr-mp-top{display:flex;align-items:center;justify-content:space-between;gap:6px;color:#8b969e;font-size:8px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden}
    .h3s-fr-mp-title{font-size:8px;font-weight:700;color:#eef1f3;display:flex;align-items:center;gap:5px;flex-shrink:0;white-space:nowrap}
    .h3s-fr-mp-tier{min-width:68px;text-align:center;padding:1px 5px;border-radius:999px;color:#06120f;background:#34d3b5;font-size:7.2px;font-weight:800;letter-spacing:.02em;display:inline-block;flex-shrink:0}
    .h3s-fr-mp-tier.is-detail{background:#e6ad55;color:#1a150d}
    .h3s-fr-mp-tier.is-high{background:#ef7d52;color:#1a0e08}
    .h3s-fr-mp-tier.is-extreme{background:#ef5350;color:#ffffff}
    .h3s-fr-value{color:#bcc4c9;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:8px;text-align:right;flex-shrink:0}
    .h3s-fr-mp-range-wrap{position:relative;width:100%;height:14px;display:flex;align-items:center}
    .h3s-fr-mp-track{position:absolute;left:0;right:0;height:3px;border-radius:999px;background:linear-gradient(90deg,#38d6af 0%,#68d391 22%,#e6ad55 50%,#ef7d52 75%,#ef5350 100%);pointer-events:none}
    .h3s-fr-mp-slider{position:relative;z-index:1;width:100%;height:14px;margin:0;appearance:none;background:transparent;cursor:pointer}
    .h3s-fr-mp-slider::-webkit-slider-thumb{appearance:none;width:12px;height:12px;border:2px solid #1e2227;border-radius:999px;background:#34d3b5;box-shadow:0 1px 3px rgba(0,0,0,.35);cursor:pointer;transition:transform .1s ease,background .15s ease}
    .h3s-fr-mp-slider::-webkit-slider-thumb:hover{transform:scale(1.15)}
    .h3s-fr-mp-slider[data-tier="detail"]::-webkit-slider-thumb{background:#e6ad55}
    .h3s-fr-mp-slider[data-tier="high"]::-webkit-slider-thumb{background:#ef7d52}
    .h3s-fr-mp-slider[data-tier="extreme"]::-webkit-slider-thumb{background:#ef5350}
    .h3s-fr-mp-presets{display:flex;flex-wrap:wrap;gap:3px;margin-top:2px}
    .h3s-fr-mp-preset{appearance:none;min-height:20px;padding:2px 6px;border:1px solid #262c31;border-radius:5px;color:#8b969e;background:#14181b;cursor:pointer;font:620 7.5px/1.2 ui-sans-serif,system-ui;transition:all .15s ease}
    .h3s-fr-mp-preset:hover{color:#eef1f3;border-color:color-mix(in srgb,#34d3b5 45%,#262c31)}
    .h3s-fr-mp-preset.is-active{color:#eef1f3;border-color:color-mix(in srgb,#34d3b5 65%,#262c31);background:color-mix(in srgb,#34d3b5 12%,#14181b);font-weight:700}
    .h3s-fr-proof{margin-top:7px;border-radius:6px;overflow:hidden;border:1px solid #1e2327;background:#0d1113;padding:6px;display:flex;flex-direction:column;gap:5px}
    .h3s-fr-proof-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:8px}
    .h3s-fr-proof-title{font-weight:700;color:#dbe2e6}
    .h3s-fr-toggle-markers{font-size:7.5px;line-height:1;padding:2px 5px;border-radius:3px;border:1px solid #2d353b;background:#151a1d;color:#8d98a0;cursor:pointer;transition:all .15s}
    .h3s-fr-toggle-markers:hover{background:#20282e;color:#c9d0d5}
    .h3s-fr-toggle-markers.is-active{color:#e6ad55;border-color:#524022;background:#241d13}
    .h3s-fr-proof-img{width:100%;max-height:180px;object-fit:contain;border-radius:4px;background:#000000;cursor:pointer;display:block;border:1px solid #181d21;transition:border-color .15s}
    .h3s-fr-proof-img:hover{border-color:#38d6af}
    .h3s-fr-empty{font-size:8px;line-height:1.4;color:#69747c;padding:3px 2px}
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
  const cleanProofUrl = previewUrl(data.preview_clean);
  if (proofUrl) {
    const proof = document.createElement("div");
    proof.className = "h3s-fr-proof";
    const head = document.createElement("div");
    head.className = "h3s-fr-proof-head";
    const title = document.createElement("span");
    title.className = "h3s-fr-proof-title";
    title.textContent = "Visual inspection";
    const metaWrap = document.createElement("div");
    metaWrap.style.display = "flex";
    metaWrap.style.alignItems = "center";
    metaWrap.style.gap = "6px";

    let showMarkers = node.__h3studioShowFaceMarkers !== false;
    let currentUrl = showMarkers ? proofUrl : (cleanProofUrl || proofUrl);

    if (cleanProofUrl) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = `h3s-fr-toggle-markers${showMarkers ? " is-active" : ""}`;
      toggle.textContent = showMarkers ? "Markers ON" : "Markers OFF";
      toggle.title = "Toggle face bounding box overlays";
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        showMarkers = !showMarkers;
        node.__h3studioShowFaceMarkers = showMarkers;
        toggle.className = `h3s-fr-toggle-markers${showMarkers ? " is-active" : ""}`;
        toggle.textContent = showMarkers ? "Markers ON" : "Markers OFF";
        currentUrl = showMarkers ? proofUrl : cleanProofUrl;
        img.src = currentUrl;
      });
      metaWrap.append(toggle);
    }

    const meta = document.createElement("span");
    meta.className = "h3s-fr-proof-meta";
    meta.textContent = `${data.selected ?? 0} selected · ${data.refined ?? 0} refined`;
    metaWrap.append(meta);
    head.append(title, metaWrap);

    const img = document.createElement("img");
    img.className = "h3s-fr-proof-img";
    img.src = currentUrl;
    img.alt = "Face Refine before and after inspection";
    img.title = "Click to inspect at full size";
    img.addEventListener("click", (event) => {
      event.stopPropagation();
      openImageLightbox(currentUrl, showMarkers ? "H3 Face Refine · before / after (with markers)" : "H3 Face Refine · before / after (clean)");
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

function rangeControl(labelText, value, min, max, step, format, onInput, onCommit) {
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
    onInput?.(next);
  });
  input.addEventListener("change", () => {
    const next = Number(input.value);
    onCommit?.(next);
  });
  input.addEventListener("pointerup", () => {
    const next = Number(input.value);
    onCommit?.(next);
  });
  box.append(label, input);
  return box;
}

function mpSliderControl(labelText, value, onInput, onCommit) {
  const box = document.createElement("div");
  box.className = "h3s-fr-mp-control";

  const getTierInfo = (size) => {
    const mp = (size * size) / (1024 * 1024);
    let key = "fast";
    let label = "Fast";
    if (size >= 1536) { key = "extreme"; label = "Extreme"; }
    else if (size >= 1280) { key = "high"; label = "High"; }
    else if (size >= 1024) { key = "detail"; label = "Detail"; }
    else if (size >= 768) { key = "recommended"; label = "Recommended"; }
    return { key, label, mpText: `${mp.toFixed(2)} MP` };
  };

  const top = document.createElement("div");
  top.className = "h3s-fr-mp-top";

  const titleWrap = document.createElement("div");
  titleWrap.className = "h3s-fr-mp-title";
  const name = document.createElement("span");
  name.textContent = labelText;
  const tierBadge = document.createElement("span");
  tierBadge.className = "h3s-fr-mp-tier";
  titleWrap.append(name, tierBadge);

  const valueDisplay = document.createElement("span");
  valueDisplay.className = "h3s-fr-value";
  top.append(titleWrap, valueDisplay);

  const rangeWrap = document.createElement("div");
  rangeWrap.className = "h3s-fr-mp-range-wrap";
  const track = document.createElement("div");
  track.className = "h3s-fr-mp-track";

  const input = document.createElement("input");
  input.type = "range";
  input.className = "h3s-fr-mp-slider";
  input.min = "512";
  input.max = "1536";
  input.step = "64";
  input.value = String(value);

  rangeWrap.append(track, input);

  const presets = [
    [512, "0.26 MP · 512"],
    [768, "0.59 MP · 768"],
    [1024, "1.05 MP · 1024"],
    [1280, "1.64 MP · 1280"],
    [1536, "2.36 MP · 1536"],
  ];
  const presetWrap = document.createElement("div");
  presetWrap.className = "h3s-fr-mp-presets";
  const presetButtons = [];

  const updateUI = (size) => {
    const tier = getTierInfo(size);
    tierBadge.className = `h3s-fr-mp-tier is-${tier.key}`;
    tierBadge.textContent = tier.label;
    valueDisplay.textContent = `${tier.mpText} · ${size}px`;
    input.dataset.tier = tier.key;
    for (const [btn, presetVal] of presetButtons) {
      btn.classList.toggle("is-active", Math.abs(presetVal - size) < 32);
    }
  };

  for (const [presetVal, presetLabel] of presets) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `h3s-fr-mp-preset${Math.abs(presetVal - value) < 32 ? " is-active" : ""}`;
    btn.textContent = presetLabel;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      input.value = String(presetVal);
      updateUI(presetVal);
      onInput(presetVal);
      onCommit(presetVal);
    });
    presetButtons.push([btn, presetVal]);
    presetWrap.appendChild(btn);
  }

  updateUI(value);

  input.addEventListener("input", () => {
    const next = Number(input.value);
    updateUI(next);
    onInput(next);
  });
  input.addEventListener("change", () => {
    const next = Number(input.value);
    onCommit(next);
  });
  input.addEventListener("pointerup", () => {
    const next = Number(input.value);
    onCommit(next);
  });

  box.append(top, rangeWrap, presetWrap);
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
  const sparkle = document.createElement("span");
  sparkle.className = "h3s-fr-sparkle";
  sparkle.textContent = "✦";
  const title = document.createElement("span");
  title.className = "h3s-fr-title";
  title.textContent = "Face Refine";
  const kicker = document.createElement("span");
  kicker.className = "h3s-fr-kicker";
  kicker.textContent = "Distant & Wide";
  heading.append(sparkle, title, kicker);
  const badge = document.createElement("span");
  badge.className = "h3s-fr-badge";
  const modeLabel = (value) => value === "auto" ? "Auto" : value === "strong" ? "Strong" : "Off";
  badge.textContent = modeLabel(mode);
  head.append(heading, badge);
  container.appendChild(head);

  const modes = document.createElement("div");
  modes.className = "h3s-fr-modes";
  const buttons = new Map();
  for (const [key, text] of [["off", "Off"], ["auto", "✦ Auto"], ["strong", "Strong"]]) {
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

  const controls = document.createElement("div");
  controls.hidden = mode === "off";

  const warning = document.createElement("div");
  warning.className = "h3s-fr-warning";
  warning.textContent = "Face Refine runs an individual H3 FL2VA diffusion pass per detected face. Higher MP guides and multiple faces will increase total generation time proportionally.";
  controls.appendChild(warning);

  const details = document.createElement("details");
  details.className = "h3s-fr-advanced";
  const summary = document.createElement("summary");
  summary.textContent = "Advanced face-refine controls";
  details.appendChild(summary);
  const grid = document.createElement("div");
  grid.className = "h3s-fr-grid";

  grid.append(
    mpSliderControl("Refine canvas", generation.face_refine_guide_size, (v) => { generation.face_refine_guide_size = v; }, (v) => { generation.face_refine_guide_size = v; commit(); }),
    rangeControl("Crop context", generation.face_refine_crop_factor, 1.5, 4.0, 0.1, (v) => `${v.toFixed(1)}×`, (v) => { generation.face_refine_crop_factor = v; }, () => commit()),
    rangeControl("Base denoise", generation.face_refine_denoise, 0.10, 0.60, 0.01, (v) => v.toFixed(2), (v) => { generation.face_refine_denoise = v; }, () => commit()),
    rangeControl("Max faces", advanced.max_faces, 1, 12, 1, (v) => String(Math.round(v)), (v) => { advanced.max_faces = Math.round(v); }, () => commit()),
    rangeControl("Auto face ceiling", advanced.auto_max_face_px, 48, 240, 8, (v) => `${Math.round(v)} px`, (v) => { advanced.auto_max_face_px = Math.round(v); }, () => commit()),
    rangeControl("Blend feather", advanced.blend_feather, 4, 48, 2, (v) => `${Math.round(v)} px`, (v) => { advanced.blend_feather = Math.round(v); }, () => commit()),
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