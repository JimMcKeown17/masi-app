import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import ListGroup from '../../components/common/ListGroup';
import { fontFamilies, typeRoles } from '../../constants/typography';
import { useToast } from '../../context/ToastContext';
import { useSignedInEA } from '../../context/SignedInEAContext';
import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing } from '../../constants/colors';

import { useLookupsContext } from '../../context/LookupsContext';
import { useSessionHistoryStatus } from '../../services/sessionHistoryStatus';
import { describeHistoryState } from '../../utils/syncStatusPresenter';

import { toLocalDateString } from '../../utils/localDate';

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
  const onScroll = useHeaderHairline();
  const paddingBottom = useScrollBottomPadding();
  const toast = useToast();
  const { repositories, services } = useSignedInEA();
  const { sessions: sessionsRepository } = repositories;

  const { user } = useAuth();
  const { jobTitles } = useLookupsContext();
  const { running, pageVersion, runVersion } = useSessionHistoryStatus();
  const [pullState, setPullState] = useState(null);
  const history = describeHistoryState({ running, pullState });
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

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
          setPullState(null);
          setLoading(false);
          return;
        }

        try {
          setLoading(true);
          const cached = await sessionsRepository.getSessions({
            userId: user.id,
            recordedByUserId: user.id,
            sinceDate: toLocalDateString(new Date(Date.now() - THIRTY_DAYS_MS)),
            order: 'desc',
          });
          const persistedHistory = await services.sessionHistory.store.getPullState(user.id);
          if (active) {
            setSessions(cached);
            setPullState(persistedHistory);
          }
        } catch (error) {
          console.error('Error loading sessions:', error);
          if (active) {
            toast.show({ message: 'Failed to load sessions', tone: 'error', duration: 3000 });
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
    }, [user?.id, pageVersion, runVersion, toast])
  );

  const renderItem = ({ item, index }) => {
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
      <View style={styles.row}>
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
        {index < sessions.length - 1 && <View testID="history-row-divider" pointerEvents="none" style={styles.rowDivider} />}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        {history.detail && <Text variant="bodySmall" style={styles.historyDetail}>{history.detail}</Text>}
        <Text variant="bodySmall" style={styles.historyDetail}>Showing sessions you recorded in the last 30 days.</Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text variant="bodyMedium" style={styles.emptyText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {history.detail && <Text variant="bodySmall" style={styles.historyDetail}>{history.detail}</Text>}
      <Text variant="bodySmall" style={styles.historyDetail}>Showing sessions you recorded in the last 30 days.</Text>
      <ListGroup style={styles.group}>
        <FlatList onScroll={onScroll} scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={running} onRefresh={() => services.sessionHistory.start({ userId: user?.id, force: true })} />}
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={{ paddingBottom }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text variant="bodyMedium" style={styles.emptyText}>
                No sessions yet. Record your first session!
              </Text>
            </View>
          }
        />
      </ListGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  historyDetail: {
    color: colors.textSecondary,
    margin: spacing.sm,
  },
  group: { margin: spacing.md, flexShrink: 1 },
  list: { flexGrow: 0 },
  row: { padding: spacing.md },
  rowDivider: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: 0, height: 1, backgroundColor: colors.border },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardDate: {
    color: colors.text,
    ...typeRoles.textData,
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
    fontFamily: fontFamilies.textSemi,
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
    fontFamily: fontFamilies.textMedium,
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
