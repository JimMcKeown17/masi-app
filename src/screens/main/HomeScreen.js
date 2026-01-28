import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Card, Text, Button } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, borderRadius, shadows } from '../../constants/colors';

export default function HomeScreen({ navigation }) {
  const { profile, signOut } = useAuth();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text variant="titleLarge" style={styles.welcomeText}>
          Welcome, {profile?.first_name || 'User'}!
        </Text>
        <Text variant="bodyMedium" style={styles.roleText}>
          {profile?.job_title || 'Field Staff'}
        </Text>
        {profile?.assigned_school && (
          <Text variant="bodyMedium" style={styles.schoolText}>
            {profile.assigned_school}
          </Text>
        )}
      </View>

      <View style={styles.content}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge">Quick Start</Text>
            <Text variant="bodyMedium" style={styles.description}>
              Use the tabs below to:
            </Text>
            <Text variant="bodyMedium" style={styles.listItem}>• Track your work time</Text>
            <Text variant="bodyMedium" style={styles.listItem}>• View and manage children</Text>
            <Text variant="bodyMedium" style={styles.listItem}>• Record and review sessions</Text>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge">Profile & Settings</Text>
            <Text variant="bodyMedium" style={styles.description}>
              Manage your account and preferences
            </Text>
            <Button
              mode="outlined"
              onPress={() => navigation.navigate('Profile')}
              style={styles.profileButton}
            >
              View Profile
            </Button>
          </Card.Content>
        </Card>

        <Button
          mode="text"
          onPress={signOut}
          style={styles.signOutButton}
        >
          Sign Out
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: spacing.lg,
    backgroundColor: colors.primary,  // Brand blue
  },
  welcomeText: {
    color: '#FFFFFF',
    marginBottom: spacing.xs,
  },
  roleText: {
    color: '#FFFFFF',
    opacity: 0.95,
  },
  schoolText: {
    color: '#FFFFFF',
    opacity: 0.9,
    marginTop: spacing.xs,
  },
  content: {
    padding: spacing.md,
  },
  card: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,  // 16px rounded corners
    ...shadows.card,                // Subtle shadow
  },
  description: {
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  listItem: {
    color: colors.textSecondary,
    marginLeft: spacing.sm,
    marginBottom: spacing.xs,
  },
  profileButton: {
    marginTop: spacing.sm,
  },
  signOutButton: {
    marginTop: spacing.lg,
  },
});
