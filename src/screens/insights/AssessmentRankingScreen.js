import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, ActivityIndicator, SegmentedButtons } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { assessmentsRepository } from '../../db/repositories/assessmentsRepository';
import { getLetterAssessmentRanking, getWordAssessmentRanking } from '../../utils/dashboardStats';
import { getScoreBand, getBandColor } from '../../utils/scoreBands';
import RankedBarRow from '../../components/dashboard/RankedBarRow';
import StatBar from '../../components/dashboard/StatBar';
import { colors, spacing, borderRadius } from '../../constants/colors';

// The screen toggles between two EGRA Questions. Each carries its own band
// tool_code (for grade-referenced colours), bar scale, and copy. Word bands are
// not seeded yet, so word_reading degrades to neutral grey via getScoreBand.
const MODES = {
  letters: {
    value: 'letters',
    label: 'Letters',
    toolCode: 'letter_sounds',
    maxValue: 60,
    rank: getLetterAssessmentRanking,
    subtitle: 'Ranked by letters correct on the most recent EGRA letter assessment',
    benchmarked: true,
  },
  words: {
    value: 'words',
    label: 'Words',
    toolCode: 'word_reading',
    maxValue: 50,
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
  const { user } = useAuth();
  const { children: childrenList } = useChildren();
  const { classes } = useClasses();
  const [assessments, setAssessments] = useState([]);
  const [mode, setMode] = useState('letters');
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        setLoading(true);
        const rows = await assessmentsRepository.getAssessments({ userId: user.id });
        setAssessments(rows);
        setLoading(false);
      };
      load();
    }, [user.id])
  );

  const modeConfig = MODES[mode];
  // Toggling re-ranks the already-fetched assessments — no refetch needed.
  const ranking = useMemo(
    () => modeConfig.rank(childrenList, assessments),
    [modeConfig, childrenList, assessments]
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const assessed = ranking.filter(r => r.accuracy !== null);
  const notAssessed = ranking.filter(r => r.accuracy === null);

  const avgCorrect = assessed.length > 0
    ? Math.round(assessed.reduce((sum, r) => sum + r.correct, 0) / assessed.length)
    : 0;
  const highest = assessed.length > 0 ? assessed[0].correct : 0;

  const renderItem = ({ item, index }) => {
    if (item.accuracy === null) {
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
    // Colour by raw-score band (grade-referenced), never accuracy percent (ADR-0003).
    // Grade/language come from the child's class; band degrades to neutral grey
    // for tools/grades without a configured benchmark (e.g. word_reading today).
    const cls = classes.find((c) => c.id === item.child.class_id);
    const band = getScoreBand({
      toolCode: modeConfig.toolCode,
      grade: cls?.grade,
      language: cls?.home_language,
      rawScore: item.correct,
    });
    return (
      <RankedBarRow
        rank={index + 1}
        name={childName}
        value={item.correct}
        maxValue={modeConfig.maxValue}
        barColor={getBandColor(band)}
        label={`${item.correct}`}
        onPress={item.assessment ? () => navigation.navigate('AssessmentDetail', {
          assessment: item.assessment,
          childName,
        }) : undefined}
      />
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={ranking}
        keyExtractor={(item) => item.child.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <SegmentedButtons
              value={mode}
              onValueChange={setMode}
              density="small"
              style={styles.toggle}
              buttons={[
                { value: MODES.letters.value, label: MODES.letters.label, icon: 'alphabetical' },
                { value: MODES.words.value, label: MODES.words.label, icon: 'text' },
              ]}
            />
            <Text style={styles.subtitle}>{modeConfig.subtitle}</Text>
            <StatBar items={[
              { label: 'Avg Correct', value: avgCorrect },
              { label: 'Highest', value: highest, color: colors.success },
              { label: 'Not Assessed', value: notAssessed.length, color: colors.emphasis },
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
    paddingBottom: spacing.xxl,
  },
  toggle: {
    marginBottom: spacing.md,
  },
  subtitle: {
    fontSize: 12,
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
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  unassessedLabel: {
    fontSize: 11,
    color: colors.disabled,
    fontStyle: 'italic',
  },
  keyCaption: {
    fontSize: 10,
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
    fontSize: 10,
    color: colors.textSecondary,
  },
});
