import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../constants/colors';
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
      panelRole="alertdialog"
      onDismiss={onCancel}
      dismissLabel={dismissLabel}
      scrollable
      keyboardAvoiding={false}
      footerStyle={styles.footer}
      footer={
        <View style={styles.actions}>
          <BrandButton variant={confirmVariant} size="lg" label={confirmLabel} onPress={onConfirm} />
          <BrandButton variant="tertiary" tone="ink" label={cancelLabel} onPress={onCancel} />
        </View>
      }
    >
      {titleAccessory ? <View style={styles.accessory}>{titleAccessory}</View> : null}
      <Text style={styles.body}>{body}</Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { ...typeRoles.textParagraph, color: colors.textSecondary },
  accessory: { marginBottom: spacing.md },
  footer: { borderTopWidth: 0, paddingTop: spacing.sm },
  actions: { gap: spacing.ms },
});
