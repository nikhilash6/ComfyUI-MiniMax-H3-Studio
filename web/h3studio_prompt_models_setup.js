import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const SETUP = "H3StudioModelSetup";
const LOADER = "H3StudioLoader";
const STYLE_ID = "h3studio-prompt-models-style";
const OLD_AUTO_ANALYZER = "Auto · Qwen3-VL 4B";
const OLD_AUTO_WRITERS = new Set(["Auto · Qwen3-VL 4B writer", "Auto · Qwen3-VL 8B writer"]);

const ASSETS = [
  {
    id: "q35-4b",
    family: "qwen35",
    name: "Qwen3.5-4B",
    role: "Shared analyzer + prompt writer",
    filename: "qwen3.5_4b_bf16.safetensors",
    destination: "text_encoders",
    approx: "~9.3 GB",
    url: "https://huggingface.co/Comfy-Org/Qwen3.5/resolve/main/text_encoders/qwen3.5_4b_bf16.safetensors?download=true",
  },
  {
    id: "q35-2b",
    family: "qwen35",
    name: "Qwen3.5-2B",
    role: "Fast image analyzer",
    filename: "qwen3.5_2b_bf16.safetensors",
    destination: "text_encoders",
    approx: "~4.6 GB",
    url: "https://huggingface.co/Comfy-Org/Qwen3.5/resolve/main/text_encoders/qwen3.5_2b_bf16.safetensors?download=true",
  },
  {
    id: "minicpm-model",
    family: "minicpm",
    name: "MiniCPM-V 4.6 Q4_K_M",
    role: "Fastest Vision · llama.cpp model",
    filename: "MiniCPM-V-4_6-Q4_K_M.gguf",
    destination: "h3studio_vlm",
    approx: "~529 MB",
    url: "https://huggingface.co/openbmb/MiniCPM-V-4.6-gguf/resolve/main/MiniCPM-V-4_6-Q4_K_M.gguf?download=true",
  },
  {
    id: "minicpm-mmproj",
    family: "minicpm",
    name: "MiniCPM-V 4.6 mmproj",
    role: "Required multimodal projector",
    filename: "mmproj-model-f16.gguf",
    destination: "h3studio_vlm",
    approx: "~1.1 GB",
    url: "https://huggingface.co/openbmb/MiniCPM-V-4.6-gguf/resolve/main/mmproj-model-f16.gguf?download=true",
  },
  {
    id: "legacy-q3vl4",
    family: "legacy",
    name: "Qwen3-VL 4B FP8",
    role: "Legacy analyzer / writer",
    filename: "qwen3vl_4b_fp8_scaled.safetensors",
    destination: "text_encoders",
    approx: "legacy",
    url: "https://huggingface.co/Comfy-Org/Qwen3-VL/resolve/main/text_encoders/qwen3vl_4b_fp8_scaled.safetensors?download=true",
  },
  {
    id: "legacy-q3vl8",
    family: "legacy",
    name: "Qwen3-VL 8B FP8",
    role: "Legacy analyzer / writer",
    filename: "qwen3vl_8b_fp8_scaled.safetensors",
    destination: "text_encoders",
    approx: "legacy",
    url: "https://huggingface.co/Comfy-Org/Qwen3-VL/resolve/main/text_encoders/qwen3vl_8b_fp8_scaled.safetensors?download=true",
  },
];

const PROFILES = [
  {
    key: "recommended",
    badge: "RECOMMENDED",
    title: "Qwen3.5-4B · shared",
    text: "One newer 4B model does both factual vision analysis and prompt direction. No second model switch.",
    assets: ["q35-4b"],
    analyzer: "Auto · Qwen3.5 4B",
    writer: "Same as image analyzer",
  },
  {
    key: "fast",
    badge: "FAST",
    title: "Qwen3.5-2B → Qwen3.5-4B",
    text: "2B handles pixels; 4B remains the safer structured prompt writer. Faster vision with one model switch.",
    assets: ["q35-2b", "q35-4b"],
    analyzer: "Fast · Qwen3.5 2B",
    writer: "Auto · Qwen3.5 4B writer",
  },
  {
    key: "fastest",
    badge: "FASTEST VISION",
    title: "MiniCPM-V 4.6 → Qwen3.5-4B",
    text: "Lightweight GGUF pixel analyzer through llama.cpp + its required mmproj; Qwen3.5-4B writes the final brief.",
    assets: ["minicpm-model", "minicpm-mmproj", "q35-4b"],
    analyzer: "Fastest Vision · MiniCPM-V 4.6",
    writer: "Auto · Qwen3.5 4B writer",
  },
];

