import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

export default function CapturedPill({ text }) {
  return (
    <View style={styles.pill}>
      <View style={styles.disc} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width={14} height={14} viewBox="0 0 24 24">
          <Path d="m5 12.5 4.5 4.5L19 7.5" stroke={colors.surface} strokeWidth={3}
            strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      </View>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
    minHeight: 34, borderRadius: 17, backgroundColor: colors.surface,
    paddingLeft: 7, paddingRight: 16, gap: 8,
    shadowColor: colors.red900, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18, shadowRadius: 8, elevation: 3,
  },
  disc: {
    width: 22, height: 22, borderRadius: 11, flexShrink: 0,
    backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center',
  },
  text: { ...typeRoles.textPill, color: colors.text, textAlign: 'center', flexShrink: 1 },
});
