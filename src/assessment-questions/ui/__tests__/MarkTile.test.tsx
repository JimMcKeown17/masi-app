import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { AssessmentThemeProvider } from '../../theme/AssessmentTheme';
import { tokens } from '../../theme/tokens';
import { MarkTile, type TileState } from '../MarkTile';
import { ContentText, UiText, toneColor } from '../Text';
import { Icon } from '../Icon';

test('prompt cards show a check or cross mark only when filled, and fade when not reached', () => {
  const r = render(<MarkTile variant="promptCard" state="correct" text="Prompt" accessibilityLabel="tile" />);
  for (const [state, name] of [['correct', 'check'], ['incorrect', 'cross']] as const) {
    r.rerender(<MarkTile variant="promptCard" state={state} text="Prompt" accessibilityLabel="tile" />);
    const mark = r.getByTestId('tile-mark');
    expect(mark).toHaveStyle({ position: 'absolute', right: 10, top: 8 });
    expect(mark.findByType(Icon).props).toMatchObject({ name, tone: 'onInk', size: 14 });
  }
  for (const state of ['idle', 'current', 'notReached'] as const) {
    r.rerender(<MarkTile variant="promptCard" state={state} text="Prompt" accessibilityLabel="tile" />);
    expect(r.queryByTestId('tile-mark')).toBeNull();
  }
  expect(r.getByLabelText('tile')).toHaveStyle({ opacity: 0.55 });
  r.rerender(<MarkTile variant="promptCard" state="notReached" text="Prompt" accessibilityLabel="tile" onPress={jest.fn()} />);
  expect(r.getByLabelText('tile')).toHaveStyle({ opacity: 0.55 });
  for (const variant of ['letter', 'word', 'pill', 'picture'] as const) {
    r.rerender(<MarkTile variant={variant} state="notReached" text="a" accessibilityLabel="tile" />);
    expect(StyleSheet.flatten(r.getByLabelText('tile').props.style).opacity).toBeUndefined();
    r.rerender(<MarkTile variant={variant} state="correct" text="a" accessibilityLabel="tile" />);
    expect(r.queryByTestId('tile-mark')).toBeNull();
  }
});

test.each([
  ['current', { borderWidth: 1, borderColor: tokens.color.ink, backgroundColor: tokens.color.surface }, 'ink'],
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


test.each(['letter', 'word', 'pill', 'promptCard', 'picture'] as const)(
  '%s tile keeps content geometry in every state and only current draws a decorative ring', variant => {
    const states: TileState[] = ['idle', 'current', 'correct', 'incorrect', 'notReached'];
    const r = render(<MarkTile variant={variant} state="idle" text="a" accessibilityLabel="tile" onPress={jest.fn()} />);
    const geometry = () => {
      const style = StyleSheet.flatten(r.getByLabelText('tile').props.style);
      return [style.borderWidth, style.padding, style.paddingHorizontal, style.paddingVertical];
    };
    const idleGeometry = geometry();
    for (const state of states) {
      r.rerender(<MarkTile variant={variant} state={state} text="a" accessibilityLabel="tile" onPress={jest.fn()} />);
      expect(geometry()).toEqual(idleGeometry);
      if (state === 'current') {
        const ring = r.getByTestId('current-ring', { includeHiddenElements: true });
        expect(ring).toHaveStyle({ position: 'absolute', top: -1, left: -1, right: -1, bottom: -1,
          borderWidth: 3, borderColor: tokens.color.ink, borderRadius: tokens.radius.tile });
        expect(ring.props).toMatchObject({ pointerEvents: 'none', accessible: false,
          accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' });
      } else {
        expect(r.queryByTestId('current-ring', { includeHiddenElements: true })).toBeNull();
      }
    }
  },
);


test.each(['ball', 'ufudo (tortoise)', 'i-orenji (orange)'])(
  'picture caption %s reserves the same two scaled lines before its letter', caption => {
    const r = render(<MarkTile variant="picture" state="idle" text="b" caption={caption} accessibilityLabel="picture" />);
    expect(r.getByTestId('picture-caption')).toHaveStyle({ height: 2 * 18 * 1.2, flexShrink: 0 });
    expect(r.getByText(caption).props).toMatchObject({ numberOfLines: 2, maxFontSizeMultiplier: 1.2 });
  },
);

test.each([[1, 2 * 18], [1.15, 2 * 18 * 1.15], [2, 2 * 18 * 1.2]])(
  'picture caption box follows OS font scale %s, capped at the caption multiplier', (fontScale, height) => {
    const spy = jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 360, height: 800, scale: 2, fontScale });
    try {
      const r = render(<MarkTile variant="picture" state="idle" text="b" caption="ball" accessibilityLabel="picture" />);
      expect(r.getByTestId('picture-caption')).toHaveStyle({ height });
    } finally { spy.mockRestore(); }
  },
);
