import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  Button,
  Chip,
  List,
  Menu,
  Searchbar,
  Text,
} from 'react-native-paper';
import { borderRadius, colors, shadows, spacing } from '../../constants/colors';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { NO_TEXT_SUGGESTIONS } from '../../constants/textInputProps';

// Paper List.Item measures 72px for a title plus description. The existing
// spacing.xs vertical margins make each roster row 80px tall.
const ROSTER_ROW_HEIGHT = 80;
const INITIAL_ROSTER_ROWS = 8;
const ROSTER_WINDOW_SIZE = 5;
const PAPER_CARD_RADIUS = 12;

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
        right={(props) => (
          isSelected
            ? <List.Icon {...props} icon="check" color={colors.primary} />
            : null
        )}
        style={[styles.listItem, isSelected && styles.listItemSelected]}
      />
    </View>
  );
});

function ChildSelectorHeader({
  formHeader,
  searchTerm,
  onSearchTermChange,
  groupMenuVisible,
  onOpenGroupMenu,
  onDismissGroupMenu,
  groups,
  onSelectGroup,
}) {
  return (
    <>
      {formHeader}
      <View style={styles.cardTop}>
        <Text variant="titleSmall" style={styles.sectionLabel}>Select Children</Text>
        <Searchbar
          placeholder="Search children..."
          value={searchTerm}
          onChangeText={onSearchTermChange}
          style={styles.searchBar}
          elevation={0}
          {...NO_TEXT_SUGGESTIONS}
        />

        <Menu
          visible={groupMenuVisible}
          onDismiss={onDismissGroupMenu}
          anchor={
            <Button
              mode="outlined"
              onPress={onOpenGroupMenu}
              icon="folder-open"
              style={styles.groupButton}
            >
              Select by Group
            </Button>
          }
        >
          {groups.length === 0 ? (
            <Menu.Item title="No groups available" disabled />
          ) : (
            groups.map((group) => (
              <Menu.Item
                key={group.id}
                title={group.name}
                onPress={() => onSelectGroup(group.id)}
              />
            ))
          )}
        </Menu>
      </View>
    </>
  );
}

function ChildSelectorFooter({
  formFooter,
  selectedChildren,
  onRemoveChild,
  selectionError,
}) {
  return (
    <>
      <View style={styles.cardBottom}>
        {selectedChildren.length > 0 && (
          <View style={styles.chipsSection}>
            <Text variant="bodySmall" style={styles.chipsSectionLabel}>
              Selected Children
            </Text>
            <View style={styles.chipsRow}>
              {selectedChildren.map((child) => (
                <Chip
                  key={child.id}
                  onDelete={() => onRemoveChild(child.id)}
                  style={styles.chip}
                >
                  {child.first_name} {child.last_name}
                </Chip>
              ))}
            </View>
          </View>
        )}
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
  const [groupMenuVisible, setGroupMenuVisible] = useState(false);

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

  const onToggle = useCallback((childId) => {
    const currentSelection = selectedChildrenRef.current;
    const isSelected = currentSelection.some((child) => child.id === childId);
    const nextSelection = isSelected
      ? currentSelection.filter((child) => child.id !== childId)
      : [...currentSelection, childrenByIdRef.current.get(childId)];
    onSelectionChangeRef.current(nextSelection);
  }, []);

  const handleSelectGroup = useCallback((groupId) => {
    const currentSelection = selectedChildrenRef.current;
    const currentIds = new Set(currentSelection.map((child) => child.id));
    const merged = [...currentSelection];
    getChildrenInGroup(groupId).forEach((child) => {
      if (!currentIds.has(child.id)) merged.push(child);
    });
    onSelectionChangeRef.current(merged);
    setGroupMenuVisible(false);
  }, [getChildrenInGroup]);

  const handleRemoveChild = useCallback((childId) => {
    onSelectionChangeRef.current(
      selectedChildrenRef.current.filter((child) => child.id !== childId),
    );
  }, []);

  const renderItem = useCallback(({ item }) => (
    <ChildSelectorRow
      id={item.id}
      name={`${item.first_name} ${item.last_name}`}
      className={classNamesById.get(item.class_id) || 'No class'}
      isSelected={selectedIds.has(item.id)}
      onToggle={onToggle}
    />
  ), [classNamesById, onToggle, selectedIds]);

  const listHeader = (
    <ChildSelectorHeader
      formHeader={ListHeaderComponent}
      searchTerm={searchTerm}
      onSearchTermChange={setSearchTerm}
      groupMenuVisible={groupMenuVisible}
      onOpenGroupMenu={() => setGroupMenuVisible(true)}
      onDismissGroupMenu={() => setGroupMenuVisible(false)}
      groups={groups}
      onSelectGroup={handleSelectGroup}
    />
  );

  const listFooter = (
    <ChildSelectorFooter
      formFooter={ListFooterComponent}
      selectedChildren={selectedChildren}
      onRemoveChild={handleRemoveChild}
      selectionError={selectionError}
    />
  );

  return (
    <FlatList
      style={style}
      contentContainerStyle={contentContainerStyle}
      data={filteredChildren}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      extraData={selectedIds}
      ListHeaderComponent={listHeader}
      ListFooterComponent={listFooter}
      ListEmptyComponent={
        <View style={styles.listItemChrome}>
          <Text variant="bodySmall" style={styles.emptyText}>
            {searchTerm ? 'No children match your search' : 'No children available'}
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
    marginBottom: spacing.sm,
    fontWeight: '600',
  },
  searchBar: {
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  groupButton: {
    marginBottom: spacing.md,
  },
  listItemChrome: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  listItem: {
    backgroundColor: colors.surface,
    marginVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  listItemSelected: {
    backgroundColor: colors.red50,
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  chipsSection: {
    marginTop: spacing.md,
  },
  chipsSectionLabel: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.red50,
  },
  errorText: {
    color: colors.error,
    marginTop: spacing.sm,
  },
});
