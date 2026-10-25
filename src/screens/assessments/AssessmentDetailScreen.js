import { useHeaderHairline } from '../../components/common/ScreenHeader';
import AssessmentStatCards from '../../components/assessment/AssessmentStatCards';
import { fontFamilies, typeRoles } from '../../constants/typography';
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import { colors, spacing, shadows } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { useSignedInEA } from '../../context/SignedInEAContext';
import { LANGUAGE_LABELS, STANDALONE_TESTS } from '../../utils/assessmentRegistry';
import AssessmentDetailGrid from '../../components/assessment/AssessmentDetailGrid';

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

export default function AssessmentDetailScreen({ route }) {
  const onScroll = useHeaderHairline();
  const { assessmentId, childName } = route.params;
  const { user } = useAuth();
  const { repositories } = useSignedInEA();
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState(false);
  const paddingBottom = useScrollBottomPadding();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setReadError(false);
    repositories.assessments.getQuestionResults({ userId: user.id, assessmentId, includeSkipped: true })
      .then(results => { if (active) setAssessment(results[0] || null); })
      .catch(() => { if (active) { setAssessment(null); setReadError(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [repositories.assessments, user.id, assessmentId]);

  if (loading) return <View style={styles.container}><ActivityIndicator color={colors.primary} accessibilityLabel="Loading result" /></View>;
  if (!assessment || assessment.battery_run_id) return <View style={[styles.container, styles.scrollContent]}>
    <Text>{readError ? 'Could not load result.' : assessment?.battery_run_id ? 'Battery Questions are shown in their assessment.' : 'Result not found.'}</Text>
  </View>;
  const attempted = assessment.derived?.total_attempted ?? assessment.items.filter(item => item.metadata?.reached !== false).length;
  const incorrect = attempted - assessment.score;
  const title = STANDALONE_TESTS.find(test => test.code === assessment.question_code)?.title || assessment.question_code;

  return (
    <ScrollView onScroll={onScroll} scrollEventThrottle={16}
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, { paddingBottom }]}
    >
      <Text variant="bodyLarge" style={styles.childName}>{childName}</Text>
      <Text variant="bodyMedium" style={styles.meta}>
        {formatDate(assessment.assessment_date)} · {title}
      </Text>

      <Text style={styles.meta}>{LANGUAGE_LABELS[assessment.language] || assessment.language}</Text>
      <View style={styles.heroSection}>
        <View style={[styles.accuracyRing, { borderColor: colors.primary }]}>
          <Text style={[styles.accuracyNumber, { color: colors.primary }]}>
            {assessment.score} / {assessment.total_items}
          </Text>
        </View>
        <Text variant="headlineSmall" style={styles.feedbackText}>Score</Text>
        {assessment.duration_ms != null && (
          <Text variant="bodyMedium" style={styles.timeText}>
            Completed in {Math.round(assessment.duration_ms / 1000)}s
          </Text>
        )}
      </View>

      <AssessmentStatCards stats={[
        { key: 'attempted', value: attempted, label: 'Attempted', accentColor: colors.primary },
        { key: 'correct', value: assessment.score, label: 'Correct', accentColor: colors.success },
        { key: 'incorrect', value: incorrect, label: 'Incorrect', accentColor: colors.emphasis },
      ]} />

      <View style={styles.gridSection}><AssessmentDetailGrid assessment={assessment} /></View>
    </ScrollView>
  );
}

const RING_SIZE = 180;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  childName: {
    color: colors.primary,
    fontFamily: fontFamilies.textSemi,
    marginBottom: spacing.xs,
  },
  meta: {
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  accuracyRing: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
    ...shadows.elevated,
  },
  accuracyNumber: {
    ...typeRoles.displayXL,
    fontVariant: ['tabular-nums'],
  },
  feedbackText: {
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  timeText: {
    color: colors.textSecondary,
  },
  gridSection: {
    width: '100%',
    marginTop: spacing.xl,
  },
});
