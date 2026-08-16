import { app } from "../../scripts/app.js";

const ROOT_SELECTOR = ".h3b7.h3final-benchmark";
const MP_SELECTOR = "[data-h3-director-mp='1']";
const LEGACY_MP_SELECTOR = ".h3final-target-field > input[type='number'], .h3final-target-field > .h3b7-input[type='number']";
let restoreToken = 0;
let activeObserver = null;

function isScrollable(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.scrollHeight <= element.clientHeight + 1) return false;
  const style = getComputedStyle(element);
  return /(auto|scroll|overlay)/.test(`${style.overflowY} ${style.overflow}`);
}

function snapshot(root) {
  if (!(root instanceof HTMLElement)) return null;
  const entries = [];
  const seen = new Set();
  const add = (element) => {
    if (!(element instanceof HTMLElement) || seen.has(element)) return;
    seen.add(element);
    entries.push({ element, top: element.scrollTop, left: element.scrollLeft });
  };

  // .h3b7 is normally the scroller, but ComfyUI DOMWidget layouts can put
  // scrolling on a wrapper. Preserve both the Benchmark root and every
  // scrollable ancestor so a scenario rerender cannot jump either layer.
  add(root);
  add(root.querySelector(".h3b7-body"));
  let parent = root.parentElement;
  while (parent && parent !== document.body) {
    if (isScrollable(parent)) add(parent);
    parent = parent.parentElement;
  }
  return entries;
}

function restore(entries, token) {
  if (!entries || token !== restoreToken) return;
  for (const state of entries) {
    if (!state.element?.isConnected) continue;
    state.element.scrollTop = state.top;
    state.element.scrollLeft = state.left;
  }
}

function preserveScroll(root) {
  const entries = snapshot(root);
  if (!entries?.length) return;
  const token = ++restoreToken;
  activeObserver?.disconnect();

  const apply = () => restore(entries, token);

  // The hidden legacy MP input fires the synchronous Benchmark render. Observe
  // the root itself so every replaceChildren/mutation gets its scroll restored
  // on the following frame, not before the rerender like the old guard did.
  activeObserver = new MutationObserver(() => requestAnimationFrame(apply));
  activeObserver.observe(root, { childList: true, subtree: true });

  queueMicrotask(apply);
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
  for (const delay of [16, 40, 80, 140, 220, 360, 520]) setTimeout(apply, delay);
  setTimeout(() => {
    if (token !== restoreToken) return;
    apply();
    activeObserver?.disconnect();
    activeObserver = null;
  }, 650);
}

function guard(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const isLegacyMpCommit = target.matches?.(LEGACY_MP_SELECTOR);
  if (!isLegacyMpCommit) return;
  const root = target.closest(ROOT_SELECTOR);
  if (root) preserveScroll(root);
}

app.registerExtension({
  name: "H3Studio.BenchmarkMPScrollGuardV33",
  setup() {
    document.addEventListener("change", guard, true);
    document.addEventListener("click", guard, true);
  },
});
