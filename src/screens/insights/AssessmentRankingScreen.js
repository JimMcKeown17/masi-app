import { useAssessmentHistoryStatus } from '../../services/assessmentHistoryStatus';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import SegmentedControl from '../../components/common/SegmentedControl';
import { typeRoles } from '../../constants/typography';
import { useSignedInEA } from '../../context/SignedInEAContext';
import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';

import { getLetterScoreRanking, getWordAssessmentRanking } from '../../utils/dashboardStats';
import { getBandColor } from '../../utils/scoreBands';
import RankedBarRow from '../../components/dashboard/RankedBarRow';
import StatBar from '../../components/dashboard/StatBar';
import { colors, spacing, borderRadius } from '../../constants/colors';

// The screen toggles between two Questions. Each result carries its own scale
// and Question code for grade-referenced bands. Word bands are not seeded yet,
// so word results use the neutral unknown band.
const MODES = {
  letters: {
    value: 'letters',
    label: 'Letters',
    rank: getLetterScoreRanking,
    subtitle: 'Ranked by letters correct on the most recent EGRA letter assessment',
    benchmarked: true,
  },
  words: {
    value: 'words',
    label: 'Words',
    rank: getWordAssessmentRanking,
    subtitle: 'Ranked by words correct on the most recent EGRA word assessment',
    benchmarked: false,
  },
};

// Legend entries mirror the bands getScoreBand returns, coloured via getBandColor.
const BAND_LEGEND = [
  { band: 'great', label: 'Great' },
  { band: 'good', label: 'Good' },
  { band: 'okay', label: 'Okay' },
  { band: 'needs_work', label: 'Needs work' },
  { band: 'unknown', label: 'No benchmark' },
];

export default function AssessmentRankingScreen({ navigation }) {
  const { pageVersion, runVersion } = useAssessmentHistoryStatus();
  const onScroll = useHeaderHairline();
  const paddingBottom = useScrollBottomPadding(spacing.xxl);
  const { repositories } = useSignedInEA();
  const { assessments: assessmentsRepository, childClassMemberships: membershipsRepository } = repositories;

  const { user } = useAuth();
  const { children: childrenList } = useChildren();
  const { classes } = useClasses();
  const [assessments, setAssessments] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [mode, setMode] = useState('letters');
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        setLoading(true);
        const [rows, membershipRows] = await Promise.all([
          assessmentsRepository.getQuestionResults({ userId: user.id }),
          membershipsRepository.getAll(),
        ]);
        if (!active) return;
        setAssessments(rows);
        setMemberships(membershipRows);
        setLoading(false);
      };
      load();
      return () => { active = false; };
    }, [assessmentsRepository, membershipsRepository, user.id, pageVersion, runVersion])
  );

  const modeConfig = MODES[mode];
  // Toggling re-ranks the already-fetched assessments — no refetch needed.
  const assessed = useMemo(
    () => modeConfig.rank(childrenList, assessments, classes, memberships),
    [modeConfig, childrenList, assessments, classes, memberships]
  );
  const assessedIds = new Set(assessed.map(row => row.child.id));
  const notAssessed = childrenList.filter(child => !assessedIds.has(child.id)).map(child => ({ child }));
  const ranking = [...assessed, ...notAssessed];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const avgCorrect = assessed.length > 0
    ? Math.round(assessed.reduce((sum, r) => sum + r.score, 0) / assessed.length)
    : 0;
  const highest = assessed.length > 0 ? assessed[0].score : 0;

  const renderItem = ({ item, index }) => {
    if (!item.assessment) {
      return (
        <View style={styles.unassessedRow}>
          <Text style={styles.unassessedName}>
            {item.child.first_name} {(item.child.last_name || '').charAt(0)}.
          </Text>
          <Text style={styles.unassessedLabel}>Not assessed</Text>
        </View>
      );
    }

    const childName = `${item.child.first_name} ${(item.child.last_name || '').charAt(0)}.`;
    // The helper uses the stored Question/language and grade at the result date.
    return (
      <RankedBarRow
        rank={index + 1}
        name={childName}
        value={item.score}
        maxValue={item.total}
        barColor={getBandColor(item.band)}
        label={`${item.score} / ${item.total}`}
        onPress={!item.assessment.battery_run_id ? () => navigation.navigate('AssessmentDetail', {
          assessmentId: item.assessment.id,
          childName,
        }) : undefined}
      />
    );
  };

  return (
    <View style={styles.container}>
      <FlatList onScroll={onScroll} scrollEventThrottle={16}
        data={ranking}
        keyExtractor={(item) => item.child.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, { paddingBottom }]}
        ListHeaderComponent={
          <View>
            <View style={styles.toggle}>
              <SegmentedControl
                role="radio"
                value={mode}
                onChange={setMode}
                options={[
                  { value: MODES.letters.value, label: MODES.letters.label, icon: 'alphabetical' },
                  { value: MODES.words.value, label: MODES.words.label, icon: 'text' },
                ]}
              />
            </View>
            <Text style={styles.subtitle}>{modeConfig.subtitle}</Text>
            <StatBar items={[
              { label: 'Avg Correct', value: avgCorrect },
              { label: 'Highest', value: highest, color: colors.success },
              { label: 'Not Assessed', value: notAssessed.length, color: colors.primary },
            ]} />
          </View>
        }
        ListFooterComponent={
          modeConfig.benchmarked ? (
            <View>
              <Text style={styles.keyCaption}>Colour shows each child's level for their grade</Text>
              <View style={styles.colorKey}>
                {BAND_LEGEND.map(({ band, label }) => (
                  <View key={band} style={styles.keyItem}>
                    <View style={[styles.keySwatch, { backgroundColor: getBandColor(band) }]} />
                    <Text style={styles.keyLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <Text style={styles.keyCaption}>
              Word benchmarks aren't set yet — bars rank by words correct, without level colours.
            </Text>
          )
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No children to display</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  listContent: {
    padding: spacing.md,
  },
  toggle: {
    marginBottom: spacing.md,
  },
  subtitle: {
    ...typeRoles.textCaption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: spacing.xl,
  },
  unassessedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.sm + 2,
    marginBottom: spacing.xs + 2,
    borderLeftWidth: 3,
    borderLeftColor: colors.disabled,
  },
  unassessedName: {
    ...typeRoles.textNote,
    color: colors.textSecondary,
  },
  unassessedLabel: {
    ...typeRoles.textCaption,
    color: colors.disabled,
    fontStyle: 'italic',
  },
  keyCaption: {
    ...typeRoles.textCaption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  colorKey: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
  },
  keyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  keySwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  keyLabel: {
    ...typeRoles.textCaption,
    color: colors.textSecondary,
  },
});
