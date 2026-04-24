import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import {
  Text,
  Card,
  FAB,
  List,
  IconButton,
} from 'react-native-paper';
import { colors, spacing, borderRadius } from '../../constants/colors';
import { useClasses } from '../../context/ClassesContext';
import { useChildren } from '../../context/ChildrenContext';
import GroupPickerBottomSheet, { getGroupColor, compareGroups } from '../../components/children/GroupPickerBottomSheet';

export default function ClassDetailScreen({ route, navigation }) {
  const { classId } = route.params;
  const { classes, schools, getChildrenInClass } = useClasses();
  const { groups, childrenGroups } = useChildren();

  const classItem = classes.find(c => c.id === classId);
  const childrenInClass = getChildrenInClass(classId);
  const school = schools.find(s => s.id === classItem?.school_id);

  // Bottom sheet state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedChild, setSelectedChild] = useState(null);

  // Force re-render when groups change (after assignment)
  const [, setRefreshKey] = useState(0);
  const handleGroupChanged = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  /**
   * Get the current group for a child (for this user's groups only).
   * Returns { group, groupIndex } or { group: null, groupIndex: -1 }
   */
  const getChildGroup = (childId) => {
    const groupIds = new Set(groups.map(g => g.id));
    const membership = childrenGroups.find(
      cg => cg.child_id === childId && groupIds.has(cg.group_id)
    );
    if (!membership) return { group: null, groupIndex: -1 };

    const sortedGroups = [...groups].sort(compareGroups);
    const groupIndex = sortedGroups.findIndex(g => g.id === membership.group_id);
    return { group: sortedGroups[groupIndex], groupIndex };
  };

  const openGroupPicker = (child) => {
    setSelectedChild(child);
    setPickerVisible(true);
  };

  if (!classItem) {
    return (
      <View style={styles.container}>
        <Text variant="bodyMedium" style={styles.emptyText}>Class not found.</Text>
      </View>
    );
  }

  const renderChildItem = ({ item }) => {
    const { group, groupIndex } = getChildGroup(item.id);
    const colorScheme = group ? getGroupColor(groupIndex) : null;

    return (
      <TouchableOpacity
        style={styles.childCard}
        onPress={() => navigation.navigate('EditChild', { childId: item.id })}
        activeOpacity={0.7}
      >
        {/* Left: name + details */}
        <View style={styles.childInfo}>
          <Text variant="bodyLarge" style={styles.childName}>
            {item.first_name} {item.last_name}
          </Text>
          <View style={styles.detailRow}>
            {item.age ? (
              <Text variant="bodySmall" style={styles.childDetail}>
                Age {item.age}
              </Text>
            ) : null}
            {group ? (
              <View style={styles.groupRow}>
                {item.age ? <Text variant="bodySmall" style={styles.childDetail}>  ·  </Text> : null}
                <Text variant="bodySmall" style={styles.groupLabel}>Group:</Text>
                <TouchableOpacity
                  style={[styles.groupChip, { backgroundColor: colorScheme.bg }]}
                  onPress={() => openGroupPicker(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.groupChipText, { color: colorScheme.text }]}>
                    {group.name} ▾
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.groupRow}>
                {item.age ? <Text variant="bodySmall" style={styles.childDetail}>  ·  </Text> : null}
                <TouchableOpacity
                  style={styles.assignChip}
                  onPress={() => openGroupPicker(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.assignChipText}>+ Group</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          {/* Unsynced indicator inline */}
          {!item.synced && (
            <View style={styles.syncRow}>
              <List.Icon
                icon="cloud-upload-outline"
                color={colors.accent}
                style={styles.syncIcon}
              />
              <Text variant="labelSmall" style={styles.syncText}>Syncing…</Text>
            </View>
          )}
        </View>

        {/* Right: action icons — large and tappable */}
        <View style={styles.actionIcons}>
          <IconButton
            icon="alpha-a-box-outline"
            size={30}
            iconColor={colors.primary}
            style={styles.actionIcon}
            onPress={() => navigation.navigate('LetterTracker', { child: item, classItem })}
          />
          <IconButton
            icon="chart-box-outline"
            size={30}
            iconColor={colors.primary}
            style={styles.actionIcon}
            onPress={() => navigation.navigate('ChildAssessmentSummary', {
              child: item,
              classItem,
            })}
          />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Class info header */}
      <Card style={styles.headerCard}>
        <Card.Content>
          <View style={styles.headerRow}>
            <View style={styles.headerInfo}>
              <Text variant="titleLarge">{classItem.name}</Text>
              <Text variant="bodyMedium" style={styles.detailText}>
                {school?.name || 'Unknown school'}
              </Text>
              <Text variant="bodyMedium" style={styles.detailText}>
                {classItem.grade} • {classItem.teacher}
              </Text>
              <Text variant="bodySmall" style={styles.detailText}>
                Language: {classItem.home_language}
              </Text>
            </View>
            <IconButton
              icon="pencil"
              mode="contained-tonal"
              onPress={() => navigation.navigate('EditClass', { classId })}
            />
          </View>
        </Card.Content>
      </Card>

      {/* Children list */}
      <Text variant="titleMedium" style={styles.sectionTitle}>
        Children ({childrenInClass.length})
      </Text>

      <FlatList
        data={childrenInClass}
        keyExtractor={(item) => item.id}
        renderItem={renderChildItem}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text variant="bodyMedium" style={styles.emptyText}>
              No children in this class yet.
            </Text>
            <Text variant="bodySmall" style={styles.emptyText}>
              Tap the + button to add a child.
            </Text>
          </View>
        }
        contentContainerStyle={
          childrenInClass.length === 0 ? styles.emptyContainer : null
        }
      />

      {/* FAB to add child */}
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => navigation.navigate('AddChild', { classId })}
      />

      {/* Group Picker Bottom Sheet */}
      {selectedChild && (
        <GroupPickerBottomSheet
          visible={pickerVisible}
          onDismiss={() => {
            setPickerVisible(false);
            setSelectedChild(null);
          }}
          childId={selectedChild.id}
          childName={`${selectedChild.first_name} ${selectedChild.last_name}`}
          currentGroupId={getChildGroup(selectedChild.id).group?.id || null}
          onGroupChanged={handleGroupChanged}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerCard: {
    margin: spacing.md,
    backgroundColor: colors.surface,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerInfo: {
    flex: 1,
  },
  detailText: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  childCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  childInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  childName: {
    fontWeight: '700',
    fontSize: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  childDetail: {
    color: colors.textSecondary,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginRight: 4,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  syncIcon: {
    margin: 0,
    width: 18,
    height: 18,
  },
  syncText: {
    color: colors.accent,
    fontSize: 11,
  },
  actionIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionIcon: {
    margin: 0,
  },
  groupChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  groupChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  assignChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#F9A825',
    backgroundColor: '#FFF8E1',
  },
  assignChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F57F17',
  },
  emptyContainer: {
    flex: 1,
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
  fab: {
    position: 'absolute',
    margin: spacing.lg,
    right: 0,
    bottom: 0,
    backgroundColor: colors.primary,
  },
});
