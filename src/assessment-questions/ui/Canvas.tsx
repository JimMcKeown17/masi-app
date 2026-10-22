import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { tokens } from '../theme/tokens';

/** Shared capture surface; callers keep the normal View prop and style contract. */
export function Canvas({ style, ...props }: ViewProps) {
  return <View {...props} style={[styles.canvas, style]} />;
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: tokens.color.canvas },
});
