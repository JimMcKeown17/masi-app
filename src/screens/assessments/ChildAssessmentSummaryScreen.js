import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Card, Button } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';
import { storage } from '../../utils/storage';
import { LETTER_SETS, WORD_SETS } from '../../constants/egraConstants';
import { normalizeLanguageKey } from '../../utils/letterMastery';

const ASSESSMENT_TYPES = [
  { key: 'letter_egra', label: 'Letter Sound', description: 'EGRA letter sound recognition' },
  { key: 'word_egra', label: 'Word Reading', description: 'EGRA word reading fluency' },
];

function formatDate(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getFeedbackColor(accuracy) {
  if (accuracy >= 75) return colors.success;
  if (accuracy >= 50) return colors.primary;
  return colors.emphasis;
}

export default function ChildAssessmentSummaryScreen({ navigation, route }) {
  const { child, classItem } = route.params;
  const childName = `${child.first_name} ${child.last_name}`;
  const [latestByType, setLatestByType] = useState({});
  const [attemptCounts, setAttemptCounts] = useState({});

  const langKey = normalizeLanguageKey(classItem?.home_language);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const all = await storage.getAssessments();
        const byType = {};
        const counts = {};
        for (const a of all) {
          if (a.child_id !== child.id) continue;
          const type = a.assessment_type || 'letter_egra';
          counts[type] = (counts[type] || 0) + 1;
          const prev = byType[type];
          if (!prev || a.date_assessed > prev.date_assessed ||
              (a.date_assessed === prev.date_assessed && a.created_at > prev.created_at)) {
            byType[type] = a;
          }
        }
        setLatestByType(byType);
        setAttemptCounts(counts);
      })();
    }, [child.id])
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text variant="titleLarge" style={styles.childName}>{childName}</Text>
      <Text variant="bodyMedium" style={styles.subtitle}>Assessment Summary</Text>

      {ASSESSMENT_TYPES.map(({ key, label, description }) => {
        const assessment = latestByType[key];

        return (
          <Card key={key} style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.cardTitle}>{label}</Text>
              <Text variant="bodySmall" style={styles.cardDescription}>{description}</Text>

              {assessment ? (
                <View style={styles.scoreSection}>
                  <View style={styles.scoreRow}>
                    <View style={[styles.accuracyBadge, { backgroundColor: getFeedbackColor(assessment.accuracy) }]}>
                      <Text style={styles.accuracyText}>{assessment.accuracy}%</Text>
                    </View>
                    <View style={styles.scoreDetails}>
                      <Text variant="bodyMedium" style={styles.scoreLabel}>
                        {assessment.correct_responses} / {assessment.letters_attempted} correct
                      </Text>
                      <Text variant="bodySmall" style={styles.dateText}>
                        {formatDate(assessment.date_assessed)} - Attempt #{assessment.attempt_number}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardButtons}>
                    <Button
                      mode="outlined"
                      compact
                      onPress={() => navigation.navigate('AssessmentDetail', {
                        assessment,
                        childName,
                      })}
                    >
                      View Detail
                    </Button>
                  </View>
                </View>
              ) : (
                <View style={styles.notAssessed}>
                  <Text variant="bodyMedium" style={styles.notAssessedText}>
                    Not yet assessed
                  </Text>
                  <Button
                    mode="contained"
                    compact
                    onPress={() => {
                      const sets = key === 'word_egra' ? WORD_SETS : LETTER_SETS;
                      const itemSet = sets[langKey];
                      if (itemSet) {
                        navigation.navigate('LetterAssessment', {
                          child,
                          letterSet: itemSet,
                          attemptNumber: (attemptCounts[key] || 0) + 1,
                          assessmentType: key,
                        });
                      } else {
                        navigation.navigate('AssessmentChildSelect', { assessmentType: key });
                      }
                    }}
                    style={styles.runButton}
                  >
                    Run Assessment
                  </Button>
                </View>
              )}
            </Card.Content>
          </Card>
        );
      })}

      {/* Letter Tracker shortcut */}
      <Card style={styles.card} onPress={() => navigation.navigate('LetterTracker', { child, classItem })}>
        <Card.Content style={styles.trackerCard}>
          <Text variant="titleMedium" style={styles.cardTitle}>Letter Tracker</Text>
          <Text variant="bodySmall" style={styles.cardDescription}>
            View and manage letter mastery progress
          </Text>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  childName: {
    color: colors.primary,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  cardTitle: {
    color: colors.text,
    fontWeight: '600',
    marginBottom: 2,
  },
  cardDescription: {
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  scoreSection: {
    gap: spacing.sm,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  accuracyBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accuracyText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  scoreDetails: {
    flex: 1,
  },
  scoreLabel: {
    color: colors.text,
    fontWeight: '600',
  },
  dateText: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  cardButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.xs,
  },
  notAssessed: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  notAssessedText: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  runButton: {
    alignSelf: 'center',
  },
  trackerCard: {
    flexDirection: 'column',
  },
});
