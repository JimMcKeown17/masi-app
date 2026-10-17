import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import BottomSheet from '../common/BottomSheet';
import { borderRadius, colors, spacing } from '../../constants/colors';

export default function SignOutSheets({
  step, unsentCount, busy, message, isOnline,
  clockOutNow, stayClockedIn, tryUploadNow, recheck, signOutAnyway, cancel,
}) {
  const isBusy = busy !== null;
  const countUnknown = unsentCount === null;
  const clockOutLabel = busy === 'clocking_out' ? 'Clocking out…' : 'Clock out now';
  const uploadLabel = busy === 'uploading' ? 'Uploading…' : (isOnline ? 'Try uploading now' : 'No connection');
  const unsentActionLabel = countUnknown ? 'Try again' : uploadLabel;
  const uploadDisabled = isBusy || (!countUnknown && !isOnline);

  return <>
    <BottomSheet
      visible={step === 'clocked_in'}
      onDismiss={cancel}
      dismissLabel="Dismiss clock-out question"
      title="You're still clocked in."
      scrollable={false}
      keyboardAvoiding={false}
      maxHeight={520}
      bodyContentStyle={styles.body}
    >
      {message ? <View style={styles.warning}><Text style={styles.warningText}>{message}</Text></View> : null}
      <Pressable
        onPress={clockOutNow}
        disabled={isBusy}
        accessibilityRole="button"
        accessibilityLabel={clockOutLabel}
        accessibilityState={{ disabled: isBusy, busy: busy === 'clocking_out' }}
        style={[styles.primaryButton, isBusy && styles.disabledButton]}
      >
        <Text style={styles.primaryButtonText}>{clockOutLabel}</Text>
      </Pressable>
      <Pressable
        onPress={stayClockedIn}
        disabled={isBusy}
        accessibilityRole="button"
        accessibilityLabel="Stay clocked in and sign out"
        accessibilityState={{ disabled: isBusy }}
        style={styles.secondaryButton}
      >
        <Text style={styles.secondaryButtonText}>Stay clocked in and sign out</Text>
      </Pressable>
      <Pressable onPress={cancel} accessibilityRole="button" accessibilityLabel="Cancel" style={styles.cancelButton}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </BottomSheet>

    <BottomSheet
      visible={step === 'unsent'}
      onDismiss={cancel}
      dismissLabel="Dismiss unsent work question"
      title={countUnknown ? message : `${unsentCount} ${unsentCount === 1 ? "item hasn't" : "items haven't"} uploaded yet.`}
      subtitle={countUnknown
        ? 'If you sign out, anything not uploaded stays on this phone until you sign in here again.'
        : "If you sign out, they'll upload next time you sign in on this phone."}
      scrollable={false}
      keyboardAvoiding={false}
      maxHeight={520}
      bodyContentStyle={styles.body}
    >
      <Pressable
        onPress={countUnknown ? recheck : tryUploadNow}
        disabled={uploadDisabled}
        accessibilityRole="button"
        accessibilityLabel={unsentActionLabel}
        accessibilityState={{ disabled: uploadDisabled, busy: busy === 'uploading' }}
        style={[styles.primaryButton, uploadDisabled && styles.disabledButton]}
      >
        {busy === 'uploading' ? <ActivityIndicator size="small" color={colors.onDark} /> : null}
        <Text style={styles.primaryButtonText}>{unsentActionLabel}</Text>
      </Pressable>
      <Pressable
        onPress={signOutAnyway}
        disabled={isBusy}
        accessibilityRole="button"
        accessibilityLabel="Sign out anyway"
        accessibilityState={{ disabled: isBusy }}
        style={styles.secondaryButton}
      >
        <Text style={styles.secondaryButtonText}>Sign out anyway</Text>
      </Pressable>
      <Pressable onPress={cancel} accessibilityRole="button" accessibilityLabel="Cancel" style={styles.cancelButton}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </BottomSheet>
  </>;
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.sm + 2,
    paddingBottom: spacing.sm,
  },
  primaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.sm,
    borderCurve: 'continuous',
    backgroundColor: colors.primary,
  },
  disabledButton: {
    backgroundColor: colors.disabled,
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
