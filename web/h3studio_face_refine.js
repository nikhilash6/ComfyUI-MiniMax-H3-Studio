/**
 * MiniMax H3 Studio — Face Refine UI Extension
 * Visual controls, mode selectors, advanced tuning drawers, and execution telemetry for Face Refine.
 */

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const EXTENSION_NAME = "h3studio.face_refine";

function createFaceRefineSection(node, state, applyCallback) {
  const container = document.createElement("div");
  container.className = "h3s-face-refine-panel";
  container.style.cssText = `
    margin: 8px 0;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    font-family: inherit;
    font-size: 12px;
    color: var(--fg-color, #e0e0e0);
  `;

  const generation = state.generation || {};
  const currentMode = (generation.face_refine_mode || "off").toLowerCase();
  const cropFactor = generation.face_refine_crop_factor || 2.5;
  const guideSize = generation.face_refine_guide_size || 768;
  const denoise = generation.face_refine_denoise || 0.22;

  // Header
  const header = document.createElement("div");
  header.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  `;

  const titleGroup = document.createElement("div");
  titleGroup.style.cssText = "display: flex; align-items: center; gap: 6px;";
  
  const icon = document.createElement("span");
  icon.textContent = "✦";
  icon.style.color = "#ec4899";
  icon.style.fontSize = "13px";

  const title = document.createElement("strong");
  title.textContent = "Face Refine";
  title.style.fontWeight = "600";
  title.style.color = "#f1f5f9";

  const subtitle = document.createElement("span");
  subtitle.textContent = "Distant & Wide";
  subtitle.style.fontSize = "10px";
  subtitle.style.color = "rgba(255, 255, 255, 0.45)";
  subtitle.style.marginLeft = "4px";

  titleGroup.appendChild(icon);
  titleGroup.appendChild(title);
  titleGroup.appendChild(subtitle);

  // Status Badge
  const statusBadge = document.createElement("span");
  statusBadge.className = "h3s-face-refine-badge";
  statusBadge.style.cssText = `
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 500;
    transition: all 0.2s ease;
  `;

  function updateBadge(mode) {
    if (mode === "auto") {
      statusBadge.textContent = "Auto · Distant Only";
      statusBadge.style.background = "rgba(236, 72, 153, 0.15)";
      statusBadge.style.color = "#f472b6";
      statusBadge.style.border = "1px solid rgba(236, 72, 153, 0.3)";
    } else if (mode === "strong") {
      statusBadge.textContent = "Strong · All Faces";
      statusBadge.style.background = "rgba(168, 85, 247, 0.15)";
      statusBadge.style.color = "#c084fc";
      statusBadge.style.border = "1px solid rgba(168, 85, 247, 0.3)";
    } else {
      statusBadge.textContent = "Off";
      statusBadge.style.background = "rgba(255, 255, 255, 0.05)";
      statusBadge.style.color = "rgba(255, 255, 255, 0.4)";
      statusBadge.style.border = "1px solid rgba(255, 255, 255, 0.1)";
    }
  }
  updateBadge(currentMode);

  header.appendChild(titleGroup);
  header.appendChild(statusBadge);
  container.appendChild(header);

  // Segmented Mode Buttons
  const modeBar = document.createElement("div");
  modeBar.style.cssText = `
    display: grid;
    grid-template-columns: 1fr 1.3fr 1fr;
    gap: 4px;
    background: rgba(0, 0, 0, 0.25);
    padding: 3px;
    border-radius: 6px;
    margin-bottom: 8px;
  `;

  const modes = [
    { key: "off", label: "Off" },
    { key: "auto", label: "✦ Auto", desc: "Distant Only" },
    { key: "strong", label: "Strong", desc: "All Faces" },
  ];

  const modeButtons = {};

  modes.forEach(({ key, label }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.style.cssText = `
      border: none;
      padding: 5px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      background: transparent;
      color: rgba(255, 255, 255, 0.6);
      transition: all 0.15s ease;
    `;

    if (key === currentMode) {
      btn.style.background = "rgba(255, 255, 255, 0.12)";
      btn.style.color = "#ffffff";
      btn.style.boxShadow = "0 1px 3px rgba(0,0,0,0.3)";
    }

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.generation.face_refine_mode = key;
      Object.keys(modeButtons).forEach((k) => {
        const b = modeButtons[k];
        if (k === key) {
          b.style.background = "rgba(255, 255, 255, 0.12)";
          b.style.color = "#ffffff";
          b.style.boxShadow = "0 1px 3px rgba(0,0,0,0.3)";
        } else {
          b.style.background = "transparent";
          b.style.color = "rgba(255, 255, 255, 0.6)";
          b.style.boxShadow = "none";
        }
      });
      updateBadge(key);
      advancedDrawer.style.display = key === "off" ? "none" : "block";
      applyCallback?.(state);
    });

    modeButtons[key] = btn;
    modeBar.appendChild(btn);
  });

  container.appendChild(modeBar);

  // Collapsible Advanced Drawer
  const advancedDrawer = document.createElement("div");
  advancedDrawer.style.cssText = `
    display: ${currentMode === "off" ? "none" : "block"};
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  `;

  const drawerToggle = document.createElement("details");
  drawerToggle.style.cursor = "pointer";

  const summary = document.createElement("summary");
  summary.textContent = "Advanced Tuning & Geometry";
  summary.style.cssText = `
    font-size: 10.5px;
    color: rgba(255, 255, 255, 0.5);
    margin-bottom: 6px;
    outline: none;
    user-select: none;
  `;
  drawerToggle.appendChild(summary);

  const controlsGrid = document.createElement("div");
  controlsGrid.style.cssText = `
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 6px;
    padding: 6px 8px;
    background: rgba(0, 0, 0, 0.15);
    border-radius: 6px;
  `;

  // Crop Factor
  const cropWrapper = document.createElement("div");
  const cropLabel = document.createElement("label");
  cropLabel.style.cssText = "font-size: 10px; color: rgba(255,255,255,0.6); display: block; margin-bottom: 2px;";
  cropLabel.textContent = `Crop Context: ${cropFactor.toFixed(1)}×`;
  const cropSlider = document.createElement("input");
  cropSlider.type = "range";
  cropSlider.min = "1.5";
  cropSlider.max = "4.0";
  cropSlider.step = "0.1";
  cropSlider.value = String(cropFactor);
  cropSlider.style.cssText = "width: 100%; height: 4px; cursor: pointer; accent-color: #ec4899;";
  cropSlider.addEventListener("input", () => {
    const val = parseFloat(cropSlider.value);
    cropLabel.textContent = `Crop Context: ${val.toFixed(1)}×`;
    state.generation.face_refine_crop_factor = val;
    applyCallback?.(state);
  });
  cropWrapper.appendChild(cropLabel);
  cropWrapper.appendChild(cropSlider);

  // Denoise Strength
  const denoiseWrapper = document.createElement("div");
  const denoiseLabel = document.createElement("label");
  denoiseLabel.style.cssText = "font-size: 10px; color: rgba(255,255,255,0.6); display: block; margin-bottom: 2px;";
  denoiseLabel.textContent = `Refine Denoise: ${denoise.toFixed(2)}`;
  const denoiseSlider = document.createElement("input");
  denoiseSlider.type = "range";
  denoiseSlider.min = "0.10";
  denoiseSlider.max = "0.50";
  denoiseSlider.step = "0.01";
  denoiseSlider.value = String(denoise);
  denoiseSlider.style.cssText = "width: 100%; height: 4px; cursor: pointer; accent-color: #ec4899;";
  denoiseSlider.addEventListener("input", () => {
    const val = parseFloat(denoiseSlider.value);
    denoiseLabel.textContent = `Refine Denoise: ${val.toFixed(2)}`;
    state.generation.face_refine_denoise = val;
    applyCallback?.(state);
  });
  denoiseWrapper.appendChild(denoiseLabel);
  denoiseWrapper.appendChild(denoiseSlider);

  controlsGrid.appendChild(cropWrapper);
  controlsGrid.appendChild(denoiseWrapper);
  drawerToggle.appendChild(controlsGrid);
  advancedDrawer.appendChild(drawerToggle);
  container.appendChild(advancedDrawer);

  // Execution Telemetry Banner
  const telemetryBadge = document.createElement("div");
  telemetryBadge.className = "h3s-face-refine-telemetry";
  telemetryBadge.style.cssText = `
    display: none;
    margin-top: 6px;
    padding: 4px 8px;
    font-size: 10px;
    border-radius: 4px;
    background: rgba(34, 197, 94, 0.12);
    color: #4ade80;
    border: 1px solid rgba(34, 197, 94, 0.25);
  `;
  container.appendChild(telemetryBadge);

  // Listen to node execution events
  const onExecuted = (event) => {
    if (event.detail?.node === String(node.id)) {
      const output = event.detail?.output;
      if (output?.face_refine_status || output?.status) {
        telemetryBadge.textContent = output.face_refine_status || output.status;
        telemetryBadge.style.display = "block";
        setTimeout(() => {
          telemetryBadge.style.display = "none";
        }, 8000);
      }
    }
  };
  api.addEventListener("executed", onExecuted);

  return container;
}

app.registerExtension({
  name: EXTENSION_NAME,
  async nodeCreated(node) {
    if (node.comfyClass === "H3StudioDirector") {
      node.__createFaceRefineSection = (state, applyCallback) => {
        return createFaceRefineSection(node, state, applyCallback);
      };
    }
  },
});

export { createFaceRefineSection };
