import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { getGaugeAccessibilityLabel } from '../../utils/sessionGoalPresentation';
import { buildGaugeGeometry, GAUGE_SIZES } from './sessionGaugeGeometry';

export function GaugeArcs({ geometry, size, children }) {
  const { arcs, startDot, endDot } = geometry;
  return (
    <Svg width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`}>
      {arcs.map((arc) => (
        <Path key={arc.d + arc.color} d={arc.d} stroke={arc.color} strokeWidth={size.stroke} fill="none" />
      ))}
      <Circle cx={size.cx - size.r} cy={size.cy} r={size.stroke / 2} fill={startDot.color} />
      <Circle cx={size.cx + size.r} cy={size.cy} r={size.stroke / 2} fill={endDot.color} />
      {children}
    </Svg>
  );
}

export default function SegmentedSessionGauge({ goal }) {
  const geometry = buildGaugeGeometry(goal);
  const showSuffix = goal.state === 'below' || goal.state === 'met';
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={getGaugeAccessibilityLabel(goal)}
      style={styles.wrap}
    >
      <GaugeArcs geometry={geometry} size={GAUGE_SIZES.home} />
      <View style={styles.numeralRow} pointerEvents="none">
        <Text
          maxFontSizeMultiplier={1.2}
          style={[styles.numeral, goal.count === 0 ? styles.numeralMuted : null]}
        >
          {goal.count}
        </Text>
        {showSuffix ? (
          <View style={styles.suffixAnchor}>
            <Text maxFontSizeMultiplier={1.2} style={styles.suffix}>{'/' + goal.target}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: GAUGE_SIZES.home.width, height: GAUGE_SIZES.home.height },
  numeralRow: {
    position: 'absolute', left: 0, right: 0, bottom: 2,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end',
  },
  numeral: { ...typeRoles.displayNumeral, color: colors.text, fontVariant: ['tabular-nums'] },
  numeralMuted: { color: colors.textSecondary },
  // Zero-width anchor: "/3" hangs off the numeral's right edge without
  // shifting the numeral off the gauge's centre line.
  suffixAnchor: { width: 0, overflow: 'visible' },
  suffix: {
    ...typeRoles.textBodyLStrong, color: colors.textSecondary,
    width: 40, marginLeft: 2, marginBottom: 4,
  },
});
