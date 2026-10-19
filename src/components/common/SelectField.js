import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import InlineNote from './InlineNote';

export default function SelectField({ label, value, placeholder, icon, error, onPress, accessibilityLabel, disabled = false }) {
  return <View>
    <Pressable accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${label}, ${value || placeholder}`}
      accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.box, {
        backgroundColor: disabled || pressed ? colors.border : colors.surface,
        borderColor: disabled ? 'transparent' : error ? colors.error : colors.fieldEdge,
      }]}>
      {icon ? <Ionicons name={icon} size={22} color={disabled ? colors.disabled : colors.textSecondary} /> : null}
      <View style={styles.values}>
        <Text style={[styles.label, { color: error ? colors.error : colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.value, { color: disabled ? colors.disabled : value ? colors.text : colors.placeholder }]}>{value || placeholder}</Text>
      </View>
      <Ionicons name="chevron-down" size={20} color={disabled ? colors.disabled : colors.textSecondary} />
    </Pressable>
    {typeof error === 'string' && error ? <View style={styles.note}><InlineNote>{error}</InlineNote></View> : null}
  </View>;
}
const styles = StyleSheet.create({
  box: { minHeight: 60, borderRadius: borderRadius.md, borderWidth: 2, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  values: { flex: 1 },
  label: { ...typeRoles.textLabel, marginBottom: 2 },
  value: { ...typeRoles.textInput },
  note: { marginTop: 8 },
});
