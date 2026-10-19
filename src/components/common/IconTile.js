import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors } from '../../constants/colors';

const tones = {
  canvas: { backgroundColor: colors.background, color: colors.text, size: 20 },
  red: { backgroundColor: colors.red50, color: colors.red700, size: 22 },
  warning: { backgroundColor: colors.warningBg, color: colors.warningText, size: 22 },
};
export default function IconTile({ icon, tone = 'canvas', iconSize }) {
  const { backgroundColor, color, size } = tones[tone];
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.tile, { backgroundColor }]}>
    <Ionicons name={icon} size={iconSize ?? size} color={color} />
  </View>;
}
const styles = StyleSheet.create({
  tile: { width: 40, height: 40, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center' },
});
