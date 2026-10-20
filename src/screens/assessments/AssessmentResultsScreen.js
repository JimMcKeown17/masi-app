import { useHeaderHairline } from '../../components/common/ScreenHeader';
import BrandButton from '../../components/common/BrandButton';
import SurfaceCard from '../../components/common/SurfaceCard';
import { fontFamilies, typeRoles } from '../../constants/typography';
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, shadows } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { useSignedInEA } from '../../context/SignedInEAContext';
import { STANDALONE_TESTS } from '../../utils/assessmentRegistry';

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
      <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {label}
      </Text>
    </SurfaceCard>
  );
}

export default function AssessmentResultsScreen({ navigation, route }) {
  const onScroll = useHeaderHairline();
  const { assessmentId, testCode, child, languageCode } = route.params;
  const { user } = useAuth();
  const { repositories } = useSignedInEA();
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const insets = useSafeAreaInsets();
  const launchingRef = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    repositories.assessments.getQuestionResults({ userId: user.id, assessmentId })
      .then(results => { if (active) setAssessment(results[0] ?? null); })
      .catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [assessmentId, repositories, user.id]);

  const handleTryAgain = () => {
    if (launchingRef.current) return;
    launchingRef.current = true;
    navigation.replace('StandaloneTest', { testCode, child, languageCode });
  };

  const handleDone = () => {
    navigation.navigate('MainTabs', { screen: 'Assessments' });
  };

  if (loading || loadError || !assessment) {
    return <View style={[styles.container, styles.scrollContent, { paddingTop: insets.top }]}>
      <Text style={styles.meta}>{loading ? 'Loading result…' : loadError ? "Couldn't load this result." : 'Result not found.'}</Text>
    </View>;
  }

  const attempted = assessment.derived.total_attempted ?? assessment.items.filter(item => item.metadata?.reached !== false).length;
  const accuracy = assessment.derived.percent ?? (attempted ? assessment.score / attempted * 100 : 0);
  const incorrect = attempted - assessment.score;
  const feedback = getFeedback(accuracy);
  const testTitle = STANDALONE_TESTS.find(test => test.code === testCode)?.title;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={styles.scrollContent}>
        <Text variant="headlineSmall" style={styles.title}>Assessment Complete</Text>
        <Text variant="bodyLarge" style={styles.childName}>
          {child.first_name} {child.last_name}
        </Text>
        <Text variant="bodyMedium" style={styles.meta}>
          {testTitle}
        </Text>

        {/* Hero result section */}
        <View style={styles.heroSection}>
          <View style={[styles.accuracyRing, { borderColor: feedback.graphicColor ?? feedback.color }]}>
            <Text
              accessibilityLabel="Assessment main result"
              style={[styles.accuracyNumber, { color: feedback.color }]}
            >
              {assessment.score} / {assessment.total_items}
            </Text>
          </View>
          <Text variant="headlineSmall" style={[styles.feedbackText, { color: feedback.color }]}>
            {feedback.message}
          </Text>
          <Text variant="bodyMedium" style={styles.accuracyText}>
            {Math.round(accuracy)}% correct
          </Text>
          {assessment.stopped_reason === 'stop_rule' && (
            <Text variant="bodyMedium" style={styles.stopReason}>Stopped: 10 in a row wrong</Text>
          )}
          <Text variant="bodyMedium" style={styles.timeText}>
            Completed in {Math.round((assessment.duration_ms ?? 0) / 1000)}s
          </Text>
        </View>

        {/* Supporting stat cards */}
        <View style={styles.statsRow}>
          <StatCard
            value={attempted}
            label="Attempted"
            accentColor={colors.primary}
          />
          <StatCard
            value={assessment.score}
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
        <BrandButton variant="secondary" onPress={handleTryAgain} style={styles.button} label="Try again" />
        <BrandButton variant="primary" onPress={handleDone} style={styles.button} label="Done" />
      </View>
    </View>
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
    ...typeRoles.displayXL,
    fontVariant: ['tabular-nums'],
  },
  feedbackText: {
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  stopReason: {
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.sm,
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
