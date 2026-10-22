import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { toneColor, type Tone } from './Text';

export type IconName = 'check' | 'cross' | 'back' | 'chevronLeft' | 'chevronRight';

const paths: Record<IconName, string> = {
  check: 'M5 12l4 4L19 6',
  cross: 'M6 6l12 12M6 18L18 6',
  back: 'M19 12H5m7-7-7 7 7 7',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
};

export function Icon({ name, size = 20, tone = 'ink' }: { name: IconName; size?: number; tone?: Tone }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path d={paths[name]} fill="none" stroke={toneColor(tone)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
