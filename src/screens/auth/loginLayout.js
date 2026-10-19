export function computeLoginLayout({ windowHeight, insetsTop, keyboardHeight, standardPanelHeight }) {
  const lockupTop = Math.max(insetsTop + 9, 40);
  if (keyboardHeight === 0) return { mode: 'rest', lockupTop, showLockup: true };

  const compact = standardPanelHeight != null
    && lockupTop + 74 + standardPanelHeight > windowHeight - keyboardHeight;
  return { mode: compact ? 'keyboardCompact' : 'keyboard', lockupTop, showLockup: !compact };
}
