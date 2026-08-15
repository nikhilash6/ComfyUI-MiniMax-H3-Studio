import { app } from "../../scripts/app.js";

const TARGET = "H3StudioDirector";
const OLD_HELP = "Reference priority controls how strongly the written prompt tells H3 to preserve reference details; it is not a LoRA strength.";
const NEW_HELP = "Prompt strictness only changes wording added by H3 Studio's prompt compiler. It does not change native reference-conditioning strength, CFG, denoise, or LoRA weight. With Keep my prompt selected, this control has no generation effect.";

function rewriteCopy(root) {
  if (!root) return false;
  let changed = false;
  const replacements = [
    [OLD_HELP, NEW_HELP],
    ["Reference adherence", "Prompt strictness"],
    ["Reference priority", "Prompt strictness"],
  ];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    let value = node.nodeValue || "";
    let next = value;
    for (const [from, to] of replacements) next = next.replaceAll(from, to);
    if (next !== value) {
      node.nodeValue = next;
      changed = true;
    }
  }

  for (const element of root.querySelectorAll?.("[aria-label], [title]") || []) {
    for (const attribute of ["aria-label", "title"]) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      let next = value;
      for (const [from, to] of replacements) next = next.replaceAll(from, to);
      if (next !== value) {
        element.setAttribute(attribute, next);
        changed = true;
      }
    }
  }
  return changed;
}

function relabelNode(node) {
  if (!node || node.comfyClass !== TARGET) return false;
  return rewriteCopy(node.__h3studioPanel || null);
}

function relabelAll() {
  let changed = false;
  for (const node of app.graph?._nodes || []) changed = relabelNode(node) || changed;
  return changed;
}

function scheduleRelabel(node) {
  queueMicrotask(() => relabelNode(node));
  requestAnimationFrame(() => relabelNode(node));
}

app.registerExtension({
  name: "H3Studio.PromptStrictnessCopyV34",

  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TARGET) return;

    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function h3studioPromptStrictnessCreated() {
      const result = created?.apply(this, arguments);
      scheduleRelabel(this);
      return result;
    };

    const configured = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function h3studioPromptStrictnessConfigure() {
      const result = configured?.apply(this, arguments);
      scheduleRelabel(this);
      return result;
    };
  },

  setup() {
    const observer = new MutationObserver(() => queueMicrotask(relabelAll));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    queueMicrotask(relabelAll);
  },
});
