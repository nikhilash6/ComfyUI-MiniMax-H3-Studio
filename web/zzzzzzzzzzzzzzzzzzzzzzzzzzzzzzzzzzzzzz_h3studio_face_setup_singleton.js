import { app } from "../../scripts/app.js";

const TARGET = "H3StudioModelSetup";
const CARD_SELECTOR = ".h3ms-face-refine-card";

function dedupe(root) {
  if (!root?.isConnected) return;
  const cards = [...root.querySelectorAll(CARD_SELECTOR)];
  for (const card of cards.slice(1)) card.remove();
}

function guardRoot(root) {
  if (!root?.isConnected || root.__h3FaceSetupSingleton) return;
  root.__h3FaceSetupSingleton = true;

  // h3studio_face_setup.js builds the card asynchronously. Model Setup can
  // mutate several times while that first build is awaiting status/network
  // calls, which used to start multiple builds in parallel. Keep the first
  // completed Face Refine card and reject any later duplicate append.
  const originalAppend = root.append.bind(root);
  root.append = (...nodes) => {
    const accepted = [];
    let hasFaceCard = Boolean(root.querySelector(CARD_SELECTOR));

    for (const node of nodes) {
      const isFaceCard = node instanceof Element && node.matches(CARD_SELECTOR);
      if (isFaceCard && hasFaceCard) continue;
      if (isFaceCard) hasFaceCard = true;
      accepted.push(node);
    }

    if (accepted.length) originalAppend(...accepted);
    dedupe(root);
  };

  const observer = new MutationObserver(() => dedupe(root));
  observer.observe(root, { childList: true });
  root.__h3FaceSetupSingletonObserver = observer;
  dedupe(root);
}

function attach(node) {
  if (!node || String(node.comfyClass || node.type || "") !== TARGET) return;
  const root = node.__h3ModelSetup?.root;
  if (!root?.isConnected) {
    setTimeout(() => attach(node), 80);
    return;
  }
  guardRoot(root);
}

function sweep() {
  for (const node of app.graph?._nodes || []) attach(node);
}

app.registerExtension({
  name: "H3Studio.FaceRefineSetupSingleton",
  setup() {
    setTimeout(sweep, 0);
    setTimeout(sweep, 200);
  },
  nodeCreated(node) {
    if (String(node?.comfyClass || node?.type || "") === TARGET) {
      setTimeout(() => attach(node), 0);
      setTimeout(() => attach(node), 120);
    }
  },
  afterConfigureGraph() {
    setTimeout(sweep, 0);
    setTimeout(sweep, 200);
  },
});
