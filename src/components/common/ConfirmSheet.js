import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import BottomSheet from './BottomSheet';
import BrandButton from './BrandButton';

export default function ConfirmSheet({
  visible,
  title,
  titleAccessory,
  body,
  confirmLabel,
  confirmVariant = 'destructiveQuiet',
  cancelLabel,
  onConfirm,
  onCancel,
  dismissLabel = `Dismiss ${title}`,
}) {
  return (
    <BottomSheet
      visible={visible}
      title={title}
      headerExtras={titleAccessory}
      panelRole="alertdialog"
      onDismiss={onCancel}
      dismissLabel={dismissLabel}
      scrollable={false}
      keyboardAvoiding={false}
    >
      <Text style={styles.body}>{body}</Text>
      <View style={styles.actions}>
        <BrandButton variant={confirmVariant} size="lg" label={confirmLabel} onPress={onConfirm} />
        <BrandButton variant="tertiary" tone="ink" label={cancelLabel} onPress={onCancel} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { ...typeRoles.textParagraph, color: colors.textSecondary },
  actions: { marginTop: 24, gap: 12 },
});
