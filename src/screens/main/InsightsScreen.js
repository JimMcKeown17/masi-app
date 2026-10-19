import { useHeaderHairline } from '../../components/common/ScreenHeader';
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import ListGroup from '../../components/common/ListGroup';
import ListRow from '../../components/common/ListRow';
import IconTile from '../../components/common/IconTile';
import { typeRoles } from '../../constants/typography';
import { colors, spacing } from '../../constants/colors';

const INSIGHTS = [
  {
    label: 'Letter mastery',
    description: 'See which letters children know and where support is needed.',
    icon: 'school-outline',
    route: 'LetterMasteryRanking',
  },
  {
    label: 'Assessment scores',
    description: 'Compare the latest literacy assessment results.',
    icon: 'clipboard-outline',
    route: 'AssessmentRanking',
  },
  {
    label: 'Session count',
    description: 'Review how often each child has attended a session.',
    icon: 'bar-chart-outline',
    route: 'SessionCountRanking',
  },
  {
    label: 'Session history',
    description: 'Review the sessions you recorded in the last 30 days.',
    icon: 'time-outline',
    route: 'SessionHistory',
  },
];

export default function InsightsScreen({ navigation }) {
  const onScroll = useHeaderHairline();
  return (
    <ScrollView onScroll={onScroll} scrollEventThrottle={16}
      style={styles.container}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.hint}>Review learner progress and participation.</Text>

      <ListGroup>
        {INSIGHTS.map((insight) => (
          <ListRow key={insight.route} title={insight.label} subtitle={insight.description}
            lead={<IconTile icon={insight.icon} />} trailing="chevron"
            onPress={() => navigation.navigate(insight.route)}
            accessibilityLabel={'Open ' + insight.label} />
        ))}
      </ListGroup>
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
  hint: { ...typeRoles.textParagraph, color: colors.textSecondary, marginBottom: spacing.md },
});
