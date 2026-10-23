import { useChildren } from '../../context/ChildrenContext';
import { useAssessmentHistoryStatus } from '../../services/assessmentHistoryStatus';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import SurfaceCard from '../../components/common/SurfaceCard';
import BrandButton from '../../components/common/BrandButton';
import { fontFamilies, typeRoles } from '../../constants/typography';
import { useSignedInEA } from '../../context/SignedInEAContext';
import React, { useState, useCallback, useRef } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing } from '../../constants/colors';

import { CURRENT_ITEM_SETS } from '../../assessment-questions';
import { languageCodeForHomeLanguage, STANDALONE_TESTS } from '../../utils/assessmentRegistry';
import LetterMasteryPanel from '../../components/assessment/LetterMasteryPanel';

function formatDate(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getFeedbackColor(accuracy) {
  if (accuracy >= 75) return colors.success;
  if (accuracy >= 50) return colors.primary;
  return colors.primary;
}

export default function ChildResultsScreen({ navigation, route }) {
  const { pageVersion, runVersion } = useAssessmentHistoryStatus();
  const onScroll = useHeaderHairline();
  const { repositories } = useSignedInEA();
  const { assessments: assessmentsRepository } = repositories;

  const { user } = useAuth();
  const { child, classItem: routeClassItem } = route.params;
  const { children: deliveryChildren } = useChildren();
  const isDelivery = deliveryChildren.some(deliveryChild => deliveryChild.id === child.id);
  // Assessment routes carry the chosen membership's class metadata. Older
  // delivery routes still supply their class separately.
  const classItem = child.home_language !== undefined ? {
    ...routeClassItem, id: child.class_id, grade: child.grade, home_language: child.home_language,
  } : routeClassItem;
  const childName = `${child.first_name} ${child.last_name}`;
  const [latestByType, setLatestByType] = useState({});
  const launchingRef = useRef(false);

  const languageCode = languageCodeForHomeLanguage(classItem?.home_language);

  const handleRunAssessment = (testCode) => {
    if (launchingRef.current) return;
    launchingRef.current = true;
    if (languageCode === null || !CURRENT_ITEM_SETS[testCode]?.[languageCode]) {
      navigation.navigate('AssessmentChildSelect', { testCode });
      return;
    }
    navigation.navigate('StandaloneTest', { testCode, child, languageCode });
  };

  useFocusEffect(
    useCallback(() => {
      launchingRef.current = false;
      (async () => {
        const all = await assessmentsRepository.getQuestionResults({
          userId: user.id,
          childId: child.id,
          questionCodes: STANDALONE_TESTS.map(test => test.code),
        });
        const byType = {};
        for (const a of all) {
          if (a.child_id !== child.id) continue;
          const type = a.question_code;
          const prev = byType[type];
          if (!prev || a.assessment_date > prev.assessment_date ||
              (a.assessment_date === prev.assessment_date && a.created_at > prev.created_at)) {
            byType[type] = a;
          }
        }
        setLatestByType(byType);
      })();
    }, [assessmentsRepository, child.id, user.id, pageVersion, runVersion])
  );

  return (
    <ScrollView onScroll={onScroll} scrollEventThrottle={16} style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text variant="titleLarge" style={styles.childName}>{childName}</Text>
      <Text variant="bodyMedium" style={styles.subtitle}>Assessment Summary</Text>
      <Text variant="bodyMedium" style={styles.readingLevel}>
        Current reading level: {child.reading_level || 'Not set'}
      </Text>

      {STANDALONE_TESTS.map(({ code, title }) => {
        const assessment = latestByType[code];
        const accuracy = assessment?.derived?.percent;

        return (
          <SurfaceCard key={code} style={styles.card}>
            <Text variant="titleMedium" style={styles.cardTitle}>{title}</Text>
            <Text variant="bodySmall" style={styles.cardDescription}>{code === 'letter_sounds' ? '60-second letter sound test' : '60-second word reading test'}</Text>

            {assessment ? (
              <View style={styles.scoreSection}>
                <View style={styles.scoreRow}>
                  <View style={[styles.accuracyBadge, { backgroundColor: getFeedbackColor(accuracy) }]}>
                    <Text style={styles.accuracyText}>{accuracy != null ? `${accuracy}%` : assessment.score}</Text>
                  </View>
                  <View style={styles.scoreDetails}>
                    <Text variant="bodyMedium" style={styles.scoreLabel}>
                      {assessment.score} / {assessment.total_items} correct
                    </Text>
                    <Text variant="bodySmall" style={styles.dateText}>
                      {formatDate(assessment.assessment_date)}
                    </Text>
                  </View>
                </View>

                {!assessment.battery_run_id && <View style={styles.cardButtons}>
                  <BrandButton size="md"
                    variant="secondary"
                    onPress={() => navigation.navigate('AssessmentDetail', {
                      assessmentId: assessment.id,
                      childName,
                    })}
                    label="View detail"
                  />
                </View>}
              </View>
            ) : (
              <View style={styles.notAssessed}>
                <Text variant="bodyMedium" style={styles.notAssessedText}>
                  Not yet assessed
                </Text>
                <BrandButton size="md"
                  variant="primary"
                  onPress={() => handleRunAssessment(code)}
                  style={styles.runButton}
                  label="Run assessment"
                />
              </View>
            )}
          </SurfaceCard>
        );
      })}

      {/* Letter mastery — embedded panel (one source of truth) */}
      <SurfaceCard style={styles.card}>
        <Text variant="titleMedium" style={styles.cardTitle}>Letter Tracker</Text>
        <Text variant="bodySmall" style={styles.cardDescription}>
          Tap letters to mark them as taught
        </Text>
        <LetterMasteryPanel child={child} classItem={classItem} isDelivery={isDelivery} />
      </SurfaceCard>
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
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  readingLevel: {
    color: colors.text,
    fontFamily: fontFamilies.textSemi,
    marginBottom: spacing.lg,
  },
  card: {
    marginBottom: spacing.md,
  },
  cardTitle: {
    color: colors.text,
    fontFamily: fontFamilies.textSemi,
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
    color: colors.onDark,
    ...typeRoles.textButtonL,
    fontVariant: ['tabular-nums'],
  },
  scoreDetails: {
    flex: 1,
  },
  scoreLabel: {
    color: colors.text,
    fontFamily: fontFamilies.textSemi,
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
});
