import React from 'react';
import { Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from 'react-native-paper';
import { colors } from '../constants/colors';

export default function HeaderBackButton({ onPress }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={{ flexDirection: 'row', alignItems: 'center', marginLeft: Platform.OS === 'ios' ? -8 : 0 }}
    >
      <Ionicons name="chevron-back" size={28} color={colors.primary} />
      <Text style={{ color: colors.primary, fontSize: 17 }}>Back</Text>
    </Pressable>
  );
}
