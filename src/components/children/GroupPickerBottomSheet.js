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
 * Number of virtual preset rows to show when the user has zero groups.
 * Each tap creates the corresponding real group and assigns the current child.
 */
const PRESET_VIRTUAL_COUNT = 4;

/**
 * Get color for a group based on its index in the sorted groups array
 */
export function getGroupColor(groupIndex) {
  return GROUP_COLORS[groupIndex % GROUP_COLORS.length];
}

/**
 * Regex matching the preset "Group N" format (where N is a positive integer).
 * Used for numeric sorting and next-number computation.
 */
const NUMBERED_GROUP = /^Group (\d+)$/;

/**
 * Compute the next group number for the "+ Add Group N" button.
 * Returns max(existing numbered) + 1, or 1 if no numbered groups exist.
 * Monotonic — does not fill gaps from deleted groups.
 * Ignores legacy free-text names.
 */
export function nextGroupNumber(groups) {
  const nums = groups
    .map((g) => g.name.match(NUMBERED_GROUP))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

/**
 * Comparator for sorting groups:
 *   1. Numbered groups ("Group N") first, sorted numerically.
 *   2. Legacy free-text names after, sorted alphabetically.
 * Solves the "Group 10 before Group 2" lexicographic gotcha.
 */
export function compareGroups(a, b) {
  const ma = a.name.match(NUMBERED_GROUP);
  const mb = b.name.match(NUMBERED_GROUP);
  if (ma && mb) return parseInt(ma[1], 10) - parseInt(mb[1], 10);
  if (ma) return -1;
  if (mb) return 1;
  return a.name.localeCompare(b.name);
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
    deleteGroup,
    addChildToGroup,
    removeChildFromGroup,
    getChildrenInGroup,
  } = useChildren();

  const [loading, setLoading] = useState(false);

  const sortedGroups = [...groups].sort(compareGroups);

  const resetState = () => {
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

  /**
   * Tap handler for a virtual preset row AND the "+ Add Group N" button.
   * Creates the group as a real record, then assigns the current child to it.
   * One-group-per-user rule is preserved by removing from the existing group first,
   * with a success check to prevent orphaned multi-group state if the remove fails
   * (e.g., local storage error while offline).
   */
  const handleSelectVirtual = async (n) => {
    const name = `Group ${n}`;

    // Case-insensitive + whitespace-normalised duplicate guard.
    // Matches the existing handleSelectGroup / handleCreateGroup behavior
    // and prevents near-miss collisions such as a legacy "group 1" (lowercase)
    // coexisting with a new "Group 1". Only plausible on the "+ Add Group N"
    // path when a conforming-but-case-mismatched legacy group exists; virtuals
    // only render when groups.length === 0 so no collisions are possible there.
    const normalized = name.trim().toLowerCase();
    if (groups.some((g) => g.name.trim().toLowerCase() === normalized)) {
      Alert.alert('Duplicate Name', `${name} already exists (or a case variant does).`);
      return;
    }

    setLoading(true);
    try {
      const createResult = await addGroup({ name });
      if (!createResult.success) {
        Alert.alert('Error', 'Failed to create group.');
        return;
      }
      // Best-effort rollback for a downstream failure. If remove-from-old or
      // assign-to-new fails after creation, the group exists with no child
      // assigned — a phantom empty group would appear in the picker next time.
      // Delete it; if the delete also fails the orphan persists, which is still
      // better than always leaving one behind.
      const rollbackCreate = async () => {
        try {
          await deleteGroup(createResult.group.id);
        } catch {
          // no-op; orphan will remain in this rare case
        }
      };
      if (currentGroupId) {
        const removeResult = await removeChildFromGroup(childId, currentGroupId);
        if (!removeResult.success) {
          await rollbackCreate();
          Alert.alert('Error', 'Failed to remove from current group.');
          return;
        }
      }
      const assignResult = await addChildToGroup(childId, createResult.group.id);
      if (!assignResult.success) {
        await rollbackCreate();
        Alert.alert('Error', 'Group created but failed to assign child.');
        return;
      }
      onGroupChanged?.();
      handleDismiss();
    } catch (error) {
      console.error('Error creating virtual group:', error);
    } finally {
      setLoading(false);
    }
  };

  // Computed once per render so the "+ Add Group N" label and the handler that
  // uses it cannot disagree if a context update (e.g., a sync event delivering
  // a new group) lands between render and tap.
  const nextNumberedN = nextGroupNumber(groups);

  /**
   * Tap handler for the "+ Add Group N" button.
   * Creates the next monotonic group number and assigns the current child.
   */
  const handleAddNextNumbered = async () => {
    // Reuses handleSelectVirtual's logic — same effect, different trigger.
    await handleSelectVirtual(nextNumberedN);
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
              {/* Virtual preset rows — shown only when user has no groups yet */}
              {groups.length === 0 &&
                Array.from({ length: PRESET_VIRTUAL_COUNT }, (_, i) => i + 1).map((n) => {
                  const colorScheme = getGroupColor(n - 1);
                  return (
                    <TouchableOpacity
                      key={`virtual-${n}`}
                      style={styles.groupRow}
                      onPress={() => handleSelectVirtual(n)}
                      disabled={loading}
                    >
                      <View style={styles.groupInfo}>
                        <View style={[styles.groupColorDot, { backgroundColor: colorScheme.text }]} />
                        <View>
                          <Text variant="bodyLarge" style={styles.groupName}>
                            Group {n}
                          </Text>
                          <Text variant="bodySmall" style={styles.groupChildCount}>
                            0 children
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}

              {/* Group list */}
              {sortedGroups.map((group, index) => {
                const isSelected = group.id === currentGroupId;
                const colorScheme = getGroupColor(index);
                const childCount = getChildrenInGroup(group.id).length;

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

              {/* "+ Add Group N" — hidden while virtual presets are showing */}
              {groups.length > 0 && (
                <TouchableOpacity
                  style={styles.createRow}
                  onPress={handleAddNextNumbered}
                  disabled={loading}
                >
                  <Text style={styles.createText}>
                    +  Add Group {nextNumberedN}
                  </Text>
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
});
