import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, colors, spacing } from '../../constants/colors';

export default function AssessmentInstructions({
  title,
  childName,
  language,
  attemptNumber,
  steps,
  onStart,
  onCancel,
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.instructionsContainer}>
        <Text variant="headlineSmall" style={styles.instructionsTitle}>
          {title}
        </Text>
        <Text variant="bodyLarge" style={styles.instructionsChild}>
          {childName}
        </Text>
        <Text variant="bodyMedium" style={styles.instructionsLanguage}>
          {language} - Attempt #{attemptNumber}
        </Text>

        <View style={styles.instructionsBox}>
          {steps.map((step) => (
            <Text key={step} variant="bodyMedium" style={styles.instructionsText}>
              {step}
            </Text>
          ))}
        </View>

        <Button
          mode="contained"
          onPress={onStart}
          style={styles.startButton}
          contentStyle={styles.startButtonContent}
        >
          Start Assessment
        </Button>
        <Button mode="outlined" onPress={onCancel}>
          Cancel
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  instructionsContainer: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  instructionsTitle: {
    textAlign: 'center',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  instructionsChild: {
    textAlign: 'center',
    color: colors.primary,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  instructionsLanguage: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  instructionsBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  instructionsText: {
    color: colors.text,
  },
  startButton: {
    marginBottom: spacing.md,
  },
  startButtonContent: {
    paddingVertical: spacing.sm,
  },
});
