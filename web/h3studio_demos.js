import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { applyState, renderPanel, stateFromNode } from "./js/studio_extension.js";

const TARGET = "H3StudioDirector";
const STYLE_ID = "h3studio-demos-shelf-style";
const STORAGE_EXPANDED_KEY = "h3studio-demos-expanded-v1";
const STORAGE_HISTORY_KEY = "h3studio-history-v1";
const EXT_PATH = "/extensions/ComfyUI-MiniMax-H3-Studio/demos";
const MANIFEST_URL = `${EXT_PATH}/manifest.json`;

let cachedManifest = null;
let activeTab = "demos"; // "demos" | "history"
let activeFilter = "ALL";
let activeSelectedId = null;

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3s-demos-shelf{margin:0 0 14px 0!important;padding:0!important;border:1px solid #24292e!important;border-radius:9px!important;background:#131619!important;overflow:hidden!important;transition:border-color .15s ease;width:100%!important;box-sizing:border-box!important}
    .h3s-demos-shelf:hover{border-color:#353d45!important}
    .h3s-demos-header{display:flex;align-items:center;justify-content:space-between;padding:7px 12px;cursor:pointer;user-select:none;background:#15191d;border-bottom:1px solid transparent;transition:background .12s ease}
    .h3s-demos-shelf.is-open .h3s-demos-header{border-bottom-color:#22272c}
    .h3s-demos-header:hover{background:#181d22}
    .h3s-demos-title-group{display:flex;align-items:center;gap:10px}
    .h3s-shelf-tabs{display:flex;align-items:center;background:#0d1012;padding:2px;border-radius:6px;border:1px solid #232a30;gap:2px}
    .h3s-shelf-tab{font-size:9px;font-weight:700;padding:3px 9px;border-radius:4px;border:0;background:transparent;color:#7e8b97;cursor:pointer;transition:all .12s ease;display:flex;align-items:center;gap:5px}
    .h3s-shelf-tab:hover{color:#d1d9e0}
    .h3s-shelf-tab.is-active{background:#232b34;color:#f0f4f8;box-shadow:0 1px 3px rgba(0,0,0,.3)}
    .h3s-demos-filter-pills{display:flex;align-items:center;gap:4px}
    .h3s-demos-filter-pill{font-size:8px;font-weight:650;padding:2px 6px;border-radius:4px;border:1px solid #2a3138;background:#181d22;color:#8c959e;cursor:pointer;transition:all .12s ease;text-transform:uppercase;letter-spacing:.04em}
    .h3s-demos-filter-pill:hover{color:#dce2e6;border-color:#404b54}
    .h3s-demos-filter-pill.is-active{color:#eef1f3;border-color:#a8b7ca;background:#252e38}
    .h3s-history-clear-btn{font-size:8px;color:#8c959e;background:transparent;border:1px solid #2a3138;border-radius:4px;padding:2px 6px;cursor:pointer;transition:all .12s ease}
    .h3s-history-clear-btn:hover{color:#f87171;border-color:#7f1d1d}
    .h3s-demos-toggle-btn{display:flex;align-items:center;gap:5px;font-size:9px;color:#7d8790;background:transparent;border:0;padding:0;cursor:pointer}
    .h3s-demos-chevron{font-size:9px;transition:transform .15s ease;display:inline-block}
    .h3s-demos-shelf.is-open .h3s-demos-chevron{transform:rotate(180deg)}
    .h3s-demos-body{display:none;padding:10px;overflow-x:auto;overflow-y:hidden;scroll-behavior:smooth;scrollbar-width:thin;scrollbar-color:#353b42 transparent}
    .h3s-demos-shelf.is-open .h3s-demos-body{display:flex;gap:10px}
    .h3s-demos-body::-webkit-scrollbar{height:5px}
    .h3s-demos-body::-webkit-scrollbar-thumb{background:#353b42;border-radius:999px}
    .h3s-demo-card{flex:0 0 210px;display:flex;flex-direction:column;border:1px solid #272d33;border-radius:8px;background:#111417;overflow:hidden;cursor:pointer;transition:all .15s cubic-bezier(.16,1,.3,1);position:relative}
    .h3s-demo-card:hover{transform:translateY(-2px);border-color:#a8b7ca;box-shadow:0 4px 14px rgba(0,0,0,.4)}
    .h3s-demo-card.is-selected{border-color:#a8b7ca;box-shadow:0 0 0 1px #a8b7ca,0 4px 14px rgba(0,0,0,.5);background:#161b20}
    .h3s-demo-thumb-box{position:relative;width:100%;height:105px;background:#0d0f11;overflow:hidden}
    .h3s-demo-thumb{width:100%;height:100%;object-fit:cover;transition:transform .25s ease;display:block}
    .h3s-demo-card:hover .h3s-demo-thumb{transform:scale(1.04)}
    .h3s-demo-category-tag{position:absolute;top:6px;left:6px;font-size:7.5px;font-weight:750;padding:1.5px 5px;border-radius:3px;text-transform:uppercase;letter-spacing:.05em;backdrop-filter:blur(4px);background:rgba(20,24,30,.85);color:#cbd5e1;border:1px solid rgba(255,255,255,.15)}
    .h3s-demo-category-tag.cat-cinematic{background:rgba(45,30,12,.88);color:#fcd34d;border:1px solid rgba(245,158,11,.45)}
    .h3s-demo-category-tag.cat-anime{background:rgba(28,22,45,.85);color:#c4b5fd;border:1px solid rgba(139,92,246,.4)}
    .h3s-demo-category-tag.cat-realistic{background:rgba(16,32,24,.85);color:#6ee7b7;border:1px solid rgba(16,185,129,.4)}
    .h3s-demo-category-tag.cat-history{background:rgba(24,30,40,.85);color:#93c5fd;border:1px solid rgba(59,130,246,.4)}
    .h3s-demo-badge-specs{position:absolute;bottom:5px;right:6px;font-size:7.5px;font-weight:650;padding:1px 5px;border-radius:3px;background:rgba(10,12,14,.82);color:#d1d7dc;border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(4px)}
    .h3s-demo-content{padding:8px 9px 9px;display:flex;flex-direction:column;gap:3px}
    .h3s-demo-card-title{font-size:10px;font-weight:700;color:#e5ebf0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .h3s-demo-card-sub{font-size:8.5px;color:#838d96;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.25}
    .h3s-demo-card-action{margin-top:5px;display:flex;align-items:center;justify-content:space-between;font-size:7.5px;color:#6b757e;border-top:1px solid #1c2227;padding-top:5px}
    .h3s-demo-apply-btn{color:#a8b7ca;font-weight:650;letter-spacing:.02em}
    .h3s-demo-card.is-selected .h3s-demo-apply-btn{color:#6ee7b7}
    .h3s-empty-history{padding:24px 16px;text-align:center;color:#64748b;font-size:10px;font-style:italic;width:100%;box-sizing:border-box}
  `;
  document.head.append(style);
}

function getSessionHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveSessionHistory(list) {
  try {
    localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(list.slice(0, 30)));
  } catch (e) {
    console.warn("[H3 Studio] Failed to save session history:", e);
  }
}

function addHistoryEntry(entry) {
  const current = getSessionHistory();
  const filtered = current.filter((item) => item.url !== entry.url && item.id !== entry.id);
  const next = [entry, ...filtered].slice(0, 30);
  saveSessionHistory(next);
  updateActiveShelves();
}

async function loadManifest() {
  if (cachedManifest) return cachedManifest;
  try {
    const res = await fetch(MANIFEST_URL);
    if (res.ok) {
      cachedManifest = await res.json();
      return cachedManifest;
    }
  } catch (err) {
    console.warn("[H3 Studio] Demos manifest fetch error:", err);
  }
  return [];
}

function fullPromptText(item) {
  if (item.summary || item.detailed_description) {
    return `summary:\n${item.summary || ""}\n\ndetailed_description:\n${item.detailed_description || ""}`;
  }
  return String(item.prompt || "");
}

function formatSamplingBadge(profile) {
  if (!profile) return "LightX 8";
  const s = String(profile).toLowerCase();

  // Distinguish 4-step vs 8-step LightX/Turbo correctly
  if (s.includes("lightx") || s.includes("turbo")) {
    if (s.includes("sa_solver") || s.includes("sa")) return "LightX SA-4";
    if (s.includes("er_sde") || s.includes("sde")) return "LightX SDE-4";
    if (s.includes("4")) return "LightX 4";
    if (s.includes("8") || s.includes("fl2v_8")) return "LightX 8";
    return "LightX 8";
  }
  if (s.includes("pdd")) {
    if (s.includes("600")) return "PDD 600";
    return "PDD 900";
  }
  if (s.includes("12") || s.includes("balanced")) return "Base 12";
  if (s.includes("20") || s.includes("quality")) return "Base 20";
  if (s.length <= 12) return profile;
  return "Custom";
}

function applyItemToNode(node, item, cardEl, shelfEl) {
  if (!node) return;
  activeSelectedId = item.id;

  const promptText = fullPromptText(item);

  // 1. Reset prompt rich doc cache to avoid rendering stale token parts
  if (node.properties) {
    node.properties["h3_prompt_doc"] = null;
  }

  // 2. Update native prompt widget
  const promptWidget = node.widgets?.find((w) => w.name === "prompt");
  if (promptWidget) {
    promptWidget.value = promptText;
    promptWidget.callback?.(promptText, app.canvas, node, [0, 0], {});
  }

  // 3. Update DOM editor & textareas
  if (node.__h3sDomWidget?.options?.setValue) {
    node.__h3sDomWidget.options.setValue(promptText);
  }
  if (node.__h3sEditor) {
    node.__h3sEditor.textContent = promptText;
    node.__h3sEditor.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // 4. Update Studio State
  const current = stateFromNode(node);
  const next = {
    ...current,
    prompt: promptText,
    references: item.references || current.references || [],
    prompt_options: {
      ...current.prompt_options,
      ...(item.prompt_options || {}),
    },
    generation: {
      ...current.generation,
      aspect_ratio: item.aspect || current.generation?.aspect_ratio || "16:9",
      megapixels: Number(item.target_mp ?? current.generation?.megapixels ?? 1.0),
      sampling_profile: item.sampling || current.generation?.sampling_profile || "lightx_v1_fl2v_8",
      route: item.route || current.generation?.route || "auto",
      seed: item.seed != null ? Number(item.seed) : current.generation?.seed,
      ...(item.generation || {}),
    },
  };
  applyState(node, next, true);

  // 5. Re-render Director Panel DOM to immediately reflect new settings
  try {
    renderPanel(node);
  } catch (e) {
    console.warn("[H3 Studio] renderPanel error:", e);
  }

  // 6. Highlight card
  if (shelfEl) {
    for (const other of shelfEl.querySelectorAll(".h3s-demo-card")) {
      const isMatch = other.getAttribute("data-demo-id") === item.id;
      other.classList.toggle("is-selected", isMatch);
      const btn = other.querySelector(".h3s-demo-apply-btn");
      if (btn) btn.textContent = isMatch ? "Applied ✓" : "Apply →";
    }
  }

  app.graph?.setDirtyCanvas?.(true, true);
}

function timeAgo(timestamp) {
  if (!timestamp) return "Recent";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function renderShelfContent(node, shelf, manifest) {
  const body = shelf.querySelector(".h3s-demos-body");
  if (!body) return;

  const demos = manifest || [];
  const selectedId = shelf.dataset.selectedId || activeSelectedId;

  body.innerHTML = "";

  // History Tab
  if (activeTab === "history") {
    const history = getSessionHistory();
    if (!history.length) {
      body.innerHTML = `<div class="h3s-empty-history">No session generations yet. Queue a prompt to see previous outputs here.</div>`;
      return;
    }
    for (const item of history) {
      const card = document.createElement("div");
      const isSelected = selectedId === item.id || activeSelectedId === item.id;
      card.className = `h3s-demo-card${isSelected ? " is-selected" : ""}`;
      card.setAttribute("data-demo-id", item.id);

      const thumbBox = document.createElement("div");
      thumbBox.className = "h3s-demo-thumb-box";

      const img = document.createElement("img");
      img.className = "h3s-demo-thumb";
      img.loading = "lazy";
      img.src = item.url;
      img.alt = item.title || "Generated image";
      thumbBox.appendChild(img);

      const catTag = document.createElement("div");
      catTag.className = "h3s-demo-category-tag cat-history";
      catTag.textContent = timeAgo(item.timestamp);
      thumbBox.appendChild(catTag);

      const specs = document.createElement("div");
      specs.className = "h3s-demo-badge-specs";
      const seedLabel = item.seed != null ? `Seed ${item.seed}` : "Auto";
      const profileShort = formatSamplingBadge(item.sampling);
      specs.textContent = `${item.aspect || "16:9"} · ${profileShort} · ${seedLabel}`;
      thumbBox.appendChild(specs);

      const content = document.createElement("div");
      content.className = "h3s-demo-content";

      const cardTitle = document.createElement("div");
      cardTitle.className = "h3s-demo-card-title";
      cardTitle.textContent = item.title || `Generation (${timeAgo(item.timestamp)})`;

      const cardSub = document.createElement("div");
      cardSub.className = "h3s-demo-card-sub";
      cardSub.textContent = item.prompt ? `“${item.prompt.replace(/\s+/g, " ").slice(0, 60)}...”` : "Session output";

      const action = document.createElement("div");
      action.className = "h3s-demo-card-action";
      action.innerHTML = `<span>Restore run</span> <span class="h3s-demo-apply-btn">${isSelected ? "Applied ✓" : "Apply →"}</span>`;

      content.appendChild(cardTitle);
      content.appendChild(cardSub);
      content.appendChild(action);

      card.appendChild(thumbBox);
      card.appendChild(content);

      card.addEventListener("click", () => {
        applyItemToNode(node, item, card, shelf);
      });

      body.appendChild(card);
    }
    return;
  }

  // Demos Tab
  const filtered = activeFilter === "ALL" 
    ? demos 
    : demos.filter((d) => d.category === activeFilter);

  for (const demo of filtered) {
    const card = document.createElement("div");
    const isSelected = selectedId === demo.id || activeSelectedId === demo.id;
    card.className = `h3s-demo-card${isSelected ? " is-selected" : ""}`;
    card.setAttribute("data-demo-id", demo.id);

    const thumbBox = document.createElement("div");
    thumbBox.className = "h3s-demo-thumb-box";

    const img = document.createElement("img");
    img.className = "h3s-demo-thumb";
    img.loading = "lazy";
    img.src = `${EXT_PATH}/${demo.file}`;
    img.alt = demo.title;
    thumbBox.appendChild(img);

    const catTag = document.createElement("div");
    catTag.className = `h3s-demo-category-tag cat-${String(demo.category || "").toLowerCase()}`;
    catTag.textContent = demo.category;
    thumbBox.appendChild(catTag);

    const specs = document.createElement("div");
    specs.className = "h3s-demo-badge-specs";
    const profileShort = formatSamplingBadge(demo.sampling);
    specs.textContent = `${demo.aspect} · ${demo.target_mp}MP · ${profileShort}`;
    thumbBox.appendChild(specs);

    const content = document.createElement("div");
    content.className = "h3s-demo-content";

    const cardTitle = document.createElement("div");
    cardTitle.className = "h3s-demo-card-title";
    cardTitle.textContent = demo.title;

    const cardSub = document.createElement("div");
    cardSub.className = "h3s-demo-card-sub";
    cardSub.textContent = `“${demo.subtitle}”`;

    const action = document.createElement("div");
    action.className = "h3s-demo-card-action";
    action.innerHTML = `<span>Click to apply</span> <span class="h3s-demo-apply-btn">${isSelected ? "Applied ✓" : "Apply →"}</span>`;

    content.appendChild(cardTitle);
    content.appendChild(cardSub);
    content.appendChild(action);

    card.appendChild(thumbBox);
    card.appendChild(content);

    card.addEventListener("click", () => {
      applyItemToNode(node, demo, card, shelf);
    });

    body.appendChild(card);
  }
}

async function buildDemoShelf(node, selectedId = null) {
  const demos = await loadManifest();
  const history = getSessionHistory();

  const shelf = document.createElement("div");
  shelf.className = "h3s-demos-shelf";

  const isExpanded = localStorage.getItem(STORAGE_EXPANDED_KEY) !== "false";
  if (isExpanded) {
    shelf.classList.add("is-open");
  }

  const header = document.createElement("div");
  header.className = "h3s-demos-header";

  const titleGroup = document.createElement("div");
  titleGroup.className = "h3s-demos-title-group";

  // Segmented Tabs: Demos vs History
  const tabs = document.createElement("div");
  tabs.className = "h3s-shelf-tabs";

  const demosTab = document.createElement("button");
  demosTab.type = "button";
  demosTab.className = `h3s-shelf-tab ${activeTab === "demos" ? "is-active" : ""}`;
  demosTab.innerHTML = `<span>✦</span> Demos (${demos.length})`;

  const historyTab = document.createElement("button");
  historyTab.type = "button";
  historyTab.className = `h3s-shelf-tab ${activeTab === "history" ? "is-active" : ""}`;
  historyTab.innerHTML = `<span>⏱</span> History (${history.length})`;

  tabs.appendChild(demosTab);
  tabs.appendChild(historyTab);
  titleGroup.appendChild(tabs);

  // Sub-controls (Category pills or Clear History button)
  const subControls = document.createElement("div");
  subControls.className = "h3s-demos-filter-pills";

  function refreshSubControls() {
    subControls.innerHTML = "";
    if (activeTab === "demos") {
      const distinctCats = Array.from(new Set(demos.map((d) => d.category).filter(Boolean)));
      const categories = ["ALL", ...distinctCats];
      for (const cat of categories) {
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = `h3s-demos-filter-pill ${cat === activeFilter ? "is-active" : ""}`;
        const count = cat === "ALL" ? demos.length : demos.filter((d) => d.category === cat).length;
        pill.textContent = `${cat} (${count})`;
        pill.addEventListener("click", (e) => {
          e.stopPropagation();
          activeFilter = cat;
          for (const p of subControls.querySelectorAll(".h3s-demos-filter-pill")) {
            p.classList.remove("is-active");
          }
          pill.classList.add("is-active");
          renderShelfContent(node, shelf, demos);
        });
        subControls.appendChild(pill);
      }
    } else {
      const currentHist = getSessionHistory();
      if (currentHist.length > 0) {
        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className = "h3s-history-clear-btn";
        clearBtn.textContent = "Clear history";
        clearBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          saveSessionHistory([]);
          historyTab.innerHTML = `<span>⏱</span> History (0)`;
          renderShelfContent(node, shelf, demos);
          refreshSubControls();
        });
        subControls.appendChild(clearBtn);
      }
    }
  }

  demosTab.addEventListener("click", (e) => {
    e.stopPropagation();
    activeTab = "demos";
    demosTab.classList.add("is-active");
    historyTab.classList.remove("is-active");
    refreshSubControls();
    renderShelfContent(node, shelf, demos);
  });

  historyTab.addEventListener("click", (e) => {
    e.stopPropagation();
    activeTab = "history";
    historyTab.classList.add("is-active");
    demosTab.classList.remove("is-active");
    refreshSubControls();
    renderShelfContent(node, shelf, demos);
  });

  refreshSubControls();
  titleGroup.appendChild(subControls);

  const toggleBtn = document.createElement("div");
  toggleBtn.className = "h3s-demos-toggle-btn";
  toggleBtn.innerHTML = `<span>Shelf</span> <span class="h3s-demos-chevron">▾</span>`;

  header.appendChild(titleGroup);
  header.appendChild(toggleBtn);

  header.addEventListener("click", () => {
    const open = shelf.classList.toggle("is-open");
    localStorage.setItem(STORAGE_EXPANDED_KEY, open ? "true" : "false");
  });

  const body = document.createElement("div");
  body.className = "h3s-demos-body";

  renderShelfContent(node, shelf, demos);

  shelf.appendChild(header);
  shelf.appendChild(body);
  return shelf;
}

function updateActiveShelves() {
  for (const shelf of document.querySelectorAll(".h3s-demos-shelf")) {
    const history = getSessionHistory();
    const historyTab = shelf.querySelector(".h3s-shelf-tab:nth-child(2)");
    if (historyTab) historyTab.innerHTML = `<span>⏱</span> History (${history.length})`;
    if (activeTab === "history") {
      const body = shelf.querySelector(".h3s-demos-body");
      if (body) {
        const node = app.graph?._nodes?.find((n) => n.comfyClass === TARGET);
        loadManifest().then((demos) => {
          renderShelfContent(node, shelf, demos);
        });
      }
    }
  }
}

async function installDemosShelf(node, selectedId = null) {
  const panel = node?.__h3studioPanel;
  if (!panel?.isConnected) return;

  const existing = panel.querySelector(".h3s-demos-shelf");
  if (existing) {
    if (selectedId) {
      for (const card of existing.querySelectorAll(".h3s-demo-card")) {
        const isMatch = card.getAttribute("data-demo-id") === selectedId;
        card.classList.toggle("is-selected", isMatch);
        const btn = card.querySelector(".h3s-demo-apply-btn");
        if (btn) btn.textContent = isMatch ? "Applied ✓" : "Apply →";
      }
    }
    return;
  }

  const shelf = await buildDemoShelf(node, selectedId);
  if (!shelf || !panel.isConnected || panel.querySelector(".h3s-demos-shelf")) return;

  // Insert as full-width strip across the top of Director (above the 2-column layout)
  const header = panel.querySelector(".h3s-studio-header");
  const layout = panel.querySelector(".h3s-v6-layout, .h3s-v7-layout, .h3s-layout");

  if (layout && layout.parentNode === panel) {
    panel.insertBefore(shelf, layout);
  } else if (header && header.nextSibling && header.parentNode === panel) {
    panel.insertBefore(shelf, header.nextSibling);
  } else {
    panel.prepend(shelf);
  }
}

function executedImageUrl(item) {
  if (!item?.filename) return null;
  const params = new URLSearchParams({
    filename: item.filename,
    type: item.type || "output",
    subfolder: item.subfolder || "",
  });
  return `/view?${params.toString()}`;
}

function findDirectorForOutput(executedNodeId) {
  if (!app.graph?._nodes) return null;

  // 1. Direct match
  const direct = app.graph._nodes.find((n) => String(n.id) === String(executedNodeId) && n.comfyClass === TARGET);
  if (direct) return direct;

  // 2. Trace upstream from executed node
  const visited = new Set();
  const queue = [String(executedNodeId)];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const currentNode = app.graph._nodes.find((n) => String(n.id) === currentId);
    if (!currentNode) continue;

    if (currentNode.comfyClass === TARGET) {
      return currentNode;
    }

    if (currentNode.inputs) {
      for (const input of currentNode.inputs) {
        if (input.link != null && app.graph.links) {
          const link = app.graph.links[input.link];
          if (link?.origin_id != null) {
            queue.push(String(link.origin_id));
          }
        }
      }
    }
  }

  // 3. Fallback to first Director node in graph
  return app.graph._nodes.find((n) => n.comfyClass === TARGET) || null;
}

// Auto-capture executed generations into history with upstream node association
api.addEventListener("executed", ({ detail }) => {
  const item = detail?.output?.images?.[0];
  const url = executedImageUrl(item);
  if (!url) return;

  const directorNode = findDirectorForOutput(detail?.node);
  if (!directorNode) return;

  const state = stateFromNode(directorNode);
  const promptWidget = directorNode.widgets?.find((w) => w.name === "prompt");
  const prompt = String(promptWidget?.value || state.prompt || "");

  addHistoryEntry({
    id: `gen_${Date.now()}`,
    url,
    timestamp: Date.now(),
    prompt,
    seed: state.generation?.seed,
    aspect: state.generation?.aspect_ratio || "16:9",
    target_mp: state.generation?.megapixels || 1.0,
    sampling: state.generation?.sampling_profile || "lightx_v1_fl2v_8",
    route: state.generation?.route || "auto",
    references: state.references || [],
    prompt_options: state.prompt_options || {},
    generation: state.generation || {},
    title: `Generation #${getSessionHistory().length + 1}`,
  });
});

function watchDirector(node) {
  const wait = () => {
    if (!node.graph) return;
    if (node.__h3studioPanel?.isConnected) {
      installDemosShelf(node);
      return;
    }
    setTimeout(wait, 50);
  };
  setTimeout(wait, 0);
}

app.registerExtension({
  name: "H3Studio.DemosShelf",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TARGET) return;
    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function h3demosCreated() {
      const result = created?.apply(this, arguments);
      installStyles();
      watchDirector(this);
      return result;
    };
    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function h3demosConfigured() {
      const result = configured?.apply(this, arguments);
      installStyles();
      watchDirector(this);
      return result;
    };
  },
});

export {
  buildDemoShelf,
  formatSamplingBadge,
  installDemosShelf,
  renderShelfContent,
  findDirectorForOutput,
};
