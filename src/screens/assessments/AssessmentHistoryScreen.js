import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import ListGroup from '../../components/common/ListGroup';
import { fontFamilies, typeRoles } from '../../constants/typography';
import { useToast } from '../../context/ToastContext';
import { useSignedInEA } from '../../context/SignedInEAContext';
import React, { useState, useCallback } from 'react';
import { View, Pressable, StyleSheet, FlatList } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useChildren } from '../../context/ChildrenContext';
import { LANGUAGE_LABELS, STANDALONE_TESTS } from '../../utils/assessmentRegistry';
import { colors, spacing } from '../../constants/colors';
import { toLocalDateString } from '../../utils/localDate';


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
  const onScroll = useHeaderHairline();
  // The list scrolls inside the card, so the card (not the list) clears the bottom inset.
  const cardBottom = useScrollBottomPadding(spacing.md);
  const toast = useToast();
  const { repositories } = useSignedInEA();
  const { assessments: assessmentsRepository, batteryRuns } = repositories;

  const { user } = useAuth();
  // Use allChildren (includes hidden) so historical assessments still resolve
  // child names. Hidden children render with a "(removed)" badge so users know
  // why the child no longer appears in their active list.
  const { allChildren } = useChildren();
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);

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
          const [results, runs] = await Promise.all([
            assessmentsRepository.getQuestionResults({
              userId: user.id, recordedByUserId: user.id, includeSkipped: true, order: 'desc',
            }),
            batteryRuns.getRunsForUser(user.id),
          ]);
          const cached = [
            ...results.filter(result => result.battery_run_id == null).map(result => ({ ...result, kind: 'result' })),
            ...runs.map(run => ({ ...run, kind: 'run', assessment_date: toLocalDateString(run.started_at) })),
          ].sort((a, b) => b.assessment_date.localeCompare(a.assessment_date)
            || (b.created_at || '').localeCompare(a.created_at || ''));
          if (active) {
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
    }, [user?.id, toast, assessmentsRepository, batteryRuns])
  );

  const childInfoMap = React.useMemo(() => {
    const map = {};
    for (const c of allChildren) {
      map[c.id] = {
        name: `${c.first_name} ${c.last_name}`,
        hidden: !!c.hidden_at,
      };
    }
    return map;
  }, [allChildren]);

  const renderItem = ({ item, index }) => {
    const isRun = item.kind === 'run';
    const synced = item.sync_status === 'synced';
    const title = STANDALONE_TESTS.find(test => test.code === item.question_code)?.title || item.question_code;
    const status = isRun ? item.status.replace(/_/g, ' ').replace(/^./, char => char.toUpperCase()) : null;
    const Row = isRun ? View : Pressable;
    const info = childInfoMap[item.child_id];
    const childName = info ? info.name : 'Unknown child';
    const isHidden = info?.hidden;

    return (
      <Row testID="assessment-history-row" style={styles.row}
        {...(!isRun && { accessibilityRole: 'button', onPress: () => navigation.navigate('AssessmentDetail', { assessmentId: item.id, childName }) })}
      >
        <View style={styles.cardHeader}>
          <Text variant="titleSmall" style={styles.cardDate}>
            {formatDate(item.assessment_date)}
          </Text>
          <View style={styles.cardHeaderRight}>
            <View style={[styles.syncBadge, synced ? styles.syncBadgeSynced : styles.syncBadgePending]}>
              <Text variant="bodySmall" style={[styles.syncBadgeText, synced ? styles.syncTextSynced : styles.syncTextPending]}>
                {synced ? 'Synced' : 'Pending sync'}
              </Text>
            </View>
            {!isRun && <Text style={styles.chevron}>{'\u203A'}</Text>}
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
            {isRun ? `WelaPLUS · ${status} · ${item.question_count} Questions` : title}
          </Text>
          <Text variant="bodyMedium" style={styles.language}>
            {LANGUAGE_LABELS[item.language] || item.language}
          </Text>
        </View>
        {!isRun && <View style={styles.statsRow}>
          <Text variant="bodySmall" style={styles.stat}>{item.score} / {item.total_items}</Text>
        </View>}
        {index < assessments.length - 1 && <View testID="history-row-divider" pointerEvents="none" style={styles.rowDivider} />}
      </Row>
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
      <ListGroup style={[styles.group, { marginBottom: cardBottom }]}>
        <FlatList onScroll={onScroll} scrollEventThrottle={16}
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
