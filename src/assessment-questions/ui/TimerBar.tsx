import React from 'react';
import { StyleSheet, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { toneColor, UiText } from './Text';

/** Presentation only; Countdown owns the clock and its isolated updates. */
export function TimerBar({ remainingMs, durationMs }: { remainingMs: number; durationMs: number }) {
  const seconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  const tone = seconds <= 10 ? 'warning' : 'marked';
  const fraction = durationMs <= 0 ? 0 : Math.min(1, Math.max(0, remainingMs / durationMs));
  return (
    <View accessible accessibilityLabel={`Time left, ${seconds} seconds`} style={styles.row}>
      <View accessible={false} testID="countdown-track" style={styles.track}>
        <View accessible={false} testID="countdown-fill" style={[
          styles.fill, { width: `${fraction * 100}%`, backgroundColor: toneColor(tone) },
        ]} />
      </View>
      <UiText variant="timer" tone={tone} style={styles.label}>{`${seconds}s`}</UiText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.sm,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.sm,
  },
  track: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: tokens.color.line,
    overflow: 'hidden',
  },
  fill: { height: 12, borderRadius: 6 },
  label: { minWidth: 44, textAlign: 'right' },
});
