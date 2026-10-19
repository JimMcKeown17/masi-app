import React from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Circle, Path } from 'react-native-svg';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { getGaugeAccessibilityLabel } from '../../utils/sessionGoalPresentation';
import { GaugeArcs } from './SegmentedSessionGauge';
import { buildEarnedArc, buildGaugeGeometry, buildSkeletonGeometry, GAUGE_SIZES } from './sessionGaugeGeometry';

const SIZE = GAUGE_SIZES.celebration;
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AT_REST = {
  content: new Animated.Value(1), earned: new Animated.Value(1), flip: new Animated.Value(1),
};
const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };
const inverse = (value) => value.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

function Skeleton() {
  return (
    <View testID="gauge-skeleton" style={styles.skeleton} {...hidden}>
      <GaugeArcs geometry={buildSkeletonGeometry(SIZE)} size={SIZE} />
      <View testID="gauge-skeleton-title" style={styles.skeletonTitle} />
      <View testID="gauge-skeleton-subtitle" style={styles.skeletonSubtitle} />
    </View>
  );
}

function Numeral({ goal, from = false, style }) {
  const noTarget = goal.state === 'no_target';
  const suffix = noTarget ? ' today' : goal.state === 'exceeded' ? null : '/' + goal.target;
  return (
    <Animated.View style={[styles.numeralRow, style]} pointerEvents="none" {...(from ? hidden : {})}>
      <Text
        testID={from ? 'gauge-numeral-from' : 'gauge-numeral-to'}
        maxFontSizeMultiplier={1.2}
        style={[styles.numeral, goal.count === 0 && styles.numeralMuted]}
      >
        {goal.count}
      </Text>
      {suffix ? (
        <View style={styles.suffixAnchor}>
          <Text maxFontSizeMultiplier={1.2} style={[styles.suffix, noTarget && styles.todaySuffix]}>
            {suffix}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

function Copy({ copy, showSub, style, from = false }) {
  return (
    <Animated.View style={style} {...(from ? hidden : {})}>
      <Text style={styles.heading}>{copy.title}</Text>
      {showSub && copy.subtitle ? <Text style={styles.subtitle}>{copy.subtitle}</Text> : null}
    </Animated.View>
  );
}

export default function CelebrationGauge({ card, gauge, values = AT_REST, settled = true }) {
  if (card.kind === 'skeleton') return <Skeleton />;

  const animating = gauge.mode === 'animated' && gauge.fromGoal && !settled;
  const fromOpacity = inverse(values.flip);
  const toStyle = animating ? {
    opacity: values.flip,
    transform: [{ translateY: values.flip.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }],
  } : null;
  const earnedArc = animating && gauge.earned ? buildEarnedArc(card.goal, SIZE) : null;
  const fromGeometry = animating ? buildGaugeGeometry(gauge.fromGoal, SIZE) : null;
  if (earnedArc && card.goal.count === 1) {
    fromGeometry.startDot = { color: gauge.earned.color };
  }
  const toOpacity = !animating ? 1 : gauge.flip ? values.flip : values.flip.interpolate({
    inputRange: [0, 0.01], outputRange: [0, 1], extrapolate: 'clamp',
  });

  return (
    <View>
      <Animated.View testID="gauge-content" style={{ opacity: settled ? 1 : values.content }}>
        <View accessible accessibilityRole="image" accessibilityLabel={getGaugeAccessibilityLabel(card.goal)} style={styles.gauge}>
          {animating ? (
            <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: fromOpacity }]} {...hidden}>
              <GaugeArcs geometry={fromGeometry} size={SIZE}>
                {earnedArc ? (
                  <AnimatedPath
                    testID="gauge-earned"
                    d={earnedArc.d}
                    fill="none"
                    stroke={gauge.earned.color}
                    strokeWidth={SIZE.stroke}
                    strokeDasharray={[earnedArc.length, earnedArc.length]}
                    strokeDashoffset={values.earned.interpolate({ inputRange: [0, 1], outputRange: [earnedArc.length + 1, 0] })}
                  />
                ) : null}
                {earnedArc && card.goal.count === card.goal.target ? (
                  <AnimatedCircle
                    testID="gauge-earned-end"
                    cx={SIZE.cx + SIZE.r} cy={SIZE.cy} r={SIZE.stroke / 2}
                    fill={gauge.earned.color}
                    opacity={values.earned.interpolate({ inputRange: [0.99, 1], outputRange: [0, 1], extrapolate: 'clamp' })}
                  />
                ) : null}
              </GaugeArcs>
            </Animated.View>
          ) : null}
          <Animated.View testID="gauge-layer-to" style={{ opacity: toOpacity }}>
            <GaugeArcs geometry={buildGaugeGeometry(card.goal, SIZE)} size={SIZE} />
          </Animated.View>
          {animating ? <Numeral goal={gauge.fromGoal} from style={{ opacity: fromOpacity }} /> : null}
          <Numeral goal={card.goal} style={toStyle} />
        </View>
        <View>
          {animating && card.fromCopy ? (
            <Copy copy={card.fromCopy} showSub={card.showSub} from style={[StyleSheet.absoluteFillObject, { opacity: fromOpacity }]} />
          ) : null}
          <Copy copy={card.copy} showSub={card.showSub} style={toStyle} />
        </View>
      </Animated.View>
      {!settled ? (
        <Animated.View testID="gauge-skeleton-overlay" pointerEvents="none" style={[StyleSheet.absoluteFillObject, { opacity: inverse(values.content) }]} {...hidden}>
          <Skeleton />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gauge: { width: SIZE.width, height: SIZE.height, alignSelf: 'center' },
  skeleton: { alignItems: 'center' },
  skeletonTitle: { width: 168, height: 18, borderRadius: 9, marginTop: 13, backgroundColor: colors.border },
  skeletonSubtitle: { width: 212, height: 12, borderRadius: 6, marginTop: 13, backgroundColor: colors.border },
  numeralRow: {
    position: 'absolute', left: 0, right: 0, bottom: 1,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end',
  },
  numeral: { ...typeRoles.displayNumeralXL, color: colors.text, fontVariant: ['tabular-nums'] },
  numeralMuted: { color: colors.textSecondary },
  suffixAnchor: { width: 0, overflow: 'visible' },
  suffix: {
    ...typeRoles.textRowTitle,
    // The board's Figtree 24/28 suffix uses existing token sizes, without a guard exception.
    fontSize: typeRoles.displaySheetTitle.fontSize,
    lineHeight: typeRoles.displaySheetTitle.lineHeight,
    color: colors.textSecondary, marginLeft: 1, width: SIZE.width / 2,
  },
  todaySuffix: { marginLeft: 4 },
  heading: { ...typeRoles.displayHeading, color: colors.text, textAlign: 'center', marginTop: 10 },
  subtitle: { ...typeRoles.textSmall, color: colors.textSecondary, textAlign: 'center', marginTop: 2 },
});
