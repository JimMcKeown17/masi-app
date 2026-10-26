import React from 'react';
import { StyleSheet, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { UiText } from './Text';

const styles = StyleSheet.create({
  group: { gap: tokens.space.sm },
  card: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.card, padding: tokens.space.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm },
});

/** Shared group chrome for scrolling capture bodies. */
export function TileGroup({ card = false, heading, testID, children }: {
  card?: boolean;
  heading?: string;
  testID?: string;
  children: React.ReactNode;
}) {
  if (!card && heading === undefined) {
    return <View testID={testID} style={styles.row}>{children}</View>;
  }
  return <View testID={testID} style={[styles.group, card && styles.card]}>
    {heading !== undefined && <UiText variant="label" tone="muted">{heading}</UiText>}
    <View style={styles.row}>{children}</View>
  </View>;
}
