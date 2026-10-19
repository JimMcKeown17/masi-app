import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';

// Unmounting on blur restores the root status-bar style from the native stack.
export default function FocusAwareStatusBar({ style }) {
  return useIsFocused() ? <StatusBar style={style} /> : null;
}
