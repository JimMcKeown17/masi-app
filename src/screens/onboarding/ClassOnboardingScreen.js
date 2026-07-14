import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, Text } from 'react-native-paper';
import { useClasses } from '../../context/ClassesContext';
import { borderRadius, colors, shadows, spacing } from '../../constants/colors';

export default function ClassOnboardingScreen({ navigation }) {
  const { classBootstrapStatus, loadClasses } = useClasses();
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (classBootstrapStatus === 'available') {
      navigation.goBack();
    }
  }, [classBootstrapStatus, navigation]);

  const retryCheck = async () => {
    setRetrying(true);
    try {
      await loadClasses();
    } finally {
      setRetrying(false);
    }
  };

  const startClassCreation = (acknowledgedDuplicateRisk = false) => {
    navigation.replace('CreateClass', {
      onboarding: true,
      acknowledgedDuplicateRisk,
    });
  };

  if (classBootstrapStatus === 'checking') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text variant="titleMedium" style={styles.loadingTitle}>Checking your setup</Text>
        <Text variant="bodyMedium" style={styles.centeredText}>
          Looking for classes assigned by Head Office...
        </Text>
      </View>
    );
  }

  if (classBootstrapStatus === 'no_active_programme') {
    return (
      <View style={styles.centered}>
        <Text variant="headlineSmall" style={styles.title}>Programme setup needed</Text>
        <Text variant="bodyMedium" style={styles.centeredText}>
          Head Office must assign your active programme before you can create a class.
        </Text>
        <Button mode="outlined" onPress={retryCheck} loading={retrying} disabled={retrying}>
          Check Again
        </Button>
      </View>
    );
  }

  const backendUnconfirmed = classBootstrapStatus === 'unconfirmed_empty';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text variant="labelLarge" style={styles.stepLabel}>STEP 1 OF 2</Text>
      <Text variant="headlineMedium" style={styles.title}>
        {backendUnconfirmed
          ? 'We could not confirm your Head Office setup'
          : 'Let’s set up your first class'}
      </Text>
      <Text variant="bodyLarge" style={styles.intro}>
        Your class connects the children you will work with. You can add them next, and every change
        will be saved on this phone before it syncs.
      </Text>

      {backendUnconfirmed ? (
        <Card style={styles.warningCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.warningTitle}>Backend check unavailable</Text>
            <Text variant="bodyMedium" style={styles.warningText}>
              This phone has no cached classes, but it could not reach the backend. Head Office may
              already have assigned a class that has not downloaded yet. Creating one now may create
              a duplicate class when the device reconnects.
            </Text>
          </Card.Content>
        </Card>
      ) : (
        <Card style={styles.infoCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.infoTitle}>No assigned classes found</Text>
            <Text variant="bodyMedium" style={styles.infoText}>
              The backend check completed successfully, so you can create your class here.
            </Text>
          </Card.Content>
        </Card>
      )}

      {backendUnconfirmed ? (
        <>
          <Button
            mode="contained"
            onPress={() => startClassCreation(true)}
            style={styles.primaryButton}
          >
            Create locally anyway
          </Button>
          <Button
            mode="outlined"
            onPress={retryCheck}
            loading={retrying}
            disabled={retrying}
            style={styles.secondaryButton}
          >
            Retry Backend Check
          </Button>
        </>
      ) : (
        <Button
          mode="contained"
          onPress={() => startClassCreation(false)}
          style={styles.primaryButton}
        >
          Create My Class
        </Button>
      )}

      <Text variant="bodySmall" style={styles.progressHint}>
        Next: add your children.
      </Text>
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
    padding: spacing.lg,
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  centeredText: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  loadingTitle: {
    color: colors.text,
    marginTop: spacing.md,
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
  warningCard: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  warningTitle: {
    color: colors.warningText,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  warningText: {
    color: colors.warningText,
    lineHeight: 21,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  infoTitle: {
    color: colors.text,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  infoText: {
    color: colors.textSecondary,
    lineHeight: 21,
  },
  primaryButton: {
    marginTop: spacing.sm,
  },
  secondaryButton: {
    marginTop: spacing.md,
  },
  progressHint: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
