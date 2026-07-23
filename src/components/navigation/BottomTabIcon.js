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
  Insights: 'bar-chart',
  Assessments: 'clipboard',
};

const FALLBACK_ICON = 'ellipse';

export function getTabIconName(routeName, focused) {
  const base = TAB_ICONS[routeName] || FALLBACK_ICON;
  return focused ? base : `${base}-outline`;
}

/**
 * Bottom-tab icon with a clear active indicator (a small dot above the icon when
 * focused), so the selected tab reads at a glance beyond the tint change alone.
 *
 * The indicator is absolutely positioned so it adds NO layout height — React
 * Navigation renders this inside a fixed ~24-28px icon slot, so a flow-stacked
 * indicator would overflow and clip against the label.
 */
export default function BottomTabIcon({ routeName, focused, color, size }) {
  return (
    <View style={styles.container}>
      {focused && <View testID="tab-active-indicator" style={styles.indicator} />}
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
    position: 'absolute',
    top: -4,
    alignSelf: 'center',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.tabActive,
  },
});
