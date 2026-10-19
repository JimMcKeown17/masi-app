import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../constants/colors';
import { useToastObstruction } from '../../context/ToastContext';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';

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
      { paddingBottom: Math.max(insets.bottom, 16) }, style]}>
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
