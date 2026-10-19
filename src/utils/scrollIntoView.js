export function computeScrollTarget({ blockY, blockHeight, scrollY, viewportHeight }) {
  const blockBottom = blockY + blockHeight;
  if (blockY >= scrollY && blockBottom <= scrollY + viewportHeight) return null;
  // An oversized block cannot fit in full; anchor its start so the field is visible.
  if (blockHeight > viewportHeight || blockY < scrollY) return blockY;
  return blockBottom - viewportHeight;
}
