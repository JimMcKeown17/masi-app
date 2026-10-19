import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

const StepHeader = React.forwardRef(function StepHeader({ step, label, status = 'todo', right, onLayout }, ref) {
  const done = status === 'done';
  const error = status === 'error';
  const suffix = done ? ', complete' : error ? ', needs attention' : '';
  return <View ref={ref} onLayout={onLayout} accessible accessibilityRole="header"
    accessibilityLabel={`Step ${step}: ${label}${suffix}`} style={styles.row}>
    <View style={[styles.disc, done && styles.done, error && styles.errorDisc]}>
      {done ? <Ionicons name="checkmark" size={12} color={colors.onDark} />
        : <Text style={[styles.numeral, error && styles.errorText]}>{step}</Text>}
    </View>
    <Text style={[styles.label, error && styles.errorText]}>{label}</Text>
    {typeof right === 'string' ? <Text style={styles.right}>{right}</Text> : right}
  </View>;
});
export default StepHeader;

const styles = StyleSheet.create({
  row: { minHeight: 20, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  disc: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.textSecondary, alignItems: 'center', justifyContent: 'center' },
  done: { backgroundColor: colors.text, borderColor: colors.text },
  errorDisc: { borderColor: colors.error },
  numeral: { ...typeRoles.textBadge, color: colors.text },
  label: { ...typeRoles.textSectionLabel, textTransform: 'uppercase', color: colors.textSecondary, flex: 1 },
  errorText: { color: colors.error },
  right: { ...typeRoles.textCaption, color: colors.textSecondary },
});
