import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { haloGeometry } from '../../utils/haloGeometry';
import CapturedPill from './CapturedPill';
import ConfettiBurst from './ConfettiBurst';

export default function SessionCompleteHero({
  width, insetTop, pill, headline, showHalo, confetti = null, pillStyle, headlineStyle, headlineHidden,
}) {
  const halo = haloGeometry(width);
  return (
    <View testID="session-complete-hero" style={[styles.field, {
      paddingTop: insetTop + 11, paddingBottom: showHalo ? halo.headlineGap + 108 : 32,
    }]}>
      {showHalo ? (
        <Svg
          testID="session-complete-halo"
          width={width} height={halo.svgHeight} style={styles.halo}
          pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        >
          <Circle cx={halo.cx} cy={halo.cy} r={halo.r} stroke={colors.red500} strokeWidth={halo.stroke} fill="none" />
        </Svg>
      ) : null}
      {confetti ? <ConfettiBurst width={width} {...confetti} /> : null}
      <Animated.View testID="session-complete-pill" style={[styles.pill, pillStyle]}>
        <CapturedPill text={pill.text} />
      </Animated.View>
      <Animated.Text
        accessibilityRole="header"
        accessibilityElementsHidden={!!headlineHidden}
        importantForAccessibility={headlineHidden ? 'no-hide-descendants' : 'auto'}
        maxFontSizeMultiplier={1.2}
        style={[styles.headline, headlineStyle, headlineHidden && styles.hiddenHeadline]}
      >
        {headline}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { backgroundColor: colors.red600, overflow: 'hidden', paddingHorizontal: 24 },
  halo: { position: 'absolute', bottom: 0, left: 0 },
  pill: { alignSelf: 'center' },
  headline: { ...typeRoles.display3XL, marginTop: 16, color: colors.onDark, textAlign: 'center' },
  hiddenHeadline: { opacity: 0 },
});
