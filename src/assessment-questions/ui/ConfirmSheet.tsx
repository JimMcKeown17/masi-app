import React from 'react';
import { StyleSheet, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { useBottomInset } from './BottomBar';
import { PrimaryButton, SecondaryButton } from './Button';
import { UiText } from './Text';

export function ConfirmSheet({ testID, title, confirmLabel, onConfirm, cancelLabel, onCancel, confirmTone = 'ink', children }: {
  testID: string;
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  cancelLabel?: string;
  onCancel?: () => void;
  confirmTone?: 'ink' | 'danger';
  children?: React.ReactNode;
}) {
  const bottom = Math.max(useBottomInset(), tokens.space.xl);
  return (
    <View testID={testID} accessibilityViewIsModal style={[StyleSheet.absoluteFillObject, { justifyContent: 'flex-end', backgroundColor: tokens.color.scrim }]}>
      <View style={{ backgroundColor: tokens.color.surface, borderTopLeftRadius: tokens.radius.card, borderTopRightRadius: tokens.radius.card, padding: tokens.space.xl, paddingBottom: bottom, gap: tokens.space.md }}>
        <UiText variant="heading" accessibilityRole="header">{title}</UiText>
        <PrimaryButton label={confirmLabel} onPress={onConfirm} tone={confirmTone} />
        {cancelLabel && <SecondaryButton label={cancelLabel} onPress={() => onCancel?.()} />}
        {children}
      </View>
    </View>
  );
}
