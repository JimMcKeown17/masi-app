import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { borderRadius, colors, tints } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { getInitials } from '../../utils/initials';
import { rosterRowHeight } from '../../utils/sessionFormLayout';
import Avatar from '../common/Avatar';
import IconTile from '../common/IconTile';
import InlineNote from '../common/InlineNote';
import SearchField from '../common/SearchField';
import SegmentedControl from '../common/SegmentedControl';
import StepHeader from '../forms/StepHeader';
import CountChip from '../forms/CountChip';
import SelectableRow from '../forms/SelectableRow';

const INITIAL_ROSTER_ROWS = 8;
const ROSTER_WINDOW_SIZE = 5;
const MODES = [{ value: 'children', label: 'Children' }, { value: 'groups', label: 'Groups' }];
const rowPosition = (index, count) => count === 1 ? 'only' : index === 0 ? 'first' : index === count - 1 ? 'last' : 'middle';

const ChildSelectorRow = React.memo(function ChildSelectorRow({ id, name, initials, className, isSelected, onToggle, height, position }) {
  return <SelectableRow variant="checkbox" title={name} subtitle={className}
    lead={<Avatar label={initials} size={40} />} selected={isSelected}
    onPress={() => onToggle(id)} height={height} position={position}
    accessibilityLabel={`${name}, ${className}`} />;
});

const GroupSelectorRow = React.memo(function GroupSelectorRow({ id, name, childCount, isSelected, onSelect, height, position }) {
  const subtitle = `${childCount} ${childCount === 1 ? 'child' : 'children'}`;
  return <SelectableRow variant="radio" title={name} subtitle={subtitle}
    lead={<IconTile icon="people-outline" tone="red" />} selected={isSelected}
    onPress={() => onSelect(id)} height={height} position={position}
    accessibilityLabel={`${name}, ${subtitle}`} />;
});

function ChildSelectorHeader({ formHeader, searchTerm, onSearchTermChange, selectionMode,
  onSelectionModeChange, searchPlaceholder, selectedCount, selectionError, childrenStepRef,
  onHeaderLayout, onSectionLayout }) {
  return <View testID="roster-header" onLayout={onHeaderLayout}>
    {formHeader}
    <View testID="children-section" onLayout={onSectionLayout} style={styles.section}>
      <View style={styles.heading}>
        <StepHeader ref={childrenStepRef} step={2} label="Select children"
          status={selectionError ? 'error' : selectedCount > 0 ? 'done' : 'todo'}
          right={<CountChip label={`${selectedCount} selected`} active={selectedCount > 0} />} />
      </View>
      {selectionError ? <View style={styles.error}><InlineNote tone="error">{selectionError}</InlineNote></View> : null}
      <SegmentedControl role="tab" accessibilityLabel="Show" options={MODES}
        value={selectionMode} onChange={onSelectionModeChange} />
      {selectionMode === 'groups' ? <Text style={styles.hint}>Choosing a group replaces your selection.</Text> : null}
      <View style={styles.search}>
        <SearchField placeholder={searchPlaceholder} accessibilityLabel={searchPlaceholder}
          value={searchTerm} onChangeText={onSearchTermChange} />
      </View>
    </View>
  </View>;
}

function ChildSelectorFooter({ formFooter }) {
  return <>{formFooter}</>;
}

