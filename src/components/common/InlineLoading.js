import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import SpinnerArc from './SpinnerArc';

export default function InlineLoading({ label }) {
  return (
    <View testID="inline-loading" accessibilityLiveRegion="polite" style={styles.row}>
      <SpinnerArc size={22} color={colors.primary} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 28 },
  label: { ...typeRoles.textBodySemi, color: colors.text, flexShrink: 1 },
});
