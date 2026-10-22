import React, { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { fireEvent, render, within } from '@testing-library/react-native';
import { tokens } from '../../theme/tokens';
import { MarkTile } from '../MarkTile';
import { PagedGrid, type TileSize } from '../PagedGrid';
import { LETTER_PAGE_LAYOUT, WORD_PAGE_LAYOUT, paginate, rowsFromLengths } from '../paginate';

const renderLetter = (position: number, size: TileSize) => (
  <MarkTile variant="letter" state="idle" text={String(position)} accessibilityLabel={`item ${position}`} {...size} />
);

// Skip component boundaries when checking native layout ancestry.
function parentView(node: { parent: any }) {
  let parent = node.parent;
  while (parent && typeof parent.type !== 'string') parent = parent.parent;
  return parent;
}

test('PagedGrid renders only page positions in display rows with a divider before a new card row', () => {
  const page = paginate(rowsFromLengths([10, 10, 10, 10]), LETTER_PAGE_LAYOUT)[1];
  const r = render(<PagedGrid page={page} variant="letter" layout={LETTER_PAGE_LAYOUT} testID="grid" groupTestID={row => `row-${row}`} renderTile={renderLetter} />);
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
  const r = render(<PagedGrid page={page} variant="letter" layout={LETTER_PAGE_LAYOUT} testID="grid" renderTile={renderTile} />);
  expect(r.getAllByLabelText(/^item \d+$/)).toHaveLength(12);
  expect(renderTile.mock.calls).toEqual(page.positions.map(position => [position, { width: undefined, height: undefined }]));
  for (const tile of r.getAllByLabelText(/^item \d+$/)) expect(parentView(tile)).toHaveStyle({ flex: 1 });
  for (const width of [320, 360]) {
    renderTile.mockClear();
    fireEvent(r.getByTestId('grid'), 'layout', { nativeEvent: { layout: { width, height: 400, x: 0, y: 0 } } });
    const tileWidth = (width - 2 * tokens.space.lg - 10 * (LETTER_PAGE_LAYOUT.columns - 1)) / LETTER_PAGE_LAYOUT.columns;
    expect(renderTile.mock.calls).toEqual(page.positions.map(position => [position, { width: tileWidth, height: 60 }]));
    for (const tile of r.getAllByLabelText(/^item \d+$/)) expect(tile).toHaveStyle({ width: tileWidth });
  }
  expect(r.queryByTestId('card-row-divider')).toBeNull();
});

test('continuous word pages have no dividers and use the word column count', () => {
  const page = paginate(rowsFromLengths([5, 5]), WORD_PAGE_LAYOUT)[0];
  const r = render(<PagedGrid page={page} variant="word" layout={WORD_PAGE_LAYOUT} testID="grid"
    renderTile={(position, size) => <MarkTile variant="word" state="idle" text={String(position)} accessibilityLabel={`item ${position}`} {...size} />} />);
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
  const renderTile = jest.fn((position: number, size: TileSize) => (
    <MarkTile variant={name} state="idle" text={String(position)} accessibilityLabel={`item ${position}`} {...size} />
  ));
  const r = render(<PagedGrid page={page} variant={name} layout={layout} testID="grid" renderTile={renderTile} />);
  renderTile.mockClear();
  fireEvent(r.getByTestId('grid'), 'layout', { nativeEvent: { layout: { width: 360 } } });
  expect(r.getByTestId('grid')).toHaveStyle({ paddingHorizontal: 16 });
  expect(renderTile.mock.calls).toEqual(page.positions.map(position => [position, { width: expectedWidth, height: undefined }]));
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
    return <PagedGrid page={paginate([[0, 1, 2, 3]], WORD_PAGE_LAYOUT)[0]} variant="word" layout={WORD_PAGE_LAYOUT}
      renderTile={(position, size) => <MarkTile variant="word" {...size} text={words[position]}
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

function sizedPage(variant: 'letter' | 'word', height: number) {
  const layout = variant === 'letter' ? LETTER_PAGE_LAYOUT : WORD_PAGE_LAYOUT;
  const page = paginate(rowsFromLengths(variant === 'letter' ? [10, 10] : [5, 5]), layout)[0];
  const r = render(<PagedGrid page={page} variant={variant} layout={layout} testID="sized-grid"
    renderTile={(position: number, size: { width?: number; height?: number }) => (
      <MarkTile variant={variant} state="idle" text={String(position)} accessibilityLabel={`item ${position}`} {...size} />
    )} />);
  fireEvent(r.getByTestId('sized-grid'), 'layout', { nativeEvent: { layout: { width: 360, height } } });
  return r;
}

function pageGeometry(r: ReturnType<typeof render>) {
  const tiles = r.getAllByLabelText(/^item \d+$/);
  const rows = [...new Set(tiles.map(tile => parentView(parentView(tile))))];
  const groups = [...new Set(rows.map(row => parentView(row)))];
  const gap = StyleSheet.flatten(groups[0].props.style).gap as number;
  const heights = rows.map(row => StyleSheet.flatten(within(row).getAllByLabelText(/^item \d+$/)[0].props.style).height as number);
  const internalGaps = groups.reduce((sum, group) => sum + rows.filter(row => parentView(row) === group).length - 1, 0);
  const dividers = r.UNSAFE_queryAllByType(Svg);
  const dividerHeight = dividers.reduce((sum, divider) => sum + divider.props.height
    + 2 * StyleSheet.flatten(divider.props.style).marginVertical, 0);
  return { tiles, rows, gap, heights, total: heights.reduce((sum, height) => sum + height, 0) + internalGaps * gap + dividerHeight };
}

test('a full 10-word page fits a 360 by 300dp grid without scrolling or changing capacity', () => {
  const r = sizedPage('word', 300);
  const { tiles, rows, gap, heights, total } = pageGeometry(r);
  expect(tiles).toHaveLength(10);
  expect(rows).toHaveLength(5);
  expect(gap).toBe(6);
  heights.forEach(height => {
    expect(height).toBeCloseTo(55.2);
    expect(height).toBeLessThanOrEqual((300 - 4 * gap) / 5);
  });
  expect(total).toBeLessThanOrEqual(300);
  expect(r.UNSAFE_queryByType(ScrollView)).toBeNull();
});

test.each([
  ['word', 58, 330],
  ['letter', 60, 281],
] as const)('a roomy %s grid keeps its nominal height and 10dp gaps', (variant, nominalHeight, totalHeight) => {
  const r = sizedPage(variant, 400);
  const { tiles, gap, heights, total } = pageGeometry(r);
  expect(gap).toBe(10);
  expect(heights.every(height => height === nominalHeight)).toBe(true);
  expect(total).toBe(totalHeight);
  expect(tiles).toHaveLength(variant === 'word' ? 10 : 20);
});

test('gaps shrink before word tiles, then both recover when the grid grows', () => {
  const r = sizedPage('word', 322);
  let geometry = pageGeometry(r);
  expect(geometry.gap).toBe(8);
  expect(geometry.heights).toEqual([58, 58, 58, 58, 58]);
  expect(geometry.total).toBe(322);
  expect(geometry.tiles[0]).toHaveStyle({ width: 160 });
  for (const height of [300, 400]) {
    fireEvent(r.getByTestId('sized-grid'), 'layout', { nativeEvent: { layout: { width: 360, height } } });
    geometry = pageGeometry(r);
    expect(geometry.gap).toBe(height === 300 ? 6 : 10);
    expect(geometry.heights.every(value => value === (height === 300 ? 55.2 : 58))).toBe(true);
    expect(geometry.total).toBeLessThanOrEqual(height);
  }
});

test('a letter page fits its display rows and divider inside 250dp', () => {
  const r = sizedPage('letter', 250);
  const { tiles, rows, gap, heights, total } = pageGeometry(r);
  expect(tiles).toHaveLength(20);
  expect(rows).toHaveLength(4);
  expect(r.getAllByTestId('card-row-divider')).toHaveLength(1);
  expect(gap).toBe(6);
  expect(heights).toEqual([56.25, 56.25, 56.25, 56.25]);
  expect(total).toBeLessThanOrEqual(250);
  expect(r.UNSAFE_queryByType(ScrollView)).toBeNull();
});

test('tiles stop shrinking at 40dp and gaps at 6dp even when that must overflow', () => {
  const r = sizedPage('word', 100);
  const { gap, heights, total } = pageGeometry(r);
  expect(gap).toBe(6);
  expect(heights).toEqual([40, 40, 40, 40, 40]);
  expect(total).toBe(224);
  expect(total).toBeGreaterThan(100);
});
