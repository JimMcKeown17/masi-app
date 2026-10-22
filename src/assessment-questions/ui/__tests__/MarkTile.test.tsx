import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { AssessmentThemeProvider } from '../../theme/AssessmentTheme';
import { tokens } from '../../theme/tokens';
import { MarkTile, type TileState } from '../MarkTile';
import { ContentText, UiText, toneColor } from '../Text';

test.each([
  ['current', { borderWidth: 3, borderColor: tokens.color.ink, backgroundColor: tokens.color.surface }, 'ink'],
  ['correct', { backgroundColor: tokens.color.marked, borderColor: tokens.color.marked }, 'onInk'],
  ['incorrect', { backgroundColor: tokens.color.error, borderColor: tokens.color.error }, 'onInk'],
  ['idle', { backgroundColor: tokens.color.surface, borderColor: tokens.color.line, borderWidth: 1 }, 'ink'],
  ['notReached', { backgroundColor: tokens.color.surface, borderColor: tokens.color.line, borderWidth: 1 }, 'notReached'],
] as const)('%s tile look and selection preserve the caller label', (state, style, tone) => {
  const r = render(<MarkTile variant="letter" state={state} text="a" accessibilityLabel="a, x" />);
  expect(r.getByLabelText('a, x')).toHaveStyle({ ...style, borderRadius: tokens.radius.tile });
  expect(r.getByText('a')).toHaveStyle({ color: toneColor(tone) });
  expect(r.getByLabelText('a, x').props.accessibilityState?.selected ?? false).toBe(state === 'current');
});

test('a tile with onPress is a button; without, it is text', () => {
  const onPress = jest.fn();
  const r = render(<MarkTile variant="letter" state="idle" text="a" accessibilityLabel="a, idle" testID="tile" onPress={onPress} />);
  expect(r.getByRole('button', { name: 'a, idle' })).toBe(r.getByTestId('tile'));
  fireEvent.press(r.getByRole('button', { name: 'a, idle' }));
  expect(onPress).toHaveBeenCalledTimes(1);
  const style = r.UNSAFE_root.find((node: { props: { style?: unknown } }) => typeof node.props.style === 'function').props.style;
  expect(StyleSheet.flatten(style({ pressed: true })).opacity).toBe(0.85);
  expect(StyleSheet.flatten(style({ pressed: false })).opacity).toBe(1);
  r.rerender(<MarkTile variant="letter" state="current" text="a" accessibilityLabel="a, current" />);
  expect(r.queryByRole('button')).toBeNull();
  expect(r.getByRole('text', { name: 'a, current' })).toBeTruthy();
  expect(r.UNSAFE_root.findAll((node: { props: { style?: unknown } }) => typeof node.props.style === 'function')).toHaveLength(0);
});

test.each([
  ['letter', 'I', 60, 'tileLetter'],
  ['word', 'ibhulukhwe', 58, 'tileWord'],
] as const)('%s tiles have fixed height and shrink long content without truncation', (variant, text, height, size) => {
  const r = render(<MarkTile variant={variant} state="idle" text={text} accessibilityLabel={`${text}, idle`} width={160} />);
  expect(r.getByLabelText(`${text}, idle`)).toHaveStyle({ height, width: 160 });
  expect(r.UNSAFE_getByType(ContentText).props).toMatchObject({ size, fit: true });
  expect(r.getByText(text).props).toMatchObject({
    numberOfLines: 1, adjustsFontSizeToFit: true, maxFontSizeMultiplier: 1.2, minimumFontScale: 0.6,
  });
  expect(r.getByText(text).props.ellipsizeMode).toBeUndefined();
});

test('pills wrap content and use markingWord with a 48dp minimum target', () => {
  const r = render(<MarkTile variant="pill" state="idle" text="a word" accessibilityLabel="a word, idle" />);
  expect(r.getByRole('text', { name: 'a word, idle' })).toHaveStyle({ minHeight: 48, paddingHorizontal: 14, borderRadius: tokens.radius.tile });
  expect(r.UNSAFE_getByType(ContentText).props.size).toBe('markingWord');
  expect(r.getByText('a word').props.numberOfLines ?? 0).toBe(0);
});

test.each(['idle', 'correct', 'incorrect'] as TileState[])('prompt cards show a caption gloss in the %s state', state => {
  const r = render(<MarkTile variant="promptCard" state={state} text="ibhulukhwe" gloss="trousers" accessibilityLabel="ibhulukhwe, x" />);
  expect(r.getByLabelText('ibhulukhwe, x')).toHaveStyle({ alignSelf: 'stretch', minHeight: 72, padding: tokens.space.lg });
  expect(r.UNSAFE_getByType(ContentText).props.size).toBe('promptCard');
  expect(r.UNSAFE_getByType(UiText).props.variant).toBe('caption');
  expect(r.getByText('trousers')).toHaveStyle({ color: toneColor(state === 'idle' ? 'muted' : 'onInk') });
});

test('picture tiles show the caption above the content letter using the supplied fonts', () => {
  const r = render(
    <AssessmentThemeProvider fonts={{ content: 'Andika_400Regular', text: 'Figtree_400Regular' }}>
      <MarkTile variant="picture" state="idle" text="b" caption="ball" accessibilityLabel="ball → b, idle" />
    </AssessmentThemeProvider>,
  );
  expect(r.getByLabelText('ball → b, idle')).toHaveStyle({ height: 88 });
  const texts = r.UNSAFE_getByType(MarkTile).findAll((node: { type: unknown }) => node.type === UiText || node.type === ContentText);
  expect(texts.map((node: { props: { children?: React.ReactNode } }) => node.props.children)).toEqual(['ball', 'b']);
  expect(r.getByText('ball').props).toMatchObject({ numberOfLines: 2, maxFontSizeMultiplier: 1.2, ellipsizeMode: 'clip' });
  expect(r.getByText('ball')).toHaveStyle({ fontFamily: 'Figtree_400Regular', fontSize: tokens.font.caption });
  expect(r.getByText('b')).toHaveStyle({ fontFamily: 'Andika_400Regular', fontSize: tokens.font.tileWord });
});

test.each(['letter', 'word'] as const)('%s tile accepts a fitted height without changing its fit text', variant => {
  const r = render(<MarkTile variant={variant} state="idle" text="a" accessibilityLabel="fitted" width={100} height={45} />);
  expect(r.getByLabelText('fitted')).toHaveStyle({ width: 100, height: 45 });
  expect(r.getByText('a').props).toMatchObject({ adjustsFontSizeToFit: true, minimumFontScale: 0.6 });
});

test('a height override does not alter non-grid variants', () => {
  const r = render(<MarkTile variant="pill" state="idle" text="a" accessibilityLabel="pill" height={45} />);
  expect(StyleSheet.flatten(r.getByLabelText('pill').props.style).height).toBeUndefined();
});


test('picture tiles accept the fitted row height without a nominal minimum overriding it', () => {
  const r = render(<MarkTile variant="picture" state="idle" text="r" caption="iroboti (traffic light)" accessibilityLabel="picture" width={103} height={72} />);
  expect(r.getByLabelText('picture')).toHaveStyle({ width: 103, height: 72 });
  expect(StyleSheet.flatten(r.getByLabelText('picture').props.style).minHeight).toBeUndefined();
  expect(r.getByText('iroboti (traffic light)').props).toMatchObject({ numberOfLines: 2, maxFontSizeMultiplier: 1.2, ellipsizeMode: 'clip' });
});
