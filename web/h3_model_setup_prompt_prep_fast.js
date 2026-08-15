import { app } from "../../scripts/app.js";

const TARGET = "H3StudioModelSetup";
const CARD_CLASS = "h3ms-prompt-fast";
const STYLE_ID = "h3ms-prompt-fast-style";

const ASSETS = [
  {
    id: "qwen35native4",
    label: "Qwen3.5 4B BF16 · native fallback",
    filename: "qwen3.5_4b_bf16.safetensors",
    remoteFilename: "qwen3.5_4b_bf16.safetensors",
    destination: "text_encoders",
    url: "https://huggingface.co/Comfy-Org/Qwen3.5/resolve/main/text_encoders/qwen3.5_4b_bf16.safetensors?download=true",
  },
  {
    id: "qwen35gguf4",
    label: "Qwen3.5 4B GGUF · UD-Q4_K_XL",
    filename: "qwen3.5_4b_ud_q4_k_xl.gguf",
    remoteFilename: "Qwen3.5-4B-UD-Q4_K_XL.gguf",
    destination: "h3studio_vlm",
    url: "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-UD-Q4_K_XL.gguf?download=true",
  },
  {
    id: "qwen35mmproj4",
    label: "Qwen3.5 4B vision projector · BF16",
    filename: "qwen3.5_4b_mmproj_bf16.gguf",
    remoteFilename: "mmproj-BF16.gguf",
    destination: "h3studio_vlm",
    url: "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/mmproj-BF16.gguf?download=true",
  },
];

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${CARD_CLASS}{margin-top:10px;padding:10px;border:1px solid rgba(45,212,191,.25);border-radius:9px;background:linear-gradient(145deg,rgba(45,212,191,.055),rgba(0,0,0,.08));font:11px/1.45 ui-sans-serif,system-ui;color:#e8eeef}
    .${CARD_CLASS} *{box-sizing:border-box}.h3pf-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.h3pf-title{font-weight:850;color:#bdf8ed}.h3pf-sub{margin-top:2px;opacity:.63;font-size:9px;max-width:590px}.h3pf-badge{flex:none;padding:3px 7px;border:1px solid rgba(255,255,255,.12);border-radius:999px;font-size:8.5px}.h3pf-badge.ok{border-color:rgba(52,211,153,.45);color:#a7f3d0}.h3pf-badge.warn{border-color:rgba(245,158,11,.45);color:#fde68a}
    .h3pf-assets{margin-top:8px;border-top:1px solid rgba(255,255,255,.07)}.h3pf-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:7px 2px;border-bottom:1px solid rgba(255,255,255,.055)}.h3pf-name{font-weight:680}.h3pf-meta{margin-top:2px;font:8.5px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace;opacity:.52;overflow-wrap:anywhere}.h3pf-status{font-size:9px;white-space:nowrap;align-self:center}.h3pf-status.ok{color:#86efac}.h3pf-status.bad{color:#fca5a5}.h3pf-status.wait{opacity:.52}
    .h3pf-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.h3pf-btn{padding:6px 8px;border:1px solid rgba(255,255,255,.13);border-radius:7px;background:rgba(255,255,255,.07);color:inherit;cursor:pointer;font-weight:680}.h3pf-btn:hover{background:rgba(255,255,255,.12)}.h3pf-btn.primary{border-color:rgba(45,212,191,.42);background:rgba(45,212,191,.13)}.h3pf-btn:disabled{opacity:.38;cursor:not-allowed}.h3pf-log{margin-top:7px;padding:6px 7px;border:1px solid rgba(255,255,255,.07);border-radius:6px;background:rgba(0,0,0,.17);font-size:9px;white-space:pre-wrap;overflow-wrap:anywhere}.h3pf-note{margin-top:6px;font-size:8.8px;opacity:.58}
  `;
  document.head.append(style);
}

async function jsonFetch(path, options = {}) {
  const response = await fetch(path, options);
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

async function postJson(path, payload = {}) {
  return jsonFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}

function itemFrom(asset, meta = {}) {
  return {
    ...meta,
    id: asset.id,
    provider: meta.provider || "huggingface",
    filename: asset.filename,
    destination: asset.destination,
    download_url: meta.download_url || asset.url,
    source_url: asset.url,
  };
}

async function metadataFor(asset) {
  const result = await postJson("/uad/analyze-fast", { url: asset.url });
  const found = (result.assets || []).find((item) => item.filename === asset.remoteFilename) || (result.assets || [])[0];
  return found || {};
}

function stateFor(node) {
  node.__h3PromptFastState ||= {
    runtime: null,
    uad: null,
    metadata: new Map(),
    verification: new Map(),
    busy: false,
    log: "Checking fast prompt-prep runtime…",
  };
  return node.__h3PromptFastState;
}

function rowStatus(state, asset) {
  const check = state.verification.get(asset.id);
  if (!check) return ["wait", "not checked"];
  if (check.ok) return ["ok", "verified"];
  if (check.status === "missing") return ["wait", "missing"];
  return ["bad", check.status || "attention"];
}

function render(node) {
  const setup = node.__h3ModelSetup;
  const root = setup?.root;
  if (!root?.isConnected) return;
  injectStyles();
  const state = stateFor(node);
  let card = root.querySelector(`.${CARD_CLASS}`);
  if (!card) {
    card = document.createElement("section");
    card.className = CARD_CLASS;
    const anchor = root.querySelector(".h3ms-stats") || root.querySelector(".h3ms-actions") || root.querySelector(".h3ms-head");
    if (anchor?.parentNode) anchor.insertAdjacentElement("afterend", card); else root.prepend(card);
  }
  const runtime = state.runtime?.runtime || state.runtime || {};
  const runtimeReady = Boolean(runtime.available);
  const autoReady = Boolean(runtime.ready);
  const badge = autoReady ? "GGUF Auto ready" : runtimeReady ? "runtime ready · models missing" : "llama.cpp missing";
  const badgeClass = autoReady ? "ok" : "warn";
  const rows = ASSETS.map((asset) => {
    const meta = state.metadata.get(asset.id) || {};
    const [cls, text] = rowStatus(state, asset);
    const size = meta.size_label || "size pending";
    return `<div class="h3pf-row"><div><div class="h3pf-name">${asset.label}</div><div class="h3pf-meta">${size} · models/${asset.destination}/${asset.filename}</div></div><div class="h3pf-status ${cls}">${text}</div></div>`;
  }).join("");
  card.innerHTML = `
    <div class="h3pf-head"><div><div class="h3pf-title">Prompt prep · Qwen3.5 speed pack</div><div class="h3pf-sub">Auto prefers Qwen3.5-4B UD-Q4_K_XL through llama.cpp when the runtime + model/mmproj pair are ready, then falls back to native Qwen3.5-4B. The helper is released before H3 conditioning.</div></div><div class="h3pf-badge ${badgeClass}">${badge}</div></div>
    <div class="h3pf-assets">${rows}</div>
    <div class="h3pf-actions">
      <button class="h3pf-btn" data-h3pf="check" ${state.busy?"disabled":""}>Verify speed pack</button>
      <button class="h3pf-btn primary" data-h3pf="models" ${state.busy?"disabled":""}>Install missing models</button>
      <button class="h3pf-btn" data-h3pf="runtime" ${state.busy?"disabled":""}>${runtimeReady?"Repair/update fast runtime":"Install fast runtime"}</button>
      <button class="h3pf-btn" data-h3pf="refresh" ${state.busy?"disabled":""}>Refresh</button>
    </div>
    <div class="h3pf-log">${state.log}</div>
    <div class="h3pf-note">GGUF pair: Qwen3.5-4B Q4_K_XL + its matching BF16 mmproj. Supported Linux/Windows NVIDIA machines use a private prebuilt llama.cpp CUDA runtime; no source compile. The helper is stopped before H3 conditioning so H3 gets the VRAM back.</div>`;
  card.querySelector('[data-h3pf="check"]')?.addEventListener("click", () => verify(node));
  card.querySelector('[data-h3pf="models"]')?.addEventListener("click", () => installModels(node));
  card.querySelector('[data-h3pf="runtime"]')?.addEventListener("click", () => installRuntime(node));
  card.querySelector('[data-h3pf="refresh"]')?.addEventListener("click", () => refresh(node));
}

async function refresh(node) {
  const state = stateFor(node);
  try {
    state.runtime = await jsonFetch("/h3studio/dependencies/llama/status", { cache: "no-store" });
  } catch (error) {
    state.runtime = null;
    state.log = `llama.cpp status unavailable: ${error.message}`;
  }
  try { state.uad = await jsonFetch("/uad/status", { cache: "no-store" }); } catch { state.uad = null; }
  render(node);
}

async function ensureMetadata(node) {
  const state = stateFor(node);
  if (!state.uad?.capabilities?.install) throw new Error("Current Universal Asset Downloader is required for the speed pack.");
  for (const asset of ASSETS) {
    if (!state.metadata.has(asset.id)) state.metadata.set(asset.id, await metadataFor(asset));
  }
}

async function verify(node) {
  const state = stateFor(node);
  state.busy = true; state.log = "Reading exact provider metadata and verifying prompt-prep files…"; render(node);
  try {
    await refresh(node);
    await ensureMetadata(node);
    const items = ASSETS.map((asset) => itemFrom(asset, state.metadata.get(asset.id)));
    const result = await postJson("/uad/verify-fast", { items });
    (result.results || []).forEach((check, index) => state.verification.set(ASSETS[index].id, check));
    const good = [...state.verification.values()].filter((item) => item?.ok).length;
    state.log = `${good}/${ASSETS.length} speed-pack files verified. ${state.runtime?.runtime?.available ? "llama.cpp detected." : "llama.cpp runtime still needs setup."}`;
  } catch (error) {
    state.log = `Speed-pack verification failed: ${error.message}`;
  } finally {
    state.busy = false; render(node);
  }
}

async function installModels(node) {
  const state = stateFor(node);
  state.busy = true; state.log = "Preparing Qwen3.5 speed-pack download…"; render(node);
  try {
    await refresh(node);
    await ensureMetadata(node);
    const items = ASSETS.map((asset) => itemFrom(asset, state.metadata.get(asset.id)));
    const verifyResult = await postJson("/uad/verify-fast", { items });
    const checks = verifyResult.results || [];
    checks.forEach((check, index) => state.verification.set(ASSETS[index].id, check));
    const missing = items.filter((_, index) => !checks[index]?.ok);
    if (!missing.length) {
      state.log = "Qwen3.5 speed-pack model files are already verified.";
    } else {
      state.log = `Downloading ${missing.length} missing prompt-prep file(s) with UAD + hf_xet…`;
      render(node);
      await postJson("/uad/install", { items: missing, node_id: String(node.id), force: false });
      state.log = "Model install finished. Re-verifying…";
      await verify(node);
      return;
    }
  } catch (error) {
    const hint = /unsupported destination/i.test(error.message) ? " Update Universal Asset Downloader to the current version with h3studio_vlm support." : "";
    state.log = `Model install failed: ${error.message}.${hint}`;
  } finally {
    state.busy = false; render(node);
  }
}

async function installRuntime(node) {
  const state = stateFor(node);
  if (!window.confirm("Install H3 Studio's private prebuilt llama.cpp GPU runtime? Supported Linux/Windows NVIDIA systems download a pinned CUDA package; this does not compile llama.cpp or modify your ComfyUI Python environment.")) return;
  state.busy = true;
  state.log = "Installing private prebuilt llama.cpp CUDA runtime… downloading and verifying the pinned package, then running a multimodal smoke test.";
  render(node);
  try {
    const result = await postJson("/h3studio/dependencies/llama/install", { mode: "prebuilt" });
    state.runtime = { runtime: result.runtime, ...result };
    const backend = result.cuda ? `CUDA ${result.cuda_version || ""}${result.cuda_arch ? ` · SM${result.cuda_arch}` : ""}`.trim() : "GPU runtime";
    state.log = `llama.cpp fast runtime ready · ${result.provider || "prebuilt"} · ${backend}. No ComfyUI restart required.`;
  } catch (error) {
    state.log = `Fast runtime install failed: ${error.message}`;
  } finally {
    state.busy = false; await refresh(node); render(node);
  }
}

function install(node) {
  if (!node || node.comfyClass !== TARGET || node.__h3PromptFastInstalled) return;
  node.__h3PromptFastInstalled = true;
  let attempts = 0;
  const wait = () => {
    const root = node.__h3ModelSetup?.root;
    if (!root?.isConnected) {
      if (++attempts < 800) setTimeout(wait, 25);
      return;
    }
    render(node);
    refresh(node);
    const observer = new MutationObserver(() => {
      if (!root.querySelector(`.${CARD_CLASS}`)) requestAnimationFrame(() => render(node));
    });
    observer.observe(root, { childList: true });
    node.__h3PromptFastObserver = observer;
  };
  setTimeout(wait, 0);
}

app.registerExtension({
  name: "H3Studio.PromptPrepFastSetup",
  nodeCreated(node) { if (node?.comfyClass === TARGET) install(node); },
  afterConfigureGraph() {
    setTimeout(() => {
      for (const node of app.graph?._nodes || []) if (node?.comfyClass === TARGET) install(node);
    }, 100);
  },
});