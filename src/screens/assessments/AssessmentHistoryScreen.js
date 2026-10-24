import { useAssessmentHistoryStatus } from '../../services/assessmentHistoryStatus';
import { describeCombinedHistoryState } from '../../utils/syncStatusPresenter';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import { batteryFor } from '../../assessment-questions';
import StatusBadge from '../../components/common/StatusBadge';
import ListGroup from '../../components/common/ListGroup';
import { fontFamilies, typeRoles } from '../../constants/typography';
import { useToast } from '../../context/ToastContext';
import { isStaleActorError } from '../../session/staleActor';
import { useSignedInEA } from '../../context/SignedInEAContext';
import React, { useState, useCallback } from 'react';
import { View, Pressable, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useAssessableChildren } from '../../hooks/useAssessableChildren';
import { LANGUAGE_LABELS, STANDALONE_TESTS } from '../../utils/assessmentRegistry';
import { colors, spacing } from '../../constants/colors';
import { toLocalDateString } from '../../utils/localDate';


const RUN_STATUS = {
  completed: { label: 'Finalized', tone: 'success' },
  in_progress: { label: 'Open', tone: 'warning' },
  abandoned: { label: 'Abandoned', tone: 'neutral' },
};

function formatDate(dateString, short = false) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(short ? 'en-GB' : 'en-US', short ? { day: 'numeric', month: 'short' } : {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function AssessmentHistoryScreen({ navigation }) {
  const onScroll = useHeaderHairline();
  // The list scrolls inside the card, so the card (not the list) clears the bottom inset.
  const cardBottom = useScrollBottomPadding(spacing.md);
  const toast = useToast();
  const { repositories, services } = useSignedInEA();
  const { assessments: assessmentsRepository, batteryRuns, children: childrenRepository } = repositories;
  const { running, pageVersion, runVersion } = useAssessmentHistoryStatus();
  const [pullStates, setPullStates] = useState([null, null]);
  const [referenceNames, setReferenceNames] = useState({});
  const history = describeCombinedHistoryState({ running, pullStates });

  const { user } = useAuth();
  // Class-roster names are available directly. History-only/removed children
  // still resolve through getChildNamesByIds below.
  const { all: assessableChildren } = useAssessableChildren();
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void services.assessmentHistory.start({ force: true })
      .catch((error) => { if (!isStaleActorError(error)) console.error('Assessment history failed:', error); })
      .finally(() => setRefreshing(false));
  }, [services]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadAssessments = async () => {
        if (!user?.id) {
          setAssessments([]);
          setLoading(false);
          return;
        }

        try {
          setLoading(true);
          const [results, runs, states] = await Promise.all([
            assessmentsRepository.getQuestionResults({
              userId: user.id, recordedByUserId: user.id, includeSkipped: true, order: 'desc',
            }),
            batteryRuns.getRunsForUser(user.id),
            services.assessmentHistory.store.getPullStates(user.id),
          ]);
          const cached = [
            ...results.filter(result => result.battery_run_id == null).map(result => ({ ...result, kind: 'result' })),
            ...runs.map(run => ({ ...run, kind: 'run', assessment_date: toLocalDateString(run.started_at) })),
          ].sort((a, b) => b.assessment_date.localeCompare(a.assessment_date)
            || (b.created_at || '').localeCompare(a.created_at || ''));
          const rosterIds = new Set(assessableChildren.map(child => child.id));
          const missingIds = [...new Set(cached.map(row => row.child_id).filter(id => !rosterIds.has(id)))];
          const names = missingIds.length ? await childrenRepository.getChildNamesByIds(missingIds) : {};
          if (active) {
            setReferenceNames(names);
            setPullStates([states.batteryRuns, states.assessments]);
            setAssessments(cached);
          }
        } catch (error) {
          console.error('Error loading assessments:', error);
          if (active) {
            toast.show({ message: 'Failed to load assessments', tone: 'error', duration: 3000 });
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      };

      loadAssessments();
      return () => {
        active = false;
      };
    }, [user?.id, toast, assessmentsRepository, batteryRuns, childrenRepository, services, assessableChildren, pageVersion, runVersion])
  );

  const childInfoMap = React.useMemo(() => {
    const map = { ...referenceNames };
    for (const c of assessableChildren) {
      map[c.id] = {
        name: `${c.first_name} ${c.last_name}`,
        hidden: !!c.hidden_at,
      };
    }
    return map;
  }, [assessableChildren, referenceNames]);

  const renderItem = ({ item, index }) => {
    const isRun = item.kind === 'run';
    const synced = item.sync_status === 'synced';
    const battery = isRun ? batteryFor(item.battery_code, item.battery_version) : null;
    const title = isRun
      ? battery?.title ?? item.battery_code
      : STANDALONE_TESTS.find(test => test.code === item.question_code)?.title || item.question_code;
    const status = isRun ? RUN_STATUS[item.status] : null;
    const info = childInfoMap[item.child_id];
    const childName = info ? info.name : 'Unknown child';
    const isHidden = info?.hidden;
    const date = formatDate(item.assessment_date);
    const decidedCount = isRun
      ? `${item.question_count}${battery ? ` of ${battery.questions.length}` : ''} decided`
      : null;

    return (
      <Pressable testID="assessment-history-row" style={styles.row} accessibilityRole="button"
        accessibilityLabel={isRun ? [date, title, childName, status.label,
          LANGUAGE_LABELS[item.language] || item.language, decidedCount].join(', ') : undefined}
        onPress={() => isRun
          ? navigation.navigate('BatteryRunSummary', { runId: item.id })
          : navigation.navigate('AssessmentDetail', { assessmentId: item.id, childName })}
      >
        <View style={styles.cardHeader}>
          <Text variant="titleSmall" style={styles.cardDate}>
            {date}
          </Text>
          <View style={styles.cardHeaderRight}>
            {isRun ? <StatusBadge label={status.label} tone={status.tone} /> :
            <View style={[styles.syncBadge, synced ? styles.syncBadgeSynced : styles.syncBadgePending]}>
              <Text variant="bodySmall" style={[styles.syncBadgeText, synced ? styles.syncTextSynced : styles.syncTextPending]}>
                {synced ? 'Synced' : 'Pending sync'}
              </Text>
            </View>}
            <Text style={styles.chevron}>{'\u203A'}</Text>
          </View>
        </View>

        <Text variant="bodyMedium" style={styles.childName}>
          {childName}
          {isHidden && (
            <Text variant="bodySmall" style={styles.removedBadge}> (removed)</Text>
          )}
        </Text>

        <View style={styles.typeRow}>
          <Text variant="labelSmall" style={styles.typeBadgeText}>
            {title}
          </Text>
          <Text variant="bodyMedium" style={styles.language}>
            {LANGUAGE_LABELS[item.language] || item.language}
          </Text>
        </View>
        <View style={styles.statsRow}>
          <Text variant="bodySmall" style={styles.stat}>{isRun
            ? decidedCount
            : `${item.score} / ${item.total_items}`}</Text>
        </View>
        {index < assessments.length - 1 && <View testID="history-row-divider" pointerEvents="none" style={styles.rowDivider} />}
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        {history.detail && <Text variant="bodySmall" style={styles.historyDetail}>{history.detail}</Text>}
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
      <ListGroup style={[styles.group, { marginBottom: cardBottom }]}>
        <FlatList onScroll={onScroll} scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          data={assessments}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          style={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text variant="bodyMedium" style={styles.emptyText}>
                No assessments yet. Run your first assessment!
              </Text>
            </View>
          }
        />
      </ListGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  historyDetail: { color: colors.textSecondary, marginHorizontal: spacing.md, marginTop: spacing.sm },
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chevron: {
    ...typeRoles.textLetter,
    color: colors.textSecondary,
    fontFamily: fontFamilies.textSemi,
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
  syncTextSynced: {
    color: colors.success,
  },
  syncTextPending: {
    color: colors.textSecondary,
  },
  childName: {
    color: colors.text,
    fontFamily: fontFamilies.textSemi,
    marginBottom: 2,
  },
  removedBadge: {
    color: colors.textSecondary,
    fontStyle: 'italic',
    fontFamily: fontFamilies.textMedium,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  typeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
  },
  typeBadgeLetter: {
    backgroundColor: colors.red50,
  },
  typeBadgeWord: {
    backgroundColor: colors.warningBg,
  },
  typeBadgeText: {
    ...typeRoles.textNavInactive,
    color: colors.text,
  },
  language: {
    color: colors.primary,
    fontFamily: fontFamilies.textMedium,
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
