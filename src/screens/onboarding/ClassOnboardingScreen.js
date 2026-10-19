import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { useClasses } from '../../context/ClassesContext';
import { colors, spacing } from '../../constants/colors';

import BrandButton from '../../components/common/BrandButton';
import SurfaceCard from '../../components/common/SurfaceCard';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { typeRoles } from '../../constants/typography';

export default function ClassOnboardingScreen({ navigation }) {
  const onScroll = useHeaderHairline();
  const paddingBottom = useScrollBottomPadding(spacing.lg);
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
        <BrandButton variant="secondary" onPress={retryCheck} loading={retrying} disabled={retrying} label="Check again" />
      </View>
    );
  }

  const backendUnconfirmed = classBootstrapStatus === 'unconfirmed_empty';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom }]}
      keyboardShouldPersistTaps="handled"
      onScroll={onScroll}
      scrollEventThrottle={16}
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
        <SurfaceCard style={styles.warningCard}>
          <Text variant="titleMedium" style={styles.warningTitle}>Backend check unavailable</Text>
          <Text variant="bodyMedium" style={styles.warningText}>
            This phone has no cached classes, but it could not reach the backend. Head Office may
            already have assigned a class that has not downloaded yet. Creating one now may create
            a duplicate class when the device reconnects.
          </Text>
        </SurfaceCard>
      ) : (
        <SurfaceCard style={styles.infoCard}>
          <Text variant="titleMedium" style={styles.infoTitle}>No assigned classes found</Text>
          <Text variant="bodyMedium" style={styles.infoText}>
            The backend check completed successfully, so you can create your class here.
          </Text>
        </SurfaceCard>
      )}

      {backendUnconfirmed ? (
        <>
          <BrandButton
            onPress={() => startClassCreation(true)}
            style={styles.primaryButton}
            variant="primary" size="lg" label="Create locally anyway"
          />
          <BrandButton
            onPress={retryCheck}
            loading={retrying}
            disabled={retrying}
            style={styles.secondaryButton}
            variant="secondary" size="lg" label="Retry backend check"
          />
        </>
      ) : (
        <BrandButton
          onPress={() => startClassCreation(false)}
          style={styles.primaryButton}
          variant="primary" size="lg" label="Create my class"
        />
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
    ...typeRoles.textSectionLabel,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    marginBottom: spacing.md,
  },
  intro: {
    color: colors.textSecondary,
    ...typeRoles.textBodyL,
    marginBottom: spacing.lg,
  },
  warningCard: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warning,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  warningTitle: {
    color: colors.warningText,
    ...typeRoles.textRowTitle,
    marginBottom: spacing.sm,
  },
  warningText: {
    color: colors.warningText,
    ...typeRoles.textParagraph,
  },
  infoCard: {
    backgroundColor: colors.surface,
    marginBottom: spacing.lg,
  },
  infoTitle: {
    color: colors.text,
    ...typeRoles.textRowTitle,
    marginBottom: spacing.sm,
  },
  infoText: {
    color: colors.textSecondary,
    ...typeRoles.textParagraph,
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
