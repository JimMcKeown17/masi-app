import React from 'react';
import { Modal, StyleSheet, View, type Text } from 'react-native';
import { tokens } from '../theme/tokens';
import { useBottomInset } from './BottomBar';
import { PrimaryButton, SecondaryButton } from './Button';
import { UiText } from './Text';

type ConfirmPanelProps = {
  title: string;
  message?: string;
  confirmLabel: string;
  onConfirm: () => void;
  cancelLabel?: string;
  onCancel?: () => void;
  confirmTone?: 'ink' | 'danger';
  children?: React.ReactNode;
  titleRef?: React.Ref<Text>;
};

export function ConfirmPanel({ title, message, confirmLabel, onConfirm, cancelLabel, onCancel, confirmTone = 'ink', children, titleRef }: ConfirmPanelProps) {
  // Keep the same inset in native and in-window sheets. The native Modal draws
  // under Android's navigation bar (SDK 54; A03s build 30).
  const bottom = Math.max(useBottomInset(), tokens.space.xl);
  return (
    <View style={{ backgroundColor: tokens.color.surface, borderTopLeftRadius: tokens.radius.card, borderTopRightRadius: tokens.radius.card, padding: tokens.space.xl, paddingBottom: bottom, gap: tokens.space.md }}>
      <UiText ref={titleRef} variant="heading" accessibilityRole="header">{title}</UiText>
      {message !== undefined && <UiText variant="body" tone="ink">{message}</UiText>}
      <PrimaryButton label={confirmLabel} onPress={onConfirm} tone={confirmTone} />
      {cancelLabel && <SecondaryButton label={cancelLabel} onPress={() => onCancel?.()} />}
      {children}
    </View>
  );
}

export function ConfirmSheet({ testID, ...props }: Omit<ConfirmPanelProps, 'titleRef'> & { testID: string }) {
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => props.onCancel?.()}>
      <View testID={testID} accessibilityViewIsModal style={[StyleSheet.absoluteFillObject, { justifyContent: 'flex-end', backgroundColor: tokens.color.scrim }]}>
        <ConfirmPanel {...props} />
      </View>
    </Modal>
  );
}
