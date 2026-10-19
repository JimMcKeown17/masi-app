import React, { useEffect } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

const spokenText = (children) => React.Children.toArray(children).map((child) =>
  React.isValidElement(child) ? spokenText(child.props.children) : String(child)).join('');

export default function InlineNote({ tone = 'error', size = 'sm', live = 'polite', children }) {
  const error = tone === 'error';
  const text = spokenText(children);
  useEffect(() => {
    if (error && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(text);
  }, [error, text]);
  const medium = size === 'md';
  return <View
    accessible={error}
    accessibilityRole={error ? 'alert' : undefined}
    accessibilityLiveRegion={error ? live : undefined}
    style={[styles.row, medium ? styles.medium : styles.small, { backgroundColor: error ? colors.errorBg : colors.warningBg }]}
  >
    <Ionicons name={error ? 'warning-outline' : 'warning'} size={medium ? 18 : 16}
      color={error ? colors.error : colors.warning} accessible={false} />
    <Text style={[styles.text, { color: error ? colors.error : colors.warningText }]}>{children}</Text>
  </View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  small: { borderRadius: borderRadius.sm, paddingVertical: 8, paddingHorizontal: 12, gap: 8 },
  medium: { borderRadius: borderRadius.md, paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  text: { ...typeRoles.textNote, flex: 1 },
});
