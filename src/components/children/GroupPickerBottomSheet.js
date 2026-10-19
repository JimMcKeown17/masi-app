import { isStaleActorError } from '../../session/staleActor';
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {
  Text,
  IconButton,
  Divider,
} from 'react-native-paper';
import { colors, spacing, borderRadius } from '../../constants/colors';
import { useChildren } from '../../context/ChildrenContext';
import { compareGroups, getGroupDotColor, nextGroupNumber } from '../../utils/groupHelpers';
import { GroupDot } from './GroupChip';
import BottomSheet from '../common/BottomSheet';
import BrandButton from '../common/BrandButton';
import { fontFamilies, typeRoles } from '../../constants/typography';

/**
 * Number of virtual preset rows to show when the user has zero groups.
 * Each tap creates the corresponding real group and assigns the current child.
 */
const PRESET_VIRTUAL_COUNT = 4;

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
      if (isStaleActorError(error)) throw error;
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
      if (isStaleActorError(error)) throw error;
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
      if (isStaleActorError(error)) throw error;
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
    <BottomSheet
      visible={visible}
      onDismiss={handleDismiss}
      title="Assign group"
      subtitle={childName}
      dismissLabel="Dismiss group picker"
    >
      {/* Virtual preset rows — shown only when user has no groups yet */}
      {groups.length === 0 &&
        Array.from({ length: PRESET_VIRTUAL_COUNT }, (_, i) => i + 1).map((n) => {
          return (
            <TouchableOpacity
              key={`virtual-${n}`}
              style={styles.groupRow}
              onPress={() => handleSelectVirtual(n)}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={`Assign ${childName} to Group ${n}`}
              accessibilityState={{ disabled: loading }}
            >
              <View style={styles.groupInfo}>
                <View style={styles.groupColorDot}><GroupDot color={getGroupDotColor(n - 1)} size={12} /></View>
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
        const childCount = getChildrenInGroup(group.id).length;

        return (
          <TouchableOpacity
            key={group.id}
            style={[
              styles.groupRow,
              isSelected && { borderColor: colors.text, borderWidth: 2 },
            ]}
            onPress={() => handleSelectGroup(group.id)}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={`Assign ${childName} to ${group.name}`}
            accessibilityState={{ disabled: loading, selected: isSelected }}
          >
            <View style={styles.groupInfo}>
              <View style={styles.groupColorDot}><GroupDot color={getGroupDotColor(index)} size={12} /></View>
              <View>
                <Text variant="bodyLarge" style={[
                  styles.groupName,
                  isSelected && { color: colors.text, fontFamily: fontFamilies.textBold },
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
                <Text style={[styles.checkmark, { color: colors.text }]}>✓</Text>
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
        <BrandButton
          variant="secondary"
          label="✕  Remove from group"
          style={styles.removeRow}
          onPress={handleRemoveFromGroup}
          disabled={loading}
          accessibilityLabel={`Remove ${childName} from group`}
        />
      )}

      <Divider style={styles.divider} />

      {/* "+ Add Group N" — hidden while virtual presets are showing */}
      {groups.length > 0 && (
        <BrandButton
          variant="secondary"
          label={`+  Add Group ${nextNumberedN}`}
          onPress={handleAddNextNumbered}
          disabled={loading}
          accessibilityLabel={`Add Group ${nextNumberedN}`}
        />
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
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
    marginRight: spacing.sm,
  },
  groupName: {
    fontFamily: fontFamilies.textMedium,
    color: colors.text,
  },
  groupChildCount: {
    color: colors.textSecondary,
  },
  groupActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkmark: {
    ...typeRoles.textLetter,
    marginRight: spacing.xs,
  },
  actionIcon: {
    margin: 0,
  },
  removeRow: {
    marginBottom: spacing.sm,
  },
  divider: {
    marginVertical: spacing.sm,
  },
});
