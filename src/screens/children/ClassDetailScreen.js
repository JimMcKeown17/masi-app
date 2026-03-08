import React from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import {
  Text,
  Card,
  FAB,
  List,
  IconButton,
  Button,
} from 'react-native-paper';
import { colors, spacing } from '../../constants/colors';
import { useClasses } from '../../context/ClassesContext';

export default function ClassDetailScreen({ route, navigation }) {
  const { classId } = route.params;
  const { classes, schools, getChildrenInClass } = useClasses();

  const classItem = classes.find(c => c.id === classId);
  const childrenInClass = getChildrenInClass(classId);
  const school = schools.find(s => s.id === classItem?.school_id);

  if (!classItem) {
    return (
      <View style={styles.container}>
        <Text variant="bodyMedium" style={styles.emptyText}>Class not found.</Text>
      </View>
    );
  }

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
        renderItem={({ item }) => (
          <List.Item
            title={`${item.first_name} ${item.last_name}`}
            description={`Age ${item.age || 'N/A'}${item.gender ? ` • ${item.gender}` : ''}`}
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

      {/* Manage Groups button */}
      {childrenInClass.length > 0 && (
        <Button
          mode="outlined"
          onPress={() => navigation.navigate('GroupManagement')}
          style={styles.groupButton}
          icon="folder-multiple"
        >
          Manage Groups
        </Button>
      )}

      {/* FAB to add child */}
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => navigation.navigate('AddChild', { classId })}
      />
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
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
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
