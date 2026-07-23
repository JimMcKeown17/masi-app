import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import SectionHeader from '../../components/common/SectionHeader';
import { borderRadius, colors, spacing } from '../../constants/colors';

const INSIGHTS = [
  {
    label: 'Letter Mastery',
    description: 'See which letters children know and where support is needed.',
    icon: 'school-outline',
    route: 'LetterMasteryRanking',
  },
  {
    label: 'Assessment Scores',
    description: 'Compare the latest literacy assessment results.',
    icon: 'clipboard-outline',
    route: 'AssessmentRanking',
  },
  {
    label: 'Session Count',
    description: 'Review how often each child has attended a session.',
    icon: 'bar-chart-outline',
    route: 'SessionCountRanking',
  },
];

export default function InsightsScreen({ navigation }) {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <SectionHeader
        title="Insights"
        subtitle="Review learner progress and participation."
      />

      <View style={styles.list}>
        {INSIGHTS.map((insight) => (
          <Pressable
            key={insight.route}
            onPress={() => navigation.navigate(insight.route)}
            accessibilityRole="button"
            accessibilityLabel={'Open ' + insight.label}
            style={styles.card}
          >
            <View style={styles.icon}>
              <Ionicons name={insight.icon} size={22} color={colors.primary} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.title}>{insight.label}</Text>
              <Text style={styles.description}>{insight.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
  },
  list: {
    gap: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 88,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  icon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.sm,
    borderCurve: 'continuous',
    backgroundColor: colors.red50,
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  description: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
});
