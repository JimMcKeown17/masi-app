import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import Svg, { Circle } from 'react-native-svg';
import { colors, spacing } from '../../constants/colors';

const SIZE = 132;
const STROKE = 12;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Per-state visual + accessibility treatment. Only one state shows at a time,
// so a distinct colour per state does not violate the "no rainbow" brand rule.
const STATE_CONFIG = {
  below: {
    color: colors.primary, // brand red = in progress
    label: ({ count, target }) => `${count} of ${target} sessions today. Below target.`,
  },
  met: {
    color: colors.success, // green = goal completed (semantic)
    label: ({ count, target }) => `${count} of ${target} sessions today. Goal met.`,
  },
  exceeded: {
    color: colors.accent, // amber = gentle "above the expected range" flag
    label: ({ count, ceiling }) => `${count} sessions today. Above the usual maximum of ${ceiling}.`,
  },
  no_target: {
    color: colors.disabled, // muted neutral = activity, but no goal to measure against
    label: ({ count }) => `${count} sessions today.`,
  },
};

/**
 * Sessions Today ring — a presentational progress ring for the EA's daily
 * session goal. It is intentionally "dumb": hand it the goal object produced by
 * `getSessionGoal` ({ target, ceiling, count, state }) and it draws the ring.
 * It contains zero data logic, so it survives any change to how the goal is
 * computed and can be dropped onto any screen unchanged.
 */
export default function SessionsTodayRing({ goal }) {
  const { target, count, state } = goal;

  const config = STATE_CONFIG[state] || STATE_CONFIG.below;
  // With a target, fill toward it (capped — the ring "completes" at the goal).
  // Without one (1000 Stories), show a full muted ring as an activity frame.
  const fraction = target ? Math.min(count / target, 1) : 1;
  const strokeColor = config.color;
  const label = config.label(goal);

  return (
    <View style={styles.container} accessibilityLabel={label} accessibilityRole="image">
      <Svg width={SIZE} height={SIZE}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={colors.border}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={strokeColor}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          strokeLinecap="round"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={styles.count}>{count}</Text>
        <Text style={styles.denominator}>{target != null ? `of ${target}` : 'today'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 40,
  },
  denominator: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.xs / 2,
  },
});
