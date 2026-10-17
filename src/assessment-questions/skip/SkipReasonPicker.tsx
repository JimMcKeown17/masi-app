import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { tokens } from '../theme/tokens';
import { MANUAL_SKIP_REASONS, type ManualSkipReason } from './skipReasons';

export function SkipReasonPicker({
  onChoose,
  onCancel,
}: {
  onChoose: (reason: ManualSkipReason) => void;
  onCancel: () => void;
}) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Why are you skipping this question?</Text>
      {MANUAL_SKIP_REASONS.map(({ reason, label }) => (
        <Pressable key={reason} accessibilityRole="button" onPress={() => onChoose(reason)} style={styles.option}>
          <Text style={styles.optionText}>{label}</Text>
        </Pressable>
      ))}
      <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancel}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: tokens.space.lg, gap: tokens.space.sm },
  title: { fontSize: tokens.font.heading, color: tokens.color.ink, fontWeight: '600', marginBottom: tokens.space.sm },
  option: { paddingVertical: tokens.space.md, paddingHorizontal: tokens.space.lg, borderRadius: tokens.radius.card, borderWidth: 1, borderColor: tokens.color.line, backgroundColor: tokens.color.surface },
  optionText: { fontSize: tokens.font.body, color: tokens.color.ink },
  cancel: { paddingVertical: tokens.space.md, alignItems: 'center' },
  cancelText: { fontSize: tokens.font.body, color: tokens.color.muted },
});
