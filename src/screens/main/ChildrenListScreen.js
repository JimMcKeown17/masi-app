import React, { useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import {
  Text,
  Searchbar,
  FAB,
  Button,
  List,
  Banner,
} from 'react-native-paper';
import { colors, spacing } from '../../constants/colors';
import { useChildren } from '../../context/ChildrenContext';
import { useOffline } from '../../context/OfflineContext';

export default function ChildrenListScreen({ navigation }) {
  const { children, loading, loadChildren } = useChildren();
  const { syncStatus, refreshSyncStatus } = useOffline();

  const [searchTerm, setSearchTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Filter children by search term
  const filteredChildren = children.filter(child =>
    `${child.first_name} ${child.last_name}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadChildren();
    await refreshSyncStatus();
    setRefreshing(false);
  };

  const unsyncedCount = children.filter(c => c.synced === false).length;

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <Searchbar
        placeholder="Search children..."
        value={searchTerm}
        onChangeText={setSearchTerm}
        style={styles.searchBar}
      />

      {/* Sync status banner */}
      {unsyncedCount > 0 && (
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
          {unsyncedCount} {unsyncedCount === 1 ? 'child' : 'children'} waiting to sync
        </Banner>
      )}

      {/* Children list */}
      <FlatList
        data={filteredChildren}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <List.Item
            title={`${item.first_name} ${item.last_name}`}
            description={`${item.class || 'No class'} • ${item.teacher || 'No teacher'} • Age ${item.age || 'N/A'}`}
            left={props => <List.Icon {...props} icon="account" />}
            right={props =>
              !item.synced && (
                <List.Icon
                  {...props}
                  icon="cloud-upload-outline"
                  color={colors.accent}
                />
              )
            }
            onPress={() => navigation.navigate('EditChild', { childId: item.id })}
            style={styles.listItem}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text variant="headlineSmall" style={styles.emptyTitle}>
              No children yet
            </Text>
            <Text variant="bodyMedium" style={styles.emptyText}>
              Add your first child to get started.
            </Text>
            <Button
              mode="contained"
              onPress={() => navigation.navigate('AddChild')}
              style={styles.emptyButton}
            >
              Add First Child
            </Button>
          </View>
        }
        contentContainerStyle={
          filteredChildren.length === 0 ? styles.emptyContainer : null
        }
      />

      {/* Navigate to Groups button */}
      {children.length > 0 && (
        <Button
          mode="outlined"
          onPress={() => navigation.navigate('GroupManagement')}
          style={styles.groupButton}
          icon="folder-multiple"
        >
          Manage Groups
        </Button>
      )}

      {/* FAB for adding child */}
      {children.length > 0 && (
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={() => navigation.navigate('AddChild')}
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
  listItem: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderRadius: 8,
    elevation: 1,
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
  emptyButton: {
    marginTop: spacing.md,
  },
  groupButton: {
    margin: spacing.md,
    marginTop: spacing.sm,
  },
  fab: {
    position: 'absolute',
    margin: spacing.lg,
    right: 0,
    bottom: 0,
    backgroundColor: colors.primary,
  },
});
