import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, Card, ActivityIndicator, Snackbar } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';
import { sessionsRepository } from '../../db/repositories/sessionsRepository';
import { useLookupsContext } from '../../context/LookupsContext';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function formatSessionDate(dateString) {
  // dateString is "YYYY-MM-DD" — parse as local date to avoid timezone shift
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function SessionHistoryScreen() {
  const { user } = useAuth();
  const { jobTitles } = useLookupsContext();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  const showSnackbar = (message) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const filterAndSort = useCallback((allSessions) => {
    const now = Date.now();
    const cutoff = now - THIRTY_DAYS_MS;

    return allSessions
      .filter((s) => {
        if (s.user_id !== user?.id) return false;
        const [y, m, d] = s.session_date.split('-').map(Number);
        const sessionTime = new Date(y, m - 1, d).getTime();
        return sessionTime >= cutoff;
      })
      .sort((a, b) => {
        if (a.session_date !== b.session_date) return a.session_date > b.session_date ? -1 : 1;
        return new Date(b.created_at) - new Date(a.created_at);
      });
  }, [user?.id]);

  /**
   * Load recent session history from local SQLite. Network sync runs through
   * the outbox engine; this screen only renders the local cache.
   */
  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadSessions = async () => {
        if (!user?.id) {
          setSessions([]);
          setLoading(false);
          return;
        }

        try {
          setLoading(true);
          const cached = await sessionsRepository.getSessions({ userId: user.id });
          if (active) {
            setSessions(filterAndSort(cached));
          }
        } catch (error) {
          console.error('Error loading sessions:', error);
          if (active) {
            showSnackbar('Failed to load sessions');
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      };

      loadSessions();
      return () => {
        active = false;
      };
    }, [filterAndSort, user?.id])
  );

  const renderItem = ({ item }) => {
    const lettersDisplay =
      item.activities?.letters_focused?.length > 0
        ? item.activities.letters_focused.map((l) => l.toUpperCase()).join(', ')
        : 'None';

    const sessionLabel =
      item.session_type_lookup?.name ||
      item.session_type ||
      jobTitles.find(j => j.id === item.session_type_id)?.name ||
      'Session';

    return (
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <Text variant="titleSmall" style={styles.cardDate}>
              {formatSessionDate(item.session_date)}
            </Text>
            <View style={[styles.syncBadge, item.synced ? styles.syncBadgeSynced : styles.syncBadgePending]}>
              <Text variant="bodySmall" style={[styles.syncBadgeText, item.synced ? styles.syncBadgeTextSynced : styles.syncBadgeTextPending]}>
                {item.synced ? 'Synced' : 'Pending sync'}
              </Text>
            </View>
          </View>

          <Text variant="bodyMedium" style={styles.sessionType}>
            {sessionLabel}
          </Text>

          <View style={styles.detailRow}>
            <Text variant="bodySmall" style={styles.detailLabel}>Children:</Text>
            <Text variant="bodySmall" style={styles.detailValue}>
              {item.children_ids?.length || 0}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text variant="bodySmall" style={styles.detailLabel}>Letters:</Text>
            <Text variant="bodySmall" style={styles.detailValue}>
              {lettersDisplay}
            </Text>
          </View>

          {item.activities?.session_reading_level && (
            <View style={styles.detailRow}>
              <Text variant="bodySmall" style={styles.detailLabel}>Reading Level:</Text>
              <Text variant="bodySmall" style={styles.detailValue}>
                {item.activities.session_reading_level}
              </Text>
            </View>
          )}
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
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text variant="bodyMedium" style={styles.emptyText}>
              No sessions yet. Record your first session!
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
  syncBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 12,
  },
  syncBadgeSynced: {
    backgroundColor: colors.successBg,
  },
  syncBadgePending: {
    backgroundColor: colors.border,
  },
  syncBadgeText: {
    fontWeight: '600',
  },
  syncBadgeTextSynced: {
    color: colors.success,
  },
  syncBadgeTextPending: {
    color: colors.textSecondary,
  },
  sessionType: {
    color: colors.primary,
    marginBottom: spacing.sm,
    fontWeight: '500',
  },
  detailRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  detailLabel: {
    color: colors.textSecondary,
    minWidth: 80,
  },
  detailValue: {
    color: colors.text,
    flex: 1,
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
