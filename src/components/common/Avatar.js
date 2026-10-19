import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors, tints } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

const initialsRoles = { 28: typeRoles.textInitialsSm, 40: typeRoles.textInitialsMd, 64: typeRoles.textInitialsLg };
const iconSizes = { 28: 14, 40: 18, 64: 28 };
// The 28dp stack disc is overlapped by its neighbour, so its initials stay at 1x.
const decorative = { accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

export default function Avatar({ label = '', size = 40, shape = 'circle', icon, ring = false, testID = 'avatar', style }) {
  const radius = shape === 'tile' ? borderRadius.md : size / 2;
  const disc = (
    <View {...decorative} testID={testID} style={[styles.disc, { width: size, height: size, borderRadius: radius }, ring && styles.edge, !ring && style]}>
      {icon ? <Ionicons name={icon} size={iconSizes[size]} color={colors.red700} /> : (
        <Text
          style={[shape === 'tile' ? typeRoles.textButton : initialsRoles[size], styles.label]}
          maxFontSizeMultiplier={size <= 28 ? 1 : 1.2}
          numberOfLines={1}
          adjustsFontSizeToFit={shape === 'tile'}
        >{label}</Text>
      )}
    </View>
  );
  return ring ? (
    <View {...decorative} testID={`${testID}-ring`} style={[styles.ring, { width: size + 4, height: size + 4, borderRadius: radius + 2 }, style]}>
      {disc}
    </View>
  ) : disc;
}

const styles = StyleSheet.create({
  disc: { backgroundColor: colors.red50, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label: { color: colors.red700, textAlign: 'center' },
  edge: { borderWidth: 1, borderColor: tints.avatarEdge },
  ring: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', margin: -2 },
});
