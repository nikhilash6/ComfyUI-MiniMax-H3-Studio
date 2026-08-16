import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { renderPanel } from "./js/studio_extension.js";
import { isNodeDownstream } from "./js/core/final_output.js";
import { openImageLightbox } from "./js/core/lightbox.js";

const TARGET = "H3StudioDirector";
const HISTORY_KEY = "h3studio-history-v2";
const HISTORY_BACKUP_KEY = "h3studio-history-v18-unbounded";
const HISTORY_HIDDEN_KEY = "h3studio-history-v18-hidden";

function safeParse(value, fallback = []) {
  try { return JSON.parse(value || "null") ?? fallback; } catch { return fallback; }
}

function historyIdentity(item) {
  if (item?.id) return `id:${item.id}`;
  return `${item?.state?.generation?.seed ?? ""}|${String(item?.state?.prompt || "").replace(/\s+/g, " ").trim().slice(0, 120)}|${item?.url || item?.image || ""}`;
}

function mergeHistory(primary, backup) {
  const seen = new Set();
  const result = [];
  for (const item of [...primary, ...backup]) {
    const key = historyIdentity(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result.sort((a, b) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0));
}

function installHistoryPatch() {
  if (Storage.prototype.__h3sV18) return;
  Storage.prototype.__h3sV18 = true;
  const get = Storage.prototype.getItem;
  const set = Storage.prototype.setItem;
  const remove = Storage.prototype.removeItem;
  const seeded = mergeHistory(
    safeParse(get.call(localStorage, HISTORY_KEY), []),
    safeParse(get.call(localStorage, HISTORY_BACKUP_KEY), []),
  );
  set.call(localStorage, HISTORY_BACKUP_KEY, JSON.stringify(seeded));

  Storage.prototype.getItem = function h3studioGetItem(key) {
    if (this !== localStorage || key !== HISTORY_KEY) return get.call(this, key);
    if (get.call(localStorage, HISTORY_HIDDEN_KEY) === "1") return "[]";
    return get.call(localStorage, HISTORY_BACKUP_KEY) || get.call(localStorage, HISTORY_KEY) || "[]";
  };

  Storage.prototype.setItem = function h3studioSetItem(key, value) {
    if (this !== localStorage || key !== HISTORY_KEY) return set.call(this, key, value);
    const next = safeParse(value, []);
    if (Array.isArray(next) && !next.length) {
      set.call(localStorage, HISTORY_HIDDEN_KEY, "1");
      return set.call(localStorage, HISTORY_KEY, "[]");
    }
    const merged = mergeHistory(
      Array.isArray(next) ? next : [],
      safeParse(get.call(localStorage, HISTORY_BACKUP_KEY), []),
    );
    set.call(localStorage, HISTORY_BACKUP_KEY, JSON.stringify(merged));
    remove.call(localStorage, HISTORY_HIDDEN_KEY);
    return set.call(localStorage, HISTORY_KEY, JSON.stringify(merged));
  };
}

function installStyles() {
  if (document.getElementById("h3s-v18-style")) return;
  const style = document.createElement("style");
  style.id = "h3s-v18-style";
  style.textContent = `
    .h3s-reference-card{grid-template-columns:104px minmax(0,1fr)!important;gap:12px!important;overflow:hidden!important}
    .h3s-reference-thumb{width:104px!important;height:104px!important;min-height:104px!important;max-height:104px!important;aspect-ratio:1!important;border:1px solid #2b3237!important;border-radius:8px!important;background:#0d1012!important;overflow:hidden!important}
    .h3s-reference-thumb img{width:100%!important;height:100%!important;object-fit:cover!important;image-rendering:auto!important}
    .h3s-reference-body{min-width:0!important;overflow:hidden!important}
    .h3s-demo-card{content-visibility:auto;contain-intrinsic-size:216px 168px}
    .h3s-demo-thumb-box{position:relative}
    .h3s-strip-expand{position:absolute;z-index:6;right:6px;top:6px;display:grid;place-items:center;width:21px;height:21px;padding:0;border:0;border-radius:5px;background:rgba(8,11,13,.46);backdrop-filter:blur(5px);color:rgba(238,242,244,.86);cursor:zoom-in;opacity:0;transform:translateY(-2px);transition:opacity .14s ease,transform .14s ease,background .14s ease}
    .h3s-demo-card:hover .h3s-strip-expand,.h3s-strip-expand:focus-visible{opacity:1;transform:translateY(0)}
    .h3s-strip-expand:hover{background:rgba(18,23,27,.78);color:#fff}
    .h3s-history-restore-btn{border-color:#36574d!important;color:#9fd8c8!important}
    .h3s-shelf-tab:nth-child(2)::before{content:'◷';margin-right:5px;color:#a6b8c4}
    .h3s-output-heading-icon{display:inline-grid;place-items:center;width:20px;height:20px;margin-right:7px;border:1px solid #344047;border-radius:6px;background:#182026;color:#b9cbd6}
    .h3s-output-polished .h3s-output-stage{border-color:#323b41!important;border-radius:10px!important;background:#080a0c!important}
    .h3s-run-timings{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
    .h3s-run-time{min-width:0;padding:7px 9px;border:1px solid #293138;border-radius:7px;background:#14191d}
    .h3s-run-time b{display:block;color:#78858e;font-size:7.5px;text-transform:uppercase;letter-spacing:.075em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .h3s-run-time span{display:block;margin-top:2px;color:#e3e9ed;font-size:10.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .h3rt-presets{grid-template-columns:repeat(2,minmax(0,1fr))!important}
    .h3rt-preset{display:grid!important;grid-template-columns:25px minmax(0,1fr)!important;grid-template-rows:auto auto!important;column-gap:8px!important;align-items:center!important;min-height:54px!important;background:linear-gradient(145deg,#171c20,#13171a)!important}
    .h3rt-preset::before{grid-row:1/3;display:grid;place-items:center;width:25px;height:25px;border:1px solid #313a40;border-radius:7px;background:#1d2429;color:#a9bbc6}
    .h3rt-preset[data-runtime-preset='auto']::before{content:'A'}.h3rt-preset[data-runtime-preset='fast']::before{content:'↯'}.h3rt-preset[data-runtime-preset='quality']::before{content:'◇'}.h3rt-preset[data-runtime-preset='low_vram']::before{content:'▽'}.h3rt-preset[data-runtime-preset='og_current']::before{content:'○'}.h3rt-preset[data-runtime-preset='extreme_low_vram']::before{content:'≋'}
    .h3rt-preset-name,.h3rt-preset-sub{grid-column:2!important}.h3rt-preset.is-active{border-color:#5d747e!important;background:linear-gradient(145deg,#202a2f,#182025)!important}
    .h3s-share-section .h3s-section-title::before{content:'⌘';display:inline-grid;place-items:center;width:18px;height:18px;margin-right:6px;border:1px solid #313a40;border-radius:5px;background:#182026;color:#adbec8}
    .h3s-share-button{position:relative!important;padding-left:29px!important;background:linear-gradient(145deg,#181d21,#14181b)!important}.h3s-share-button::before{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:#94a9b4}.h3s-share-button:nth-child(1)::before{content:'⧉'}.h3s-share-button:nth-child(2)::before{content:'</>'}.h3s-share-button:nth-child(3)::before{content:'↓'}.h3s-share-button:nth-child(4)::before{content:'≡'}
    #h3studio-lora-picker{display:flex!important;flex-direction:column!important;min-height:min(250px,calc(100vh - 20px))!important;height:auto!important;max-height:min(420px,calc(100vh - 20px))!important}
    #h3studio-lora-picker .h3lp-head{flex:0 0 auto!important}
    #h3studio-lora-picker .h3lp-list{display:block!important;flex:1 1 auto!important;min-height:170px!important;max-height:330px!important;overflow-y:auto!important;overflow-x:hidden!important}
    #h3studio-lora-picker .h3lp-option{display:grid!important;visibility:visible!important;min-height:35px!important}
    @media(max-width:560px){.h3s-run-timings{grid-template-columns:1fr 1fr}.h3s-run-time:last-child{grid-column:1/-1}}
  `;
  document.head.append(style);
}

const directors = () => app.graph?._nodes?.filter((node) => node?.comfyClass === TARGET) || [];

function duration(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(Math.round(seconds - minutes * 60)).padStart(2, "0")}s`;
}

function stepSpeed(timing) {
  const seconds = Number(timing?.samplingSeconds);
  const steps = Number(timing?.samplingSteps);
  if (!Number.isFinite(seconds) || !Number.isFinite(steps) || steps <= 0) return "—";
  return `${(seconds / steps).toFixed(2)}s/step`;
}

function outputSection(node) {
  const panel = node?.__h3studioPanel;
  if (!panel?.isConnected) return;
  const title = [...panel.querySelectorAll(".h3s-section-title")]
    .find((candidate) => candidate.textContent.trim().endsWith("Generated output"));
  const section = title?.closest(".h3s-section");
  if (!section) return;
  section.classList.add("h3s-output-polished");
  if (!title.querySelector(".h3s-output-heading-icon")) {
    const icon = document.createElement("span");
    icon.className = "h3s-output-heading-icon";
    icon.textContent = "◈";
    title.prepend(icon);
  }
  const result = section.querySelector(".h3s-final-result");
  if (!result) return;
  let timings = result.querySelector(".h3s-run-timings");
  if (!timings) {
    timings = document.createElement("div");
    timings.className = "h3s-run-timings";
    for (const label of ["Total generation", "Sampling", "Average step"]) {
      const card = document.createElement("div");
      card.className = "h3s-run-time";
      const key = document.createElement("b");
      const value = document.createElement("span");
      key.textContent = label;
      value.textContent = "—";
      card.append(key, value);
      timings.append(card);
    }
    result.append(timings);
  }
  const timing = node.__h3studioRunTiming || {};
  const values = [duration(timing.totalSeconds), duration(timing.samplingSeconds), stepSpeed(timing)];
  timings.querySelectorAll(".h3s-run-time span").forEach((element, index) => {
    element.textContent = values[index] || "—";
  });
}

function polishStrip() {
  for (const tab of document.querySelectorAll(".h3s-shelf-tab:nth-child(2)")) {
    if (tab.firstChild?.nodeType === Node.TEXT_NODE) {
      const clean = tab.firstChild.textContent.replace(/^\s*⏱\s*/, "");
      if (clean !== tab.firstChild.textContent) tab.firstChild.textContent = clean;
    }
  }
  for (const box of document.querySelectorAll(".h3s-demo-thumb-box")) {
    if (box.querySelector(".h3s-strip-expand")) continue;
    const image = box.querySelector("img.h3s-demo-thumb");
    if (!image) continue;
    const expand = document.createElement("button");
    expand.type = "button";
    expand.className = "h3s-strip-expand";
    expand.textContent = "⤢";
    expand.title = "Expand image";
    expand.setAttribute("aria-label", "Expand image");
    expand.addEventListener("pointerdown", (event) => { event.preventDefault(); event.stopPropagation(); });
    expand.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      openImageLightbox(image.currentSrc || image.src, image.alt || "H3 Studio image");
    });
    box.append(expand);
  }
  if (localStorage.getItem(HISTORY_HIDDEN_KEY) !== "1") return;
  for (const shelf of document.querySelectorAll(".h3s-demos-shelf")) {
    const tabs = shelf.querySelectorAll(".h3s-shelf-tab");
    const controls = shelf.querySelector(".h3s-demos-filter-pills");
    if (!tabs[1]?.classList.contains("is-active") || !controls || controls.querySelector(".h3s-history-restore-btn")) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "h3s-history-clear-btn h3s-history-restore-btn";
    button.textContent = "Reload history";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      localStorage.removeItem(HISTORY_HIDDEN_KEY);
      localStorage.setItem(HISTORY_KEY, localStorage.getItem(HISTORY_BACKUP_KEY) || "[]");
      tabs[1].click();
    });
    controls.append(button);
  }
}

function restoreSavedResult(node) {
  if (!node || node.comfyClass !== TARGET || node.__h3studioResult?.prompt) return;
  const saved = node.properties?.h3studio_saved_result;
  const prompt = String(saved?.compiled_prompt || saved?.actual_h3_prompt || "").trim();
  if (!prompt) return;
  node.__h3studioResult = {
    prompt,
    enhancedPrompt: String(saved.enhanced_prompt || saved.actual_h3_prompt || prompt),
    labels: Array.isArray(saved.reference_labels) ? saved.reference_labels : [],
    roles: [],
    retentions: [],
    descriptions: Array.isArray(saved.reference_descriptions) ? saved.reference_descriptions : [],
    modelStatus: "Restored from saved H3 Studio PNG metadata",
    diagnostics: "Saved enhanced/final prompt restored from PNG workflow metadata.",
  };
  queueMicrotask(() => renderPanel(node));
}

let executionStartedAt = 0;
const samplingByPreviewNode = new Map();
let fallbackSampling = null;

function recordPreviewTiming(detail) {
  if (!detail || detail.reset || detail.error) return;
  const elapsed = Number(detail.elapsed_seconds ?? detail.sampling_seconds);
  if (!Number.isFinite(elapsed) || elapsed < 0) return;
  const steps = Number(detail.total ?? detail.steps);
  const nodeId = String(detail.node_id ?? "");
  const record = { seconds: elapsed, steps: Number.isFinite(steps) && steps > 0 ? steps : null };
  if (nodeId) {
    const prior = samplingByPreviewNode.get(nodeId);
    if (!prior || elapsed >= prior.seconds) samplingByPreviewNode.set(nodeId, record);
  }
  if (!fallbackSampling || elapsed >= fallbackSampling.seconds) fallbackSampling = record;
}

function samplingForDirector(node) {
  let best = null;
  for (const [previewId, record] of samplingByPreviewNode.entries()) {
    if (!/^\d+$/.test(previewId)) continue;
    if (!isNodeDownstream(app.graph?.links, node.id, Number(previewId))) continue;
    if (!best || record.seconds > best.seconds) best = record;
  }
  return best || fallbackSampling;
}

function commitRunTiming(totalSeconds = null) {
  const total = Number(totalSeconds);
  for (const node of directors()) {
    const sampling = samplingForDirector(node);
    const previous = node.__h3studioRunTiming || {};
    node.__h3studioRunTiming = {
      totalSeconds: Number.isFinite(total) && total >= 0 ? total : previous.totalSeconds,
      samplingSeconds: sampling?.seconds ?? previous.samplingSeconds,
      samplingSteps: sampling?.steps ?? previous.samplingSteps,
    };
    setTimeout(() => outputSection(node), 0);
  }
}

api.addEventListener("execution_start", () => {
  executionStartedAt = performance.now();
  samplingByPreviewNode.clear();
  fallbackSampling = null;
});
api.addEventListener("h3studio-preview", ({ detail }) => recordPreviewTiming(detail));
api.addEventListener("h3studio-preview-timing", ({ detail }) => recordPreviewTiming(detail));
api.addEventListener("execution_success", () => {
  const total = executionStartedAt ? (performance.now() - executionStartedAt) / 1000 : null;
  commitRunTiming(total);
});
api.addEventListener("executed", ({ detail }) => {
  const outputNode = app.graph?.getNodeById?.(Number(detail?.node));
  if (!outputNode || !["PreviewImage", "H3StudioSaveImage", "H3StudioComparisonView"].includes(outputNode.comfyClass)) return;
  const total = executionStartedAt ? (performance.now() - executionStartedAt) / 1000 : null;
  for (const node of directors()) {
    if (!isNodeDownstream(app.graph?.links, node.id, detail?.node)) continue;
    const sampling = samplingForDirector(node);
    node.__h3studioRunTiming = {
      totalSeconds: total,
      samplingSeconds: sampling?.seconds ?? node.__h3studioRunTiming?.samplingSeconds,
      samplingSteps: sampling?.steps ?? node.__h3studioRunTiming?.samplingSteps,
    };
    setTimeout(() => outputSection(node), 0);
  }
});

function refreshAll() {
  polishStrip();
  for (const node of directors()) {
    restoreSavedResult(node);
    outputSection(node);
  }
}

installHistoryPatch();
installStyles();
let queued = false;
new MutationObserver(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    refreshAll();
  });
}).observe(document.documentElement, { childList: true, subtree: true });

app.registerExtension({
  name: "H3Studio.ProductFinishV18",
  nodeCreated: (node) => { if (node?.comfyClass === TARGET) setTimeout(refreshAll, 0); },
  loadedGraphNode: (node) => { if (node?.comfyClass === TARGET) queueMicrotask(refreshAll); },
  afterConfigureGraph: () => queueMicrotask(refreshAll),
});

queueMicrotask(refreshAll);
