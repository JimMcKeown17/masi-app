import React, { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { fireEvent, render, within } from '@testing-library/react-native';
import { tokens } from '../../theme/tokens';
import { MarkTile } from '../MarkTile';
import { PagedGrid } from '../PagedGrid';
import { LETTER_PAGE_LAYOUT, WORD_PAGE_LAYOUT, paginate, rowsFromLengths } from '../paginate';

const renderLetter = (position: number, width: number | undefined) => (
  <MarkTile variant="letter" state="idle" text={String(position)} accessibilityLabel={`item ${position}`} width={width} />
);

// Skip component boundaries when checking native layout ancestry.
function parentView(node: { parent: any }) {
  let parent = node.parent;
  while (parent && typeof parent.type !== 'string') parent = parent.parent;
  return parent;
}

test('PagedGrid renders only page positions in display rows with a divider before a new card row', () => {
  const page = paginate(rowsFromLengths([10, 10, 10, 10]), LETTER_PAGE_LAYOUT)[1];
  const r = render(<PagedGrid page={page} layout={LETTER_PAGE_LAYOUT} testID="grid" groupTestID={row => `row-${row}`} renderTile={renderLetter} />);
  expect(r.getByTestId('grid')).toHaveStyle({ flex: 1, justifyContent: 'center', paddingHorizontal: tokens.space.lg });
  expect(r.UNSAFE_queryByType(ScrollView)).toBeNull();
  expect(r.getAllByLabelText(/^item \d+$/).map(tile => tile.props.accessibilityLabel)).toEqual(page.positions.map(position => `item ${position}`));
  expect(r.queryByLabelText('item 0')).toBeNull();
  for (const [row, start] of [[2, 20], [3, 30]]) {
    const group = r.getByTestId(`row-${row}`);
    const tiles = within(group).getAllByLabelText(/^item \d+$/);
    expect(tiles.map(tile => tile.props.accessibilityLabel)).toEqual(Array.from({ length: 10 }, (_, index) => `item ${start + index}`));
    expect(parentView(parentView(tiles[0]))).toBe(parentView(parentView(tiles[4])));
    expect(parentView(parentView(tiles[0]))).not.toBe(parentView(parentView(tiles[5])));
    expect(parentView(parentView(tiles[0]))).toHaveStyle({ flexDirection: 'row', gap: 10 });
  }
  expect(r.getAllByTestId('card-row-divider')).toHaveLength(1);
  const divider = r.UNSAFE_getByType(Svg);
  expect(divider.props).toMatchObject({ accessible: false, width: '100%', height: 1 });
  expect(StyleSheet.flatten(divider.props.style)).toMatchObject({ marginVertical: 10 });
  expect(r.UNSAFE_getByType(Line).props).toMatchObject({ x1: 0, x2: '100%', stroke: tokens.color.line, strokeWidth: 1 });
  expect(r.UNSAFE_getByType(Line).props.strokeDasharray).toBeTruthy();
  fireEvent(r.getByTestId('grid'), 'layout', { nativeEvent: { layout: { width: 360 } } });
  expect(r.UNSAFE_getByType(Svg).props.width).toBe(328);
});

test('every tile renders with flex before layout, then receives the measured column width on resize', () => {
  const page = paginate(rowsFromLengths([12]), LETTER_PAGE_LAYOUT)[0];
  const renderTile = jest.fn(renderLetter);
  const r = render(<PagedGrid page={page} layout={LETTER_PAGE_LAYOUT} testID="grid" renderTile={renderTile} />);
  expect(r.getAllByLabelText(/^item \d+$/)).toHaveLength(12);
  expect(renderTile.mock.calls.map(([position, width]) => [position, width])).toEqual(page.positions.map(position => [position, undefined]));
  for (const tile of r.getAllByLabelText(/^item \d+$/)) expect(parentView(tile)).toHaveStyle({ flex: 1 });
  for (const width of [320, 360]) {
    renderTile.mockClear();
    fireEvent(r.getByTestId('grid'), 'layout', { nativeEvent: { layout: { width, height: 400, x: 0, y: 0 } } });
    const tileWidth = (width - 2 * tokens.space.lg - 10 * (LETTER_PAGE_LAYOUT.columns - 1)) / LETTER_PAGE_LAYOUT.columns;
    expect(renderTile.mock.calls).toEqual(page.positions.map(position => [position, tileWidth]));
    for (const tile of r.getAllByLabelText(/^item \d+$/)) expect(tile).toHaveStyle({ width: tileWidth });
  }
  expect(r.queryByTestId('card-row-divider')).toBeNull();
});

test('continuous word pages have no dividers and use the word column count', () => {
  const page = paginate(rowsFromLengths([5, 5]), WORD_PAGE_LAYOUT)[0];
  const r = render(<PagedGrid page={page} layout={WORD_PAGE_LAYOUT} testID="grid" renderTile={renderLetter} />);
  fireEvent(r.getByTestId('grid'), 'layout', { nativeEvent: { layout: { width: 360 } } });
  expect(r.getAllByLabelText(/^item \d+$/)).toHaveLength(10);
  expect(parentView(parentView(r.getByLabelText('item 4')))).toBe(parentView(parentView(r.getByLabelText('item 5'))));
  expect(r.getByLabelText('item 4')).toHaveStyle({ width: 159 });
  expect(r.queryByTestId('card-row-divider')).toBeNull();
});

test.each([
  { name: 'letter', layout: LETTER_PAGE_LAYOUT, length: 12, expectedWidth: 57.6 },
  { name: 'word', layout: WORD_PAGE_LAYOUT, length: 7, expectedWidth: 159 },
] as const)('360dp $name grid fits 328dp content and keeps column widths on a partial last row', ({ name, layout, length, expectedWidth }) => {
  const page = paginate(rowsFromLengths([length]), layout)[0];
  const renderTile = jest.fn((position: number, width: number | undefined) => (
    <MarkTile variant={name} state="idle" text={String(position)} accessibilityLabel={`item ${position}`} width={width} />
  ));
  const r = render(<PagedGrid page={page} layout={layout} testID="grid" renderTile={renderTile} />);
  renderTile.mockClear();
  fireEvent(r.getByTestId('grid'), 'layout', { nativeEvent: { layout: { width: 360 } } });
  expect(r.getByTestId('grid')).toHaveStyle({ paddingHorizontal: 16 });
  expect(renderTile.mock.calls).toEqual(page.positions.map(position => [position, expectedWidth]));
  expect(expectedWidth * layout.columns + 10 * (layout.columns - 1)).toBeCloseTo(328);
  for (const tile of r.getAllByLabelText(/^item \d+$/)) {
    expect(tile).toHaveStyle({ width: expectedWidth });
    expect(parentView(tile)).toHaveStyle({ width: expectedWidth });
  }
  const lastRow = parentView(parentView(r.getByLabelText(`item ${length - 1}`)));
  expect(within(lastRow).getAllByLabelText(/^item \d+$/)).toHaveLength(length % layout.columns);
});

test('duplicate words render distinct keyed tiles and toggle independently', () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  const words = ['there', 'how', 'there', 'how'];
  function RepeatedWords() {
    const [correct, setCorrect] = useState<number[]>([]);
    return <PagedGrid page={paginate([[0, 1, 2, 3]], WORD_PAGE_LAYOUT)[0]} layout={WORD_PAGE_LAYOUT}
      renderTile={(position, width) => <MarkTile variant="word" width={width} text={words[position]}
        state={correct.includes(position) ? 'correct' : 'idle'} accessibilityLabel={`word ${position}`}
        onPress={() => setCorrect(previous => previous.includes(position) ? previous.filter(value => value !== position) : [...previous, position])} />} />;
  }
  try {
    const r = render(<RepeatedWords />);
    expect(r.getAllByRole('button')).toHaveLength(4);
    expect(r.getAllByText('there')).toHaveLength(2);
    expect(r.getAllByText('how')).toHaveLength(2);
    fireEvent.press(r.getByLabelText('word 2'));
    expect(r.getByLabelText('word 2')).toHaveStyle({ backgroundColor: tokens.color.marked });
    expect(r.getByLabelText('word 0')).toHaveStyle({ backgroundColor: tokens.color.surface });
    fireEvent.press(r.getByLabelText('word 0'));
    fireEvent.press(r.getByLabelText('word 2'));
    expect(r.getByLabelText('word 0')).toHaveStyle({ backgroundColor: tokens.color.marked });
    expect(r.getByLabelText('word 2')).toHaveStyle({ backgroundColor: tokens.color.surface });
    expect(error).not.toHaveBeenCalled();
  } finally {
    error.mockRestore();
  }
});
