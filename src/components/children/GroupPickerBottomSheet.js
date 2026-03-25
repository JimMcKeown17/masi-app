import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  IconButton,
  Divider,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius } from '../../constants/colors';
import { useChildren } from '../../context/ChildrenContext';

/**
 * Color palette for group chips — assigned by group index (wrapping).
 * Each entry: { bg: background, text: text color }
 */
const GROUP_COLORS = [
  { bg: '#E3F2FD', text: '#1565C0' }, // Blue
  { bg: '#E8F5E9', text: '#2E7D32' }, // Green
  { bg: '#FFF3E0', text: '#E65100' }, // Orange
  { bg: '#F3E5F5', text: '#7B1FA2' }, // Purple
  { bg: '#E0F7FA', text: '#00695C' }, // Teal
  { bg: '#FCE4EC', text: '#C62828' }, // Pink
  { bg: '#FFF8E1', text: '#F57F17' }, // Amber
  { bg: '#E8EAF6', text: '#283593' }, // Indigo
];

/**
 * Get color for a group based on its index in the sorted groups array
 */
export function getGroupColor(groupIndex) {
  return GROUP_COLORS[groupIndex % GROUP_COLORS.length];
}

/**
 * Bottom sheet for selecting/managing a child's group.
 * Enforces one-group-per-user rule.
 *
 * Props:
 *   visible       - boolean
 *   onDismiss     - () => void
 *   childId       - string (UUID)
 *   childName     - string (display name)
 *   currentGroupId - string | null (the child's current group for this user)
 *   onGroupChanged - () => void (optional callback after assignment changes)
 */
