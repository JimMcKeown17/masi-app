import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import {
  List,
  Searchbar,
  Text,
} from 'react-native-paper';
import { borderRadius, colors, shadows, spacing } from '../../constants/colors';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { NO_TEXT_SUGGESTIONS } from '../../constants/textInputProps';

const ROSTER_ROW_HEIGHT = 64;
const INITIAL_ROSTER_ROWS = 8;
const ROSTER_WINDOW_SIZE = 5;
const PAPER_CARD_RADIUS = 12;

function SelectionPill({ selected }) {
  return (
    <View style={[styles.selectionPill, selected && styles.selectionPillSelected]}>
      <Text style={[styles.selectionPillText, selected && styles.selectionPillTextSelected]}>
        {selected ? 'Selected' : 'Select'}
      </Text>
    </View>
  );
}

const ChildSelectorRow = React.memo(function ChildSelectorRow({
  id,
  name,
  className,
  isSelected,
  onToggle,
}) {
  return (
    <View style={styles.listItemChrome}>
      <List.Item
        title={name}
        description={className}
        onPress={() => onToggle(id)}
        right={() => <SelectionPill selected={isSelected} />}
        accessibilityLabel={`${name}, ${isSelected ? 'selected' : 'not selected'}`}
        accessibilityState={{ selected: isSelected }}
        style={[styles.listItem, isSelected && styles.listItemSelected]}
      />
    </View>
  );
});

const GroupSelectorRow = React.memo(function GroupSelectorRow({
  id,
  name,
  childCount,
  isSelected,
  onSelect,
}) {
  return (
    <View style={styles.listItemChrome}>
      <List.Item
        title={name}
        description={`${childCount} ${childCount === 1 ? 'child' : 'children'}`}
        onPress={() => onSelect(id)}
        right={() => <SelectionPill selected={isSelected} />}
        accessibilityLabel={`${name}, ${childCount} ${childCount === 1 ? 'child' : 'children'}, ${isSelected ? 'selected' : 'not selected'}`}
        accessibilityState={{ selected: isSelected }}
        style={[styles.listItem, isSelected && styles.listItemSelected]}
      />
    </View>
  );
});

