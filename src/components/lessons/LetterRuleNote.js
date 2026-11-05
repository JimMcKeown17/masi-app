import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, spacing, tints } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

// Wrap up's bold reminder for an EA's first lessons: mark a letter only when the child knows it alone.
export default function LetterRuleNote() {
  return <View testID="wrap-up-letter-rule" style={styles.note}>
    <Ionicons name="warning" size={22} color={colors.warningText} accessible={false} />
    <View style={styles.copy}>
      <Text style={styles.title}>Only tap a letter the child knows on their own.</Text>
      <Text style={styles.detail}>If they wait, guess or need your help, leave it. Teaching it today doesn't count.</Text>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.ms, paddingVertical: 14, paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md, borderWidth: 1.5, borderColor: tints.warningEdge, backgroundColor: colors.warningBg },
  copy: { flex: 1, gap: spacing.xs },
  title: { ...typeRoles.textRowTitle, color: colors.warningText },
  detail: { ...typeRoles.textBody, color: colors.warningText },
});
