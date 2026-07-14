import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { Button, Card, Text } from 'react-native-paper';
import { useChildren } from '../../context/ChildrenContext';
import { useClasses } from '../../context/ClassesContext';
import { borderRadius, colors, shadows, spacing } from '../../constants/colors';

const RECOMMENDED_CHILD_COUNT = 10;

export default function ChildOnboardingScreen({ route, navigation }) {
  const { classId } = route.params;
  const { children } = useChildren();
  const { classes, completeClassOnboarding } = useClasses();
  const [finishing, setFinishing] = useState(false);
  const classItem = classes.find(item => item.id === classId);
  const childCount = children.filter(child => child.class_id === classId).length;
  const hasRequiredChild = childCount > 0;
  const childLabel = childCount === 1 ? 'child' : 'children';

  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (hasRequiredChild) return;
    event.preventDefault();
    Alert.alert(
      'Add a child before leaving',
      'Add at least one child to finish setting up this class.'
    );
  }), [hasRequiredChild, navigation]);

  const completeAndExit = async () => {
    setFinishing(true);
    try {
      const result = await completeClassOnboarding(classId);
      if (result.success) {
        navigation.popToTop();
        return;
      }
      Alert.alert(
        'Could not finish setup',
        'Please try again. Your class and saved children are still safe on this phone.'
      );
    } finally {
      setFinishing(false);
    }
  };

  const finishSetup = () => {
    if (!hasRequiredChild) return;
    if (childCount < RECOMMENDED_CHILD_COUNT) {
      Alert.alert(
        'Finish with fewer than 10 children?',
        `You have added ${childCount} ${childLabel}. You can finish now and add more children later.`,
        [
          { text: 'Keep Adding', style: 'cancel' },
          { text: 'Finish Setup', onPress: completeAndExit },
        ]
      );
      return;
    }
    completeAndExit();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text variant="labelLarge" style={styles.stepLabel}>STEP 2 OF 2</Text>
      <Text variant="headlineMedium" style={styles.title}>Add your children</Text>
      <Text variant="bodyLarge" style={styles.intro}>
        Add the children you work with in {classItem?.name || 'this class'}. You can add them one at
        a time and return here after each child.
      </Text>

      <Card style={styles.countCard}>
        <Card.Content>
          <Text variant="headlineSmall" style={styles.count}>
            {childCount} {childLabel} added
          </Text>
          <Text variant="bodyMedium" style={styles.countHint}>
            We recommend adding at least {RECOMMENDED_CHILD_COUNT} children so the class is ready for
            daily work.
          </Text>
        </Card.Content>
      </Card>

      {childCount < RECOMMENDED_CHILD_COUNT ? (
        <Card style={styles.warningCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.warningTitle}>
              {hasRequiredChild ? 'Keep adding children' : 'Add your first child'}
            </Text>
            <Text variant="bodyMedium" style={styles.warningText}>
              {hasRequiredChild
                ? `You have added ${childCount} of the recommended ${RECOMMENDED_CHILD_COUNT} children. You can finish now, but this warning will remain until the class reaches ${RECOMMENDED_CHILD_COUNT}.`
                : `Add at least one child to finish setup. The warning will remain until you have added at least ${RECOMMENDED_CHILD_COUNT} children.`}
            </Text>
          </Card.Content>
        </Card>
      ) : (
        <Card style={styles.successCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.successTitle}>
              Recommended roster reached
            </Text>
            <Text variant="bodyMedium" style={styles.successText}>
              Your class has at least {RECOMMENDED_CHILD_COUNT} children. You can finish setup or add
              more children now.
            </Text>
          </Card.Content>
        </Card>
      )}

      <Button
        mode="contained"
        onPress={() => navigation.navigate('AddChild', { classId })}
        style={styles.primaryButton}
      >
        {hasRequiredChild ? 'Add Another Child' : 'Add First Child'}
      </Button>
      <Button
        mode="outlined"
        onPress={finishSetup}
        disabled={!hasRequiredChild || finishing}
        loading={finishing}
        style={styles.secondaryButton}
      >
        Finish Setup
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  stepLabel: {
    color: colors.primary,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  intro: {
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
  countCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  count: {
    color: colors.text,
    fontWeight: '700',
  },
  countHint: {
    color: colors.textSecondary,
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  warningCard: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warning,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  warningTitle: {
    color: colors.warningText,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  warningText: {
    color: colors.warningText,
    lineHeight: 21,
  },
  successCard: {
    backgroundColor: colors.successBg,
    borderColor: colors.successBorder,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  successTitle: {
    color: colors.successText,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  successText: {
    color: colors.successText,
    lineHeight: 21,
  },
  primaryButton: {
    marginTop: spacing.sm,
  },
  secondaryButton: {
    marginTop: spacing.md,
  },
});
