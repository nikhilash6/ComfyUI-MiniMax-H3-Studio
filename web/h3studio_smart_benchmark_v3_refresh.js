import { app } from "../../scripts/app.js";

const SMART = "H3StudioSmartBenchmark";

function attach(node) {
  if (!node || node.comfyClass !== SMART || node.__h3b3PresetRefreshHook) return;
  node.__h3b3PresetRefreshHook = true;
  const wait = () => {
    const root = node.__h3bRoot;
    if (!root?.isConnected) { setTimeout(wait, 50); return; }
    root.addEventListener("click", (event) => {
      if (!event.target?.closest?.(".h3b3-preset")) return;
      setTimeout(() => {
        const currentRoot = node.__h3bRoot;
        const refresh = [...(currentRoot?.querySelectorAll?.("button") || [])]
          .find((button) => /refresh assets/i.test(button.textContent || ""));
        refresh?.click();
      }, 0);
    });
  };
  setTimeout(wait, 0);
}

app.registerExtension({
  name: "H3Studio.SmartBenchmarkV3PresetRefresh",
  afterConfigureGraph() {
    for (const node of app.graph?._nodes || []) if (node?.comfyClass === SMART) attach(node);
  },
  nodeCreated(node) {
    if (node?.comfyClass === SMART) attach(node);
  },
});
