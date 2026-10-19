export const HERO_DESIGN_WIDTH = 390;
export const LEARNER = { left: 74, top: 110, width: 296, height: 430 };

export function computeHeroArtLayout({ windowWidth, windowHeight, anchorPanelTop, panelTop }) {
  const scale = Math.min(1, Math.max(0.74, 0.74 + (windowHeight - 640) * 0.26 / 204));
  const offsetX = windowWidth - HERO_DESIGN_WIDTH * scale;
  // Follow the rest panel's anchor so notes cover more art without moving its crop.
  const offsetY = Math.max(-43.8 * (1 - scale), anchorPanelTop - 446 * scale);
  const visible = panelTop - (offsetY + LEARNER.top * scale) >= 120;
  return { scale, offsetX, offsetY, visible };
}
