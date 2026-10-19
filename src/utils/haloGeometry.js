export function haloGeometry(width) {
  const r = width / 2 + 19;
  const svgHeight = r - 9;
  return {
    cx: width / 2,
    r,
    stroke: 32,
    svgHeight,
    cy: svgHeight + 26,
    headlineGap: Math.max(112, Math.round(width / 2 - 83)),
  };
}