function ChildSelectorHeader({
  formHeader,
  searchTerm,
  onSearchTermChange,
  selectionMode,
  onSelectionModeChange,
  searchPlaceholder,
  selectedCount,
}) {
  return (
    <>
      {formHeader}
      <View style={styles.cardTop}>
        <View style={styles.sectionHeading}>
          <Text variant="titleSmall" style={styles.sectionLabel}>Select Children</Text>
          <Text variant="bodySmall" style={styles.selectedCount}>
            {selectedCount} selected
          </Text>
        </View>
        <View style={styles.modeToggle}>
          {[
            { key: 'children', label: 'Children' },
            { key: 'groups', label: 'Groups' },
          ].map((option) => {
            const selected = selectionMode === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => onSelectionModeChange(option.key)}
                accessibilityRole="button"
                accessibilityLabel={`Show ${option.label.toLowerCase()}`}
                accessibilityState={{ selected }}
                style={[styles.modeOption, selected && styles.modeOptionSelected]}
              >
                <Text style={[styles.modeOptionText, selected && styles.modeOptionTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Searchbar
          placeholder={searchPlaceholder}
          value={searchTerm}
          onChangeText={onSearchTermChange}
          style={styles.searchBar}
          elevation={0}
          {...NO_TEXT_SUGGESTIONS}
        />
      </View>
    </>
  );
}

function ChildSelectorFooter({
  formFooter,
  selectionError,
}) {
  return (
    <>
      <View style={styles.cardBottom}>
        {selectionError && (
          <Text variant="bodySmall" style={styles.errorText}>{selectionError}</Text>
        )}
      </View>
      {formFooter}
    </>
  );
}

function ChildSelector({
  selectedChildren,
  onSelectionChange,
  selectionError,
  ListHeaderComponent,
  ListFooterComponent,
  style,
  contentContainerStyle,
}) {
  const { children, groups, getChildrenInGroup } = useChildren();
  const { classes } = useClasses();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectionMode, setSelectionMode] = useState('children');

  const selectedIds = useMemo(
    () => new Set(selectedChildren.map((child) => child.id)),
    [selectedChildren],
  );
  const childrenById = useMemo(
    () => new Map(children.map((child) => [child.id, child])),
    [children],
  );
  const classNamesById = useMemo(
    () => new Map(classes.map((childClass) => [childClass.id, childClass.name])),
    [classes],
  );
  const groupChildrenById = useMemo(
    () => new Map(groups.map((group) => [group.id, getChildrenInGroup(group.id)])),
    [getChildrenInGroup, groups],
  );

  const selectedChildrenRef = useRef(selectedChildren);
  const childrenByIdRef = useRef(childrenById);
  const onSelectionChangeRef = useRef(onSelectionChange);
  selectedChildrenRef.current = selectedChildren;
  childrenByIdRef.current = childrenById;
  onSelectionChangeRef.current = onSelectionChange;

  const filteredChildren = useMemo(() => {
    if (!searchTerm) return children;
    const lower = searchTerm.toLowerCase();
    return children.filter(
      (child) =>
        child.first_name.toLowerCase().includes(lower) ||
        child.last_name.toLowerCase().includes(lower),
    );
  }, [children, searchTerm]);
  const filteredGroups = useMemo(() => {
    if (!searchTerm) return groups;
    const lower = searchTerm.toLowerCase();
    return groups.filter((group) => group.name.toLowerCase().includes(lower));
  }, [groups, searchTerm]);

  const onToggle = useCallback((childId) => {
    const currentSelection = selectedChildrenRef.current;
    const isSelected = currentSelection.some((child) => child.id === childId);
    const nextSelection = isSelected
      ? currentSelection.filter((child) => child.id !== childId)
      : [...currentSelection, childrenByIdRef.current.get(childId)];
    onSelectionChangeRef.current(nextSelection);
  }, []);

  const handleSelectGroup = useCallback((groupId) => {
    const groupChildren = getChildrenInGroup(groupId);
    const currentSelection = selectedChildrenRef.current;
    const isExactSelection = groupChildren.length > 0
      && groupChildren.length === currentSelection.length
      && groupChildren.every((child) => currentSelection.some(
        (selected) => selected.id === child.id
      ));
    onSelectionChangeRef.current(isExactSelection ? [] : groupChildren);
  }, [getChildrenInGroup]);

  const handleSelectionModeChange = useCallback((mode) => {
    setSearchTerm('');
    setSelectionMode(mode);
  }, []);

  const renderItem = useCallback(({ item }) => (
    selectionMode === 'groups'
      ? (
        <GroupSelectorRow
          id={item.id}
          name={item.name}
          childCount={groupChildrenById.get(item.id)?.length || 0}
          isSelected={(
            groupChildrenById.get(item.id)?.length > 0
            && groupChildrenById.get(item.id).length === selectedIds.size
            && groupChildrenById.get(item.id).every((child) => selectedIds.has(child.id))
          )}
          onSelect={handleSelectGroup}
        />
      )
      : (
        <ChildSelectorRow
          id={item.id}
          name={`${item.first_name} ${item.last_name}`}
          className={classNamesById.get(item.class_id) || 'No class'}
          isSelected={selectedIds.has(item.id)}
          onToggle={onToggle}
        />
      )
  ), [
    classNamesById,
    groupChildrenById,
    handleSelectGroup,
    onToggle,
    selectedIds,
    selectionMode,
  ]);

  const listHeader = (
    <ChildSelectorHeader
      formHeader={ListHeaderComponent}
      searchTerm={searchTerm}
      onSearchTermChange={setSearchTerm}
      selectionMode={selectionMode}
      onSelectionModeChange={handleSelectionModeChange}
      searchPlaceholder={selectionMode === 'groups' ? 'Search groups...' : 'Search children...'}
      selectedCount={selectedChildren.length}
    />
  );

  const listFooter = (
    <ChildSelectorFooter
      formFooter={ListFooterComponent}
      selectionError={selectionError}
    />
  );

  return (
    <FlatList
      style={style}
      contentContainerStyle={contentContainerStyle}
      data={selectionMode === 'groups' ? filteredGroups : filteredChildren}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      extraData={selectedIds}
      ListHeaderComponent={listHeader}
      ListFooterComponent={listFooter}
      ListEmptyComponent={
        <View style={styles.listItemChrome}>
          <Text variant="bodySmall" style={styles.emptyText}>
            {selectionMode === 'groups'
              ? (searchTerm ? 'No groups match your search' : 'No groups available')
              : (searchTerm ? 'No children match your search' : 'No children available')}
          </Text>
        </View>
      }
      initialNumToRender={INITIAL_ROSTER_ROWS}
      windowSize={ROSTER_WINDOW_SIZE}
      getItemLayout={(_, index) => ({
        length: ROSTER_ROW_HEIGHT,
        offset: ROSTER_ROW_HEIGHT * index,
        index,
      })}
    />
  );
}

export default React.memo(ChildSelector);

const styles = StyleSheet.create({
  cardTop: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: PAPER_CARD_RADIUS,
    borderTopRightRadius: PAPER_CARD_RADIUS,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    ...shadows.card,
  },
  cardBottom: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: PAPER_CARD_RADIUS,
    borderBottomRightRadius: PAPER_CARD_RADIUS,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    ...shadows.card,
  },
  sectionLabel: {
    color: colors.primary,
    fontWeight: '600',
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedCount: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderCurve: 'continuous',
    padding: spacing.xs,
    marginVertical: spacing.sm,
    gap: spacing.xs,
  },
  modeOption: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.sm,
    borderCurve: 'continuous',
  },
  modeOptionSelected: {
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  modeOptionText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  modeOptionTextSelected: {
    color: colors.primary,
  },
  searchBar: {
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  listItemChrome: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  listItem: {
    backgroundColor: colors.surface,
    minHeight: ROSTER_ROW_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  listItemSelected: {
    backgroundColor: colors.red50,
  },
  selectionPill: {
    alignSelf: 'center',
    minWidth: 84,
    minHeight: 38,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.xl,
    borderCurve: 'continuous',
  },
  selectionPillSelected: {
    backgroundColor: colors.red50,
  },
  selectionPillText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  selectionPillTextSelected: {
    color: colors.primary,
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  errorText: {
    color: colors.error,
    marginTop: spacing.sm,
  },
});
