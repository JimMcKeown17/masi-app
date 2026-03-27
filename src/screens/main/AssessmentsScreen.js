import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Card } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';
import { useChildren } from '../../context/ChildrenContext';
import { storage } from '../../utils/storage';
import { getAssessmentsTabStats } from '../../utils/dashboardStats';
import StatBar from '../../components/dashboard/StatBar';

export default function AssessmentsScreen({ navigation }) {
  const { children: childrenList } = useChildren();
  const [stats, setStats] = useState(null);

  useFocusEffect(
    useCallback(() => {
      const loadStats = async () => {
        const assessments = await storage.getAssessments();
        setStats(getAssessmentsTabStats(childrenList, assessments));
      };
      loadStats();
    }, [childrenList])
  );

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

      <Text variant="titleLarge" style={styles.title}>Assessments</Text>
      <Text variant="bodyMedium" style={styles.description}>
        Run timed assessments and view results.
      </Text>

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
            onPress={() => navigation.navigate('AssessmentChildSelect')}
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
  title: {
    marginBottom: spacing.sm,
  },
  description: {
    marginBottom: spacing.xl,
    color: colors.textSecondary,
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
