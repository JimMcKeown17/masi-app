import React from 'react';
import { StyleSheet } from 'react-native';
import BottomSheet from '../common/BottomSheet';
import BrandButton from '../common/BrandButton';
import InlineNote from '../common/InlineNote';
import { SESSION_CLOCK_WARNING, SESSION_CLOCK_WARNING_COST } from '../../hooks/useSessionLaunchGuard';

export default function ClockInBeforeSessionSheet({ visible, onDismiss, onClockInNow, onContinueAnyway }) {
  return <BottomSheet visible={visible} onDismiss={onDismiss} dismissLabel="Dismiss clock-in warning"
    title={SESSION_CLOCK_WARNING} subtitle="Clock in first so your hours are counted alongside this session."
    scrollable={false} keyboardAvoiding={false} maxHeight={520} bodyContentStyle={styles.body}>
    <BrandButton variant="primary" label="Clock in now" onPress={onClockInNow} />
    <InlineNote tone="warning" size="md">{SESSION_CLOCK_WARNING_COST}</InlineNote>
    <BrandButton variant="warning" label="Record without clocking in" onPress={onContinueAnyway} />
    <BrandButton variant="tertiary" tone="ink" label="Cancel" onPress={onDismiss} />
  </BottomSheet>;
}
const styles = StyleSheet.create({
  // BottomSheet supplies the subtitle's 16dp bottom gap; add 8 to reach D8's 24.
  body: { paddingTop: 8, gap: 12, paddingBottom: 8 },
});
