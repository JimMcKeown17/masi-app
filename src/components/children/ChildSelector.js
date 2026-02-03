import React, { useState, useMemo } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import {
  Text,
  Searchbar,
  List,
  Chip,
  Menu,
  Button,
} from 'react-native-paper';
import { colors, spacing, borderRadius } from '../../constants/colors';
import { useChildren } from '../../context/ChildrenContext';

export default function ChildSelector({ selectedChildren, onSelectionChange }) {
  const { children, groups, getChildrenInGroup } = useChildren();
  const [searchTerm, setSearchTerm] = useState('');
  const [groupMenuVisible, setGroupMenuVisible] = useState(false);

  const selectedIds = useMemo(
    () => new Set(selectedChildren.map((c) => c.id)),
    [selectedChildren]
  );

  const filteredChildren = useMemo(() => {
    if (!searchTerm) return children;
    const lower = searchTerm.toLowerCase();
    return children.filter(
      (child) =>
        child.first_name.toLowerCase().includes(lower) ||
        child.last_name.toLowerCase().includes(lower)
    );
  }, [children, searchTerm]);

  const handleToggleChild = (child) => {
    if (selectedIds.has(child.id)) {
      onSelectionChange(selectedChildren.filter((c) => c.id !== child.id));
    } else {
      onSelectionChange([...selectedChildren, child]);
    }
  };

  const handleSelectGroup = (groupId) => {
    const groupChildren = getChildrenInGroup(groupId);
    const merged = [...selectedChildren];
    groupChildren.forEach((child) => {
      if (!selectedIds.has(child.id)) {
        merged.push(child);
      }
    });
    onSelectionChange(merged);
    setGroupMenuVisible(false);
  };

  const handleRemoveChild = (childId) => {
    onSelectionChange(selectedChildren.filter((c) => c.id !== childId));
  };

  return (
    <View>
      <Searchbar
        placeholder="Search children..."
        value={searchTerm}
        onChangeText={setSearchTerm}
        style={styles.searchBar}
        elevation={0}
      />

      <Menu
        visible={groupMenuVisible}
        onDismiss={() => setGroupMenuVisible(false)}
        anchor={
          <Button
            mode="outlined"
            onPress={() => setGroupMenuVisible(true)}
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
              onPress={() => handleSelectGroup(group.id)}
            />
          ))
        )}
      </Menu>

      <FlatList
        data={filteredChildren}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isSelected = selectedIds.has(item.id);
          return (
            <List.Item
              title={`${item.first_name} ${item.last_name}`}
              description={item.class || item.teacher || undefined}
              onPress={() => handleToggleChild(item)}
              right={(props) =>
                isSelected ? (
                  <List.Icon {...props} icon="check" color={colors.primary} />
                ) : null
              }
              style={[styles.listItem, isSelected && styles.listItemSelected]}
            />
          );
        }}
        ListEmptyComponent={
          <Text variant="bodySmall" style={styles.emptyText}>
            {searchTerm ? 'No children match your search' : 'No children available'}
          </Text>
        }
        scrollEnabled={false}
      />

      {selectedChildren.length > 0 && (
        <View style={styles.chipsSection}>
          <Text variant="bodySmall" style={styles.chipsSectionLabel}>
            Selected Children
          </Text>
          <View style={styles.chipsRow}>
            {selectedChildren.map((child) => (
              <Chip
                key={child.id}
                onDelete={() => handleRemoveChild(child.id)}
                style={styles.chip}
              >
                {child.first_name} {child.last_name}
              </Chip>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  groupButton: {
    marginBottom: spacing.md,
  },
  listItem: {
    backgroundColor: colors.surface,
    marginVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  listItemSelected: {
    backgroundColor: '#EEF2FF',
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
    backgroundColor: '#EEF2FF',
  },
});
