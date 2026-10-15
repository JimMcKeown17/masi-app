import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { tokens } from '../theme/tokens';
import { NO_ATTEMPT } from './applyProgress';

export function LastAttemptedSheet({
  labels,
  rowLengths,
  defaultIndex,
  onConfirm,
  onCancel,
}: {
  labels: string[];
  rowLengths?: number[];
  defaultIndex: number;
  onConfirm: (index: number) => void;
  onCancel?: () => void;
}) {
  const [selected, setSelected] = useState(defaultIndex);
  const rows: number[][] = [];
  let cursor = 0;
  for (const len of rowLengths ?? [labels.length]) {
    rows.push(Array.from({ length: len }, (_, i) => cursor + i).filter((i) => i < labels.length));
    cursor += len;
  }
  if (cursor < labels.length) rows.push(Array.from({ length: labels.length - cursor }, (_, i) => cursor + i));

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Last item attempted</Text>
      <Text style={styles.subtitle}>Tap the last item the child attempted.</Text>
      <ScrollView contentContainerStyle={styles.rows}>
        {rows.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`${labels[i]}, item ${i + 1}`}
                accessibilityState={{ selected: i === selected }}
                onPress={() => setSelected(i)}
                style={[styles.cell, i === selected && styles.cellSelected]}
              >
                <Text style={[styles.cellText, i === selected && styles.cellTextSelected]}>{labels[i]}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => onConfirm(labels.length - 1)}><Text style={styles.link}>Reached the end</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => onConfirm(NO_ATTEMPT)}><Text style={styles.link}>Nothing attempted</Text></Pressable>
        {onCancel ? (
          <Pressable accessibilityRole="button" onPress={onCancel}><Text style={styles.link}>Cancel</Text></Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={() => onConfirm(selected)} style={styles.confirm}>
          <Text style={styles.confirmText}>Confirm</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: tokens.space.lg, backgroundColor: tokens.color.surface },
  title: { fontSize: tokens.font.heading, fontWeight: '600', color: tokens.color.ink },
  subtitle: { fontSize: tokens.font.body, color: tokens.color.muted, marginBottom: tokens.space.md },
  rows: { gap: tokens.space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.xs },
  cell: { minWidth: 44, minHeight: 44, paddingHorizontal: tokens.space.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: tokens.color.line, borderRadius: tokens.radius.cell },
  cellSelected: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
  cellText: { fontSize: tokens.font.body, color: tokens.color.ink },
  cellTextSelected: { color: tokens.color.onPrimary, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: tokens.space.lg, paddingTop: tokens.space.md },
  link: { fontSize: tokens.font.body, color: tokens.color.primary },
  confirm: { marginLeft: 'auto', backgroundColor: tokens.color.primary, paddingHorizontal: tokens.space.xl, paddingVertical: tokens.space.md, borderRadius: tokens.radius.card },
  confirmText: { color: tokens.color.onPrimary, fontWeight: '600', fontSize: tokens.font.body },
});
