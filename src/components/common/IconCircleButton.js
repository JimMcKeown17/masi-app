import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, tints } from '../../constants/colors';

export default function IconCircleButton({ icon, onPress, accessibilityLabel, surface = 'canvas', disabled = false, testID }) {
  if (!accessibilityLabel) console.error('IconCircleButton requires an accessibilityLabel');
  const red = surface === 'red';
  return <Pressable
    testID={testID}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={[styles.button, {
      backgroundColor: red ? colors.red700 : colors.surface,
      borderColor: disabled ? tints.rule : red ? 'transparent' : tints.control,
    }]}
  >
    <Ionicons name={icon} size={22} color={disabled ? colors.disabled : red ? colors.onDark : colors.text} />
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
