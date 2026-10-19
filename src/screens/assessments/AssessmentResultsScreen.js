import { useHeaderHairline } from '../../components/common/ScreenHeader';
import BrandButton from '../../components/common/BrandButton';
import SurfaceCard from '../../components/common/SurfaceCard';
import { fontFamilies, typeRoles } from '../../constants/typography';
import React, { useRef } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, shadows } from '../../constants/colors';
import AssessmentDetailGrid from '../../components/assessment/AssessmentDetailGrid';
import { resolveAssessmentRoute } from '../../utils/assessmentRouting';

function getFeedback(accuracy) {
  if (accuracy >= 90) return { message: 'Excellent work!', color: colors.success };
  if (accuracy >= 75) return { message: 'Great job!', color: colors.success };
  if (accuracy >= 60) return { message: 'Good effort!', color: colors.primary };
  if (accuracy >= 40) return { message: 'Nice try!', color: colors.accent };
  return { message: 'Keep practicing!', color: colors.primary, graphicColor: colors.emphasis };
}

function StatCard({ value, label, accentColor }) {
  return (
    <SurfaceCard style={[styles.statCard, { borderTopColor: accentColor }]}>
      <Text style={[styles.statValue, { color: accentColor === colors.emphasis ? colors.primary : accentColor }]}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </SurfaceCard>
  );
}

export default function AssessmentResultsScreen({ navigation, route }) {
  const onScroll = useHeaderHairline();
  const { assessment, child, letterSet, attemptNumber, assessmentType = 'letter_egra' } = route.params;
  const incorrect = assessment.letters_attempted - assessment.correct_responses;
  const feedback = getFeedback(assessment.accuracy);
  const insets = useSafeAreaInsets();
  const launchingRef = useRef(false);

  const handleTryAgain = async () => {
    if (launchingRef.current) return;
    launchingRef.current = true;
    try {
      const { screenName, captureMode } = await resolveAssessmentRoute();
      navigation.replace(screenName, {
        child,
        letterSet,
        attemptNumber: attemptNumber + 1,
        assessmentType,
        captureMode,
      });
    } finally {
      launchingRef.current = false;
    }
  };

  const handleDone = () => {
    navigation.navigate('MainTabs', { screen: 'Assessments' });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={styles.scrollContent}>
        <Text variant="headlineSmall" style={styles.title}>Assessment Complete</Text>
        <Text variant="bodyLarge" style={styles.childName}>
          {child.first_name} {child.last_name}
        </Text>
        <Text variant="bodyMedium" style={styles.meta}>
          {letterSet.language} - Attempt #{attemptNumber}
        </Text>

        {/* Hero result section */}
        <View style={styles.heroSection}>
          <View style={[styles.accuracyRing, { borderColor: feedback.graphicColor ?? feedback.color }]}>
            <Text
              accessibilityLabel="Assessment main result"
              style={[styles.accuracyNumber, { color: feedback.color }]}
            >
              {assessment.correct_responses}
            </Text>
          </View>
          <Text variant="headlineSmall" style={[styles.feedbackText, { color: feedback.color }]}>
            {feedback.message}
          </Text>
          <Text variant="bodyMedium" style={styles.accuracyText}>
            {assessment.accuracy}% correct
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

        <View style={styles.gridSection}>
          <AssessmentDetailGrid assessment={assessment} letterSet={letterSet} />
        </View>
      </ScrollView>

      <View style={[styles.buttonRow, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <BrandButton variant="secondary" onPress={handleTryAgain} style={styles.button} label="Try again" />
        <BrandButton variant="primary" onPress={handleDone} style={styles.button} label="Done" />
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
    fontFamily: fontFamilies.textSemi,
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
    ...typeRoles.display2XL,
    fontVariant: ['tabular-nums'],
  },
  feedbackText: {
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  timeText: {
    color: colors.textSecondary,
  },
  accuracyText: {
    color: colors.textSecondary,
    marginBottom: 2,
  },
  // Stat cards
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  gridSection: {
    width: '100%',
    marginTop: spacing.xl,
  },
  statCard: {
    flex: 1,
    borderTopWidth: 3,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  statValue: {
    ...typeRoles.displayTitle,
    fontVariant: ['tabular-nums'],
    marginBottom: spacing.xs,
  },
  statLabel: {
    ...typeRoles.textLabel,
    color: colors.textSecondary,
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
