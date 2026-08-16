
if (!globalThis.__H3_STUDIO_CANONICAL_UI__) {
/*
 * Director inspector compatibility alias.
 *
 * The current Director layout is still named h3s-v6-inspector while Runtime,
 * Custom LoRAs and Share look for h3s-v7-inspector. Keep both class names on
 * the same element so those extensions mount into the inspector instead of
 * falling back to the outer panel and throwing insertBefore DOMExceptions.
 */

function aliasInspector(root = document) {
  if (!root?.querySelectorAll) return;
  for (const inspector of root.querySelectorAll(".h3s-v6-inspector, .h3s-inspector")) {
    inspector.classList.add("h3s-v7-inspector");
  }
}

aliasInspector();

const observer = new MutationObserver((records) => {
  for (const record of records) {
    for (const added of record.addedNodes || []) {
      if (!(added instanceof Element)) continue;
      if (added.matches?.(".h3s-v6-inspector, .h3s-inspector")) {
        added.classList.add("h3s-v7-inspector");
      }
      aliasInspector(added);
    }
  }
});

observer.observe(document.documentElement, { childList: true, subtree: true });

}
