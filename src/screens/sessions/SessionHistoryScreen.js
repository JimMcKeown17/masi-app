import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, Card, ActivityIndicator, Snackbar } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { useOffline } from '../../context/OfflineContext';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';
import { storage, STORAGE_KEYS } from '../../utils/storage';
import { supabase } from '../../services/supabaseClient';

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
  const { isOnline } = useOffline();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  const showSnackbar = (message) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const filterAndSort = (allSessions) => {
    const now = Date.now();
    const cutoff = now - THIRTY_DAYS_MS;

    return allSessions
      .filter((s) => {
        if (s.user_id !== user.id) return false;
        const [y, m, d] = s.session_date.split('-').map(Number);
        const sessionTime = new Date(y, m - 1, d).getTime();
        return sessionTime >= cutoff;
      })
      .sort((a, b) => {
        if (a.session_date !== b.session_date) return a.session_date > b.session_date ? -1 : 1;
        return new Date(b.created_at) - new Date(a.created_at);
      });
  };

  /**
   * Load sessions: cache-first, then fetch from Supabase when online.
   * Merges server data with unsynced local records to prevent data loss.
   */
  const loadSessions = async () => {
    try {
      // 1. Show cached data immediately
      const cached = await storage.getSessions();
      setSessions(filterAndSort(cached));

      // 2. If online, fetch from server and merge
      if (isOnline && user?.id) {
        const { data, error } = await supabase
          .from('sessions')
          .select('*')
          .eq('user_id', user.id)
          .order('session_date', { ascending: false });

        if (error) {
          console.error('Error fetching sessions from server:', error);
        } else if (data) {
          const serverSessions = data.map(s => ({ ...s, synced: true }));
          const serverIds = new Set(serverSessions.map(s => s.id));

          // Preserve local unsynced records not yet on server
          const localUnsynced = cached.filter(s => s.synced === false && !serverIds.has(s.id));
          const merged = [...serverSessions, ...localUnsynced];

          await storage.setItem(STORAGE_KEYS.SESSIONS, merged);
          setSessions(filterAndSort(merged));
        }
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
      showSnackbar('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }) => {
    const lettersDisplay =
      item.activities?.letters_focused?.length > 0
        ? item.activities.letters_focused.map((l) => l.toUpperCase()).join(', ')
        : 'None';

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
            {item.session_type}
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
    backgroundColor: '#D1FAE5',
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
