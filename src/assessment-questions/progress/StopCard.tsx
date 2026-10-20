import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { tokens } from '../theme/tokens';

export function StopCard({ childName, stopAt, onSave, onUndo }: {
  childName?: string;
  stopAt: number;
  onSave: () => void;
  onUndo: () => void;
}) {
  return (
    <View testID="stop-card" style={styles.overlay} accessibilityViewIsModal>
      <View style={styles.panel}>
        <Text style={styles.title} accessibilityRole="header">
          {`${childName ?? 'The child'} got ${stopAt} in a row wrong. The test has stopped.`}
        </Text>
        <Pressable accessibilityRole="button" onPress={onSave} style={styles.primary}>
          <Text style={styles.primaryText}>Save result</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onUndo} style={styles.secondary}>
          <Text style={styles.secondaryText}>Undo last mark</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', backgroundColor: tokens.color.scrim },
  panel: { padding: tokens.space.xl, gap: tokens.space.md, backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radius.card, borderTopRightRadius: tokens.radius.card },
  title: { fontSize: tokens.font.heading, fontWeight: '600', color: tokens.color.ink },
  primary: { minHeight: 56, padding: tokens.space.md, borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.primaryPressed, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: tokens.font.body, fontWeight: '600', color: tokens.color.onPrimary },
  secondary: { minHeight: 44, padding: tokens.space.md, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: tokens.font.body, fontWeight: '600', color: tokens.color.primaryPressed },
});
