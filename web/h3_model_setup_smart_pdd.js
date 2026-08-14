import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const TARGET = "H3StudioModelSetup";
const PDD_SOURCE = "https://huggingface.co/Mamad8/MiniMaxH3_R2V-PDD-Turbo-LoRA-Mamad8";
const PDD_NODE_PAGE = "https://github.com/mamad8c/ComfyUI-MiniMaxH3-PDD-Mamad8";
const STYLE_ID = "h3-model-setup-smart-pdd-style";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const className = (node) => String(node?.comfyClass || node?.type || "");

function bytesLabel(bytes) {
  let value = Number(bytes) || 0;
  if (!value) return "size pending";
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
  if (!response.ok || data?.ok === false) {
    const error = new Error(data?.error || text || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function postJson(path, payload) {
  return jsonFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3ms{background:radial-gradient(circle at 100% 0,rgba(45,212,191,.07),transparent 28%),linear-gradient(180deg,#101817,#0b1111)!important}
    .h3ms-smart-transfer{display:none;margin:9px 0;padding:10px;border:1px solid rgba(45,212,191,.3);border-radius:9px;background:linear-gradient(135deg,rgba(45,212,191,.09),rgba(56,189,248,.035));box-shadow:inset 0 1px rgba(255,255,255,.025)}
    .h3ms-smart-transfer.active{display:block}.h3ms-smart-transfer.indeterminate .h3ms-smart-bar>div{width:34%!important;animation:h3-smart-slide 1.1s ease-in-out infinite}
    .h3ms-smart-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.h3ms-smart-title{font-weight:800;color:#ccfbf1}.h3ms-smart-pct{font:800 11px ui-monospace,SFMono-Regular,Consolas,monospace;color:#99f6e4}
    .h3ms-smart-file{margin-top:3px;font:9px ui-monospace,SFMono-Regular,Consolas,monospace;opacity:.78;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .h3ms-smart-bar{height:7px;margin-top:8px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden}.h3ms-smart-bar>div{height:100%;width:0;background:linear-gradient(90deg,#2dd4bf,#38bdf8);transition:width .16s ease}
    .h3ms-smart-meta{display:flex;justify-content:space-between;gap:8px;margin-top:5px;font-size:9px;opacity:.58}
    .h3ms-pdd-smart{margin-top:10px;padding:9px;border:1px solid rgba(244,114,182,.26);border-radius:9px;background:linear-gradient(135deg,rgba(244,114,182,.04),rgba(167,139,250,.025))}
    .h3ms-pdd-smart-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.h3ms-pdd-smart-title{font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.065em;color:#f5d0fe}.h3ms-pdd-smart-sub{font-size:9px;opacity:.58;margin-top:2px;max-width:560px}.h3ms-pdd-smart-status{font-size:9px;opacity:.62;white-space:nowrap}
    .h3ms-pdd-pairs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:8px}.h3ms-pdd-pair{padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(0,0,0,.15)}.h3ms-pdd-pair.ready{border-color:rgba(244,114,182,.23)}.h3ms-pdd-pair.verified{border-color:rgba(52,211,153,.34);background:rgba(52,211,153,.035)}
    .h3ms-pdd-pair-head{display:flex;justify-content:space-between;gap:7px;align-items:center}.h3ms-pdd-pair-name{font-weight:850}.h3ms-pdd-pair-note{font-size:8.5px;opacity:.54;margin-top:2px}.h3ms-pdd-file{margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.05)}.h3ms-pdd-file-name{font:8.5px ui-monospace,SFMono-Regular,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.h3ms-pdd-file-meta{font-size:8px;opacity:.55;margin-top:2px}
    .h3ms-pdd-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.h3ms-pdd-links{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;font-size:9px}.h3ms-pdd-links a{color:#7dd3fc}.h3ms-pdd-badge{padding:2px 6px;border:1px solid rgba(255,255,255,.1);border-radius:999px;font-size:8px}.h3ms-pdd-badge.ok{border-color:rgba(52,211,153,.3);color:#86efac}.h3ms-pdd-badge.warn{border-color:rgba(245,158,11,.3);color:#fde68a}
    @keyframes h3-smart-slide{0%{transform:translateX(-110%)}100%{transform:translateX(300%)}}@media(max-width:680px){.h3ms-pdd-pairs{grid-template-columns:1fr}}
  `;
  document.head.append(style);
}

function stepFrom(filename) {
  const name = String(filename || "").toLowerCase();
  return name.match(/(?:step|ckpt|iter|epoch)[_.-]?(600|900)(?=[_.-]|$)/)?.[1]
    || name.match(/(?:^|[_.-])(600|900)(?=[_.-]|$)/)?.[1]
    || "";
}

function roleFrom(item) {
  const text = `${item?.filename || ""} ${item?.remote_path || ""} ${item?.asset_type || ""} ${item?.destination || ""}`.toLowerCase().replace(/-/g, "_");
  if (item?.destination === "pdd_heads" || /\bheads?\b/.test(text) || text.includes("displacement")) return "head";
  if (item?.destination === "loras" || text.includes("lora") || text.includes("student") || text.includes("adapter") || /(?:^|_)s(?:_|\.|$)/.test(text)) return "lora";
  return "";
}

function normalize(item, step, role) {
  return {
    ...item,
    id: `pdd-${step}-${role}`,
    pdd_step: step,
    pdd_role: role,
    destination: role === "head" ? "pdd_heads" : "loras",
    source_url: item.source_url || PDD_SOURCE,
  };
}

function chooseCandidate(previous, candidate, role) {
  if (!previous) return candidate;
  const expectedDestination = role === "head" ? "pdd_heads" : "loras";
  const score = (item) => Number(item?.destination === expectedDestination) * 4
    + Number(String(item?.asset_type || "").toLowerCase().includes(role === "head" ? "head" : "lora")) * 2
    + Number(String(item?.filename || "").toLowerCase().includes("pdd"));
  return score(candidate) > score(previous) ? candidate : previous;
}

function makeTransfer(root) {
  let transfer = root.querySelector(".h3ms-smart-transfer");
  if (transfer) return transfer;
  transfer = document.createElement("div");
  transfer.className = "h3ms-smart-transfer";
  transfer.innerHTML = `<div class="h3ms-smart-head"><div class="h3ms-smart-title" data-smart-title>Preparing…</div><div class="h3ms-smart-pct" data-smart-pct>…</div></div><div class="h3ms-smart-file" data-smart-file>Waiting for provider</div><div class="h3ms-smart-bar"><div data-smart-bar></div></div><div class="h3ms-smart-meta"><span data-smart-left>provider metadata ready</span><span data-smart-right></span></div>`;
  const actions = root.querySelector(".h3ms-actions");
  actions?.insertAdjacentElement("afterend", transfer);
  return transfer;
}

function setTransfer(root, detail = {}) {
  const transfer = makeTransfer(root);
  transfer.classList.add("active");
  const progress = Number(detail.progress);
  const determinate = Number.isFinite(progress);
  transfer.classList.toggle("indeterminate", !determinate);
  const set = (selector, value) => { const el = transfer.querySelector(selector); if (el) el.textContent = value; };
  set("[data-smart-title]", detail.status || "Downloading…");
  set("[data-smart-pct]", determinate ? `${Math.round(Math.max(0, Math.min(100, progress)))}%` : "…");
  set("[data-smart-file]", detail.filename || "Preparing provider transfer");
  const downloaded = Number(detail.downloaded_bytes) || 0;
  const total = Number(detail.total_bytes) || 0;
  set("[data-smart-left]", total ? `${bytesLabel(downloaded)} / ${bytesLabel(total)}` : (downloaded ? bytesLabel(downloaded) : "provider metadata ready"));
  const fileIndex = Number(detail.file_index) || 0;
  const fileCount = Number(detail.file_count) || 0;
  set("[data-smart-right]", fileCount ? `file ${Math.max(1, fileIndex || 1)} / ${fileCount}` : "");
  const bar = transfer.querySelector("[data-smart-bar]");
  if (bar && determinate) bar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
}

async function pddNodeLoaded() {
  try {
    const info = await jsonFetch("/object_info");
    return Object.keys(info || {}).some((key) => /MiniMaxH3.*PDD|PDD.*MiniMaxH3/i.test(key));
  } catch {
    return false;
  }
}

async function discoverPairs() {
  const result = await postJson("/uad/analyze-fast", { url: PDD_SOURCE });
  const pairs = new Map([["600", {}], ["900", {}]]);
  for (const item of result.assets || []) {
    const step = stepFrom(item.filename || item.remote_path);
    const role = roleFrom(item);
    if (!step || !role || !pairs.has(step)) continue;
    const candidate = normalize(item, step, role);
    const pair = pairs.get(step);
    pair[role] = chooseCandidate(pair[role], candidate, role);
  }
  return pairs;
}

async function verifyPair(pair) {
  const items = [pair.lora, pair.head].filter(Boolean);
  if (items.length !== 2) return [];
  const result = await postJson("/uad/verify-fast", { items });
  return result.results || [];
}

function pairInstallItems(pair) {
  return [pair.lora, pair.head].map((item) => ({
    ...item,
    provider: item.provider || "huggingface",
    destination: item.pdd_role === "head" ? "pdd_heads" : "loras",
    filename: item.filename,
    download_url: item.download_url,
    source_url: item.source_url || PDD_SOURCE,
  }));
}

function renderPair(step, pair, checks = []) {
  const complete = Boolean(pair?.lora && pair?.head);
  const verified = complete && checks.length === 2 && checks.every((item) => item?.ok);
  const files = [pair?.lora, pair?.head].filter(Boolean);
  const bytes = files.reduce((sum, item) => sum + (Number(item.size_bytes) || 0), 0);
  const fileRows = files.length ? files.map((item, index) => {
    const check = checks[index];
    const status = !check ? "not checked" : check.ok ? "verified" : check.status || "missing";
    return `<div class="h3ms-pdd-file"><div class="h3ms-pdd-file-name" title="${item.filename}">${item.pdd_role === "head" ? "HEADS" : "LORA"} · ${item.filename}</div><div class="h3ms-pdd-file-meta">${bytesLabel(item.size_bytes)} · models/${item.pdd_role === "head" ? "pdd_heads" : "loras"} · ${status}</div></div>`;
  }).join("") : `<div class="h3ms-pdd-pair-note">No compatible artifacts discovered.</div>`;
  return `<div class="h3ms-pdd-pair ${complete ? "ready" : ""} ${verified ? "verified" : ""}" data-pdd-card="${step}"><div class="h3ms-pdd-pair-head"><div><div class="h3ms-pdd-pair-name">PDD step ${step}</div><div class="h3ms-pdd-pair-note">${complete ? `${verified ? "2/2 verified" : "matched LoRA + heads"} · ${bytesLabel(bytes)}` : "pair incomplete"}</div></div><span class="h3ms-pdd-badge ${verified ? "ok" : complete ? "warn" : ""}">${verified ? "ready" : complete ? "available" : "incomplete"}</span></div>${fileRows}<div class="h3ms-pdd-actions"><button class="h3ms-btn h3ms-primary" data-pdd-install="${step}" ${complete && !verified ? "" : "disabled"}>${verified ? "Installed" : "Install pair"}</button><button class="h3ms-btn" data-pdd-repair="${step}" ${complete ? "" : "disabled"}>Repair pair</button><button class="h3ms-btn" data-pdd-verify="${step}" ${complete ? "" : "disabled"}>Verify</button></div></div>`;
}

async function enhance(node) {
  if (!node || className(node) !== TARGET || node.__h3SmartPddEnhanced) return;
  for (let attempt = 0; attempt < 40 && !node.__h3ModelSetup?.root; attempt += 1) await sleep(50);
  const setup = node.__h3ModelSetup;
  const root = setup?.root;
  if (!root) return;
  node.__h3SmartPddEnhanced = true;
  injectStyles();
  makeTransfer(root);

  const state = { pairs: new Map([["600", {}], ["900", {}]]), checks: new Map(), uad: null, nodeLoaded: false, busy: false };
  node.__h3SmartPdd = { state };

  function oldPddCard() {
    return [...root.querySelectorAll(".h3ms-card")].find((card) => card.textContent?.includes("PDD · optional REF2VA acceleration"));
  }

  function mount() {
    oldPddCard()?.remove();
    let section = root.querySelector(".h3ms-pdd-smart");
    if (!section) {
      section = document.createElement("section");
      section.className = "h3ms-pdd-smart";
      const log = root.querySelector("[data-log]");
      log?.insertAdjacentElement("beforebegin", section);
    }
    const pddSupported = Boolean(state.uad?.capabilities?.pdd_heads);
    section.innerHTML = `<div class="h3ms-pdd-smart-head"><div><div class="h3ms-pdd-smart-title">PDD · smart REF2VA acceleration</div><div class="h3ms-pdd-smart-sub">Current Mamad8 provider metadata is scanned automatically. Step600 and step900 are treated as matched student-LoRA + heads pairs; heads are protected in models/pdd_heads and LoRAs in models/loras.</div></div><div class="h3ms-pdd-smart-status">${state.busy ? "working…" : pddSupported ? "UAD smart pair mode" : "UAD update required"}</div></div>${pddSupported ? `<div class="h3ms-pdd-pairs">${renderPair("600", state.pairs.get("600"), state.checks.get("600") || [])}${renderPair("900", state.pairs.get("900"), state.checks.get("900") || [])}</div>` : `<div class="h3ms-note">Update Universal Asset Downloader: this backend does not advertise safe pdd_heads routing yet.</div>`}<div class="h3ms-pdd-links"><span class="h3ms-pdd-badge ${state.nodeLoaded ? "ok" : "warn"}">${state.nodeLoaded ? "PDD node loaded" : "PDD node missing"}</span><a href="${PDD_SOURCE}" target="_blank" rel="noopener noreferrer">Mamad8 weights ↗</a><a href="${PDD_NODE_PAGE}" target="_blank" rel="noopener noreferrer">PDD custom node ↗</a>${pddSupported ? '<button class="h3ms-btn" data-pdd-refresh>Refresh PDD</button>' : ''}</div>`;

    section.querySelector("[data-pdd-refresh]")?.addEventListener("click", () => refresh(true));
    section.querySelectorAll("[data-pdd-verify]").forEach((button) => button.addEventListener("click", () => verify(button.dataset.pddVerify, true)));
    section.querySelectorAll("[data-pdd-install]").forEach((button) => button.addEventListener("click", () => install(button.dataset.pddInstall, false)));
    section.querySelectorAll("[data-pdd-repair]").forEach((button) => button.addEventListener("click", () => install(button.dataset.pddRepair, true)));
  }

  const log = (text) => { const el = root.querySelector("[data-log]"); if (el) el.textContent = text; };

  async function verify(step, announce = false) {
    const pair = state.pairs.get(step) || {};
    if (!(pair.lora && pair.head)) return [];
    try {
      const checks = await verifyPair(pair);
      state.checks.set(step, checks);
      if (announce) log(`PDD step ${step}: ${checks.filter((item) => item.ok).length}/2 files verified.`);
      mount();
      return checks;
    } catch (error) {
      if (announce) log(`PDD step ${step} verification failed: ${error.message}`);
      return [];
    }
  }

  async function refresh(announce = false) {
    if (state.busy || !state.uad?.capabilities?.pdd_heads) return;
    state.busy = true;
    mount();
    if (announce) log("Discovering current Mamad8 PDD step600/step900 artifacts from provider metadata…");
    try {
      state.pairs = await discoverPairs();
      await Promise.all([verify("600", false), verify("900", false)]);
      if (announce) {
        const complete = [...state.pairs.entries()].filter(([, pair]) => pair.lora && pair.head).map(([step]) => step);
        log(complete.length ? `PDD discovery complete. Matched pair(s): step ${complete.join(", step ")}.` : "PDD metadata loaded, but no complete step600/step900 pair could be identified safely.");
      }
    } catch (error) {
      log(`PDD discovery failed: ${error.message}`);
    } finally {
      state.busy = false;
      mount();
    }
  }

  async function install(step, force) {
    const pair = state.pairs.get(step) || {};
    if (!(pair.lora && pair.head) || state.busy) return;
    if (force && !window.confirm(`Repair/redownload the matched PDD step ${step} LoRA + heads pair?`)) return;
    state.busy = true;
    mount();
    setTransfer(root, { status: `${force ? "Repairing" : "Installing"} PDD step ${step} pair…`, filename: pair.lora.filename });
    log(`${force ? "Repairing" : "Installing"} PDD step ${step} through Universal Asset Downloader…`);
    try {
      await postJson("/uad/install", { items: pairInstallItems(pair), node_id: String(node.id), force });
      setTransfer(root, { status: "Install complete · verifying", progress: 100, file_index: 2, file_count: 2 });
      await verify(step, true);
    } catch (error) {
      setTransfer(root, { status: `Install failed: ${error.message}`, progress: 0 });
      log(`PDD step ${step} install failed: ${error.message}`);
    } finally {
      state.busy = false;
      mount();
      setTimeout(() => root.querySelector(".h3ms-smart-transfer")?.classList.remove("active"), 1800);
    }
  }

  try {
    state.uad = await jsonFetch("/uad/status");
  } catch {
    state.uad = null;
  }
  state.nodeLoaded = await pddNodeLoaded();
  mount();

  // The base Model Setup renderer replaces root.innerHTML during metadata,
  // verification and selection updates. Remount only our direct-child UI when
  // that happens so the PDD panel and rich transfer card never disappear.
  let remountScheduled = false;
  const observer = new MutationObserver(() => {
    if (remountScheduled) return;
    remountScheduled = true;
    queueMicrotask(() => {
      remountScheduled = false;
      if (!node.__h3ModelSetup?.root) return;
      makeTransfer(root);
      mount();
    });
  });
  observer.observe(root, { childList: true });
  node.__h3SmartPddObserver = observer;

  if (state.uad?.capabilities?.pdd_heads) refresh(false);
}

api.addEventListener("uad-progress", ({ detail }) => {
  const node = app.graph?.getNodeById?.(Number(detail?.node)) || app.graph?.getNodeById?.(detail?.node);
  const root = node?.__h3ModelSetup?.root;
  if (!root) return;
  setTransfer(root, detail || {});
  const log = root.querySelector("[data-log]");
  if (log && detail?.status) log.textContent = detail.status;
});

app.registerExtension({
  name: "H3Studio.ModelSetupSmartPDD",
  afterConfigureGraph() {
    setTimeout(() => {
      const node = (app.graph?._nodes || []).find((candidate) => className(candidate) === TARGET);
      if (node) enhance(node);
    }, 100);
  },
  async nodeCreated(node) {
    if (className(node) === TARGET) setTimeout(() => enhance(node), 50);
  },
});
