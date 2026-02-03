import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing } from '../../constants/colors';
import { JOB_TITLES } from '../../constants/jobTitles';
import LiteracySessionForm from './LiteracySessionForm';

export default function SessionFormScreen({ navigation }) {
  const { profile } = useAuth();

  if (profile?.job_title === JOB_TITLES.LITERACY_COACH) {
    return <LiteracySessionForm navigation={navigation} />;
  }

  return (
    <View style={styles.container}>
      <Text variant="titleLarge" style={styles.title}>New Session</Text>
      <Text variant="bodyMedium" style={styles.message}>
        Session forms for {profile?.job_title || 'your role'} are coming soon.
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
  title: {
    marginBottom: spacing.md,
    color: colors.text,
  },
  message: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
