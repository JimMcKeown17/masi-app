import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  List,
  IconButton,
  Dialog,
  Portal,
} from 'react-native-paper';
import { colors, spacing } from '../../constants/colors';
import { useChildren } from '../../context/ChildrenContext';

export default function GroupManagementScreen({ navigation }) {
  const {
    groups,
    addGroup,
    updateGroup,
    deleteGroup,
    getChildrenInGroup,
    removeChildFromGroup,
  } = useChildren();

  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroup, setEditingGroup] = useState(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      return;
    }

    const result = await addGroup({ name: newGroupName.trim() });

    if (result.success) {
      setNewGroupName('');
    } else {
      Alert.alert('Error', 'Failed to create group');
    }
  };

  const handleEditGroup = (group) => {
    setEditingGroup(group);
    setEditGroupName(group.name);
  };

  const handleSaveEdit = async () => {
    if (!editGroupName.trim() || !editingGroup) {
      return;
    }

    const result = await updateGroup(editingGroup.id, {
      name: editGroupName.trim(),
    });

    if (result.success) {
      setEditingGroup(null);
      setEditGroupName('');
    } else {
      Alert.alert('Error', 'Failed to update group');
    }
  };

  const handleDeleteGroup = (groupId, groupName) => {
    Alert.alert(
      'Delete Group',
      `Are you sure you want to delete "${groupName}"? This will remove all children from this group. Sessions using this group will still show historical data.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteGroup(groupId);
            if (!result.success) {
              Alert.alert('Error', 'Failed to delete group');
            }
          },
        },
      ]
    );
  };

  const handleRemoveChildFromGroup = (childId, childName, groupId, groupName) => {
    Alert.alert(
      'Remove Child',
      `Remove ${childName} from ${groupName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const result = await removeChildFromGroup(childId, groupId);
            if (!result.success) {
              Alert.alert('Error', 'Failed to remove child from group');
            }
          },
        },
      ]
    );
  };

  const toggleGroupExpanded = (groupId) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Create group section */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Create New Group
          </Text>
          <TextInput
            label="Group Name"
            value={newGroupName}
            onChangeText={setNewGroupName}
            mode="outlined"
            style={styles.input}
          />
          <Button
            mode="contained"
            onPress={handleCreateGroup}
            disabled={!newGroupName.trim()}
          >
            Create Group
          </Button>
        </Card.Content>
      </Card>

      {/* Groups list */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            My Groups
          </Text>

          {groups.length === 0 ? (
            <Text variant="bodyMedium" style={styles.emptyText}>
              No groups yet. Create your first group above.
            </Text>
          ) : (
            groups.map(group => {
              const childrenInGroup = getChildrenInGroup(group.id);
              const isExpanded = expandedGroups[group.id];

              return (
                <List.Accordion
                  key={group.id}
                  title={group.name}
                  description={`${childrenInGroup.length} ${
                    childrenInGroup.length === 1 ? 'child' : 'children'
                  }`}
                  left={props => <List.Icon {...props} icon="folder" />}
                  expanded={isExpanded}
                  onPress={() => toggleGroupExpanded(group.id)}
                  style={styles.accordion}
                >
                  {/* Children in this group */}
                  {childrenInGroup.length > 0 ? (
                    childrenInGroup.map(child => (
                      <List.Item
                        key={child.id}
                        title={`${child.first_name} ${child.last_name}`}
                        left={props => <List.Icon {...props} icon="account" />}
                        right={props => (
                          <IconButton
                            icon="close"
                            iconColor={colors.error}
                            onPress={() =>
                              handleRemoveChildFromGroup(
                                child.id,
                                `${child.first_name} ${child.last_name}`,
                                group.id,
                                group.name
                              )
                            }
                          />
                        )}
                        style={styles.childItem}
                      />
                    ))
                  ) : (
                    <Text variant="bodySmall" style={styles.emptyGroupText}>
                      No children in this group yet
                    </Text>
                  )}

                  {/* Add children button */}
                  <Button
                    mode="outlined"
                    onPress={() =>
                      navigation.navigate('AddChildToGroup', {
                        groupId: group.id,
                        groupName: group.name,
                      })
                    }
                    style={styles.addButton}
                    icon="plus"
                  >
                    Add Children
                  </Button>

                  {/* Group actions */}
                  <View style={styles.groupActions}>
                    <Button
                      onPress={() => handleEditGroup(group)}
                      icon="pencil"
                    >
                      Rename
                    </Button>
                    <Button
                      textColor={colors.error}
                      onPress={() => handleDeleteGroup(group.id, group.name)}
                      icon="delete"
                    >
                      Delete
                    </Button>
                  </View>
                </List.Accordion>
              );
            })
          )}
        </Card.Content>
      </Card>

      {/* Edit group dialog */}
      <Portal>
        <Dialog
          visible={!!editingGroup}
          onDismiss={() => setEditingGroup(null)}
        >
          <Dialog.Title>Rename Group</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Group Name"
              value={editGroupName}
              onChangeText={setEditGroupName}
              mode="outlined"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditingGroup(null)}>Cancel</Button>
            <Button onPress={handleSaveEdit}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  input: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginVertical: spacing.lg,
  },
  emptyGroupText: {
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  accordion: {
    backgroundColor: colors.cardBackground,
    marginBottom: spacing.sm,
    borderRadius: 8,
  },
  childItem: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderRadius: 4,
  },
  addButton: {
    margin: spacing.md,
  },
  groupActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
});
