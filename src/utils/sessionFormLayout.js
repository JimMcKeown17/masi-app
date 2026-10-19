// Uniform row geometry keeps FlatList offsets exact at every supported font scale.
export const rosterRowHeight = (fontScale) => Math.max(64, Math.ceil(20 + 2 + (22 + 18) * fontScale));

export function stepScrollOffset({ step, paddingTop, headerHeight, childrenSectionY, bodyHeight, footerSectionY }) {
  const sectionY = step === 2 ? childrenSectionY : headerHeight + bodyHeight + footerSectionY[step];
  return Math.max(0, paddingTop + sectionY - 12);
}
