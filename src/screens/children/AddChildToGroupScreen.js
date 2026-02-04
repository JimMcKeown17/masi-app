import React, { useState } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import {
  Text,
  Button,
  List,
  Checkbox,
  Searchbar,
  Snackbar,
} from 'react-native-paper';
import { colors, spacing } from '../../constants/colors';
import { useChildren } from '../../context/ChildrenContext';

export default function AddChildToGroupScreen({ route, navigation }) {
  const { groupId, groupName } = route.params;
  const { children, childrenGroups, addChildToGroup } = useChildren();

  const [selectedChildren, setSelectedChildren] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [adding, setAdding] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  const showSnackbar = (message) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  // Filter out children already in this group
  const availableChildren = children.filter(child => {
    // Check if child is already in this group
    const alreadyInGroup = childrenGroups.some(
      cg => cg.child_id === child.id && cg.group_id === groupId
    );

    // Check if child name matches search term
    const matchesSearch =
      searchTerm === '' ||
      `${child.first_name} ${child.last_name}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

    return !alreadyInGroup && matchesSearch;
  });

  const handleToggleChild = (childId) => {
    if (selectedChildren.includes(childId)) {
      setSelectedChildren(selectedChildren.filter(id => id !== childId));
    } else {
      setSelectedChildren([...selectedChildren, childId]);
    }
  };

  const handleAddToGroup = async () => {
    if (selectedChildren.length === 0) {
      return;
    }

    setAdding(true);
    try {
      for (const childId of selectedChildren) {
        await addChildToGroup(childId, groupId);
      }
      navigation.goBack();
    } catch (error) {
      console.error('Error adding children to group:', error);
      showSnackbar('Failed to add children. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="titleLarge">Add Children to {groupName}</Text>
        {selectedChildren.length > 0 && (
          <Text variant="bodyMedium" style={styles.selectedCount}>
            {selectedChildren.length} selected
          </Text>
        )}
      </View>

      {/* Search bar */}
      <Searchbar
        placeholder="Search children..."
        value={searchTerm}
        onChangeText={setSearchTerm}
        style={styles.searchBar}
      />

      {/* Available children list */}
      <FlatList
        data={availableChildren}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <List.Item
            title={`${item.first_name} ${item.last_name}`}
            description={`${item.class || 'No class'} • ${item.teacher || 'No teacher'}`}
            left={props => (
              <Checkbox
                status={selectedChildren.includes(item.id) ? 'checked' : 'unchecked'}
                onPress={() => handleToggleChild(item.id)}
              />
            )}
            onPress={() => handleToggleChild(item.id)}
            style={styles.listItem}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text variant="bodyMedium" style={styles.emptyText}>
              {searchTerm
                ? 'No children match your search'
                : 'All children are already in this group'}
            </Text>
          </View>
        }
      />

      {/* Add button */}
      <View style={styles.footer}>
        <Button
          mode="contained"
          onPress={handleAddToGroup}
          disabled={selectedChildren.length === 0 || adding}
          loading={adding}
          style={styles.addButton}
        >
          Add {selectedChildren.length > 0 && `${selectedChildren.length}`}{' '}
          {selectedChildren.length === 1 ? 'Child' : 'Children'}
        </Button>
      </View>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  selectedCount: {
    marginTop: spacing.xs,
    color: colors.primary,
  },
  searchBar: {
    margin: spacing.md,
    elevation: 0,
    backgroundColor: colors.surface,
  },
  listItem: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderRadius: 8,
    elevation: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  footer: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  addButton: {
    width: '100%',
  },
});
