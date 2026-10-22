import React from 'react';
import { Image, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { tokens } from '../theme/tokens';
import { TextLink } from './Button';
import { UiText } from './Text';

export function ScoreChip({ score, selected, accessibilityLabel, onPress, testID }: {
  score: number;
  selected: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, {
        backgroundColor: selected ? tokens.color.ink : tokens.color.surface,
        borderColor: selected ? tokens.color.ink : tokens.color.line,
        opacity: pressed ? 0.85 : 1,
      }]}
    >
      <UiText variant="label" tone={selected ? 'onInk' : 'ink'}>{score}</UiText>
    </Pressable>
  );
}

export function RubricRow({ label, chipsTestID, viewRubricTestID, onViewRubric, gloss, children }: {
  label: string;
  chipsTestID: string;
  viewRubricTestID: string;
  onViewRubric: () => void;
  gloss?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <UiText variant="label" style={{ flexShrink: 1 }}>{label}</UiText>
        <TextLink label="View full rubric" testID={viewRubricTestID} onPress={onViewRubric} />
      </View>
      <View testID={chipsTestID} style={styles.chips}>{children}</View>
      {gloss ? <UiText variant="caption" tone="muted">{gloss}</UiText> : null}
    </View>
  );
}

/** The optional story prompt keeps its image and alt-text fallback in one tap target. */
export function RubricPictureThumbnail({ source, alt, onPress }: {
  source: ImageSourcePropType | null;
  alt: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID="picture-thumbnail"
      accessibilityRole="button"
      accessibilityLabel={alt}
      onPress={onPress}
      style={({ pressed }) => [styles.thumbnail, { opacity: pressed ? 0.85 : 1 }]}
    >
      {source ? <Image source={source} style={styles.thumbnailImage} accessibilityLabel={alt} /> : null}
      <UiText variant="caption" style={{ flex: 1 }}>{alt}</UiText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    width: 52, height: 52, borderRadius: tokens.radius.tile, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  card: {
    backgroundColor: tokens.color.surface, borderRadius: tokens.radius.card,
    padding: tokens.space.md, gap: tokens.space.sm,
  },
  header: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    justifyContent: 'space-between', columnGap: tokens.space.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm },
  thumbnail: {
    flexDirection: 'row', alignItems: 'center', minHeight: 56,
    padding: tokens.space.sm, gap: tokens.space.md,
    backgroundColor: tokens.color.surface, borderRadius: tokens.radius.card,
  },
  thumbnailImage: { width: 56, height: 56, borderRadius: tokens.radius.cell },
});
