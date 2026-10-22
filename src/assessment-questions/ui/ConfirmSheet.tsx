import React, { useContext } from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { tokens } from '../theme/tokens';
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
  // Android's Modal viewport already excludes the navigation bar. The host's
  // bottom inset must not be added again; iOS still needs its home-indicator inset.
  const inset = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const bottom = Math.max(Platform.OS === 'android' ? 0 : inset, tokens.space.xl);
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => onCancel?.()}>
      <View testID={testID} accessibilityViewIsModal style={[StyleSheet.absoluteFillObject, { justifyContent: 'flex-end', backgroundColor: tokens.color.scrim }]}>
        <View style={{ backgroundColor: tokens.color.surface, borderTopLeftRadius: tokens.radius.card, borderTopRightRadius: tokens.radius.card, padding: tokens.space.xl, paddingBottom: bottom, gap: tokens.space.md }}>
          <UiText variant="heading" accessibilityRole="header">{title}</UiText>
          <PrimaryButton label={confirmLabel} onPress={onConfirm} tone={confirmTone} />
          {cancelLabel && <SecondaryButton label={cancelLabel} onPress={() => onCancel?.()} />}
          {children}
        </View>
      </View>
    </Modal>
  );
}
