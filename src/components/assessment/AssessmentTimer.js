import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing, borderRadius } from '../../constants/colors';
import { ASSESSMENT_DURATION } from '../../constants/egraConstants';

function getTimerColor(timeRemaining) {
  if (timeRemaining > 30) return colors.success;
  if (timeRemaining >= 10) return colors.accent;
  return colors.emphasis;
}

export default function AssessmentTimer({ timeRemaining, isPaused }) {
  const progress = timeRemaining / ASSESSMENT_DURATION;
  const timerColor = getTimerColor(timeRemaining);

  return (
    <View style={styles.container}>
      <View style={styles.barBackground}>
        <View
          style={[
            styles.barFill,
            { width: `${progress * 100}%`, backgroundColor: timerColor },
          ]}
        />
      </View>
      <Text style={[styles.timeText, { color: timerColor }]}>
        {isPaused ? 'PAUSED' : `${timeRemaining}s`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  barBackground: {
    flex: 1,
    height: 10,
    backgroundColor: colors.border,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: borderRadius.sm,
  },
  timeText: {
    fontSize: 18,
    fontWeight: '700',
    minWidth: 60,
    textAlign: 'right',
  },
});
