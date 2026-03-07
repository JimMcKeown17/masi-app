import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Card } from 'react-native-paper';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';

export default function AssessmentsScreen({ navigation }) {
  return (
    <View style={styles.container}>
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
