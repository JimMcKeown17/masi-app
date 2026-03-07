import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Card } from 'react-native-paper';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';

function getFeedback(accuracy) {
  if (accuracy >= 90) return { message: 'Excellent work!', color: colors.success };
  if (accuracy >= 75) return { message: 'Great job!', color: colors.success };
  if (accuracy >= 60) return { message: 'Good effort!', color: colors.primary };
  if (accuracy >= 40) return { message: 'Nice try!', color: colors.accent };
  return { message: 'Keep practicing!', color: colors.emphasis };
}

export default function AssessmentResultsScreen({ navigation, route }) {
  const { assessment, child, letterSet, attemptNumber } = route.params;
  const incorrect = assessment.letters_attempted - assessment.correct_responses;
  const feedback = getFeedback(assessment.accuracy);

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
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text variant="headlineSmall" style={styles.title}>Assessment Complete</Text>
        <Text variant="bodyLarge" style={styles.childName}>
          {child.first_name} {child.last_name}
        </Text>
        <Text variant="bodyMedium" style={styles.meta}>
          {letterSet.language} - Attempt #{attemptNumber}
        </Text>

        <Text variant="headlineMedium" style={[styles.feedbackText, { color: feedback.color }]}>
          {feedback.message}
        </Text>

        <Card style={styles.scoreCard}>
          <Card.Content>
            <View style={styles.scoreRow}>
              <View style={styles.scoreStat}>
                <Text variant="headlineLarge" style={styles.scoreNumber}>
                  {assessment.letters_attempted}
                </Text>
                <Text variant="bodySmall" style={styles.scoreLabel}>Attempted</Text>
              </View>
              <View style={styles.scoreStat}>
                <Text variant="headlineLarge" style={[styles.scoreNumber, { color: colors.success }]}>
                  {assessment.correct_responses}
                </Text>
                <Text variant="bodySmall" style={styles.scoreLabel}>Correct</Text>
              </View>
              <View style={styles.scoreStat}>
                <Text variant="headlineLarge" style={[styles.scoreNumber, { color: colors.emphasis }]}>
                  {incorrect}
                </Text>
                <Text variant="bodySmall" style={styles.scoreLabel}>Incorrect</Text>
              </View>
              <View style={styles.scoreStat}>
                <Text variant="headlineLarge" style={[styles.scoreNumber, { color: colors.primary }]}>
                  {assessment.accuracy}%
                </Text>
                <Text variant="bodySmall" style={styles.scoreLabel}>Accuracy</Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        <View style={styles.detailRow}>
          <Text variant="bodyMedium" style={styles.detailLabel}>Time used:</Text>
          <Text variant="bodyMedium" style={styles.detailValue}>{assessment.completion_time}s</Text>
        </View>
      </ScrollView>

      <View style={styles.buttonRow}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
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
  feedbackText: {
    fontWeight: '700',
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  scoreCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    width: '100%',
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
  },
  scoreStat: {
    alignItems: 'center',
  },
  scoreNumber: {
    fontWeight: '700',
    color: colors.text,
  },
  scoreLabel: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  detailLabel: {
    color: colors.textSecondary,
  },
  detailValue: {
    color: colors.text,
    fontWeight: '600',
  },
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
