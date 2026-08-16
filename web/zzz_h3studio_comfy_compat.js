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

function relationLabel(item) {
  if (item?.relation === "ahead") return "newer than core pin";
  if (item?.relation === "behind") return "older than core pin";
  if (item?.relation === "missing") return "missing";
  if (item?.relation === "mismatch") return "does not satisfy core requirement";
  return "matches";
}

function issueText(item) {
  const installed = item?.installed || "missing";
  const required = item?.required || "required by this ComfyUI build";
  return `${item?.name || "package"}: installed ${installed} · core requires ${required} · ${relationLabel(item)}`;
}

function introText(payload) {
  const core = payload?.core_version || "unknown";
  if (payload?.diagnosis === "companions_ahead") {
    return `Core ${core} is older than the installed companion package set. The installed packages are ahead of this core's exact pins; update ComfyUI core or reinstall this core's requirements so the versions match.`;
  }
  if (payload?.diagnosis === "companions_behind") {
    return `Core ${core} expects newer companion packages than are installed. Update the companion packages from this core's requirements.txt.`;
  }
  return `Core ${core} and its companion packages are out of sync. H3 Studio can still start, but runtime/UI behavior may silently fall back until the exact package contract matches.`;
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
  intro.textContent = introText(payload);
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
    const kitchenIssue = payload.issues.find((item) => item?.name === "comfy-kitchen");
    kitchen.textContent = kitchenIssue?.relation === "ahead"
      ? "comfy-kitchen matters to H3 Studio Auto/Fast attention selection. A newer kitchen paired with an older core can expose APIs the core was not pinned against; align the core and companion set."
      : "comfy-kitchen matters to H3 Studio Auto/Fast attention selection; an older or incompatible build can force a slower fallback backend.";
    section.appendChild(kitchen);
  }

  host.prepend(section);
  return true;
}

function attach(node) {
  return;
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
