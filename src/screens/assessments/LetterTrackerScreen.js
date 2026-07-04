import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, spacing } from '../../constants/colors';
import LetterMasteryPanel from '../../components/assessment/LetterMasteryPanel';

export default function LetterTrackerScreen({ route }) {
  const { child, classItem } = route.params;
  const childName = `${child.first_name} ${child.last_name}`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="titleLarge" style={styles.childName}>{childName}</Text>
      <LetterMasteryPanel child={child} classItem={classItem} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  childName: {
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
});
