import React from 'react';
import { StyleSheet, View } from 'react-native';
import { borderRadius, colors, tints } from '../../constants/colors';

export default function SurfaceCard({ children, style, testID }) {
  return <View testID={testID} style={[styles.card, style]}>{children}</View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: tints.rule, borderRadius: borderRadius.lg, padding: 16 },
});
