import { app } from "../../scripts/app.js";
import { guidedT2IModeHelp, referenceAiCues } from "./js/core/reference_ai_cues.js";

const TARGET = "H3StudioDirector";
const STYLE_ID = "h3studio-reference-ai-cues-v35-style";
let observer = null;
let queued = false;

function widget(node, name) {
  return (node?.widgets || []).find((item) => item?.name === name) || null;
}

function studioState(node) {
  if (node?.__h3studioState && typeof node.__h3studioState === "object") {
    return node.__h3studioState;
  }
  const raw = node?.properties?.h3studio_state || widget(node, "studio_state")?.value || "{}";
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3s-studio-panel .h3s-ai-cues{
      display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-width:0
    }
    .h3s-studio-panel .h3s-ai-cue{
      display:inline-flex;align-items:center;gap:4px;width:fit-content;max-width:100%;
      padding:2px 6px;border:1px solid color-mix(in srgb,var(--h3s-accent) 28%,transparent);
      border-radius:999px;color:var(--h3s-accent);
      background:color-mix(in srgb,var(--h3s-accent) 10%,transparent);
      font-size:8px;font-weight:700;line-height:1.25;white-space:nowrap
    }
    .h3s-studio-panel .h3s-ai-cue::before{
      content:"";width:5px;height:5px;flex:none;border-radius:999px;background:var(--h3s-accent);
      box-shadow:0 0 0 2px color-mix(in srgb,var(--h3s-accent) 12%,transparent)
    }
    .h3s-studio-panel .h3s-reference-card.h3s-ai-managed{
      border-color:color-mix(in srgb,var(--h3s-accent) 45%,var(--h3s-border));
      box-shadow:inset 2px 0 0 color-mix(in srgb,var(--h3s-accent) 78%,transparent)
    }
  `;
  document.head.append(style);
}

function cueCard(node, card, index, reference) {
  const changedNow = node.__h3studioAutoChanges?.[index] || null;
  const cues = referenceAiCues(reference, changedNow);
  const signature = JSON.stringify(cues);
  if (card.dataset.h3sAiCueSignature === signature) return;
  card.dataset.h3sAiCueSignature = signature;

  card.querySelector(".h3s-ai-cues")?.remove();
  card.classList.toggle("h3s-ai-managed", cues.length > 0);

  const legacy = card.querySelector(".h3s-auto-role");
  if (legacy) legacy.hidden = cues.length > 0;
  if (!cues.length) return;

  const row = document.createElement("div");
  row.className = "h3s-ai-cues";
  row.setAttribute("aria-label", "AI-selected reference settings");
  for (const cue of cues) {
    const pill = document.createElement("span");
    pill.className = "h3s-ai-cue";
    pill.dataset.kind = cue.key;
    pill.textContent = cue.label;
    pill.title = "This setting was selected or maintained automatically by H3 Studio's image analysis.";
    row.append(pill);
  }

  const controls = card.querySelector(".h3s-reference-controls");
  const body = card.querySelector(".h3s-reference-body");
  if (controls?.parentElement) controls.insertAdjacentElement("afterend", row);
  else body?.append(row);
}

function fixModeHelp(root) {
  for (const help of root.querySelectorAll(".h3s-context-help")) {
    const next = guidedT2IModeHelp(help.textContent);
    if (next !== help.textContent) help.textContent = next;
  }
}

function applyNode(node) {
  const root = node?.__h3studioPanel;
  if (!root?.isConnected) return;
  const references = studioState(node)?.references || [];
  const cards = root.querySelectorAll(".h3s-reference-card");
  cards.forEach((card, index) => cueCard(node, card, index, references[index] || {}));
  fixModeHelp(root);
}

function sweep() {
  queued = false;
  installStyles();
  for (const node of app.graph?._nodes || []) {
    if (node?.comfyClass === TARGET) applyNode(node);
  }
}

function queueSweep() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(sweep);
}

app.registerExtension({
  name: "H3Studio.ReferenceAICuesV35",
  setup() {
    installStyles();
    queueSweep();
    globalThis.addEventListener?.("h3studio:references-changed", queueSweep);
    if (!observer && document.body) {
      observer = new MutationObserver(queueSweep);
      observer.observe(document.body, { childList: true, subtree: true });
    }
  },
});
