import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, Card, ActivityIndicator, Snackbar, IconButton } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { useOffline } from '../../context/OfflineContext';
import { useChildren } from '../../context/ChildrenContext';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';
import { storage, STORAGE_KEYS } from '../../utils/storage';
import { supabase } from '../../services/supabaseClient';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function formatDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function AssessmentHistoryScreen({ navigation }) {
  const { user } = useAuth();
  const { isOnline } = useOffline();
  const { children } = useChildren();
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  useEffect(() => {
    loadAssessments();
  }, []);

  const filterAndSort = (all) => {
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    return all
      .filter((a) => {
        if (a.user_id !== user.id) return false;
        const [y, m, d] = a.date_assessed.split('-').map(Number);
        return new Date(y, m - 1, d).getTime() >= cutoff;
      })
      .sort((a, b) => {
        if (a.date_assessed !== b.date_assessed) return a.date_assessed > b.date_assessed ? -1 : 1;
        return new Date(b.created_at) - new Date(a.created_at);
      });
  };

  const loadAssessments = async () => {
    try {
      const cached = await storage.getAssessments();
      setAssessments(filterAndSort(cached));

      if (isOnline && user?.id) {
        const { data, error } = await supabase
          .from('assessments')
          .select('*')
          .eq('user_id', user.id)
          .order('date_assessed', { ascending: false });

        if (error) {
          console.error('Error fetching assessments from server:', error);
        } else if (data) {
          const serverRecords = data.map((a) => ({ ...a, synced: true }));
          const serverIds = new Set(serverRecords.map((a) => a.id));
          const localToKeep = cached.filter((a) => !serverIds.has(a.id));
          const merged = [...serverRecords, ...localToKeep];

          await storage.setItem(STORAGE_KEYS.ASSESSMENTS, merged);
          setAssessments(filterAndSort(merged));
        }
      }
    } catch (error) {
      console.error('Error loading assessments:', error);
      setSnackbarMessage('Failed to load assessments');
      setSnackbarVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const childNameMap = React.useMemo(() => {
    const map = {};
    for (const c of children) {
      map[c.id] = `${c.first_name} ${c.last_name}`;
    }
    return map;
  }, [children]);

  const renderItem = ({ item }) => {
    const accuracyColor = item.accuracy >= 75
      ? colors.success
      : item.accuracy >= 50
        ? colors.primary
        : colors.emphasis;
    const childName = childNameMap[item.child_id] || 'Unknown child';

    return (
      <Card
        style={styles.card}
        onPress={() => navigation.navigate('AssessmentDetail', { assessment: item, childName })}
      >
        <Card.Content>
          <View style={styles.cardHeader}>
            <Text variant="titleSmall" style={styles.cardDate}>
              {formatDate(item.date_assessed)}
            </Text>
            <View style={styles.cardHeaderRight}>
              <View style={[styles.syncBadge, item.synced ? styles.syncBadgeSynced : styles.syncBadgePending]}>
                <Text variant="bodySmall" style={[styles.syncBadgeText, item.synced ? styles.syncTextSynced : styles.syncTextPending]}>
                  {item.synced ? 'Synced' : 'Pending sync'}
                </Text>
              </View>
              <Text style={styles.chevron}>{'\u203A'}</Text>
            </View>
          </View>

          <Text variant="bodyMedium" style={styles.childName}>
            {childName}
          </Text>

          <Text variant="bodyMedium" style={styles.language}>
            {item.letter_language} - Attempt #{item.attempt_number}
          </Text>

          <View style={styles.statsRow}>
            <Text variant="bodySmall" style={styles.stat}>
              Attempted: {item.letters_attempted}
            </Text>
            <Text variant="bodySmall" style={styles.stat}>
              Correct: {item.correct_responses}
            </Text>
            <Text variant="bodySmall" style={[styles.stat, { color: accuracyColor, fontWeight: '700' }]}>
              {item.accuracy}%
            </Text>
          </View>
        </Card.Content>
      </Card>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text variant="bodyMedium" style={styles.emptyText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={assessments}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text variant="bodyMedium" style={styles.emptyText}>
              No assessments yet. Run your first assessment!
            </Text>
          </View>
        }
      />

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
  listContent: {
    padding: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
    borderRadius: borderRadius.md,
    ...shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardDate: {
    color: colors.text,
    fontWeight: '600',
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chevron: {
    fontSize: 22,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  syncBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 12,
  },
  syncBadgeSynced: {
    backgroundColor: '#D1FAE5',
  },
  syncBadgePending: {
    backgroundColor: colors.border,
  },
  syncBadgeText: {
    fontWeight: '600',
  },
  syncTextSynced: {
    color: colors.success,
  },
  syncTextPending: {
    color: colors.textSecondary,
  },
  childName: {
    color: colors.text,
    fontWeight: '600',
    marginBottom: 2,
  },
  language: {
    color: colors.primary,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  stat: {
    color: colors.textSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: spacing.xxl,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: spacing.xxl,
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
