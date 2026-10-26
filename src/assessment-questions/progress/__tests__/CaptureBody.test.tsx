import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';
import { CaptureBody } from '../CaptureBody';
import type { CaptureBody as Body } from '../captureTypes';
import type { TileState } from '../../ui/MarkTile';
import { tokens } from '../../theme/tokens';
import { FollowScrollView } from '../../ui/FollowScrollView';

// Repeated displayed content is deliberately distinguished only by position.
const tileFor = (position: number) => ({
  state: (['correct', 'current', 'notReached'] as TileState[])[position],
  text: 'jam', gloss: '(fruit spread)', accessibilityLabel: `Word ${position + 1}`,
  tappable: position === 0,
});

const props = { pages: [], pageIndex: 0, itemCount: 3, tileFor, onTapPosition: jest.fn() };

test('cards body renders prompt cards with gloss, faded not-reached cards and the ring on the current card', () => {
  const r = render(<CaptureBody {...props} body={{ kind: 'cards', testID: 'prompt-scroll' }} />);
  const body = within(r.getByTestId('prompt-scroll'));
  expect(body.getAllByText('(fruit spread)')).toHaveLength(3);
  expect(body.getByTestId('tile-0')).toHaveStyle({ minHeight: 72, padding: tokens.space.lg });
  expect(body.getByTestId('tile-2')).toHaveStyle({ opacity: 0.55 });
  expect(within(body.getByTestId('tile-1')).getByTestId('current-ring', { includeHiddenElements: true })).toBeTruthy();
  expect(within(body.getByTestId('tile-0')).queryByTestId('current-ring', { includeHiddenElements: true })).toBeNull();
  expect(within(body.getByTestId('tile-2')).queryByTestId('current-ring', { includeHiddenElements: true })).toBeNull();
  fireEvent.press(body.getByTestId('tile-0'));
  expect(props.onTapPosition).toHaveBeenCalledWith(0);
  expect(r.UNSAFE_getByType(FollowScrollView).props).toMatchObject({ focus: 1,
    contentContainerStyle: { padding: tokens.space.lg, gap: 10 } });
  r.rerender(<CaptureBody {...props} body={{ kind: 'cards', testID: 'prompt-scroll' }}
    tileFor={position => ({ ...tileFor(position), state: 'correct', tappable: true })} />);
  expect(r.UNSAFE_getByType(FollowScrollView).props.focus).toBeUndefined();
  expect(within(r.getByTestId('prompt-scroll')).queryByTestId('current-ring', { includeHiddenElements: true })).toBeNull();
});

test.each([false, true])('groups body owns scroll gutters, headings and letter tileWidth with card=%s', card => {
  const r = render(<CaptureBody {...props} body={{ kind: 'groups', testID: 'prompt-scroll',
    card, variant: 'letter', tileWidth: 52,
    groups: [{ key: 'word-0', testID: 'word-0', heading: '1. jam', positions: [0, 1, 2] }],
  }} />);
  const body = within(r.getByTestId('prompt-scroll'));
  expect(r.UNSAFE_getByType(FollowScrollView).props).toMatchObject({ focus: 1,
    contentContainerStyle: { gap: tokens.space.lg, paddingHorizontal: tokens.space.lg, paddingVertical: tokens.space.lg } });
  expect(body.getByText('1. jam')).toBeTruthy();
  expect(r.UNSAFE_getByType(ScrollView).props.horizontal ?? false).toBe(false);
  expect(body.getByTestId('word-0')).toHaveStyle({ gap: tokens.space.sm });
  if (card) {
    expect(body.getByTestId('word-0')).toHaveStyle({ backgroundColor: tokens.color.surface,
      borderRadius: tokens.radius.card, padding: tokens.space.lg });
  } else {
    expect(body.getByTestId('word-0')).not.toHaveStyle({ backgroundColor: tokens.color.surface });
  }
  for (const position of [0, 1, 2]) {
    expect(body.getByTestId(`tile-${position}`)).toHaveStyle({ width: 52, height: 60 });
  }
});

test('groups body without cards renders paragraphs as wrapping pills', () => {
  const body: Body = { kind: 'groups', testID: 'passage', card: false, variant: 'pill',
    groups: [{ key: 'paragraph-0', testID: 'paragraph-0', positions: [0, 1, 2] }] };
  const r = render(<CaptureBody {...props} body={body} />);
  const paragraph = within(r.getByTestId('passage')).getByTestId('paragraph-0');
  expect(paragraph).toHaveStyle({ flexWrap: 'wrap', flexDirection: 'row', gap: tokens.space.sm });
  const style = StyleSheet.flatten(paragraph.props.style);
  expect(style.backgroundColor).toBeUndefined();
  expect(style.borderRadius).toBeUndefined();
  expect(style.padding).toBeUndefined();
  for (const position of [0, 1, 2]) {
    expect(within(paragraph).getByTestId(`tile-${position}`)).toHaveStyle({ minHeight: 48, paddingHorizontal: 14 });
  }
  expect(r.UNSAFE_getByType(ScrollView).props.scrollEventThrottle).toBe(16);
});

test.each([
  ['cards', { kind: 'cards', testID: 'prompt-scroll' } as Body, 2],
  ['groups', { kind: 'groups', testID: 'prompt-scroll', card: true, variant: 'pill',
    groups: [{ key: 'a', positions: [0, 1] }, { key: 'b', positions: [2] }] } as Body, 2],
])('%s body tells the scroller its last item, in reading order', (_name, body, last) => {
  const r = render(<CaptureBody {...props} body={body} />);
  expect(r.UNSAFE_getByType(FollowScrollView).props.lastIndex).toBe(last);
});
