import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';

function getFeedback(accuracy) {
  if (accuracy >= 90) return { message: 'Excellent work!', color: colors.success };
  if (accuracy >= 75) return { message: 'Great job!', color: colors.success };
  if (accuracy >= 60) return { message: 'Good effort!', color: colors.primary };
  if (accuracy >= 40) return { message: 'Nice try!', color: colors.accent };
  return { message: 'Keep practicing!', color: colors.emphasis };
}

function StatCard({ value, label, accentColor }) {
  return (
    <View style={[styles.statCard, { borderTopColor: accentColor }]}>
      <Text style={[styles.statValue, { color: accentColor }]}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function AssessmentResultsScreen({ navigation, route }) {
  const { assessment, child, letterSet, attemptNumber } = route.params;
  const incorrect = assessment.letters_attempted - assessment.correct_responses;
  const feedback = getFeedback(assessment.accuracy);
  const insets = useSafeAreaInsets();

  const handleTryAgain = () => {
    navigation.replace('LetterAssessment', {
      child,
      letterSet,
      attemptNumber: attemptNumber + 1,
    });
  };

  const handleDone = () => {
    navigation.navigate('MainTabs', { screen: 'Assessments' });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text variant="headlineSmall" style={styles.title}>Assessment Complete</Text>
        <Text variant="bodyLarge" style={styles.childName}>
          {child.first_name} {child.last_name}
        </Text>
        <Text variant="bodyMedium" style={styles.meta}>
          {letterSet.language} - Attempt #{attemptNumber}
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
          <Text variant="bodyMedium" style={styles.timeText}>
            Completed in {assessment.completion_time}s
          </Text>
        </View>

        {/* Supporting stat cards */}
        <View style={styles.statsRow}>
          <StatCard
            value={assessment.letters_attempted}
            label="Attempted"
            accentColor={colors.primary}
          />
          <StatCard
            value={assessment.correct_responses}
            label="Correct"
            accentColor={colors.success}
          />
          <StatCard
            value={incorrect}
            label="Incorrect"
            accentColor={colors.emphasis}
          />
        </View>
      </ScrollView>

      <View style={[styles.buttonRow, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Button mode="outlined" onPress={handleTryAgain} style={styles.button}>
          Try Again
        </Button>
        <Button mode="contained" onPress={handleDone} style={styles.button}>
          Done
        </Button>
      </View>
    </View>
  );
}

const RING_SIZE = 140;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    marginBottom: spacing.xs,
  },
  childName: {
    color: colors.primary,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  meta: {
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  // Hero accuracy
  heroSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  accuracyRing: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
    ...shadows.elevated,
  },
  accuracyNumber: {
    fontSize: 40,
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
  // Stat cards
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
    fontSize: 28,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginBottom: spacing.xs,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  // Buttons
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  button: {
    flex: 1,
  },
});
