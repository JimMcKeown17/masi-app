import { useSignedInEA } from '../../context/SignedInEAContext';
import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing } from '../../constants/colors';
import { useChildren } from '../../context/ChildrenContext';

import { getAssessmentsTabStats } from '../../utils/dashboardStats';
import StatBar from '../../components/dashboard/StatBar';
import { getActiveProgrammeGate } from '../../services/activeProgrammeGate';
import NoActiveProgrammeNotice from '../../components/common/NoActiveProgrammeNotice';
import SurfaceCard from '../../components/common/SurfaceCard';
import BrandButton from '../../components/common/BrandButton';
import { typeRoles } from '../../constants/typography';

export default function AssessmentsScreen({ navigation }) {
  const { handle, repositories } = useSignedInEA();
  const { assessments: assessmentsRepository } = repositories;

  const { user } = useAuth();
  const { children: childrenList } = useChildren();
  const [stats, setStats] = useState(null);
  const [programmeGate, setProgrammeGate] = useState(null);

  useFocusEffect(
    useCallback(() => {
      const loadStats = async () => {
        try {
          setProgrammeGate(await getActiveProgrammeGate({ handle, userId: user.id }));
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

      <Text style={styles.hint}>Run timed assessments and view results.</Text>

      <SurfaceCard style={styles.card}>
        <Text variant="titleMedium" style={styles.cardTitle}>
          Letter Sound Assessment (EGRA)
        </Text>
        <Text variant="bodySmall" style={styles.cardDescription}>
          60-second timed letter sound recognition test
        </Text>
        <View style={styles.cardActions}>
          <BrandButton
            size="md"
            variant="primary"
            onPress={() => navigation.navigate('AssessmentChildSelect', { assessmentType: 'letter_egra' })}
            label="Start assessment"
          />
        </View>
      </SurfaceCard>

      <SurfaceCard style={styles.card}>
        <Text variant="titleMedium" style={styles.cardTitle}>
          Word Reading Assessment (EGRA)
        </Text>
        <Text variant="bodySmall" style={styles.cardDescription}>
          60-second timed word reading fluency test
        </Text>
        <View style={styles.cardActions}>
          <BrandButton
            size="md"
            variant="primary"
            onPress={() => navigation.navigate('AssessmentChildSelect', { assessmentType: 'word_egra' })}
            label="Start assessment"
          />
        </View>
      </SurfaceCard>

      <BrandButton size="md"
        variant="secondary"
        onPress={() => navigation.navigate('AssessmentHistory')}
        style={styles.historyButton}
        label="View history"
      />
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
  hint: { ...typeRoles.textParagraph, color: colors.textSecondary, marginBottom: spacing.md },
  card: {
    marginBottom: spacing.md,
  },
  cardTitle: {
    color: colors.text,
    marginBottom: spacing.xs,
  },
  cardDescription: {
    color: colors.textSecondary,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  historyButton: {
    marginTop: spacing.sm,
  },
});
