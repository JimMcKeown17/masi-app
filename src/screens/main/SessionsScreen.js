import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { colors, spacing } from '../../constants/colors';

export default function SessionsScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Text variant="titleLarge" style={styles.title}>Sessions</Text>
      <Text variant="bodyMedium" style={styles.description}>
        Record new sessions and view session history.
      </Text>

      <View style={styles.buttonContainer}>
        <Button
          mode="contained"
          onPress={() => navigation.navigate('SessionForm')}
          style={styles.button}
        >
          Record New Session
        </Button>

        <Button
          mode="outlined"
          onPress={() => navigation.navigate('SessionHistory')}
          style={styles.button}
        >
          View History
        </Button>
      </View>
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
  buttonContainer: {
    gap: spacing.md,
  },
  button: {
    marginBottom: spacing.md,
  },
});
