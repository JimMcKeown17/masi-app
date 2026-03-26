import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';
import { getLetterSetById } from '../../constants/egraConstants';
import AssessmentDetailGrid from '../../components/assessment/AssessmentDetailGrid';

function getFeedback(accuracy) {
  if (accuracy >= 90) return { message: 'Excellent work!', color: colors.success };
  if (accuracy >= 75) return { message: 'Great job!', color: colors.success };
  if (accuracy >= 60) return { message: 'Good effort!', color: colors.primary };
  if (accuracy >= 40) return { message: 'Nice try!', color: colors.accent };
  return { message: 'Keep practicing!', color: colors.emphasis };
}

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

function StatCard({ value, label, accentColor }) {
  return (
    <View style={[styles.statCard, { borderTopColor: accentColor }]}>
      <Text style={[styles.statValue, { color: accentColor }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function AssessmentDetailScreen({ route }) {
  const { assessment, childName } = route.params;
  const insets = useSafeAreaInsets();
  const letterSet = getLetterSetById(assessment.letter_set_id);
  const incorrect = assessment.letters_attempted - assessment.correct_responses;
  const feedback = getFeedback(assessment.accuracy);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
    >
      <Text variant="bodyLarge" style={styles.childName}>{childName}</Text>
      <Text variant="bodyMedium" style={styles.meta}>
        {formatDate(assessment.date_assessed)} - {assessment.letter_language} - Attempt #{assessment.attempt_number}
      </Text>

      {/* Hero accuracy section */}
      <View style={styles.heroSection}>
        <View style={[styles.accuracyRing, { borderColor: feedback.color }]}>
          <Text style={[styles.accuracyNumber, { color: feedback.color }]}>
            {assessment.accuracy}%
          </Text>
        </View>
        <Text variant="headlineSmall" style={[styles.feedbackText, { color: feedback.color }]}>
          {feedback.message}
        </Text>
        {assessment.completion_time != null && (
          <Text variant="bodyMedium" style={styles.timeText}>
            Completed in {assessment.completion_time}s
          </Text>
        )}
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <StatCard value={assessment.letters_attempted} label="Attempted" accentColor={colors.primary} />
        <StatCard value={assessment.correct_responses} label="Correct" accentColor={colors.success} />
        <StatCard value={incorrect} label="Incorrect" accentColor={colors.emphasis} />
      </View>

      {/* Letter grid */}
      {letterSet && (
        <View style={styles.gridSection}>
          <AssessmentDetailGrid assessment={assessment} letterSet={letterSet} />
        </View>
      )}
    </ScrollView>
  );
}

const RING_SIZE = 120;

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
    fontWeight: '600',
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
    fontSize: 34,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  feedbackText: {
    fontWeight: '700',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  timeText: {
    color: colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderTopWidth: 3,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...shadows.card,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginBottom: spacing.xs,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  gridSection: {
    width: '100%',
    marginTop: spacing.xl,
  },
});
