import React, { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../constants/colors';
import { useToastObstruction } from '../../context/ToastContext';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';

// iOS's home-indicator inset already includes clearance; an Android 3-button bar fills its
// whole inset, so the action keeps the footer's 11dp top padding as breathing room above it.
function footerBottomPadding(insetBottom) {
  return Platform.OS === 'android' ? Math.max(insetBottom + 11, 16) : Math.max(insetBottom, 16);
}

export default function StickyActionFooter({ children, surface = 'always', overflowing = false, hideOnKeyboard = false, style }) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [height, setHeight] = useState(0);
  const hidden = hideOnKeyboard && keyboardHeight > 0;
  useToastObstruction(height, !hidden);

  if (__DEV__ && !['always', 'onOverflow'].includes(surface)) throw new Error(`Unsupported StickyActionFooter surface: ${surface}`);
  if (hidden) return null;

  return <View testID="sticky-action-footer"
    onLayout={event => setHeight(event.nativeEvent.layout.height)}
    style={[styles.footer, surface === 'onOverflow' && !overflowing && styles.bare,
      { paddingBottom: footerBottomPadding(insets.bottom) }, style]}>
    {children}
  </View>;
}

const styles = StyleSheet.create({
  bare: { backgroundColor: 'transparent', borderTopWidth: 0 },
  footer: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 11,
    paddingHorizontal: 24,
  },
});
