import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { tokens } from '../theme/tokens';
import { ContentText, UiText } from './Text';

/** Assessor choices wrap independently so large text never squeezes a choice. */
export function AssessmentChoiceCard({ prompt, guide, choices, selected, onSelect, testID }: {
  prompt: string;
  guide: string;
  choices: ReadonlyArray<{ value: string; label: string }>;
  selected?: string;
  onSelect: (value: string) => void;
  testID: string;
}) {
  return <View testID={testID} style={styles.card}>
    <ContentText size="promptCard">{prompt}</ContentText>
    <UiText variant="caption" tone="muted">{guide}</UiText>
    <View style={styles.choices}>
      {choices.map(choice => <Pressable key={choice.value} accessibilityRole="button"
        accessibilityLabel={choice.label} accessibilityState={{ selected: selected === choice.value }}
        onPress={() => onSelect(choice.value)} style={({ pressed }) => [styles.choice,
          selected === choice.value && styles.selected, { opacity: pressed ? 0.85 : 1 }]}>
        <UiText variant="label" tone={selected === choice.value ? 'onInk' : 'ink'}>{choice.label}</UiText>
      </Pressable>)}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: tokens.color.surface, borderRadius: tokens.radius.card, padding: tokens.space.lg, gap: tokens.space.sm },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm },
  choice: { minHeight: 48, justifyContent: 'center', padding: tokens.space.md, borderRadius: tokens.radius.pill, borderColor: tokens.color.line, borderWidth: 1 },
  selected: { backgroundColor: tokens.color.ink, borderColor: tokens.color.ink },
});
