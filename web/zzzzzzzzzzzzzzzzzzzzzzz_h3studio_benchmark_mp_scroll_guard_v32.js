import { app } from "../../scripts/app.js";

const ROOT_SELECTOR = ".h3b7.h3final-benchmark";
const MP_SELECTOR = "[data-h3-director-mp='1']";
let restoreToken = 0;

function snapshot(root) {
  if (!root) return null;
  const body = root.querySelector(".h3b7-body");
  return {
    root,
    rootTop: root.scrollTop,
    body,
    bodyTop: body?.scrollTop || 0,
  };
}

function restore(state, token) {
  if (!state || token !== restoreToken) return;
  const root = state.root?.isConnected ? state.root : null;
  if (!root) return;
  root.scrollTop = state.rootTop;
  const body = state.body?.isConnected ? state.body : root.querySelector(".h3b7-body");
  if (body) body.scrollTop = state.bodyTop;
}

function preserveScroll(root) {
  const state = snapshot(root);
  if (!state) return;
  const token = ++restoreToken;
  const apply = () => restore(state, token);

  // Benchmark's legacy scenario callback may rebuild its inner DOM synchronously
  // and again on queued UI work. Reapply the exact scroll position across those
  // frames so MP changes behave like Director controls instead of jumping upward.
  queueMicrotask(apply);
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
  for (const delay of [24, 60, 120, 220]) setTimeout(apply, delay);
}

function targetRoot(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest(MP_SELECTOR)) return null;
  return target.closest(ROOT_SELECTOR);
}

function guard(event) {
  const root = targetRoot(event);
  if (root) preserveScroll(root);
}

app.registerExtension({
  name: "H3Studio.BenchmarkMPScrollGuardV32",
  setup() {
    // change catches slider commits; click catches the Director preset buttons.
    document.addEventListener("change", guard, true);
    document.addEventListener("click", guard, true);
  },
});
