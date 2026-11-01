import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, borderRadius } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { stripSummary, tickWhenLines } from '../../numeracyLesson/copy';

export default function TickWhenStrip({ curriculum, stepKey, initiallyOpen = false }) {
  const [open, setOpen] = useState(initiallyOpen);
  const summary = stripSummary(curriculum, stepKey);
  if (!summary) return null;
  const lines = tickWhenLines(curriculum, stepKey);
  return <View style={styles.strip}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(value => !value)} style={styles.button}>
      <Text style={styles.text}>{summary}</Text>
    </Pressable>
    {open ? <View style={styles.lines}>
      <Text style={styles.text}>{lines.setup}</Text>
      {lines.items.map((item, i) => <Text key={i} style={styles.text}>{`${item.ask} → ${item.expected}`}</Text>)}
      <Text style={styles.text}>{lines.rule}</Text>
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({
  strip: { backgroundColor: colors.surface, borderRadius: borderRadius.md },
  button: { minHeight: 44, padding: spacing.md, justifyContent: 'center' },
  lines: { padding: spacing.md, gap: spacing.sm }, text: { ...typeRoles.textBody, color: colors.text },
});
