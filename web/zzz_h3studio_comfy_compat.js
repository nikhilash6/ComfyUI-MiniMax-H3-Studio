import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const TARGET = "H3StudioDirector";
const STATUS_URL = "/h3studio/comfy-compat";
let statusPromise = null;

function className(node) {
  return String(node?.comfyClass || node?.type || "");
}

async function status() {
  if (!statusPromise) {
    statusPromise = api.fetchApi(STATUS_URL, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
        return payload;
      })
      .catch((error) => {
        console.warn("[H3 Studio] ComfyUI compatibility check unavailable", error);
        return null;
      });
  }
  return statusPromise;
}

function hostFor(node) {
  const panel = node?.__h3studioPanel;
  return panel?.querySelector?.(".h3s-v7-inspector, .h3s-v6-inspector, .h3s-inspector") || panel || null;
}

function issueText(item) {
  const installed = item?.installed || "missing";
  const required = item?.required || "required by this ComfyUI build";
  return `${item?.name || "package"}: ${installed} → ${required}`;
}

function render(node, payload) {
  const host = hostFor(node);
  if (!host) return false;
  host.querySelector?.(".h3s-comfy-compat")?.remove();
  if (!payload || payload.ok !== false || !Array.isArray(payload.issues) || !payload.issues.length) return true;

  const section = document.createElement("div");
  section.className = "h3s-comfy-compat";
  section.style.cssText = [
    "margin:0 0 12px 0",
    "padding:11px 12px",
    "border:1px solid rgba(244,183,64,.55)",
    "border-radius:8px",
    "background:rgba(105,73,16,.20)",
    "font-size:12px",
    "line-height:1.45",
  ].join(";");

  const title = document.createElement("div");
  title.style.cssText = "font-weight:650;margin-bottom:5px";
  title.textContent = payload.critical
    ? "ComfyUI compatibility warning"
    : "ComfyUI companion package warning";
  section.appendChild(title);

  const intro = document.createElement("div");
  intro.style.cssText = "opacity:.86;margin-bottom:6px";
  intro.textContent = `Core ${payload.core_version || "unknown"} expects newer companion packages. H3 Studio can still start, but runtime/UI behavior may silently fall back until they match.`;
  section.appendChild(intro);

  for (const item of payload.issues) {
    const row = document.createElement("div");
    row.style.cssText = "font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere";
    row.textContent = issueText(item);
    section.appendChild(row);
  }

  if (payload.issues.some((item) => item?.name === "comfy-kitchen")) {
    const kitchen = document.createElement("div");
    kitchen.style.cssText = "margin-top:6px;opacity:.9";
    kitchen.textContent = "comfy-kitchen matters to H3 Studio Auto/Fast attention selection; an outdated build can force a slower fallback backend.";
    section.appendChild(kitchen);
  }

  host.prepend(section);
  return true;
}

function attach(node) {
  if (!node || className(node) !== TARGET || node.__h3ComfyCompatAttached) return;
  node.__h3ComfyCompatAttached = true;
  Promise.all([status()]).then(([payload]) => {
    let tries = 0;
    const mount = () => {
      if (render(node, payload)) return;
      if (++tries < 80) setTimeout(mount, 50);
    };
    mount();
  });
}

app.registerExtension({
  name: "H3Studio.ComfyCompatibilityWarning",
  afterConfigureGraph() {
    for (const node of app.graph?._nodes || []) attach(node);
  },
  nodeCreated(node) {
    attach(node);
  },
});
