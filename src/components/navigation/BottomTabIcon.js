import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';

/**
 * One place for the bottom-tab route→icon mapping. Each tab uses the filled
 * Ionicons glyph when focused and its `-outline` variant otherwise.
 */
const TAB_ICONS = {
  Home: 'home',
  Children: 'people',
  Sessions: 'document-text', // the third tab stays "Sessions" — do not rename
  Assessments: 'clipboard',
};

const FALLBACK_ICON = 'ellipse';

export function getTabIconName(routeName, focused) {
  const base = TAB_ICONS[routeName] || FALLBACK_ICON;
  return focused ? base : `${base}-outline`;
}

/**
 * Bottom-tab icon with a clear active indicator (a small bar above the icon when
 * focused), so the selected tab reads at a glance beyond the tint change alone.
 */
export default function BottomTabIcon({ routeName, focused, color, size }) {
  return (
    <View style={styles.container}>
      <View style={[styles.indicator, focused && styles.indicatorActive]} />
      <Ionicons name={getTabIconName(routeName, focused)} size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicator: {
    width: 16,
    height: 3,
    borderRadius: 2,
    marginBottom: 4,
    backgroundColor: 'transparent',
  },
  indicatorActive: {
    backgroundColor: colors.tabActive,
  },
});