export default function GroupPickerBottomSheet({
  visible,
  onDismiss,
  childId,
  childName,
  currentGroupId,
  onGroupChanged,
}) {
  const insets = useSafeAreaInsets();
  const {
    groups,
    addGroup,
    updateGroup,
    deleteGroup,
    addChildToGroup,
    removeChildFromGroup,
    getChildrenInGroup,
  } = useChildren();

  const [creating, setCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [renamingGroupId, setRenamingGroupId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [loading, setLoading] = useState(false);

  const sortedGroups = [...groups].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const resetState = () => {
    setCreating(false);
    setNewGroupName('');
    setRenamingGroupId(null);
    setRenameValue('');
    setLoading(false);
  };

  const handleDismiss = () => {
    resetState();
    onDismiss();
  };

  /**
   * Select a group for this child.
   * If already in a different group, remove from old first (one-group-per-user rule).
   */
  const handleSelectGroup = async (groupId) => {
    if (groupId === currentGroupId) {
      handleDismiss();
      return;
    }

    setLoading(true);
    try {
      // Remove from current group first (one-group-per-user enforcement)
      if (currentGroupId) {
        const removeResult = await removeChildFromGroup(childId, currentGroupId);
        if (!removeResult.success) {
          Alert.alert('Error', 'Failed to remove from current group.');
          return;
        }
      }
      // Add to new group
      const addResult = await addChildToGroup(childId, groupId);
      if (!addResult.success) {
        Alert.alert('Error', 'Failed to assign group.');
        return;
      }
      onGroupChanged?.();
      handleDismiss();
    } catch (error) {
      console.error('Error assigning group:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromGroup = async () => {
    if (!currentGroupId) return;

    setLoading(true);
    try {
      const result = await removeChildFromGroup(childId, currentGroupId);
      if (!result.success) {
        Alert.alert('Error', 'Failed to remove from group.');
        return;
      }
      onGroupChanged?.();
      handleDismiss();
    } catch (error) {
      console.error('Error removing from group:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;

    // Check for duplicate name
    if (groups.some(g => g.name.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert('Duplicate Name', 'A group with this name already exists.');
      return;
    }

    setLoading(true);
    try {
      const result = await addGroup({ name: trimmed });
      if (!result.success) {
        Alert.alert('Error', 'Failed to create group.');
        return;
      }
      // Auto-assign the new group to this child
      if (currentGroupId) {
        await removeChildFromGroup(childId, currentGroupId);
      }
      const assignResult = await addChildToGroup(childId, result.group.id);
      if (!assignResult.success) {
        Alert.alert('Error', 'Group created but failed to assign child.');
        return;
      }
      onGroupChanged?.();
      handleDismiss();
    } catch (error) {
      console.error('Error creating group:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRenameGroup = async (groupId) => {
    const trimmed = renameValue.trim();
    if (!trimmed) return;

    // Check for duplicate name (excluding current group)
    if (groups.some(g => g.id !== groupId && g.name.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert('Duplicate Name', 'A group with this name already exists.');
      return;
    }

    setLoading(true);
    try {
      await updateGroup(groupId, { name: trimmed });
      setRenamingGroupId(null);
      setRenameValue('');
    } catch (error) {
      console.error('Error renaming group:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = (group) => {
    const childCount = getChildrenInGroup(group.id).length;
    const message = childCount > 0
      ? `"${group.name}" has ${childCount} ${childCount === 1 ? 'child' : 'children'}. They will become unassigned.`
      : `Delete group "${group.name}"?`;

    Alert.alert('Delete Group', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteGroup(group.id);
          onGroupChanged?.();
        },
      },
    ]);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleDismiss}
    >
      <TouchableWithoutFeedback onPress={handleDismiss}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrapper}
      >
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            {/* Handle */}
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>

            {/* Header */}
            <Text variant="titleMedium" style={styles.title}>Assign Group</Text>
            <Text variant="bodySmall" style={styles.subtitle}>{childName}</Text>

            <ScrollView style={styles.scrollArea} bounces={false}>
              {/* Group list */}
              {sortedGroups.map((group, index) => {
                const isSelected = group.id === currentGroupId;
                const colorScheme = getGroupColor(index);
                const childCount = getChildrenInGroup(group.id).length;

                // Rename mode for this group
                if (renamingGroupId === group.id) {
                  return (
                    <View key={group.id} style={styles.renameRow}>
                      <TextInput
                        value={renameValue}
                        onChangeText={setRenameValue}
                        mode="outlined"
                        dense
                        autoFocus
                        style={styles.renameInput}
                        placeholder="Group name"
                      />
                      <IconButton
                        icon="check"
                        size={20}
                        onPress={() => handleRenameGroup(group.id)}
                        disabled={loading || !renameValue.trim()}
                      />
                      <IconButton
                        icon="close"
                        size={20}
                        onPress={() => {
                          setRenamingGroupId(null);
                          setRenameValue('');
                        }}
                      />
                    </View>
                  );
                }

                return (
                  <TouchableOpacity
                    key={group.id}
                    style={[
                      styles.groupRow,
                      isSelected && { borderColor: colorScheme.text, borderWidth: 2 },
                    ]}
                    onPress={() => handleSelectGroup(group.id)}
                    disabled={loading}
                  >
                    <View style={styles.groupInfo}>
                      <View style={[styles.groupColorDot, { backgroundColor: colorScheme.text }]} />
                      <View>
                        <Text variant="bodyLarge" style={[
                          styles.groupName,
                          isSelected && { color: colorScheme.text, fontWeight: '700' },
                        ]}>
                          {group.name}
                        </Text>
                        <Text variant="bodySmall" style={styles.groupChildCount}>
                          {childCount} {childCount === 1 ? 'child' : 'children'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.groupActions}>
                      {isSelected && (
                        <Text style={[styles.checkmark, { color: colorScheme.text }]}>✓</Text>
                      )}
                      <IconButton
                        icon="pencil-outline"
                        size={18}
                        iconColor={colors.textSecondary}
                        onPress={() => {
                          setRenamingGroupId(group.id);
                          setRenameValue(group.name);
                        }}
                        style={styles.actionIcon}
                      />
                      <IconButton
                        icon="delete-outline"
                        size={18}
                        iconColor={colors.error}
                        onPress={() => handleDeleteGroup(group)}
                        style={styles.actionIcon}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* Remove from group option */}
              {currentGroupId && (
                <TouchableOpacity
                  style={styles.removeRow}
                  onPress={handleRemoveFromGroup}
                  disabled={loading}
                >
                  <Text variant="bodyMedium" style={styles.removeText}>
                    ✕  Remove from group
                  </Text>
                </TouchableOpacity>
              )}

              <Divider style={styles.divider} />

              {/* Create new group */}
              {creating ? (
                <View style={styles.createInputRow}>
                  <TextInput
                    value={newGroupName}
                    onChangeText={setNewGroupName}
                    mode="outlined"
                    dense
                    autoFocus
                    placeholder="New group name"
                    style={styles.createInput}
                  />
                  <Button
                    mode="contained"
                    compact
                    onPress={handleCreateGroup}
                    disabled={loading || !newGroupName.trim()}
                    style={styles.createBtn}
                  >
                    Create
                  </Button>
                  <IconButton
                    icon="close"
                    size={20}
                    onPress={() => {
                      setCreating(false);
                      setNewGroupName('');
                    }}
                  />
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.createRow}
                  onPress={() => setCreating(true)}
                >
                  <Text style={styles.createText}>+  Create New Group</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheetWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    maxHeight: '80%',
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
  },
  title: {
    fontWeight: '700',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  subtitle: {
    color: colors.textSecondary,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  scrollArea: {
    paddingHorizontal: spacing.lg,
  },
  groupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  groupColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: spacing.sm,
  },
  groupName: {
    fontWeight: '500',
  },
  groupChildCount: {
    color: colors.textSecondary,
  },
  groupActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkmark: {
    fontSize: 18,
    fontWeight: '700',
    marginRight: spacing.xs,
  },
  actionIcon: {
    margin: 0,
  },
  renameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  renameInput: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  removeRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  removeText: {
    color: colors.textSecondary,
  },
  divider: {
    marginVertical: spacing.sm,
  },
  createRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
  },
  createText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  createInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  createInput: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  createBtn: {
    marginLeft: spacing.sm,
  },
});
