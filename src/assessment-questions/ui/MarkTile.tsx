import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { tokens } from '../theme/tokens';
import { ContentText, UiText, type Tone } from './Text';

export type TileState = 'idle' | 'current' | 'correct' | 'incorrect' | 'notReached';
export type TileVariant = 'letter' | 'word' | 'pill' | 'promptCard' | 'picture';

const looks: Record<TileState, ViewStyle> = {
  idle: { backgroundColor: tokens.color.surface, borderColor: tokens.color.line, borderWidth: 1 },
  notReached: { backgroundColor: tokens.color.surface, borderColor: tokens.color.line, borderWidth: 1 },
  current: { backgroundColor: tokens.color.surface, borderColor: tokens.color.ink, borderWidth: 3 },
  correct: { backgroundColor: tokens.color.marked, borderColor: tokens.color.marked, borderWidth: 1 },
  incorrect: { backgroundColor: tokens.color.error, borderColor: tokens.color.error, borderWidth: 1 },
};

export const GRID_TILE_HEIGHTS = { letter: 60, word: 58 } as const;

const styles = StyleSheet.create({
  tile: { borderRadius: tokens.radius.tile, alignItems: 'center', justifyContent: 'center', padding: tokens.space.sm, gap: tokens.space.xs },
  letter: { height: GRID_TILE_HEIGHTS.letter, alignSelf: 'stretch' },
  word: { height: GRID_TILE_HEIGHTS.word, alignSelf: 'stretch' },
  pill: { minHeight: 48, paddingHorizontal: 14 },
  promptCard: { minHeight: 72, alignSelf: 'stretch', padding: tokens.space.lg },
  picture: { minHeight: 88 },
  content: { alignSelf: 'stretch', textAlign: 'center', flexShrink: 1 },
});

const contentSize = {
  letter: 'tileLetter', word: 'tileWord', pill: 'markingWord', promptCard: 'promptCard', picture: 'tileWord',
} as const;

export function MarkTile({ variant, state, text, gloss, caption, accessibilityLabel, onPress, testID, width, height }: {
  variant: TileVariant;
  state: TileState;
  text: string;
  gloss?: string;
  caption?: string;
  accessibilityLabel: string;
  onPress?: () => void;
  testID?: string;
  width?: number;
  height?: number;
}): React.JSX.Element {
  const filled = state === 'correct' || state === 'incorrect';
  const tone: Tone = filled ? 'onInk' : state === 'notReached' ? 'notReached' : 'ink';
  const style = [styles.tile, styles[variant], looks[state], width === undefined ? undefined : { width },
    height !== undefined && (variant === 'letter' || variant === 'word') ? { height } : undefined];
  const accessibility = { accessible: true, accessibilityLabel, accessibilityState: { selected: state === 'current' }, testID };
  const content = <>
    {variant === 'picture' && caption !== undefined && <UiText variant="caption" tone={filled ? 'onInk' : 'muted'} align="center" numberOfLines={2}>{caption}</UiText>}
    <ContentText size={contentSize[variant]} tone={tone} fit={variant === 'letter' || variant === 'word'} style={styles.content}>{text}</ContentText>
    {variant === 'promptCard' && gloss !== undefined && <UiText variant="caption" tone={filled ? 'onInk' : 'muted'} align="center">{gloss}</UiText>}
  </>;
  return onPress
    ? <Pressable {...accessibility} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [style, { opacity: pressed ? 0.85 : 1 }]}>{content}</Pressable>
    : <View {...accessibility} accessibilityRole="text" style={style}>{content}</View>;
}
