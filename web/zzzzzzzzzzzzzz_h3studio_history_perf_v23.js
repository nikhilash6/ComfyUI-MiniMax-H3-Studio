import { openImageLightbox } from "./js/core/lightbox.js";

// History rendering, thumbnails, favorites and filtering now live in the
// persistent library layer. Keep only the full-resolution expand override here
// so the strip can display a 256px thumbnail without opening that thumbnail.
window.addEventListener("click", (event) => {
  const expand = event.target?.closest?.(".h3s-strip-expand");
  if (!expand) return;
  const card = expand.closest(".h3s-demo-card[data-kind='history']");
  if (!card) return;
  const image = card.querySelector("img.h3s-demo-thumb");
  const fullSrc = String(image?.dataset?.fullSrc || "").trim();
  if (!fullSrc) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  openImageLightbox(fullSrc, image?.alt || "H3 Studio image");
}, true);
