import React, { useState, useMemo } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import {
  Text,
  Searchbar,
  Button,
  Card,
  Banner,
} from 'react-native-paper';
import { colors, spacing } from '../../constants/colors';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { useOffline } from '../../context/OfflineContext';

export default function ChildrenListScreen({ navigation }) {
  const { children, loading, loadChildren } = useChildren();
  const { classes, schools, loading: classesLoading, loadClasses, getChildrenInClass } = useClasses();
  const { refreshSyncStatus } = useOffline();

  const [searchTerm, setSearchTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);

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

  const onRefresh = async () => {
    setRefreshing(true);
    await loadChildren();
    await loadClasses();
    await refreshSyncStatus();
    setRefreshing(false);
  };

  const renderClassCard = ({ item: cls }) => {
    const school = schools.find(s => s.id === cls.school_id);
    const childCount = getChildrenInClass(cls.id).length;

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
          </Text>
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
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

      {/* Create Class button */}
      <Button
        mode="contained"
        onPress={() => navigation.navigate('CreateClass')}
        style={styles.createButton}
        icon="plus"
      >
        Create Class
      </Button>

      {/* Classes list */}
      <FlatList
        data={filteredClasses}
        keyExtractor={(item) => item.id}
        renderItem={renderClassCard}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text variant="headlineSmall" style={styles.emptyTitle}>
              No classes yet
            </Text>
            <Text variant="bodyMedium" style={styles.emptyText}>
              Create your first class to get started.
            </Text>
          </View>
        }
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
  createButton: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
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
  emptyContainer: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
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
  groupButton: {
    margin: spacing.md,
    marginTop: spacing.sm,
  },
});
