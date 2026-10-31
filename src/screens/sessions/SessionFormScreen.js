import { useActiveProgrammeSubject } from '../../hooks/useActiveProgrammeSubject';
import React from 'react';
import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import BrandButton from '../../components/common/BrandButton';
import { JOB_TITLE_CODES } from '../../constants/jobTitles';
import LessonPickerScreen from '../lessons/LessonPickerScreen';

export default function SessionFormScreen({ navigation }) {
  const { isMaths, loading, settled } = useActiveProgrammeSubject();
  const { profile, refreshProfile } = useAuth();

  // "Coming soon" is safe to show from a cached maths subject, but the lesson flow can resume a
  // retained literacy draft, so it waits for this screen's own programme read.
  if (loading || (!settled && !isMaths)) {
    return <View style={styles.container}><ActivityIndicator color={colors.primary} /></View>;
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Loading your profile...</Text>
        <BrandButton variant="tertiary" label="Retry" onPress={refreshProfile} />
      </View>
    );
  }

  if (profile?.jobTitleCode === JOB_TITLE_CODES.LITERACY_COACH && !isMaths) {
    return <LessonPickerScreen navigation={navigation} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.message}>
        Session forms for {isMaths ? 'Numeracy' : profile?.jobTitleName || 'your role'} are coming soon.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  message: {
    ...typeRoles.textBody,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
