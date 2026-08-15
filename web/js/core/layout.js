export const STUDIO_PANEL_HEIGHT = 640;
export const STUDIO_NODE_WIDTH = 680;
export const STUDIO_NODE_HEIGHT = 780;
export const STUDIO_NODE_MIN_HEIGHT = 520;
export const STUDIO_NODE_MAX_HEIGHT = 1280;
export const STUDIO_PANEL_CHROME_HEIGHT = 140;

export function studioPanelSize(width) {
  const safeWidth = Number.isFinite(Number(width)) ? Number(width) : 0;
  return [safeWidth, STUDIO_PANEL_HEIGHT];
}

export function panelHeightForNode(size) {
  const height = Number(size?.[1]);
  const resolved = Number.isFinite(height) ? height : STUDIO_NODE_HEIGHT;
  return Math.max(360, Math.min(STUDIO_NODE_MAX_HEIGHT - STUDIO_PANEL_CHROME_HEIGHT, resolved - STUDIO_PANEL_CHROME_HEIGHT));
}

export function clampStudioNodeSize(size, minimumSize = [STUDIO_NODE_WIDTH, STUDIO_NODE_MIN_HEIGHT]) {
  const width = Number(size?.[0]);
  const height = Number(size?.[1]);
  const minimumWidth = Number(minimumSize?.[0]);
  const minimumHeight = Number(minimumSize?.[1]);
  const resolvedMinHeight = Math.max(
    STUDIO_NODE_MIN_HEIGHT,
    Number.isFinite(minimumHeight) ? Math.min(minimumHeight, STUDIO_NODE_MAX_HEIGHT) : 0,
  );
  return [
    Math.max(
      STUDIO_NODE_WIDTH,
      Number.isFinite(minimumWidth) ? minimumWidth : 0,
      Number.isFinite(width) ? width : 0,
    ),
    Math.max(
      resolvedMinHeight,
      Math.min(STUDIO_NODE_MAX_HEIGHT, Number.isFinite(height) ? height : STUDIO_NODE_HEIGHT),
    ),
  ];
}

export function initialStudioNodeSize(size) {
  const width = Number(size?.[0]);
  const height = Number(size?.[1]);
  return [
    Math.max(STUDIO_NODE_WIDTH, Number.isFinite(width) ? width : 0),
    Math.max(STUDIO_NODE_MIN_HEIGHT, Math.min(STUDIO_NODE_MAX_HEIGHT, Number.isFinite(height) ? height : STUDIO_NODE_HEIGHT)),
  ];
}