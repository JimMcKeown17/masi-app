import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing } from '../../constants/colors';

export default function TimeTrackingScreen() {
  return (
    <View style={styles.container}>
      <Text variant="titleLarge">Time Tracking</Text>
      <Text variant="bodyMedium">Sign in/out functionality will be implemented here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
});
