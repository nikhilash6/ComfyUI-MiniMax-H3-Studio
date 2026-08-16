import { app } from "../../scripts/app.js";


if (!globalThis.__H3_STUDIO_CANONICAL_UI__) {
const TARGET = "H3StudioSmartBenchmark";
const MAX_SCENARIOS = 4;
const SHARE_PREFIX = "H3B1:";
const SHARE_ZIP_PREFIX = "H3B1Z:";
let installed = false;

function widget(node, name) {
  return (node?.widgets || []).find((item) => item?.name === name) || null;
}

function scenarios(node) {
  try {
    const value = JSON.parse(String(widget(node, "scenarios_json")?.value || "[]"));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function benchmarkNodeForElement(element) {
  if (!element?.closest?.(".h3b7")) return null;
  for (const node of app.graph?._nodes || []) {
    if (node?.comfyClass !== TARGET) continue;
    const root = node.__h3bRoot;
    if (root && (root === element || root.contains(element))) return node;
  }
  return null;
}

function toast(summary, detail, severity = "success") {
  app.extensionManager?.toast?.add?.({ severity, summary, detail, life: 4200 });
}

function bytesToB64(bytes) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function b64ToBytes(value) {
  const raw = atob(value);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function gunzipBytes(bytes) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("This browser cannot unpack compressed benchmark presets.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function exportCode(node) {
  const raw = new TextEncoder().encode(JSON.stringify({ v: 1, scenarios: scenarios(node) }));
  return `${SHARE_PREFIX}${bytesToB64(raw)}`;
}

async function decodePreset(raw) {
  const text = String(raw || "").trim();
  const starts = [SHARE_ZIP_PREFIX, SHARE_PREFIX]
    .map((prefix) => [prefix, text.indexOf(prefix)])
    .filter(([, index]) => index >= 0)
    .sort((a, b) => a[1] - b[1]);
  const start = starts[0];
  const code = start ? text.slice(start[1]).split(/\s/)[0] : text;
  let payload;
  if (code.startsWith(SHARE_ZIP_PREFIX)) {
    const bytes = await gunzipBytes(b64ToBytes(code.slice(SHARE_ZIP_PREFIX.length)));
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } else if (code.startsWith(SHARE_PREFIX)) {
    payload = JSON.parse(new TextDecoder().decode(b64ToBytes(code.slice(SHARE_PREFIX.length))));
  } else {
    payload = JSON.parse(code);
  }
  if (Number(payload?.v) !== 1 || !Array.isArray(payload.scenarios)) {
    throw new Error("Unsupported H3 benchmark preset.");
  }
  return payload.scenarios;
}

async function copyTextReliable(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy copy path. Chromium can expose Clipboard API
      // while still rejecting it because of permissions or embedding context.
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-10000px";
  area.style.top = "0";
  area.style.opacity = "0";
  document.body.append(area);
  area.focus({ preventScroll: true });
  area.select();
  const copied = document.execCommand?.("copy");
  area.remove();
  if (copied === false) throw new Error("Clipboard permission was denied.");
}

function syncRoot(node) {
  const root = node?.__h3bRoot;
  if (!root?.isConnected) return;
  const count = scenarios(node).length;

  const maxWidget = widget(node, "max_scenarios");
  if (maxWidget && Number(maxWidget.value) !== MAX_SCENARIOS) {
    maxWidget.value = MAX_SCENARIOS;
    maxWidget.callback?.(MAX_SCENARIOS, app.canvas, node, [0, 0], {});
  }

  const buttons = [...root.querySelectorAll(".h3b7-actions .h3b7-btn")];
  const add = buttons.find((button) => String(button.textContent || "").includes("Scenario"));
  if (add) {
    add.disabled = count >= MAX_SCENARIOS;
    add.textContent = count >= MAX_SCENARIOS ? `${MAX_SCENARIOS} / ${MAX_SCENARIOS}` : "+ Scenario";
    add.title = count >= MAX_SCENARIOS
      ? `Smart Benchmark is limited to ${MAX_SCENARIOS} scenarios.`
      : `Add a scenario (${count}/${MAX_SCENARIOS}).`;
  }

  const summary = root.querySelector(".h3b7-summary strong");
  if (summary) summary.textContent = `${MAX_SCENARIOS} max`;
}

function attach(node) {
  if (!node || node.comfyClass !== TARGET) return;
  const root = node.__h3bRoot;
  if (!root?.isConnected) {
    setTimeout(() => attach(node), 160);
    return;
  }
  syncRoot(node);
  if (root.__h3BenchmarkControlsV12) return;
  root.__h3BenchmarkControlsV12 = true;
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      syncRoot(node);
    });
  });
  observer.observe(root, { childList: true, subtree: true });
  root.__h3BenchmarkControlsV12Observer = observer;
}

function sweep() {
  for (const node of app.graph?._nodes || []) {
    if (node?.comfyClass === TARGET) attach(node);
  }
}

async function handleBenchmarkClick(event) {
  const button = event.target?.closest?.("button.h3b7-btn");
  if (!button) return;
  const node = benchmarkNodeForElement(button);
  if (!node) return;

  if (button.dataset.h3BenchmarkBypass === "1") {
    delete button.dataset.h3BenchmarkBypass;
    return;
  }

  const label = String(button.textContent || "").trim();
  const count = scenarios(node).length;

  if (label === "+ Scenario" || label === `${MAX_SCENARIOS} / ${MAX_SCENARIOS}`) {
    if (count < MAX_SCENARIOS) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    toast("Benchmark limit reached", `Use up to ${MAX_SCENARIOS} scenarios per comparison.`, "info");
    return;
  }

  if (label === "Copy preset") {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    try {
      const code = exportCode(node);
      await copyTextReliable(code);
      toast("Benchmark preset copied", `${count} scenario${count === 1 ? "" : "s"} copied.`);
    } catch (error) {
      toast("Copy failed", String(error?.message || error), "error");
    }
    return;
  }

  if (label !== "Import") return;
  const importer = button.closest(".h3b7-import");
  if (!importer) {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    const live = node.__h3bRoot?.querySelector(".h3b7-import");
    live?.classList.toggle("open");
    live?.querySelector("textarea")?.focus?.({ preventScroll: true });
    return;
  }

  // Validate and normalize before letting the original benchmark importer do
  // the actual save + render, so its internal state stays authoritative.
  event.preventDefault();
  event.stopImmediatePropagation();
  event.stopPropagation();
  const area = importer.querySelector("textarea");
  try {
    const imported = await decodePreset(area?.value || "");
    if (imported.length > MAX_SCENARIOS) {
      throw new Error(`This preset has ${imported.length} scenarios. Smart Benchmark supports ${MAX_SCENARIOS} max.`);
    }
    const normalized = new TextEncoder().encode(JSON.stringify({ v: 1, scenarios: imported }));
    if (area) area.value = `${SHARE_PREFIX}${bytesToB64(normalized)}`;
    button.dataset.h3BenchmarkBypass = "1";
    button.click();
  } catch (error) {
    toast("Benchmark import failed", String(error?.message || error), "error");
  }
}

function install() {
  if (installed) return;
  installed = true;
  document.addEventListener("click", (event) => {
    void handleBenchmarkClick(event);
  }, true);
}

app.registerExtension({
  name: "H3Studio.BenchmarkControlsV12",
  setup() {
    install();
    setTimeout(sweep, 220);
  },
  nodeCreated(node) {
    if (node?.comfyClass === TARGET) setTimeout(() => attach(node), 220);
  },
  afterConfigureGraph() {
    setTimeout(sweep, 300);
  },
});

}
