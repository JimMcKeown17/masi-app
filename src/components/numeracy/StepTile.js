import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors } from '../../constants/colors';
import { masteryStateColors } from '../../constants/masteryStateColors';
import { typeRoles } from '../../constants/typography';
import { useMotion } from '../../context/MotionContext';

const STATE_WORDS = { ticked: 'Ticked', assessment: 'Assessment', implied: 'Known', not_yet: 'Not yet' };

const StepTile = React.memo(function StepTile({ tile, label, onPress, size = 44, disabled = false }) {
  const { reduceMotion } = useMotion();
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion || disabled) {
      scale.stopAnimation();
      scale.setValue(1);
    }
    return () => scale.stopAnimation();
  }, [reduceMotion, disabled, scale]);
  const animate = pressed => {
    if (reduceMotion || disabled) return;
    Animated.timing(scale, { toValue: pressed ? 0.96 : 1, duration: pressed ? 90 : 140, useNativeDriver: true }).start();
  };
  const palette = tile.state === 'assessment' ? masteryStateColors.assessment
    : tile.state === 'ticked' || tile.state === 'implied' ? masteryStateColors.taught : masteryStateColors.default;
  return <Animated.View style={{ transform: [{ scale }] }}>
    <Pressable onPress={onPress} onPressIn={() => animate(true)} onPressOut={() => animate(false)}
      disabled={disabled} accessibilityRole="button" accessibilityLabel={`${label}, ${STATE_WORDS[tile.state]}`}
      accessibilityState={{ disabled }}
      style={[styles.tile, { width: size, height: size, backgroundColor: palette.bg, borderColor: palette.border }, tile.next && styles.next]}>
      <Text style={[styles.label, { color: palette.text }]} maxFontSizeMultiplier={1.2}>{tile.sizeLabel}</Text>
      {tile.state === 'assessment' ? <View style={styles.mark}><Ionicons name="lock-closed-outline" size={12} color={palette.text} accessible={false} /></View> : null}
      {tile.state === 'implied' ? <Text accessible={false} style={[styles.arrow, { color: palette.text }]}>↑</Text> : null}
    </Pressable>
  </Animated.View>;
});
export default StepTile;

const styles = StyleSheet.create({
  tile: { borderRadius: borderRadius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  label: { ...typeRoles.textLetter },
  next: { borderStyle: 'dashed', borderColor: colors.primary },
  mark: { position: 'absolute', top: 3, right: 3 },
  arrow: { ...typeRoles.textMicroStrong, position: 'absolute', top: 1, right: 3 },
});
