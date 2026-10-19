import React from 'react';
import { StyleSheet, View } from 'react-native';
import BrandButton from '../common/BrandButton';
import InlineNote from '../common/InlineNote';
import BottomSheet from '../common/BottomSheet';
import { spacing } from '../../constants/colors';

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
      {message ? <InlineNote tone="warning" size="md">{message}</InlineNote> : null}
      <View style={[styles.actions, message ? styles.afterWarning : null]}>
        <BrandButton variant="primary" label={clockOutLabel} accessibilityLabel={clockOutLabel}
          loading={busy === 'clocking_out'} disabled={isBusy} onPress={clockOutNow} />
        <BrandButton variant="secondary" label="Stay clocked in and sign out"
          disabled={isBusy} onPress={stayClockedIn} />
        <BrandButton variant="tertiary" tone="ink" label="Cancel" onPress={cancel} />
      </View>
    </BottomSheet>

    <BottomSheet
      visible={step === 'unsent'}
      onDismiss={cancel}
      dismissLabel="Dismiss unsent work question"
      title={countUnknown ? message : `${unsentCount} ${unsentCount === 1 ? "item hasn't" : "items haven't"} uploaded yet.`}
      subtitle={countUnknown
        ? 'If you sign out, anything not uploaded stays on this phone until you sign in here again.'
        : `If you sign out, ${unsentCount === 1 ? "it'll" : "they'll"} upload next time you sign in on this phone.`}
      scrollable={false}
      keyboardAvoiding={false}
      maxHeight={520}
      bodyContentStyle={styles.body}
    >
      <View style={styles.actions}>
        <BrandButton variant="secondary" icon="cloud-upload-outline"
          label={unsentActionLabel} accessibilityLabel={unsentActionLabel}
          loading={busy === 'uploading'} disabled={uploadDisabled}
          onPress={countUnknown ? recheck : tryUploadNow} />
        <BrandButton variant="destructive" icon="log-out-outline" label="Sign out anyway"
          disabled={isBusy} onPress={signOutAnyway} />
        <BrandButton variant="tertiary" tone="ink" label="Cancel" onPress={cancel} />
      </View>
    </BottomSheet>
  </>;
}

const styles = StyleSheet.create({
  // BottomSheet already leaves 16dp below its title/subtitle.
  body: { paddingTop: spacing.sm },
  actions: { gap: spacing.ms },
  afterWarning: { marginTop: spacing.lg },
});
