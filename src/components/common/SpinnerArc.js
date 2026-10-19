import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../../constants/colors';
import { useMotion } from '../../context/MotionContext';

export default function SpinnerArc({ size = 22, color = colors.primary, testID = 'spinner-arc' }) {
  const { reduceMotion, motionLevel } = useMotion();
  const spin = useRef(new Animated.Value(0)).current;
  const rotates = !reduceMotion && motionLevel !== 'still';

  useEffect(() => {
    if (!rotates) return undefined;
    const loop = Animated.loop(Animated.timing(spin, {
      toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true,
    }));
    loop.start();
    return () => { loop.stop(); spin.setValue(0); };
  }, [rotates, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View accessible={false} testID={testID} style={[{ width: size, height: size }, rotates && { transform: [{ rotate }] }]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={9} stroke={color} strokeOpacity={0.28} strokeWidth={2.6} />
        <Path d="M12 3a9 9 0 0 1 9 9" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}
