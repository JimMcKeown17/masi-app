import React, { useContext } from 'react';
import { Modal, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { tokens } from '../theme/tokens';
import { BottomBar } from './BottomBar';
import { SecondaryButton } from './Button';
import { UiText } from './Text';

export function FullScreenSheet({ visible, title, onClose, children }: {
  visible: boolean; title?: string; onClose: () => void; children: React.ReactNode;
}) {
  const top = useContext(SafeAreaInsetsContext)?.top ?? 0;
  if (!visible) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: tokens.color.canvas, paddingTop: top }}>
        {title && <UiText variant="heading" accessibilityRole="header" style={{ padding: tokens.space.lg }}>{title}</UiText>}
        <View style={{ flex: 1 }}>{children}</View>
        <BottomBar><SecondaryButton label="Close" onPress={onClose} /></BottomBar>
      </View>
    </Modal>
  );
}
