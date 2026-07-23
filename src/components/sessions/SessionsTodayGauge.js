import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../constants/colors';

const WIDTH = 140;
const HEIGHT = 86;
const ARC_LENGTH = 182.2;
const ARC_PATH = 'M 12 74 A 58 58 0 0 1 128 74';

const STATE_CONFIG = {
  below: {
    color: ({ count }) => (count <= 0 ? colors.ringNeutral : count === 1 ? colors.ringStart : colors.primary),
    label: ({ count, target }) => `${count} of ${target} sessions today. Below target.`,
  },
  met: {
    color: () => colors.success,
    label: ({ count, target }) => `${count} of ${target} sessions today. Goal met.`,
  },
  exceeded: {
    color: () => colors.accent,
    label: ({ count, ceiling }) => `${count} sessions today. Above the usual maximum of ${ceiling}.`,
  },
  no_target: {
    color: () => colors.ringNeutral,
    label: ({ count }) => `${count} sessions today.`,
  },
};

/**
 * Locked R3 daily-session half gauge. Data stays outside this component: callers
 * provide the public getSessionGoal result and the gauge only presents it.
 */
export default function SessionsTodayGauge({ goal }) {
  const { target, count, state } = goal;
  const config = STATE_CONFIG[state] || STATE_CONFIG.below;
  const fraction = target ? Math.min(count / target, 1) : 1;
  const progressLength = Math.max(0, fraction * ARC_LENGTH);

  return (
    <View
      style={styles.container}
      accessibilityLabel={config.label(goal)}
      accessibilityRole="image"
    >
      <Svg width={WIDTH} height={HEIGHT} viewBox="0 0 140 86">
        <Path
          d={ARC_PATH}
          fill="none"
          stroke={colors.heroBorder}
          strokeWidth={11}
          strokeLinecap="round"
        />
        {progressLength > 0 ? (
          <Path
            d={ARC_PATH}
            fill="none"
            stroke={config.color(goal)}
            strokeWidth={11}
            strokeLinecap="round"
            strokeDasharray={`${progressLength} ${ARC_LENGTH}`}
          />
        ) : null}
      </Svg>
      <View pointerEvents="none" style={styles.valueRow}>
        <Text style={styles.count}>{count}</Text>
        <Text style={styles.target}>{target != null ? `/${target}` : ' today'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: WIDTH,
    height: HEIGHT,
  },
  valueRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingBottom: 2,
  },
  count: {
    color: colors.onDark,
    fontSize: 23,
    fontWeight: '800',
    lineHeight: 28,
  },
  target: {
    color: colors.onDarkMuted,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 26,
  },
});
