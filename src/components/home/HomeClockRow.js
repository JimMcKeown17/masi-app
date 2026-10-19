// src/components/home/HomeClockRow.js
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ElapsedTime from '../common/ElapsedTime';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { formatDisplayTime } from '../../utils/localDate';

const STACK_FONT_SCALE = 1.3;

export default function HomeClockRow({
  isSignedIn, loadingLocation, signInTime, fontScale = 1, onOpenHistory, onClockIn, onClockOut,
}) {
  const stacked = fontScale > STACK_FONT_SCALE;

  const tile = (
    <View style={styles.tile}>
      {loadingLocation
        ? <ActivityIndicator size="small" color={colors.onDark} />
        : <Ionicons name="time-outline" size={22} color={colors.onDark} />}
      {isSignedIn && !loadingLocation ? <View style={styles.liveDot} /> : null}
    </View>
  );

  let status;
  if (loadingLocation) {
    status = (
      <View style={styles.status} accessibilityLiveRegion="polite">
        {tile}
        <Text style={styles.statusStrong}>Getting location…</Text>
      </View>
    );
  } else if (isSignedIn) {
    status = (
      <Pressable
        onPress={onOpenHistory}
        accessibilityRole="button"
        accessibilityLabel={`On the clock since ${formatDisplayTime(signInTime)}. View work history`}
        style={styles.status}
      >
        {tile}
        <View style={styles.statusCopy}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>On the clock</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.red50} />
          </View>
          <ElapsedTime signInTime={signInTime} showSeconds={false} style={styles.elapsed} />
        </View>
      </Pressable>
    );
  } else {
    status = (
      <Pressable
        onPress={onOpenHistory}
        accessibilityRole="button"
        accessibilityLabel="Not clocked in. View work history"
        style={styles.status}
      >
        {tile}
        <Text style={styles.statusStrong}>Not clocked in</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.red50} />
      </Pressable>
    );
  }

  const action = loadingLocation ? (
    <View style={[styles.actionSpacer, stacked ? styles.actionStacked : null]} />
  ) : (
    <Pressable
      onPress={isSignedIn ? onClockOut : onClockIn}
      accessibilityRole="button"
      accessibilityLabel={isSignedIn ? 'Clock out' : 'Clock in'}
      style={[
        styles.action,
        isSignedIn ? styles.actionOutline : styles.actionFilled,
        stacked ? styles.actionStacked : null,
      ]}
    >
      <Text style={[styles.actionText, isSignedIn ? styles.actionTextOutline : styles.actionTextFilled]}>
        {isSignedIn ? 'Clock out' : 'Clock in'}
      </Text>
    </Pressable>
  );

  return (
    <View testID="home-clock-row" style={[styles.row, stacked ? styles.rowStacked : styles.rowInline]}>
      {status}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64, borderRadius: 18, backgroundColor: colors.red700,
    paddingLeft: 12, paddingRight: 10, gap: 12,
  },
  rowInline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch', paddingVertical: 12 },
  status: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: {
    width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.onDark + '24',
  },
  liveDot: {
    position: 'absolute', top: -3, right: -3, width: 12, height: 12, borderRadius: 6,
    backgroundColor: colors.onDark, borderWidth: 2.5, borderColor: colors.red700,
  },
  statusCopy: { flexShrink: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  label: { ...typeRoles.textLabel, color: colors.red50 },
  elapsed: { ...typeRoles.displayCount, color: colors.onDark, fontVariant: ['tabular-nums'] },
  statusStrong: { ...typeRoles.textOptionSelected, color: colors.onDark, flexShrink: 1 },
  action: {
    minHeight: 44, minWidth: 106, paddingHorizontal: 18, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },
  actionFilled: { backgroundColor: colors.surface, ...{ shadowColor: colors.red900, shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 8 }, elevation: 3 } },
  actionOutline: { borderWidth: 1.5, borderColor: colors.onDark },
  actionStacked: { alignSelf: 'stretch' },
  actionSpacer: { minWidth: 106, minHeight: 44 },
  actionText: { ...typeRoles.textButton },
  actionTextFilled: { color: colors.red600 },
  actionTextOutline: { color: colors.onDark },
});
