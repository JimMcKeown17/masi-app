import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '../common/BottomSheet';
import {
  SESSION_CLOCK_WARNING,
  SESSION_CLOCK_WARNING_COST,
} from '../../hooks/useSessionLaunchGuard';
import { borderRadius, colors, spacing } from '../../constants/colors';

export default function ClockInBeforeSessionSheet({
  visible,
  onDismiss,
  onClockInNow,
  onContinueAnyway,
}) {
  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      dismissLabel="Dismiss clock-in warning"
      title={SESSION_CLOCK_WARNING}
      subtitle="Clock in first so your hours are counted alongside this session."
      scrollable={false}
      keyboardAvoiding={false}
      maxHeight={520}
      bodyContentStyle={styles.body}
    >
      <Pressable
        onPress={onClockInNow}
        accessibilityRole="button"
        accessibilityLabel="Clock in now"
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>Clock in now</Text>
      </Pressable>

      <View style={styles.warning}>
        <Ionicons name="warning-outline" size={18} color={colors.warning} />
        <Text style={styles.warningText}>{SESSION_CLOCK_WARNING_COST}</Text>
      </View>

      <Pressable
        onPress={onContinueAnyway}
        accessibilityRole="button"
        accessibilityLabel="Record without clocking in"
        style={styles.secondaryButton}
      >
        <Text style={styles.secondaryButtonText}>Record without clocking in</Text>
      </Pressable>

      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        style={styles.cancelButton}
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.sm + 2,
    paddingBottom: spacing.sm,
  },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.sm,
    borderCurve: 'continuous',
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: colors.onDark,
    fontSize: 14,
    fontWeight: '800',
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: borderRadius.sm,
    borderCurve: 'continuous',
    backgroundColor: colors.warningBg,
    padding: spacing.sm + 2,
  },
  warningText: {
    flex: 1,
    color: colors.warningText,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: borderRadius.sm,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  secondaryButtonText: {
    color: colors.warningText,
    fontSize: 13,
    fontWeight: '800',
  },
  cancelButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
});
