import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing } from '../../constants/colors';

export default function ChildrenListScreen() {
  return (
    <View style={styles.container}>
      <Text variant="titleLarge">My Children</Text>
      <Text variant="bodyMedium">List of assigned children will be displayed here.</Text>
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
