import { app } from "../../scripts/app.js";

const TARGET = "H3StudioDirector";
const STYLE_ID = "h3studio-director-prompt-result-v31-style";
const RESULT_SELECTOR = ".h3s-result";
let documentObserver = null;
let queued = false;

function widget(node, name) {
  return (node?.widgets || []).find((item) => item?.name === name) || null;
}

function studioState(node) {
  const raw = node?.properties?.h3studio_state || widget(node, "studio_state")?.value || "{}";
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function promptText(node) {
  return String(widget(node, "prompt")?.value || studioState(node)?.prompt || "").trim();
}

function looksStructured(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") return true;
    } catch {
      // Prompt-shaped JSON is often pasted with comments/trailing commas.
    }
  }
  const keyMatches = text.match(/^[\t ]*["']?[A-Za-z][\w -]{2,}["']?\s*:/gm) || [];
  return keyMatches.length >= 3;
}

function wordCount(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean).length;
}

function optionsFor(node) {
  const state = studioState(node);
  return state?.prompt_options || {};
}

function modeLabel(node) {
  const options = optionsFor(node);
  if (options.deep_enhancement === true) return "QWEN ENHANCED";
  if (options.enhance_mode === "single_prompt") return "DIRECT PROMPT";
  if (options.enhance_mode === "compile_only") return "STRUCTURED BRIEF";
  return "FINAL H3 PROMPT";
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3s-studio-panel .h3s-direction-prompt-cue{
      display:flex;align-items:center;gap:7px;min-width:0;margin-left:auto;
      color:var(--h3s-muted);font-size:8px;font-weight:720;letter-spacing:.045em;white-space:nowrap
    }
    .h3s-studio-panel .h3s-direction-prompt-cue-dot{
      width:6px;height:6px;flex:none;border-radius:999px;background:var(--h3s-accent);
      box-shadow:0 0 0 2px color-mix(in srgb,var(--h3s-accent) 13%,transparent)
    }
    .h3s-studio-panel .h3s-direction-prompt-cue-meta{
      color:color-mix(in srgb,var(--h3s-muted) 84%,transparent);font-weight:600;letter-spacing:0
    }
    .h3s-studio-panel .h3s-result.h3s-result-promoted{
      margin-top:2px;border-color:color-mix(in srgb,var(--h3s-accent) 36%,var(--h3s-border));
      background:color-mix(in srgb,var(--h3s-accent) 5%,var(--h3s-bg));
      box-shadow:inset 2px 0 0 color-mix(in srgb,var(--h3s-accent) 72%,transparent)
    }
    .h3s-studio-panel .h3s-result.h3s-result-promoted>summary{
      min-height:34px;padding:6px 8px;background:color-mix(in srgb,var(--h3s-accent) 4%,transparent)
    }
    .h3s-studio-panel .h3s-result-title-wrap{display:flex;align-items:center;gap:7px;min-width:0}
    .h3s-studio-panel .h3s-result-kicker{
      display:inline-flex;align-items:center;height:17px;padding:0 5px;border:1px solid color-mix(in srgb,var(--h3s-accent) 35%,var(--h3s-border));
      border-radius:4px;color:color-mix(in srgb,var(--h3s-accent) 78%,var(--h3s-text));
      background:color-mix(in srgb,var(--h3s-accent) 7%,transparent);font-size:7px;font-weight:780;letter-spacing:.06em
    }
    .h3s-studio-panel .h3s-structure-cue{
      display:flex;align-items:flex-start;gap:7px;margin:0 8px 7px;padding:6px 7px;
      border:1px solid color-mix(in srgb,var(--h3s-warning) 26%,var(--h3s-border));border-radius:5px;
      color:color-mix(in srgb,var(--h3s-muted) 88%,var(--h3s-text) 12%);background:color-mix(in srgb,var(--h3s-warning) 4%,transparent);
      font-size:8px;line-height:1.4
    }
    .h3s-studio-panel .h3s-structure-cue strong{flex:none;color:color-mix(in srgb,var(--h3s-warning) 78%,var(--h3s-text));font-size:7px;letter-spacing:.055em}
    .h3s-studio-panel .h3s-result-promoted>.h3s-result-prompt{
      max-height:190px;font-size:9.5px;line-height:1.55
    }
    .h3s-studio-panel .h3s-result-promoted>.h3s-runtime-prompt{margin:0 8px 8px;border:1px solid var(--h3s-border);border-radius:5px;background:var(--h3s-bg)}
    .h3s-studio-panel .h3s-result-promoted>.h3s-runtime-prompt>summary{min-height:27px;padding:5px 7px;color:var(--h3s-muted);font-size:8px;font-weight:650}
  `;
  document.head.append(style);
}

function directionSection(left) {
  return [...(left?.querySelectorAll?.(":scope > .h3s-section") || [])].find((section) =>
    String(section.querySelector(":scope > .h3s-section-header .h3s-section-title")?.textContent || "").trim() === "Direction"
  ) || null;
}

function decorateSummary(node, result) {
  const summary = result.querySelector(":scope > summary");
  if (!summary) return;
  const actions = summary.querySelector(":scope > .h3s-result-actions");
  let wrap = summary.querySelector(":scope > .h3s-result-title-wrap");
  if (!wrap) {
    const existingTitle = [...summary.childNodes].find((child) => child !== actions && child.nodeType === Node.ELEMENT_NODE);
    const fallbackText = String(summary.textContent || "Final H3 prompt").trim();
    if (existingTitle) existingTitle.remove();
    else {
      for (const child of [...summary.childNodes]) {
        if (child !== actions && child.nodeType === Node.TEXT_NODE) child.remove();
      }
    }
    wrap = document.createElement("span");
    wrap.className = "h3s-result-title-wrap";
    const kicker = document.createElement("span");
    kicker.className = "h3s-result-kicker";
    kicker.textContent = modeLabel(node);
    const title = document.createElement("span");
    title.className = "h3s-result-main-title";
    title.textContent = "Final H3 prompt";
    title.title = fallbackText;
    wrap.append(kicker, title);
    summary.insertBefore(wrap, actions || summary.firstChild);
  } else {
    const kicker = wrap.querySelector(".h3s-result-kicker");
    if (kicker) kicker.textContent = modeLabel(node);
  }
}

function decorateNestedDraft(result) {
  for (const detail of result.querySelectorAll(":scope > .h3s-runtime-prompt")) {
    const summary = detail.querySelector(":scope > summary");
    if (!summary) continue;
    const text = String(summary.textContent || "").trim();
    if (/Qwen-written source direction/i.test(text)) {
      summary.textContent = "Writer draft · before final H3 compile";
      summary.title = "The Qwen writer's intermediate instruction. The Final H3 prompt above is what H3 actually receives.";
    }
  }
}

function structureCue(node, result) {
  const options = optionsFor(node);
  const structured = looksStructured(promptText(node));
  let cue = result.querySelector(":scope > .h3s-structure-cue");
  const needsCue = structured && options.enhance_mode === "single_prompt";
  if (!needsCue) {
    cue?.remove();
    return;
  }
  if (!cue) {
    cue = document.createElement("div");
    cue.className = "h3s-structure-cue";
    const strong = document.createElement("strong");
    strong.textContent = "STRUCTURE → PROSE";
    const copy = document.createElement("span");
    copy.textContent = "Single-line mode keeps useful meaning but does not preserve literal JSON keys/attribute headings. Use Keep my prompt when exact structure matters.";
    cue.append(strong, copy);
    const labels = result.querySelector(":scope > .h3s-result-labels");
    if (labels) labels.insertAdjacentElement("afterend", cue);
    else result.querySelector(":scope > summary")?.insertAdjacentElement("afterend", cue);
  }
}

function headerCue(node, direction) {
  const result = node.__h3studioResult;
  const header = direction?.querySelector(":scope > .h3s-section-header");
  if (!header) return;
  let cue = header.querySelector(":scope > .h3s-direction-prompt-cue");
  if (!result?.prompt) {
    cue?.remove();
    return;
  }
  if (!cue) {
    cue = document.createElement("span");
    cue.className = "h3s-direction-prompt-cue";
    const dot = document.createElement("span");
    dot.className = "h3s-direction-prompt-cue-dot";
    const label = document.createElement("span");
    label.className = "h3s-direction-prompt-cue-label";
    const meta = document.createElement("span");
    meta.className = "h3s-direction-prompt-cue-meta";
    cue.append(dot, label, meta);
    header.append(cue);
  }
  cue.querySelector(".h3s-direction-prompt-cue-label").textContent = modeLabel(node);
  const count = wordCount(result.prompt);
  cue.querySelector(".h3s-direction-prompt-cue-meta").textContent = count ? `· ${count} words` : "";
}

function polish(node) {
  if (!node || node.comfyClass !== TARGET) return;
  const root = node.__h3studioPanel;
  if (!root?.isConnected) return;
  const left = root.querySelector(".h3s-col-left");
  if (!left) return;
  const result = left.querySelector(RESULT_SELECTOR) || root.querySelector(RESULT_SELECTOR);
  const direction = directionSection(left);
  headerCue(node, direction);
  if (!result || !direction) return;

  // The older Director deliberately opened this block after execution. The
  // two-column rebuild dropped that one attribute and buried the useful output.
  result.open = true;
  result.classList.add("h3s-result-promoted");
  decorateSummary(node, result);
  decorateNestedDraft(result);
  structureCue(node, result);

  // Keep the final prompt next to the controls that produced it instead of
  // below Generated output / References where it can disappear off-screen.
  if (result.parentElement !== direction) direction.append(result);
}

function attach(node) {
  if (!node || node.comfyClass !== TARGET) return;
  const root = node.__h3studioPanel;
  if (!root?.isConnected) {
    setTimeout(() => attach(node), 80);
    return;
  }
  polish(node);
  if (root.__h3PromptResultV31Observer) return;
  let frame = 0;
  const observer = new MutationObserver(() => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      polish(node);
    });
  });
  observer.observe(root, { childList: true, subtree: true });
  root.__h3PromptResultV31Observer = observer;
}

function sweep() {
  queued = false;
  installStyles();
  for (const node of app.graph?._nodes || []) attach(node);
}

function scheduleSweep() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(sweep);
}

function observeDocument() {
  if (documentObserver || !document.body) return;
  documentObserver = new MutationObserver(scheduleSweep);
  documentObserver.observe(document.body, { childList: true, subtree: true });
}

app.registerExtension({
  name: "H3Studio.DirectorPromptResultV31",
  setup() {
    installStyles();
    observeDocument();
    for (const delay of [0, 120, 400]) setTimeout(scheduleSweep, delay);
  },
  nodeCreated(node) {
    if (node?.comfyClass === TARGET) for (const delay of [40, 180, 500]) setTimeout(() => attach(node), delay);
  },
  afterConfigureGraph() {
    installStyles();
    observeDocument();
    for (const delay of [0, 160, 500]) setTimeout(scheduleSweep, delay);
  },
});
