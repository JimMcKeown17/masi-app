import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Card, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';
import { useChildren } from '../../context/ChildrenContext';
import { assessmentsRepository } from '../../db/repositories/assessmentsRepository';
import { getAssessmentsTabStats } from '../../utils/dashboardStats';
import StatBar from '../../components/dashboard/StatBar';
import { getActiveProgrammeGate } from '../../services/activeProgrammeGate';
import NoActiveProgrammeNotice from '../../components/common/NoActiveProgrammeNotice';
import SectionHeader from '../../components/common/SectionHeader';

export default function AssessmentsScreen({ navigation }) {
  const { user } = useAuth();
  const { children: childrenList } = useChildren();
  const [stats, setStats] = useState(null);
  const [programmeGate, setProgrammeGate] = useState(null);

  useFocusEffect(
    useCallback(() => {
      const loadStats = async () => {
        try {
          setProgrammeGate(await getActiveProgrammeGate({ userId: user.id }));
        } catch (error) {
          console.error('Error resolving active programme gate:', error);
          // Never strand the tab on the spinner; the data layer still guards the
          // write at save, so fall back to the usable capture UI on a read error.
          setProgrammeGate({ hasActiveProgramme: true, programme: null });
        }
        const assessments = await assessmentsRepository.getAssessments({ userId: user.id });
        setStats(getAssessmentsTabStats(childrenList, assessments));
      };
      loadStats();
    }, [childrenList, user.id])
  );

  // Hold the capture UI until the programme check resolves, so an unassigned EA
  // can't tap through to a failing flow during the first (cold) gate resolve.
  if (programmeGate === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Gate programme-dependent capture: an unassigned EA sees an actionable
  // empty-state instead of an assessment that fails at save.
  if (!programmeGate.hasActiveProgramme) {
    return (
      <View style={styles.container}>
        <NoActiveProgrammeNotice action="run assessments" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Tab Stats */}
      {stats && (
        <StatBar items={[
          { label: '% Assessed', value: `${stats.percentAssessed}%`, color: stats.percentAssessed >= 75 ? colors.success : colors.primary },
          { label: 'Total', value: stats.totalAssessments },
          { label: 'Avg Accuracy', value: `${stats.avgAccuracy}%` },
        ]} />
      )}

      <SectionHeader title="Assessments" subtitle="Run timed assessments and view results." />

      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.cardTitle}>
            Letter Sound Assessment (EGRA)
          </Text>
          <Text variant="bodySmall" style={styles.cardDescription}>
            60-second timed letter sound recognition test
          </Text>
        </Card.Content>
        <Card.Actions style={styles.cardActions}>
          <Button
            mode="contained"
            onPress={() => navigation.navigate('AssessmentChildSelect', { assessmentType: 'letter_egra' })}
          >
            Start Assessment
          </Button>
        </Card.Actions>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.cardTitle}>
            Word Reading Assessment (EGRA)
          </Text>
          <Text variant="bodySmall" style={styles.cardDescription}>
            60-second timed word reading fluency test
          </Text>
        </Card.Content>
        <Card.Actions style={styles.cardActions}>
          <Button
            mode="contained"
            onPress={() => navigation.navigate('AssessmentChildSelect', { assessmentType: 'word_egra' })}
          >
            Start Assessment
          </Button>
        </Card.Actions>
      </Card>

      <Button
        mode="outlined"
        onPress={() => navigation.navigate('AssessmentHistory')}
        style={styles.historyButton}
      >
        View History
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  cardTitle: {
    color: colors.text,
    marginBottom: spacing.xs,
  },
  cardDescription: {
    color: colors.textSecondary,
  },
  cardActions: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  historyButton: {
    marginTop: spacing.sm,
  },
});
