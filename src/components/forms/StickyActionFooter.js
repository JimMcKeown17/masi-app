import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../constants/colors';
import { useToastObstruction } from '../../context/ToastContext';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';

export default function StickyActionFooter({ children, surface = 'always', hideOnKeyboard = false }) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [height, setHeight] = useState(0);
  const hidden = hideOnKeyboard && keyboardHeight > 0;
  useToastObstruction(height, !hidden);

  if (__DEV__ && surface !== 'always') throw new Error(`Unsupported StickyActionFooter surface: ${surface}`);
  if (hidden) return null;

  return <View testID="sticky-action-footer"
    onLayout={event => setHeight(event.nativeEvent.layout.height)}
    style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
    {children}
  </View>;
}

const styles = StyleSheet.create({
  footer: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 11,
    paddingHorizontal: 24,
  },
});
