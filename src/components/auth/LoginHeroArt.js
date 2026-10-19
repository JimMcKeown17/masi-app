import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors, tints } from '../../constants/colors';
import { LEARNER } from './loginHeroGeometry';

export default function LoginHeroArt({ windowWidth, windowHeight, scale, offsetX, offsetY }) {
  return (
    <View testID="login-hero-art" style={StyleSheet.absoluteFill} pointerEvents="none"
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={windowWidth} height={windowHeight}>
        <G transform={`translate(${offsetX} ${offsetY}) scale(${scale})`}>
          <Circle cx={486} cy={412} r={400} stroke={colors.heroDark} strokeWidth={54} fill="none" />
          <Circle cx={486} cy={412} r={436} stroke={tints.onRedKeyline} strokeWidth={2} fill="none" />
        </G>
      </Svg>
      <Image testID="login-hero-learner" source={require('../../../assets/login/learner-artwork.webp')}
        accessible={false} resizeMode="contain" style={{
          position: 'absolute',
          left: offsetX + LEARNER.left * scale,
          top: offsetY + LEARNER.top * scale,
          width: LEARNER.width * scale,
          height: LEARNER.height * scale,
        }} />
    </View>
  );
}
