const STYLE_ID = "h3studio-strip-labels-v20-style";

function installStripLabelStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h3s-demo-thumb-box {
      position: relative !important;
      isolation: isolate;
    }

    .h3s-demo-category-tag,
    .h3s-demo-badge-specs,
    .h3s-demo-source-tag {
      position: absolute !important;
      z-index: 4 !important;
      display: inline-flex !important;
      align-items: center !important;
      min-height: 18px !important;
      padding: 3px 7px !important;
      border: 1px solid rgba(255,255,255,.15) !important;
      border-radius: 999px !important;
      background: linear-gradient(180deg, rgba(17,21,24,.86), rgba(8,11,13,.78)) !important;
      color: rgba(235,240,243,.94) !important;
      box-shadow: 0 2px 8px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.035) !important;
      backdrop-filter: blur(8px) saturate(115%) !important;
      -webkit-backdrop-filter: blur(8px) saturate(115%) !important;
      font-size: 7px !important;
      font-weight: 720 !important;
      line-height: 1 !important;
      letter-spacing: .045em !important;
      white-space: nowrap !important;
      pointer-events: none !important;
    }

    .h3s-demo-category-tag {
      top: 7px !important;
      left: 7px !important;
      text-transform: uppercase !important;
      color: #d8e0e4 !important;
    }

    .h3s-demo-source-tag {
      top: 7px !important;
      right: 7px !important;
      color: #9fd5c0 !important;
      border-color: rgba(111,190,157,.26) !important;
      background: linear-gradient(180deg, rgba(20,42,35,.82), rgba(10,25,21,.76)) !important;
    }

    .h3s-demo-source-tag.is-missing {
      color: #e0a79f !important;
      border-color: rgba(210,120,110,.28) !important;
      background: linear-gradient(180deg, rgba(48,27,25,.82), rgba(28,16,15,.76)) !important;
    }

    .h3s-demo-badge-specs {
      right: 7px !important;
      bottom: 7px !important;
      left: auto !important;
      max-width: calc(100% - 45px) !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      color: #cbd6dc !important;
      letter-spacing: .015em !important;
      text-transform: none !important;
    }

    /* Expand stays visually secondary and never covers the metadata labels. */
    .h3s-strip-expand {
      left: 7px !important;
      right: auto !important;
      top: auto !important;
      bottom: 7px !important;
      width: 20px !important;
      height: 20px !important;
      border: 1px solid rgba(255,255,255,.11) !important;
      border-radius: 999px !important;
      background: rgba(8,11,13,.42) !important;
      color: rgba(235,240,243,.72) !important;
      box-shadow: none !important;
      backdrop-filter: blur(6px) !important;
      -webkit-backdrop-filter: blur(6px) !important;
      opacity: 0 !important;
      transform: scale(.94) !important;
      transition: opacity .14s ease, transform .14s ease, background .14s ease, color .14s ease !important;
    }

    .h3s-demo-card:hover .h3s-strip-expand,
    .h3s-strip-expand:focus-visible {
      opacity: .92 !important;
      transform: scale(1) !important;
    }

    .h3s-strip-expand:hover {
      opacity: 1 !important;
      background: rgba(18,23,27,.72) !important;
      color: #fff !important;
    }
  `;
  document.head.append(style);
}

installStripLabelStyles();
