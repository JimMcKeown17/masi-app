import React, { useState, useCallback } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { assessmentsRepository } from '../../db/repositories/assessmentsRepository';
import { getAssessmentRanking } from '../../utils/dashboardStats';
import { getScoreBand, getBandColor } from '../../utils/scoreBands';
import RankedBarRow from '../../components/dashboard/RankedBarRow';
import StatBar from '../../components/dashboard/StatBar';
import { colors, spacing, borderRadius } from '../../constants/colors';

// EGRA Letter Sounds is the Question this ranking colours; raw score is LCPM.
const LETTER_SOUNDS_TOOL_CODE = 'letter_sounds';

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
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        setLoading(true);
        const assessments = await assessmentsRepository.getAssessments({ userId: user.id });
        const ranked = getAssessmentRanking(childrenList, assessments);
        setRanking(ranked);
        setLoading(false);
      };
      load();
    }, [childrenList, user.id])
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
    // for grades without a configured benchmark.
    const cls = classes.find((c) => c.id === item.child.class_id);
    const band = getScoreBand({
      toolCode: LETTER_SOUNDS_TOOL_CODE,
      grade: cls?.grade,
      language: cls?.home_language,
      rawScore: item.correct,
    });
    return (
      <RankedBarRow
        rank={index + 1}
        name={childName}
        value={item.correct}
        maxValue={60}
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
            <Text style={styles.subtitle}>
              Children ranked by total letters correct on most recent EGRA assessment
            </Text>
            <StatBar items={[
              { label: 'Avg Correct', value: avgCorrect },
              { label: 'Highest', value: highest, color: colors.success },
              { label: 'Not Assessed', value: notAssessed.length, color: colors.emphasis },
            ]} />
          </View>
        }
        ListFooterComponent={
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
