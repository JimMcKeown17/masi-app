import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { borderRadius, colors, spacing } from '../../constants/colors';
import { letterStateColors } from '../../constants/letterStateColors';
import { typeRoles } from '../../constants/typography';
import { useMotion } from '../../context/MotionContext';

export default React.memo(function BlendTile({ text, display, tone = 'rest', onPress, accessibilityLabel }) {
  const { reduceMotion } = useMotion();
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion) { scale.stopAnimation(); scale.setValue(1); }
    return () => scale.stopAnimation();
  }, [reduceMotion, scale]);
  const animate = pressed => {
    if (reduceMotion) return;
    Animated.timing(scale, { toValue: pressed ? 0.96 : 1, duration: pressed ? 90 : 140, useNativeDriver: true }).start();
  };
  const selected = tone === 'selected';
  const palette = selected ? { bg: colors.text, border: colors.text, text: colors.onDark } : letterStateColors.default;
  return <Animated.View style={[styles.container, { transform: [{ scale }] }]}>
    <Pressable onPress={onPress} onPressIn={() => animate(true)} onPressOut={() => animate(false)}
      accessibilityRole="button" accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? `${text.replace(/-/g, '')}, ${selected ? 'ticked' : 'not ticked'}`}
      style={({ pressed }) => [styles.tile, { backgroundColor: palette.bg, borderColor: palette.border }, pressed && styles.pressed]}>
      <Text style={[styles.text, { color: palette.text }]} maxFontSizeMultiplier={1.3}>{display ?? text}</Text>
    </Pressable>
  </Animated.View>;
});
const styles = StyleSheet.create({
  container: { maxWidth: '100%' },
  tile: { minHeight: 56, maxWidth: '100%', paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  text: { ...typeRoles.lessonItem, flexShrink: 1, textAlign: 'center' },
  pressed: { backgroundColor: colors.border },
});
