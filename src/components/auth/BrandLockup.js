import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/colors';
import { logoType } from '../../constants/typography';

export default function BrandLockup({ style }) {
  return (
    <View testID="brand-lockup" accessible accessibilityRole="image"
      accessibilityLabel="Masinyusane" style={[styles.lockup, style]}>
      <Image source={require('../../../assets/brand/masi-mark-white.png')}
        accessible={false} style={styles.mark} />
      <View>
        <Text style={styles.wordmark} maxFontSizeMultiplier={1}>MASI</Text>
        <Text style={styles.wordmarkSub} maxFontSizeMultiplier={1}>NYUSANE</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lockup: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  mark: { width: 48, height: 41 },
  wordmark: { ...logoType.wordmark, color: colors.onDark },
  wordmarkSub: { ...logoType.wordmarkSub, color: colors.onDark, marginTop: 2 },
});
