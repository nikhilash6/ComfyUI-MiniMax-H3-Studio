/**
 * MiniMax H3 Studio — Face Refine UI Extension
 * Visual controls, mode selectors, advanced tuning drawers, and execution telemetry for Face Refine.
 */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXTENSION_NAME = "H3Studio.FaceRefine";
const STYLE_ID = "h3studio-face-refine-style";

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3s-face-refine-panel{margin:4px 0 6px 0;padding:8px 10px;border:1px solid #282f36;border-radius:8px;background:color-mix(in srgb,var(--h3s-bg,#15191d) 92%,white 2%);box-sizing:border-box}
    .h3s-face-refine-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
    .h3s-face-refine-title-group{display:flex;align-items:center;gap:6px}
    .h3s-face-refine-icon{color:#ec4899;font-size:11px;line-height:1}
    .h3s-face-refine-title{font-size:10px;font-weight:700;color:#e8ebed;letter-spacing:.02em}
    .h3s-face-refine-sub{font-size:8px;color:#7e8b97;font-style:italic}
    .h3s-face-refine-badge{font-size:8px;font-weight:650;padding:1.5px 5px;border-radius:4px;transition:all .15s ease}
    .h3s-face-refine-badge.is-off{background:rgba(255,255,255,.05);color:#838d96;border:1px solid rgba(255,255,255,.08)}
    .h3s-face-refine-badge.is-auto{background:rgba(236,72,153,.15);color:#f472b6;border:1px solid rgba(236,72,153,.35)}
    .h3s-face-refine-badge.is-strong{background:rgba(168,85,247,.15);color:#c084fc;border:1px solid rgba(168,85,247,.35)}
    
    .h3s-face-refine-mode-grid{display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:4px;background:#0d1012;padding:2px;border-radius:6px;border:1px solid #232a30;margin-bottom:4px}
    .h3s-face-refine-mode-btn{font-size:8.5px;font-weight:650;padding:3.5px 5px;border-radius:4px;border:0;background:transparent;color:#7e8b97;cursor:pointer;transition:all .12s ease;text-align:center}
    .h3s-face-refine-mode-btn:hover{color:#d1d9e0}
    .h3s-face-refine-mode-btn.is-active{background:#232b34;color:#f0f4f8;box-shadow:0 1px 3px rgba(0,0,0,.3)}
    
    .h3s-face-refine-drawer{margin-top:5px;padding-top:5px;border-top:1px solid #232a30}
    .h3s-face-refine-toggle-summary{font-size:8px;color:#7e8b97;cursor:pointer;user-select:none;outline:none;display:flex;align-items:center;justify-content:space-between}
    .h3s-face-refine-toggle-summary:hover{color:#c4cdd5}
    .h3s-face-refine-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:5px;padding:5px 7px;background:#0e1114;border-radius:6px;border:1px solid #1c2227}
    .h3s-face-refine-ctrl-label{font-size:7.5px;font-weight:600;color:#8c959e;display:flex;justify-content:space-between;margin-bottom:2px}
    .h3s-face-refine-slider{width:100%;height:3px;cursor:pointer;accent-color:#ec4899;display:block}
    .h3s-face-refine-telemetry{margin-top:5px;padding:3px 6px;font-size:8px;border-radius:4px;background:rgba(34,197,94,.12);color:#4ade80;border:1px solid rgba(34,197,94,.25);display:none}
  `;
  document.head.append(style);
}

function createFaceRefineSection(node, state, applyCallback) {
  installStyles();

  const generation = state.generation || {};
  const currentMode = (generation.face_refine_mode || "off").toLowerCase();
  const cropFactor = Number(generation.face_refine_crop_factor ?? 2.5);
  const denoise = Number(generation.face_refine_denoise ?? 0.22);
  const guideSize = Number(generation.face_refine_guide_size ?? 768);

  const container = document.createElement("div");
  container.className = "h3s-face-refine-panel";

  // 1. Header
  const header = document.createElement("div");
  header.className = "h3s-face-refine-header";

  const titleGroup = document.createElement("div");
  titleGroup.className = "h3s-face-refine-title-group";

  const icon = document.createElement("span");
  icon.className = "h3s-face-refine-icon";
  icon.textContent = "✦";

  const title = document.createElement("span");
  title.className = "h3s-face-refine-title";
  title.textContent = "Face Refine";

  const sub = document.createElement("span");
  sub.className = "h3s-face-refine-sub";
  sub.textContent = "· Distant & Wide";

  titleGroup.append(icon, title, sub);

  const badge = document.createElement("span");
  badge.className = `h3s-face-refine-badge is-${currentMode}`;
  badge.textContent = currentMode === "auto" ? "Auto · Distant" : currentMode === "strong" ? "Strong · All" : "Off";

  header.append(titleGroup, badge);
  container.appendChild(header);

  // 2. Segmented Mode Buttons
  const modeGrid = document.createElement("div");
  modeGrid.className = "h3s-face-refine-mode-grid";

  const modes = [
    { key: "off", label: "Off" },
    { key: "auto", label: "✦ Auto" },
    { key: "strong", label: "Strong" },
  ];

  const modeButtons = {};

  modes.forEach(({ key, label }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `h3s-face-refine-mode-btn${key === currentMode ? " is-active" : ""}`;
    btn.textContent = label;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.generation.face_refine_mode = key;

      Object.keys(modeButtons).forEach((k) => {
        modeButtons[k].classList.toggle("is-active", k === key);
      });

      badge.className = `h3s-face-refine-badge is-${key}`;
      badge.textContent = key === "auto" ? "Auto · Distant" : key === "strong" ? "Strong · All" : "Off";

      if (drawer) {
        drawer.style.display = key === "off" ? "none" : "block";
      }

      applyCallback?.(state);
    });

    modeButtons[key] = btn;
    modeGrid.appendChild(btn);
  });

  container.appendChild(modeGrid);

  // 3. Collapsible Advanced Drawer
  const drawer = document.createElement("div");
  drawer.className = "h3s-face-refine-drawer";
  drawer.style.display = currentMode === "off" ? "none" : "block";

  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.className = "h3s-face-refine-toggle-summary";
  summary.innerHTML = `<span>Tuning & Geometry</span> <span>▾</span>`;
  details.appendChild(summary);

  const grid = document.createElement("div");
  grid.className = "h3s-face-refine-grid";

  // Crop context slider
  const cropBox = document.createElement("div");
  const cropLabel = document.createElement("div");
  cropLabel.className = "h3s-face-refine-ctrl-label";
  cropLabel.innerHTML = `<span>Crop</span> <span>${cropFactor.toFixed(1)}×</span>`;
  const cropSlider = document.createElement("input");
  cropSlider.type = "range";
  cropSlider.className = "h3s-face-refine-slider";
  cropSlider.min = "1.5";
  cropSlider.max = "4.0";
  cropSlider.step = "0.1";
  cropSlider.value = String(cropFactor);
  cropSlider.addEventListener("input", () => {
    const val = parseFloat(cropSlider.value);
    cropLabel.innerHTML = `<span>Crop</span> <span>${val.toFixed(1)}×</span>`;
    state.generation.face_refine_crop_factor = val;
    applyCallback?.(state);
  });
  cropBox.append(cropLabel, cropSlider);

  // Denoise slider
  const denoiseBox = document.createElement("div");
  const denoiseLabel = document.createElement("div");
  denoiseLabel.className = "h3s-face-refine-ctrl-label";
  denoiseLabel.innerHTML = `<span>Denoise</span> <span>${denoise.toFixed(2)}</span>`;
  const denoiseSlider = document.createElement("input");
  denoiseSlider.type = "range";
  denoiseSlider.className = "h3s-face-refine-slider";
  denoiseSlider.min = "0.10";
  denoiseSlider.max = "0.50";
  denoiseSlider.step = "0.01";
  denoiseSlider.value = String(denoise);
  denoiseSlider.addEventListener("input", () => {
    const val = parseFloat(denoiseSlider.value);
    denoiseLabel.innerHTML = `<span>Denoise</span> <span>${val.toFixed(2)}</span>`;
    state.generation.face_refine_denoise = val;
    applyCallback?.(state);
  });
  denoiseBox.append(denoiseLabel, denoiseSlider);

  grid.append(cropBox, denoiseBox);
  details.appendChild(grid);
  drawer.appendChild(details);
  container.appendChild(drawer);

  // 4. Execution Telemetry
  const telemetry = document.createElement("div");
  telemetry.className = "h3s-face-refine-telemetry";
  container.appendChild(telemetry);

  return container;
}

app.registerExtension({
  name: EXTENSION_NAME,
});

export { createFaceRefineSection };