function ChildSelector({
  selectedChildren,
  onSelectionChange,
  selectionError,
  ListHeaderComponent,
  ListFooterComponent,
  style,
  contentContainerStyle,
  listRef,
  childrenStepRef,
  onScroll,
  automaticallyAdjustKeyboardInsets = false,
  onMetrics,
}) {
  const { children, groups, getChildrenInGroup } = useChildren();
  const { classes } = useClasses();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectionMode, setSelectionMode] = useState('children');
  const rowHeight = rosterRowHeight(useWindowDimensions().fontScale);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [childrenSectionY, setChildrenSectionY] = useState(0);
  const [emptyHeight, setEmptyHeight] = useState(0);
  const onMetricsRef = useRef(onMetrics);
  onMetricsRef.current = onMetrics;
  const onHeaderLayout = useCallback((event) => setHeaderHeight(event.nativeEvent.layout.height), []);
  const onSectionLayout = useCallback((event) => setChildrenSectionY(event.nativeEvent.layout.y), []);
  const onEmptyLayout = useCallback((event) => setEmptyHeight(event.nativeEvent.layout.height), []);

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
  const getChildrenInGroupRef = useRef(getChildrenInGroup);
  getChildrenInGroupRef.current = getChildrenInGroup;
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
    const groupChildren = getChildrenInGroupRef.current(groupId);
    const currentSelection = selectedChildrenRef.current;
    const isExactSelection = groupChildren.length > 0
      && groupChildren.length === currentSelection.length
      && groupChildren.every((child) => currentSelection.some(
        (selected) => selected.id === child.id
      ));
    onSelectionChangeRef.current(isExactSelection ? [] : groupChildren);
  }, []);

  const handleSelectionModeChange = useCallback((mode) => {
    setSearchTerm('');
    setSelectionMode(mode);
  }, []);

  const data = selectionMode === 'groups' ? filteredGroups : filteredChildren;
  const bodyHeight = data.length > 0 ? data.length * rowHeight : emptyHeight;
  useEffect(() => {
    onMetricsRef.current?.({ headerHeight, childrenSectionY, bodyHeight });
  }, [headerHeight, childrenSectionY, bodyHeight]);
  const getItemLayout = useCallback((_, index) => ({ length: rowHeight, offset: rowHeight * index, index }), [rowHeight]);

  const renderItem = useCallback(({ item, index }) => (
    selectionMode === 'groups'
      ? (
        <GroupSelectorRow
          id={item.id}
          height={rowHeight}
          position={rowPosition(index, data.length)}
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
          height={rowHeight}
          position={rowPosition(index, data.length)}
          name={`${item.first_name} ${item.last_name}`}
          initials={getInitials(item.first_name, item.last_name)}
          className={classNamesById.get(item.class_id) || 'No class'}
          isSelected={selectedIds.has(item.id)}
          onToggle={onToggle}
        />
      )
  ), [
    classNamesById,
    data.length,
    rowHeight,
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
      searchPlaceholder={selectionMode === 'groups' ? 'Search groups…' : 'Search children…'}
      selectedCount={selectedChildren.length}
      selectionError={selectionError}
      childrenStepRef={childrenStepRef}
      onHeaderLayout={onHeaderLayout}
      onSectionLayout={onSectionLayout}
    />
  );

  const listFooter = (
    <ChildSelectorFooter
      formFooter={ListFooterComponent}
    />
  );

  return (
    <FlatList
      ref={listRef}
      onScroll={onScroll}
      automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets}
      scrollEventThrottle={16}
      style={style}
      contentContainerStyle={contentContainerStyle}
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      extraData={selectedIds}
      ListHeaderComponent={listHeader}
      ListFooterComponent={listFooter}
      ListEmptyComponent={
        <View testID="roster-empty" onLayout={onEmptyLayout} style={styles.emptyRow}>
          <Text style={styles.emptyText}>
            {selectionMode === 'groups'
              ? (searchTerm ? 'No groups match your search' : 'No groups available')
              : (searchTerm ? 'No children match your search' : 'No children available')}
          </Text>
        </View>
      }
      initialNumToRender={INITIAL_ROSTER_ROWS}
      windowSize={ROSTER_WINDOW_SIZE}
      getItemLayout={getItemLayout}
    />
  );
}

export default React.memo(ChildSelector);

const styles = StyleSheet.create({
  section: { paddingBottom: 22 },
  heading: { minHeight: 32, marginBottom: 12 },
  error: { marginBottom: 24 },
  hint: { ...typeRoles.textCaption, color: colors.textSecondary, marginTop: 8 },
  search: { marginTop: 12 },
  emptyRow: { backgroundColor: colors.surface, borderWidth: 1, borderColor: tints.rule, borderRadius: borderRadius.lg, paddingVertical: 20, paddingHorizontal: 16 },
  emptyText: { ...typeRoles.textCaption, color: colors.textSecondary },
});
