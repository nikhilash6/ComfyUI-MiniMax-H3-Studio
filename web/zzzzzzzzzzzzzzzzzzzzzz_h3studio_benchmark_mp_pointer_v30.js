import { app } from "../../scripts/app.js";
import { rangeValueFromPointer } from "./js/core/dom.js";

const SELECTOR = ".h3b7.h3final-benchmark .h3final-mp-range";
let observer = null;

function wireRange(range) {
  if (!(range instanceof HTMLInputElement) || range.dataset.h3MpPointerV30 === "1") return;
  range.dataset.h3MpPointerV30 = "1";

  const options = {
    min: Number(range.min),
    max: Number(range.max),
    step: Number(range.step),
  };
  let lastCommitted = String(range.value);
  let syntheticCommit = false;

  const updateFromPointer = (event) => {
    const track = range.closest(".h3final-mp-track");
    if (!track) return;
    const next = rangeValueFromPointer(event.clientX, track.getBoundingClientRect(), options);
    if (String(next) === String(range.value)) return;
    range.value = String(next);
    range.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const commit = () => {
    const current = String(range.value);
    if (current === lastCommitted) return;
    syntheticCommit = true;
    range.dispatchEvent(new Event("change", { bubbles: true }));
    syntheticCommit = false;
    lastCommitted = current;
  };

  // The benchmark control already owns its change handler. This capture listener
  // only suppresses the duplicate native change that can arrive after our
  // pointer-up commit.
  range.addEventListener("change", (event) => {
    const current = String(range.value);
    if (syntheticCommit) {
      lastCommitted = current;
      return;
    }
    if (current === lastCommitted) {
      event.stopImmediatePropagation();
      event.preventDefault();
      return;
    }
    lastCommitted = current;
  }, true);

  // Match Director's rangeControl interaction: capture the pointer and derive
  // the value directly from horizontal pointer position so dragging stays
  // smooth even when ComfyUI is repainting the node underneath the DOM widget.
  range.addEventListener("pointerdown", (event) => {
    range.focus();
    range.setPointerCapture?.(event.pointerId);
    updateFromPointer(event);
  });
  range.addEventListener("pointermove", (event) => {
    if (!range.hasPointerCapture?.(event.pointerId)) return;
    updateFromPointer(event);
  });
  const releasePointer = (event) => {
    if (range.hasPointerCapture?.(event.pointerId)) range.releasePointerCapture?.(event.pointerId);
    commit();
  };
  range.addEventListener("pointerup", releasePointer);
  range.addEventListener("pointercancel", releasePointer);
}

function wireTree(root) {
  if (!(root instanceof Element || root instanceof Document)) return;
  if (root instanceof Element && root.matches(SELECTOR)) wireRange(root);
  root.querySelectorAll?.(SELECTOR).forEach(wireRange);
}

app.registerExtension({
  name: "H3Studio.BenchmarkMPPointerV30",
  setup() {
    wireTree(document);
    if (observer || !document.body) return;
    observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) wireTree(node);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  },
});
