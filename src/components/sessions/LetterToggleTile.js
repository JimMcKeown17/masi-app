import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors } from '../../constants/colors';
import { letterStateColors } from '../../constants/letterStateColors';
import { typeRoles } from '../../constants/typography';
import { useMotion } from '../../context/MotionContext';

const LetterToggleTile = React.memo(function LetterToggleTile({ letter, tone, size, onPress, disabled = false, accessibilityLabel, accessibilityState }) {
  const { reduceMotion } = useMotion();
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion) {
      scale.stopAnimation();
      scale.setValue(1);
    }
    return () => scale.stopAnimation();
  }, [reduceMotion, scale]);
  const animate = (pressed) => {
    if (reduceMotion || disabled) return;
    Animated.timing(scale, { toValue: pressed ? 0.96 : 1, duration: pressed ? 90 : 140, useNativeDriver: true }).start();
  };
  const palette = tone === 'selected' ? { bg: colors.text, border: colors.text, text: colors.onDark }
    : tone === 'taught' || tone === 'taughtNew' ? letterStateColors.taught
      : tone === 'locked' ? letterStateColors.assessment : letterStateColors.default;
  return <Animated.View style={{ transform: [{ scale }] }}>
    <Pressable onPress={onPress} onPressIn={() => animate(true)} onPressOut={() => animate(false)}
      disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, disabled }}
      style={({ pressed }) => [styles.tile, { width: size, height: size, backgroundColor: palette.bg, borderColor: palette.border ?? palette.bg },
        pressed && !disabled && (tone === 'rest' || tone === 'selected') && styles.pressed]}>
      <Text style={[styles.letter, { color: palette.text }]} maxFontSizeMultiplier={1.2}>{letter.toLowerCase()}</Text>
      {tone === 'taughtNew' ? <View testID="letter-new-dot" style={styles.newDot} /> : null}
      {tone === 'locked' ? <View style={styles.lock}><Ionicons name="lock-closed-outline" size={12} color={colors.successText} accessible={false} /></View> : null}
    </Pressable>
  </Animated.View>;
});
export default LetterToggleTile;

const styles = StyleSheet.create({
  tile: { borderRadius: borderRadius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  letter: { ...typeRoles.textLetter },
  pressed: { backgroundColor: colors.border },
  newDot: { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.onDark },
  lock: { position: 'absolute', top: 5, right: 5 },
});
