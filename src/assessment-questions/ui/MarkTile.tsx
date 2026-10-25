import React from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { textStyle } from '../theme/typography';
import { tokens } from '../theme/tokens';
import { ContentText, UiText, type Tone } from './Text';
import { Icon } from './Icon';

export type TileState = 'idle' | 'current' | 'correct' | 'incorrect' | 'notReached';
export type TileVariant = 'letter' | 'word' | 'pill' | 'promptCard' | 'picture';

const looks: Record<TileState, ViewStyle> = {
  idle: { backgroundColor: tokens.color.surface, borderColor: tokens.color.line, borderWidth: 1 },
  notReached: { backgroundColor: tokens.color.surface, borderColor: tokens.color.line, borderWidth: 1 },
  current: { backgroundColor: tokens.color.surface, borderColor: tokens.color.ink, borderWidth: 1 },
  correct: { backgroundColor: tokens.color.marked, borderColor: tokens.color.marked, borderWidth: 1 },
  incorrect: { backgroundColor: tokens.color.error, borderColor: tokens.color.error, borderWidth: 1 },
};

export const GRID_TILE_HEIGHTS = { letter: 60, word: 58, picture: 88 } as const;

// Reserve both caption lines even for one-line labels, scaled like the caption text itself
// (OS font scale, capped by its maxFontSizeMultiplier of 1.2), so every letter shares one baseline.
const CAPTION_LINE_HEIGHT = textStyle('caption', {}).lineHeight ?? tokens.font.caption;
const CAPTION_MAX_SCALE = 1.2;

const styles = StyleSheet.create({
  tile: { borderRadius: tokens.radius.tile, alignItems: 'center', justifyContent: 'center', padding: tokens.space.sm, gap: tokens.space.xs },
  letter: { height: GRID_TILE_HEIGHTS.letter, alignSelf: 'stretch' },
  word: { height: GRID_TILE_HEIGHTS.word, alignSelf: 'stretch' },
  pill: { minHeight: 48, paddingHorizontal: 14 },
  promptCard: { minHeight: 72, alignSelf: 'stretch', padding: tokens.space.lg },
  promptMark: { position: 'absolute', right: 10, top: tokens.space.sm },
  picture: { height: GRID_TILE_HEIGHTS.picture, alignSelf: 'stretch', paddingVertical: tokens.space.xs },
  // Absolute children sit inside the tile's 1dp border; outset by 1 so the ring covers it and
  // the visible outline is exactly 3dp at the tile's outer edge.
  currentRing: { position: 'absolute', top: -1, left: -1, right: -1, bottom: -1, borderWidth: 3, borderColor: tokens.color.ink, borderRadius: tokens.radius.tile },
  pictureCaption: { flexShrink: 0, alignSelf: 'stretch', justifyContent: 'center' },
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
  const { fontScale } = useWindowDimensions();
  const captionHeight = 2 * CAPTION_LINE_HEIGHT * Math.min(fontScale, CAPTION_MAX_SCALE);
  const filled = state === 'correct' || state === 'incorrect';
  const opacity = variant === 'promptCard' && state === 'notReached' ? 0.55 : 1;
  const tone: Tone = filled ? 'onInk' : state === 'notReached' ? 'notReached' : 'ink';
  const style = [styles.tile, styles[variant], looks[state], width === undefined ? undefined : { width },
    variant === 'promptCard' && state === 'notReached' ? { opacity } : undefined,
    height !== undefined && (variant === 'letter' || variant === 'word' || variant === 'picture') ? { height } : undefined];
  const accessibility = { accessible: true, accessibilityLabel, accessibilityState: { selected: state === 'current' }, testID };
  const content = <>
    {variant === 'promptCard' && filled && <View testID="tile-mark" pointerEvents="none" accessible={false} style={styles.promptMark}>
      <Icon name={state === 'correct' ? 'check' : 'cross'} tone="onInk" size={14} />
    </View>}
    {state === 'current' && <View testID="current-ring" pointerEvents="none" accessible={false}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.currentRing} />}
    {variant === 'picture' && caption !== undefined && <View testID="picture-caption" style={[styles.pictureCaption, { height: captionHeight }]}><UiText variant="caption" tone={filled ? 'onInk' : 'muted'} align="center" numberOfLines={2} ellipsizeMode="clip" maxFontSizeMultiplier={1.2} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.content}>{caption}</UiText></View>}
    <ContentText size={contentSize[variant]} tone={tone} fit={variant === 'letter' || variant === 'word' || variant === 'picture'} style={styles.content}>{text}</ContentText>
    {variant === 'promptCard' && gloss !== undefined && <UiText variant="caption" tone={filled ? 'onInk' : 'muted'} align="center">{gloss}</UiText>}
  </>;
  return onPress
    ? <Pressable {...accessibility} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [style, { opacity: pressed ? opacity * 0.85 : opacity }]}>{content}</Pressable>
    : <View {...accessibility} accessibilityRole="text" style={style}>{content}</View>;
}
