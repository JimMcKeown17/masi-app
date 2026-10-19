import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import BrandButton from './BrandButton';
import SearchField from './SearchField';
import BottomSheet from './BottomSheet';

const getOptionKey = option => option.key;

const SelectSheetRow = React.memo(function SelectSheetRow({
  optionKey,
  label,
  description,
  accessibilityLabel,
  selected,
  showDivider,
  onSelect,
}) {
  const handlePress = useCallback(() => onSelect(optionKey), [onSelect, optionKey]);

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.row, showDivider && styles.divider]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ selected }}
    >
      <View style={styles.rowText}>
        <Text style={[styles.label, selected && styles.labelSelected]}>
          {label}
        </Text>
        {description ? (
          <Text style={styles.description}>{description}</Text>
        ) : null}
      </View>
      {selected ? <Ionicons name="checkmark" size={22} color={colors.text} /> : null}
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

  const renderOption = useCallback(({ item: option, index }) => (
    <SelectSheetRow
      showDivider={index < filteredOptions.length - 1}
      optionKey={option.key}
      label={option.label}
      description={option.description}
      accessibilityLabel={option.accessibilityLabel}
      selected={(confirmLabel ? draftKey : selectedKey) === option.key}
      onSelect={handleSelect}
    />
  ), [confirmLabel, draftKey, handleSelect, selectedKey, filteredOptions.length]);

  const footer = confirmLabel || cancelLabel ? (
    <View style={styles.actions}>
      {confirmLabel ? <BrandButton variant="primary" label={confirmLabel} onPress={handleConfirm} /> : null}
      {cancelLabel ? <BrandButton variant="tertiary" tone="ink" label={cancelLabel} onPress={onDismiss} /> : null}
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
        <View style={styles.search}><SearchField
          placeholder="Search"
          accessibilityLabel="Search options"
          value={searchText}
          onChangeText={setSearchText}
        /></View>
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
          <Text style={styles.empty}>{listEmptyMessage}</Text>
        ) : null}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 0, gap: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowText: { flex: 1 },
  label: { ...typeRoles.textInput, color: colors.text },
  labelSelected: { ...typeRoles.textOptionSelected },
  description: { ...typeRoles.textCaption, color: colors.textSecondary, marginTop: 2 },
  actions: { gap: 8 },
  body: { flexShrink: 1, minHeight: 0 },
  list: { flexShrink: 1 },
  search: { marginBottom: spacing.md },
  empty: { ...typeRoles.textBody, color: colors.textSecondary, textAlign: 'center', padding: spacing.lg },
});
