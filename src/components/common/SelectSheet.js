import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { borderRadius, colors, spacing } from '../../constants/colors';
import BottomSheet from './BottomSheet';

const SelectSheetRow = React.memo(function SelectSheetRow({
  optionKey,
  label,
  description,
  accessibilityLabel,
  selected,
  onSelect,
}) {
  const handlePress = useCallback(() => onSelect(optionKey), [onSelect, optionKey]);

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.row, selected && styles.rowSelected]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ selected }}
    >
      <View style={styles.rowText}>
        <Text variant="bodyLarge" style={[styles.label, selected && styles.labelSelected]}>
          {label}
        </Text>
        {description ? (
          <Text variant="bodySmall" style={styles.description}>{description}</Text>
        ) : null}
      </View>
      {selected ? <Text style={styles.check}>✓</Text> : null}
    </Pressable>
  );
});

export default function SelectSheet({
  visible,
  onDismiss,
  title,
  subtitle,
  dismissLabel,
  options,
  selectedKey,
  onSelect,
  confirmLabel,
  cancelLabel,
  emptyMessage,
  maxHeight,
}) {
  const [draftKey, setDraftKey] = useState(selectedKey);
  const onDismissRef = useRef(onDismiss);
  const onSelectRef = useRef(onSelect);
  onDismissRef.current = onDismiss;
  onSelectRef.current = onSelect;

  useEffect(() => {
    setDraftKey(selectedKey);
  }, [selectedKey]);

  const handleSelect = useCallback((key) => {
    if (confirmLabel) {
      setDraftKey(key);
      return;
    }
    onSelectRef.current(key);
    onDismissRef.current();
  }, [confirmLabel]);

  const handleConfirm = useCallback(() => {
    onSelect(draftKey);
    onDismiss();
  }, [draftKey, onDismiss, onSelect]);

  const footer = confirmLabel || cancelLabel ? (
    <View style={styles.actions}>
      {cancelLabel ? <Button onPress={onDismiss}>{cancelLabel}</Button> : null}
      {confirmLabel ? (
        <Button mode="contained" onPress={handleConfirm}>{confirmLabel}</Button>
      ) : null}
    </View>
  ) : null;

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      title={title}
      subtitle={subtitle}
      dismissLabel={dismissLabel}
      footer={footer}
      maxHeight={maxHeight}
    >
      {options.length === 0 && emptyMessage ? (
        <Text variant="bodyMedium" style={styles.empty}>{emptyMessage}</Text>
      ) : null}
      {options.map(option => (
        <SelectSheetRow
          key={option.key}
          optionKey={option.key}
          label={option.label}
          description={option.description}
          accessibilityLabel={option.accessibilityLabel}
          selected={(confirmLabel ? draftKey : selectedKey) === option.key}
          onSelect={handleSelect}
        />
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowText: {
    flex: 1,
  },
  rowSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  label: {
    color: colors.text,
    fontWeight: '500',
  },
  labelSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  description: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  check: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  empty: {
    color: colors.textSecondary,
    textAlign: 'center',
    padding: spacing.lg,
  },
});
