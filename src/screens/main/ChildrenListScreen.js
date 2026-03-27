import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import {
  Text,
  Searchbar,
  Button,
  Card,
  Banner,
  List,
} from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing } from '../../constants/colors';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { useOffline } from '../../context/OfflineContext';
import { storage } from '../../utils/storage';
import { getChildrenTabStats } from '../../utils/dashboardStats';
import StatBar from '../../components/dashboard/StatBar';

export default function ChildrenListScreen({ navigation }) {
  const { children, groups, childrenGroups, loading, loadChildren } = useChildren();
  const { classes, schools, loading: classesLoading, loadClasses, getChildrenInClass } = useClasses();
  const { refreshSyncStatus } = useOffline();

  const [searchTerm, setSearchTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [tabStats, setTabStats] = useState(null);

  useFocusEffect(
    useCallback(() => {
      const loadStats = async () => {
        const assessments = await storage.getAssessments();
        setTabStats(getChildrenTabStats(children, classes, assessments));
      };
      loadStats();
    }, [children, classes])
  );

  // Count unsynced items across classes and children
  const unsyncedClassesCount = classes.filter(c => c.synced === false).length;
  const unsyncedChildrenCount = children.filter(c => c.synced === false).length;
  const totalUnsyncedCount = unsyncedClassesCount + unsyncedChildrenCount;

  // Filter classes by search term (searches class name, school name, teacher)
  const filteredClasses = useMemo(() => {
    if (!searchTerm) return classes;
    const lower = searchTerm.toLowerCase();
    return classes.filter(cls => {
      const school = schools.find(s => s.id === cls.school_id);
      return (
        cls.name.toLowerCase().includes(lower) ||
        (school?.name || '').toLowerCase().includes(lower) ||
        cls.teacher.toLowerCase().includes(lower)
      );
    });
  }, [classes, schools, searchTerm]);

  /**
   * Count unique groups that have at least one child in this class.
   */
  const getGroupCountForClass = (classId) => {
    const classChildIds = new Set(
      getChildrenInClass(classId).map(c => c.id)
    );
    const groupIdsInClass = new Set();
    childrenGroups.forEach(cg => {
      if (classChildIds.has(cg.child_id)) {
        groupIdsInClass.add(cg.group_id);
      }
    });
    return groupIdsInClass.size;
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadChildren();
    await loadClasses();
    await refreshSyncStatus();
    setRefreshing(false);
  };

  const hasClasses = classes.length > 0;

  // Children with no class_id (orphaned from pre-load or class deletion)
  const unassignedChildren = useMemo(() => {
    return children.filter(c => !c.class_id);
  }, [children]);

  const renderClassCard = ({ item: cls }) => {
    const school = schools.find(s => s.id === cls.school_id);
    const childCount = getChildrenInClass(cls.id).length;
    const groupCount = getGroupCountForClass(cls.id);

    return (
      <Card
        style={styles.classCard}
        onPress={() => navigation.navigate('ClassDetail', { classId: cls.id })}
      >
        <Card.Content>
          <View style={styles.cardHeader}>
            <Text variant="titleMedium">{cls.name}</Text>
            {!cls.synced && (
              <Text variant="labelSmall" style={styles.unsyncedBadge}>
                Unsynced
              </Text>
            )}
          </View>
          <Text variant="bodyMedium" style={styles.cardDetail}>
            {school?.name || 'Unknown school'}
          </Text>
          <Text variant="bodySmall" style={styles.cardDetail}>
            {cls.grade} • {cls.teacher} • {cls.home_language}
          </Text>
          <Text variant="bodySmall" style={styles.childCount}>
            {childCount} {childCount === 1 ? 'child' : 'children'}
            {groupCount > 0 && ` · ${groupCount} ${groupCount === 1 ? 'group' : 'groups'}`}
          </Text>
        </Card.Content>
      </Card>
    );
  };

  const renderFooter = () => {
    return (
      <View>
        {/* Unassigned children section */}
        {unassignedChildren.length > 0 && (
          <View style={styles.unassignedSection}>
            <Text variant="titleSmall" style={styles.unassignedTitle}>
              Unassigned Children ({unassignedChildren.length})
            </Text>
            <Text variant="bodySmall" style={styles.unassignedHint}>
              These children are not in a class yet. Tap to edit and assign them.
            </Text>
            {unassignedChildren.map(child => (
              <List.Item
                key={child.id}
                title={`${child.first_name} ${child.last_name}`}
                description={`${child.age ? `Age ${child.age}` : ''}${child.age && child.gender ? ' • ' : ''}${child.gender || ''}`}
                left={props => <List.Icon {...props} icon="account-alert-outline" color={colors.textSecondary} />}
                onPress={() => navigation.navigate('EditChild', { childId: child.id })}
                style={styles.unassignedItem}
              />
            ))}
          </View>
        )}

        {/* Add class link */}
        {hasClasses && (
          <TouchableOpacity
            style={styles.addClassLink}
            onPress={() => navigation.navigate('CreateClass')}
          >
            <Text style={styles.addClassLinkText}>+ Add another class</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderEmptyState = () => {
    // Distinguish "no classes exist" from "search returned nothing"
    if (searchTerm && classes.length > 0) {
      return (
        <View style={styles.emptyState}>
          <Text variant="bodyMedium" style={styles.emptyText}>
            No matching classes for "{searchTerm}"
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>📚</Text>
        <Text variant="headlineSmall" style={styles.emptyTitle}>
          No classes yet
        </Text>
        <Text variant="bodyMedium" style={styles.emptyText}>
          Create your first class to start adding children
        </Text>
        <Button
          mode="contained"
          onPress={() => navigation.navigate('CreateClass')}
          style={styles.emptyCreateButton}
          icon="plus"
        >
          Create Class
        </Button>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Tab Stats */}
      {tabStats && (
        <View style={styles.statBarWrapper}>
          <StatBar items={[
            { label: 'Children', value: tabStats.childrenCount },
            { label: 'Classes', value: tabStats.classCount },
            { label: 'Unassessed', value: tabStats.unassessedCount, color: tabStats.unassessedCount > 0 ? colors.emphasis : colors.primary },
          ]} />
        </View>
      )}

      {/* Search bar */}
      <Searchbar
        placeholder="Search classes..."
        value={searchTerm}
        onChangeText={setSearchTerm}
        style={styles.searchBar}
      />

      {/* Sync status banner */}
      {totalUnsyncedCount > 0 && (
        <Banner
          visible={true}
          icon="cloud-upload-outline"
          actions={[
            {
              label: 'Sync Now',
              onPress: refreshSyncStatus,
            },
          ]}
          style={styles.banner}
        >
          {totalUnsyncedCount} {totalUnsyncedCount === 1 ? 'item' : 'items'} waiting to sync
        </Banner>
      )}

      {/* Classes list */}
      <FlatList
        data={filteredClasses}
        keyExtractor={(item) => item.id}
        renderItem={renderClassCard}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={renderEmptyState}
        ListFooterComponent={renderFooter}
        contentContainerStyle={
          filteredClasses.length === 0 ? styles.emptyContainer : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  statBarWrapper: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  searchBar: {
    margin: spacing.md,
    elevation: 0,
    backgroundColor: colors.surface,
  },
  banner: {
    backgroundColor: colors.accent,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  classCard: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderRadius: 8,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardDetail: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  childCount: {
    color: colors.primary,
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  unsyncedBadge: {
    color: colors.accent,
    backgroundColor: '#FFF9CC',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  unassignedSection: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  unassignedTitle: {
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  unassignedHint: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  unassignedItem: {
    backgroundColor: colors.surface,
    marginVertical: spacing.xs,
    borderRadius: 8,
    elevation: 1,
  },
  addClassLink: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  addClassLinkText: {
    color: colors.primary,
    fontSize: 14,
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
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    marginBottom: spacing.sm,
    color: colors.textSecondary,
  },
  emptyText: {
    marginBottom: spacing.lg,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyCreateButton: {
    paddingHorizontal: spacing.lg,
  },
});
