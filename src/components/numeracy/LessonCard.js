import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, spacing } from '../../constants/colors';
import { typeRoles } from '../../constants/typography';
import { stepTitle, readyLine, needHelpLine, canHelpLine } from '../../numeracyLesson/copy';
import BrandButton from '../common/BrandButton';

export default function LessonCard({ card, curriculum, names, onOpen, onSwap }) {
  const title = stepTitle(curriculum, card.step_key);
  const help = card.help.needHelp.length ? needHelpLine({ curriculum, cardStepKey: card.step_key,
    stillOn: card.stillOn.map(({ childId, stepKey }) => ({ name: names[childId], stepKey })) }) : null;
  const partners = canHelpLine(card.help.canHelp.map(id => names[id]));
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onOpen} style={styles.body}>
      <Text style={styles.label}>{card.slot === 'warm_up' ? 'Warm-up' : 'Activity'}</Text>
      <Text style={styles.detail}>{`${card.minutes} min`}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.detail}>{readyLine(card.readiness)}</Text>
      {help ? <Text style={styles.detail}>{help}</Text> : null}
      {partners ? <Text style={styles.detail}>{partners}</Text> : null}
    </Pressable>
    <BrandButton label="Swap" variant="tertiary" onPress={onSwap} />
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, padding: spacing.md },
  body: { minHeight: 44, gap: spacing.sm },
  label: { ...typeRoles.textBodyStrong, color: colors.textSecondary },
  title: { ...typeRoles.displayHeading, color: colors.text },
  detail: { ...typeRoles.textBody, color: colors.textSecondary },
});
