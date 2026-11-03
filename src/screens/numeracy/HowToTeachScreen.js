import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { getCurriculum, getStep } from '../../../content/numeracy-curriculum';
import { keepSumsTogether } from '../../numeracyLesson/copy';
import { useHeaderHairline } from '../../components/common/ScreenHeader';
import { useScrollBottomPadding } from '../../hooks/useScrollBottomPadding';
import { colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';

export default function HowToTeachScreen({ navigation, route }) {
  const onScroll = useHeaderHairline(navigation);
  // No sticky footer here, so the scroll content clears the navigation bar itself (edge-to-edge).
  const paddingBottom = useScrollBottomPadding();
  const step = getStep(getCurriculum(), route.params?.stepKey);
  const activity = step?.activities.find(item => item.name === route.params?.activity);
  return <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom }]} onScroll={onScroll} scrollEventThrottle={16}>
    {activity ? <>
      <Text style={styles.goal}>{keepSumsTogether(step.goal)}</Text>
      <Text style={styles.heading}>{keepSumsTogether(`${activity.name} · ${activity.minutes} min`)}</Text>
      {activity.how.map((text, index) => <View key={index} style={styles.row}>
        <Text style={styles.body}>{keepSumsTogether(`${index + 1}.`)}</Text>
        <Text style={[styles.body, styles.instruction]}>{keepSumsTogether(text)}</Text>
      </View>)}
      <Text style={styles.body}>{keepSumsTogether(`You need: ${activity.needs}`)}</Text>
    </> : <Text style={styles.body}>{keepSumsTogether("This step isn't in this version of the app.")}</Text>}
  </ScrollView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  heading: { ...typeRoles.displayHeading, color: colors.text },
  goal: { ...typeRoles.textParagraph, color: colors.textSecondary },
  body: { ...typeRoles.textParagraph, color: colors.text },
  instruction: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.sm },
});