const byId = (id) => ASSETS.find((asset) => asset.id === id);
const className = (node) => String(node?.comfyClass || node?.type || "");

function bytesLabel(bytes) {
  let value = Number(bytes) || 0;
  if (!value) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unit = units[0];
  for (const candidate of units) {
    unit = candidate;
    if (value < 1024 || candidate === "TB") break;
    value /= 1024;
  }
  return `${value.toFixed(unit === "GB" || unit === "TB" ? 2 : 1)} ${unit}`;
}

async function jsonFetch(path, options = {}) {
  const response = await api.fetchApi(path, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok || data?.ok === false) throw new Error(data?.error || text || `HTTP ${response.status}`);
  return data;
}

async function postJson(path, payload) {
  return jsonFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3pm{margin:10px 0;padding:10px;border:1px solid rgba(45,212,191,.26);border-radius:10px;background:linear-gradient(145deg,rgba(45,212,191,.055),rgba(56,189,248,.025));color:#e7f4f3}.h3pm *{box-sizing:border-box}
    .h3pm-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.h3pm-title{font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.065em;color:#b8fff0}.h3pm-sub{font-size:9.5px;opacity:.64;margin-top:3px;max-width:600px;line-height:1.45}.h3pm-state{font-size:9px;white-space:nowrap;padding:3px 6px;border:1px solid rgba(255,255,255,.1);border-radius:999px;opacity:.75}
    .h3pm-profiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:9px}.h3pm-profile{padding:9px;border:1px solid rgba(255,255,255,.09);border-radius:8px;background:rgba(0,0,0,.15);min-width:0}.h3pm-profile.recommended{border-color:rgba(45,212,191,.34);background:rgba(45,212,191,.035)}.h3pm-badge{display:inline-block;font-size:7.5px;font-weight:850;letter-spacing:.08em;padding:2px 5px;border:1px solid rgba(45,212,191,.3);border-radius:999px;color:#99f6e4}.h3pm-profile-title{font-weight:800;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.h3pm-profile-text{font-size:8.8px;opacity:.62;line-height:1.4;min-height:38px;margin-top:3px}.h3pm-files{margin-top:6px;font-size:8.5px;opacity:.72;line-height:1.45}.h3pm-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.h3pm-btn{border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.06);color:inherit;border-radius:6px;padding:5px 7px;cursor:pointer;font:inherit;font-size:9px}.h3pm-btn.primary{border-color:rgba(45,212,191,.4);background:rgba(45,212,191,.11)}.h3pm-btn:disabled{opacity:.36;cursor:not-allowed}
    .h3pm-models{margin-top:9px;border-top:1px solid rgba(255,255,255,.07);padding-top:7px}.h3pm-model-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;padding:5px 3px;border-top:1px solid rgba(255,255,255,.045)}.h3pm-model-name{font-weight:680}.h3pm-model-meta{font-size:8.2px;opacity:.55;margin-top:2px;overflow-wrap:anywhere}.h3pm-model-status{font-size:8.5px;white-space:nowrap;align-self:center}.h3pm-model-status.ok{color:#86efac}.h3pm-model-status.bad{color:#fca5a5}.h3pm-legacy{margin-top:8px;padding:7px;border:1px dashed rgba(255,255,255,.1);border-radius:7px;font-size:8.8px;opacity:.7}.h3pm-log{margin-top:7px;font-size:8.8px;opacity:.65}.h3pm-legacy-base-row{display:none!important}
    @media(max-width:760px){.h3pm-profiles{grid-template-columns:1fr}}
  `;
  document.head.append(style);
}

function stateFor(node) {
  return node.__h3PromptModelsState ||= {
    metadata: new Map(),
    verification: new Map(),
    loading: false,
    busy: false,
    uadVersion: "",
    uadReady: false,
  };
}

function loaderNode() {
  const loaders = (app.graph?._nodes || []).filter((node) => className(node) === LOADER);
  return loaders.length === 1 ? loaders[0] : null;
}

function setLoaderProfile(profile) {
  const loader = loaderNode();
  if (!loader) return { ok: false, message: "No unique H3 Studio Loader found." };
  for (const [name, value] of [["image_analyzer", profile.analyzer], ["prompt_writer", profile.writer]]) {
    const target = loader.widgets?.find((candidate) => candidate.name === name);
    if (!target) return { ok: false, message: `Loader has no ${name} control.` };
    target.value = value;
    target.callback?.(value, app.canvas, loader, [0, 0], {});
  }
  loader.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
  return { ok: true, message: `${profile.title} applied to H3 Studio Loader.` };
}

function migrateAutoDefaults() {
  for (const loader of app.graph?._nodes || []) {
    if (className(loader) !== LOADER) continue;
    const analyzer = loader.widgets?.find((candidate) => candidate.name === "image_analyzer");
    const writer = loader.widgets?.find((candidate) => candidate.name === "prompt_writer");
    if (String(analyzer?.value || "") === OLD_AUTO_ANALYZER) {
      analyzer.value = "Auto · Qwen3.5 4B";
      analyzer.callback?.(analyzer.value, app.canvas, loader, [0, 0], {});
    }
    if (OLD_AUTO_WRITERS.has(String(writer?.value || ""))) {
      writer.value = "Auto · Qwen3.5 4B writer";
      writer.callback?.(writer.value, app.canvas, loader, [0, 0], {});
    }
  }
}

function demoteOldRows(node) {
  const root = node?.__h3ModelSetup?.root;
  if (!root) return;
  for (const row of root.querySelectorAll(".h3ms-row")) {
    const text = String(row.textContent || "");
    if (!/Qwen3-VL\s+(4B|8B)/i.test(text) || /32B/i.test(text)) continue;
    row.classList.add("h3pm-legacy-base-row");
    const checkbox = row.querySelector('input[type="checkbox"]');
    if (checkbox?.checked) {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
}

function itemFor(state, asset) {
  const meta = state.metadata.get(asset.id) || {};
  return {
    ...meta,
    provider: meta.provider || "huggingface",
    filename: asset.filename,
    destination: asset.destination,
    download_url: meta.download_url || asset.url,
    source_url: asset.url,
  };
}

async function loadMetadata(node, force = false) {
  const state = stateFor(node);
  if (state.loading) return;
  state.loading = true;
  render(node);
  try {
    if (force) state.metadata.clear();
    const queue = ASSETS.filter((asset) => !state.metadata.has(asset.id));
    const worker = async () => {
      while (queue.length) {
        const asset = queue.shift();
        try {
          const data = await postJson("/uad/analyze-fast", { url: asset.url });
          const found = (data.assets || []).find((item) => item.filename === asset.filename) || (data.assets || [])[0];
          state.metadata.set(asset.id, found ? { ...found } : { error: "asset not found" });
        } catch (error) {
          state.metadata.set(asset.id, { error: String(error?.message || error) });
        }
      }
    };
    await Promise.all(Array.from({ length: 3 }, () => worker()));
    await verifyAll(node, false);
  } finally {
    state.loading = false;
    render(node);
  }
}

async function verifyAll(node, rerender = true) {
  const state = stateFor(node);
  const items = ASSETS.map((asset) => itemFor(state, asset));
  try {
    const result = await postJson("/uad/verify-fast", { items });
    (result.results || []).forEach((check, index) => state.verification.set(ASSETS[index].id, check));
  } catch (error) {
    console.warn("[H3 Studio] Prompt-model verification failed", error);
  }
  if (rerender) render(node);
}

async function detectUad(node) {
  const state = stateFor(node);
  try {
    const status = await jsonFetch("/uad/status", { cache: "no-store" });
    state.uadReady = Boolean(status?.capabilities?.install);
    state.uadVersion = String(status?.version || "");
  } catch {
    state.uadReady = false;
    state.uadVersion = "";
  }
  render(node);
  if (state.uadReady && !state.metadata.size) loadMetadata(node, false);
}

async function installProfile(node, profile) {
  const state = stateFor(node);
  if (!state.uadReady || state.busy) return;
  state.busy = true;
  render(node);
  try {
    if (!state.metadata.size) await loadMetadata(node, false);
    const ids = profile.assets;
    const items = ids.map((id) => itemFor(state, byId(id)));
    const mini = items.some((item) => item.destination === "h3studio_vlm");
    if (mini && state.uadVersion && /^2\.1\.[0-3](?:\D|$)/.test(state.uadVersion)) {
      throw new Error("MiniCPM needs UAD 2.1.4+ for the safe models/h3studio_vlm destination. Update UAD, restart ComfyUI, then retry.");
    }
    await postJson("/uad/install", { items, node_id: String(node.id), force: false });
    await verifyAll(node, false);
    const applied = setLoaderProfile(profile);
    state.lastLog = `${profile.title} installed. ${applied.message}`;
  } catch (error) {
    state.lastLog = `Install failed: ${String(error?.message || error)}`;
  } finally {
    state.busy = false;
    render(node);
  }
}

function profileReady(state, profile) {
  return profile.assets.every((id) => state.verification.get(id)?.ok);
}

function fileLine(state, id) {
  const asset = byId(id);
  const meta = state.metadata.get(id) || {};
  const check = state.verification.get(id);
  const size = bytesLabel(meta.size_bytes) || asset.approx;
  const status = check?.ok ? "✓" : check?.status === "missing" ? "○" : check ? "!" : "·";
  return `${status} ${asset.name} · ${size}`;
}

function render(node) {
  const root = node?.__h3ModelSetup?.root;
  if (!root?.isConnected) return;
  demoteOldRows(node);
  const state = stateFor(node);
  let panel = root.querySelector(":scope > .h3pm");
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "h3pm";
    const stats = root.querySelector(":scope > .h3ms-stats");
    stats?.insertAdjacentElement("afterend", panel);
    if (!panel.isConnected) root.prepend(panel);
  }
  const readyCount = ASSETS.filter((asset) => state.verification.get(asset.id)?.ok).length;
  panel.innerHTML = `<div class="h3pm-head"><div><div class="h3pm-title">Prompt preparation models</div><div class="h3pm-sub">This is separate from H3's 32B generation conditioner. New installs default to one shared Qwen3.5-4B. Qwen3-VL 4B/8B remain supported under Legacy.</div></div><div class="h3pm-state">${state.uadReady ? `UAD ${state.uadVersion || "connected"} · ${readyCount}/${ASSETS.length}` : "UAD unavailable"}</div></div>`;
  const profiles = document.createElement("div");
  profiles.className = "h3pm-profiles";
  for (const profile of PROFILES) {
    const card = document.createElement("article");
    card.className = `h3pm-profile ${profile.key === "recommended" ? "recommended" : ""}`;
    const ready = profileReady(state, profile);
    card.innerHTML = `<span class="h3pm-badge">${profile.badge}</span><div class="h3pm-profile-title">${profile.title}</div><div class="h3pm-profile-text">${profile.text}</div><div class="h3pm-files">${profile.assets.map((id) => fileLine(state, id)).join("<br>")}</div>`;
    const actions = document.createElement("div"); actions.className = "h3pm-actions";
    const install = document.createElement("button"); install.type = "button"; install.className = "h3pm-btn primary"; install.textContent = ready ? "Installed" : "Install profile"; install.disabled = ready || state.busy || !state.uadReady; install.onclick = () => installProfile(node, profile);
    const apply = document.createElement("button"); apply.type = "button"; apply.className = "h3pm-btn"; apply.textContent = "Use profile"; apply.disabled = state.busy; apply.onclick = () => { state.lastLog = setLoaderProfile(profile).message; render(node); };
    actions.append(install, apply); card.append(actions); profiles.append(card);
  }
  panel.append(profiles);

  const models = document.createElement("div"); models.className = "h3pm-models";
  for (const asset of ASSETS.filter((item) => item.family !== "legacy")) {
    const meta = state.metadata.get(asset.id) || {};
    const check = state.verification.get(asset.id);
    const row = document.createElement("div"); row.className = "h3pm-model-row";
    row.innerHTML = `<div><div class="h3pm-model-name">${asset.name}</div><div class="h3pm-model-meta">${asset.role} · ${bytesLabel(meta.size_bytes) || asset.approx} · models/${asset.destination}/${asset.filename}</div></div><div class="h3pm-model-status ${check?.ok ? "ok" : check && check.status !== "missing" ? "bad" : ""}">${check?.ok ? "verified" : check?.status || "not checked"}</div>`;
    models.append(row);
  }
  panel.append(models);
  const legacyReady = ASSETS.filter((asset) => asset.family === "legacy" && state.verification.get(asset.id)?.ok).length;
  const legacy = document.createElement("div"); legacy.className = "h3pm-legacy";
  legacy.innerHTML = `<b>Legacy · Qwen3-VL 4B / 8B</b> · ${legacyReady}/2 detected. Kept for compatibility and explicit old workflows; they are not broken, just no longer the recommended H3 Studio analysis stack.`;
  panel.append(legacy);
  const actions = document.createElement("div"); actions.className = "h3pm-actions";
  const refresh = document.createElement("button"); refresh.type = "button"; refresh.className = "h3pm-btn"; refresh.textContent = state.loading ? "Refreshing…" : "Refresh model status"; refresh.disabled = state.loading || state.busy || !state.uadReady; refresh.onclick = () => loadMetadata(node, true);
  actions.append(refresh); panel.append(actions);
  const log = document.createElement("div"); log.className = "h3pm-log"; log.textContent = state.lastLog || (state.loading ? "Reading provider metadata and verifying exact local paths…" : "Recommended: Qwen3.5-4B shared. MiniCPM is optional and requires llama.cpp at runtime."); panel.append(log);
}

function attach(node) {
  if (!node || className(node) !== SETUP || node.__h3PromptModelsAttached) return;
  node.__h3PromptModelsAttached = true;
  installStyles();
  const wait = () => {
    const root = node?.__h3ModelSetup?.root;
    if (!root) { setTimeout(wait, 50); return; }
    render(node);
    detectUad(node);
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        render(node);
      });
    });
    observer.observe(root, { childList: true, subtree: false });
    node.__h3PromptModelsObserver = observer;
    root.addEventListener("click", (event) => {
      if (event.target?.closest?.('[data-action="recommended"]')) setTimeout(() => demoteOldRows(node), 0);
    }, true);
  };
  setTimeout(wait, 0);
}

