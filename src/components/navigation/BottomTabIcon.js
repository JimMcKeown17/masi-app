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
 * The active pill identifies the selected destination beyond its glyph colour.
 */
export default function BottomTabIcon({ routeName, focused, color, size }) {
  return (
    <View testID="tab-icon-pill" style={[styles.container, { backgroundColor: focused ? colors.red50 : 'transparent' }]}>
      <Ionicons name={getTabIconName(routeName, focused)} size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 56,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
