import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import BrandButton from './BrandButton';

export default function SectionHeader({ title, hint, action, style }) {
  return <View style={[styles.container, style]}>
    <View style={styles.row}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {action ? <BrandButton {...action} variant="tertiary" style={[styles.action, action.style]} /> : null}
    </View>
    {hint ? <Text style={styles.hint}>{hint}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  row: { minHeight: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { ...typeRoles.textSectionLabel, color: colors.textSecondary, flex: 1 },
  hint: { ...typeRoles.textCaption, color: colors.textSecondary, marginTop: 4 },
  action: { marginVertical: -12 },
});
