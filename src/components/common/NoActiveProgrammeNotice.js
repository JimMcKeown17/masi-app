import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../../constants/colors';

/**
 * Actionable empty-state shown on the Sessions / Assessments capture surfaces when
 * the signed-in EA has no active programme assignment. Front-loads the data
 * layer's "no resolvable programme" fail-safe so the EA never fills a form that
 * fails at save — instead they see what to do about it.
 *
 * Presentational only: the screen decides when to render this (see
 * getActiveProgrammeGate). `action` names the blocked task for the copy.
 */
export default function NoActiveProgrammeNotice({ action = 'record sessions or assessments' }) {
  return (
    <View style={styles.container} accessibilityRole="summary">
      <Ionicons name="school-outline" size={48} color={colors.disabled} style={styles.icon} />
      <Text variant="titleMedium" style={styles.title}>No active programme</Text>
      <Text variant="bodyMedium" style={styles.body}>
        You don't have a programme assigned yet. Contact your supervisor to be assigned
        before you can {action}.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    margin: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
  },
  icon: {
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  body: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
