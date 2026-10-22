import React, { useContext } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { tokens } from '../theme/tokens';

export function useBottomInset(): number {
  const bottom = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  return Platform.OS === 'android' ? Math.max(bottom + 11, 16) : Math.max(bottom, 16);
}

export function BottomBar({ children, testID }: { children: React.ReactNode; testID?: string }) {
  const bottom = useBottomInset();
  return (
    <View testID={testID} style={{ backgroundColor: tokens.color.surface, borderTopWidth: 1, borderTopColor: tokens.color.line, paddingTop: 11, paddingHorizontal: tokens.space.lg, paddingBottom: bottom, gap: 10 }}>
      {children}
    </View>
  );
}
