import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

const tones = {
  warning: { backgroundColor: colors.warningBg, color: colors.warningText },
  success: { backgroundColor: colors.successBg, color: colors.successText },
  successStrong: { backgroundColor: colors.successText, color: colors.onDark },
  error: { backgroundColor: colors.errorBg, color: colors.error },
  neutral: { backgroundColor: colors.border, color: colors.text },
};
export default function StatusBadge({ label, tone = 'neutral' }) {
  const { backgroundColor, color } = tones[tone];
  return <View style={[styles.badge, { backgroundColor }]}>
    <Text style={[styles.label, { color }]}>{label}</Text>
  </View>;
}
const styles = StyleSheet.create({
  badge: { minHeight: 22, borderRadius: borderRadius.pill, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  label: { ...typeRoles.textBadge, textAlign: 'center' },
});
