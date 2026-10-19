import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import BrandButton from '../../components/common/BrandButton';
import { JOB_TITLE_CODES } from '../../constants/jobTitles';
import LiteracySessionForm from './LiteracySessionForm';

export default function SessionFormScreen({ navigation }) {
  const { profile, refreshProfile } = useAuth();

  if (!profile) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Loading your profile...</Text>
        <BrandButton variant="tertiary" label="Retry" onPress={refreshProfile} />
      </View>
    );
  }

  if (profile?.jobTitleCode === JOB_TITLE_CODES.LITERACY_COACH) {
    return <LiteracySessionForm navigation={navigation} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.message}>
        Session forms for {profile?.jobTitleName || 'your role'} are coming soon.
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
