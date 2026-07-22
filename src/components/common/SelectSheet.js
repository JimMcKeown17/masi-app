import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { borderRadius, colors, spacing } from '../../constants/colors';
import { NO_TEXT_SUGGESTIONS } from '../../constants/textInputProps';
import BottomSheet from './BottomSheet';

const getOptionKey = option => option.key;

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
  searchable = false,
  keyboardAvoiding = true,
}) {
  const [draftKey, setDraftKey] = useState(selectedKey);
  const [searchText, setSearchText] = useState('');
  const onDismissRef = useRef(onDismiss);
  const onSelectRef = useRef(onSelect);
  onDismissRef.current = onDismiss;
  onSelectRef.current = onSelect;

  useEffect(() => {
    setDraftKey(selectedKey);
  }, [selectedKey]);

  useEffect(() => {
    setSearchText('');
  }, [visible]);

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

  const filteredOptions = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();
    if (!searchable || !normalizedSearch) return options;
    return options.filter(option => option.label.toLowerCase().includes(normalizedSearch));
  }, [options, searchText, searchable]);
  const listEmptyMessage = searchable && searchText.trim() && options.length > 0
    ? 'No matches found.'
    : emptyMessage;

  const renderOption = useCallback(({ item: option }) => (
    <SelectSheetRow
      optionKey={option.key}
      label={option.label}
      description={option.description}
      accessibilityLabel={option.accessibilityLabel}
      selected={(confirmLabel ? draftKey : selectedKey) === option.key}
      onSelect={handleSelect}
    />
  ), [confirmLabel, draftKey, handleSelect, selectedKey]);

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
      scrollable={false}
      keyboardAvoiding={keyboardAvoiding}
      bodyContentStyle={styles.body}
    >
      {searchable ? (
        <TextInput
          label="Search"
          accessibilityLabel="Search options"
          value={searchText}
          onChangeText={setSearchText}
          {...NO_TEXT_SUGGESTIONS}
          mode="outlined"
          style={styles.search}
        />
      ) : null}
      <FlatList
        data={filteredOptions}
        renderItem={renderOption}
        keyExtractor={getOptionKey}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={5}
        keyboardShouldPersistTaps="handled"
        style={styles.list}
        ListEmptyComponent={listEmptyMessage ? (
          <Text variant="bodyMedium" style={styles.empty}>{listEmptyMessage}</Text>
        ) : null}
      />
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
  body: {
    flexShrink: 1,
    minHeight: 0,
  },
  list: {
    flexShrink: 1,
  },
  search: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  empty: {
    color: colors.textSecondary,
    textAlign: 'center',
    padding: spacing.lg,
  },
});