function patchWorkflowNotes() {
  for (const node of app.graph?._nodes || []) {
    if (className(node) !== "H3StudioWorkflowNote") continue;
    const text = node.widgets?.find((candidate) => candidate.name === "text");
    if (!text || typeof text.value !== "string") continue;
    let value = text.value;
    value = value.replace(
      /- \[Qwen3-VL 4B analyzer \+ writer\][^\n]*/g,
      "- **Recommended prompt prep:** Qwen3.5-4B shared analyzer + writer → `text_encoders/`\n- **Fast:** Qwen3.5-2B analyzer + Qwen3.5-4B writer → `text_encoders/`\n- **Fastest vision:** MiniCPM-V 4.6 GGUF + mmproj → `h3studio_vlm/`, with Qwen3.5-4B writer\n- **Legacy:** Qwen3-VL 4B / 8B remain compatible",
    );
    if (value !== text.value) {
      text.value = value;
      text.callback?.(value, app.canvas, node, [0, 0], {});
    }
  }
}

app.registerExtension({
  name: "H3Studio.PromptModelSetup",
  afterConfigureGraph() {
    migrateAutoDefaults();
    patchWorkflowNotes();
    for (const node of app.graph?._nodes || []) if (className(node) === SETUP) attach(node);
  },
  nodeCreated(node) {
    if (className(node) === SETUP) attach(node);
  },
});
