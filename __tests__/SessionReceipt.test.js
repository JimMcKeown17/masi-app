import React from 'react';
const ReactNative = require('react-native');
import { StyleSheet, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import SessionReceipt from '../src/components/sessions/SessionReceipt';
import LetterReceiptTile from '../src/components/sessions/LetterReceiptTile';
import { buildReceiptRows } from '../src/utils/sessionCompleteView';
import { borderRadius, colors, tints } from '../src/constants/colors';
import { typeRoles } from '../src/constants/typography';

const rows = buildReceiptRows({
  childNames: ['Anelisa', 'Athenkosi'], letters: ['s', 'm', 'n', 'l'], readingLevel: '3 Letter Blends',
});
const style = node => StyleSheet.flatten(node.props.style);

beforeEach(() => jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({
  width: 390, height: 844, scale: 1, fontScale: 1,
}));
afterEach(() => jest.restoreAllMocks());

test.each([1, 1.59])('fontScale %s preserves the horizontal receipt layout', fontScale => {
  ReactNative.useWindowDimensions.mockReturnValue({ width: 390, height: 844, scale: 1, fontScale });
  const screen = render(<SessionReceipt rows={rows} />);
  rows.forEach(row => expect(style(screen.getByLabelText(row.accessibilityLabel))).toMatchObject({
    flexDirection: 'row', justifyContent: 'space-between', gap: 16,
  }));
  expect(screen.getByText('Reading level').props.numberOfLines).toBe(1);
  expect(style(screen.getByText('3 Letter Blends'))).toMatchObject({ textAlign: 'right', flex: 1 });
});

test.each([1.6, 2, 3.5])('fontScale %s stacks wrapping labels above left-aligned receipt values', fontScale => {
  ReactNative.useWindowDimensions.mockReturnValue({ width: 390, height: 844, scale: 1, fontScale });
  const screen = render(<SessionReceipt rows={rows} />);
  rows.forEach(row => {
    const renderedRow = screen.getByLabelText(row.accessibilityLabel);
    expect(renderedRow.props.accessible).toBe(true);
    expect(style(renderedRow)).toMatchObject({ flexDirection: 'column', alignItems: 'stretch' });
    expect(screen.getByText(row.label).props.numberOfLines).toBeUndefined();
    expect(style(screen.getByText(row.label)).marginTop ?? 0).toBe(0);
  });
  for (const value of ['Anelisa & Athenkosi', '3 Letter Blends']) {
    expect(style(screen.getByText(value))).toMatchObject({ textAlign: 'left', flex: 0 });
    expect(screen.getByText(value).props.numberOfLines).toBeUndefined();
  }
  expect(style(screen.getByTestId('receipt-letters'))).toMatchObject({ justifyContent: 'flex-start', flex: 0 });
  // Native layout notifications must not reinstate the horizontal offsets.
  fireEvent(screen.getByText('3 Letter Blends'), 'textLayout', { nativeEvent: { lines: [{}, {}] } });
  expect(style(screen.getByText('Reading level')).marginTop ?? 0).toBe(0);
  expect(screen.getAllByLabelText(/^(Children|Letters|Reading level):/).map(node => node.props.accessibilityLabel))
    .toEqual(rows.map(row => row.accessibilityLabel));
});

test('each row is one accessible phrase in order', () => {
  const screen = render(<SessionReceipt rows={rows} />);
  const phrases = screen.getAllByLabelText(/^(Children|Letters|Reading level):/);
  expect(phrases.map(node => node.props.accessibilityLabel)).toEqual([
    'Children: Anelisa and Athenkosi', 'Letters: M, L, N, S', 'Reading level: 3 Letter Blends',
  ]);
  phrases.forEach(node => expect(node.props.accessible).toBe(true));
  expect(screen.getByText('Children').props.accessible).toBe(false);
  expect(screen.getByText('Anelisa & Athenkosi').props.accessible).toBe(false);
  expect(style(screen.toJSON())).toMatchObject({ marginTop: 20, marginHorizontal: 24 });
});

test('tiles draw lowercase in teaching order without shrinking or separate announcements', () => {
  const screen = render(<SessionReceipt rows={rows} />);
  expect(screen.UNSAFE_getAllByType(LetterReceiptTile).map(node => node.props.letter)).toEqual(['m', 'l', 'n', 's']);
  for (const letter of ['m', 'l', 'n', 's']) {
    const text = screen.getByText(letter);
    expect(text.props.maxFontSizeMultiplier).toBe(1.2);
    expect(text.props.accessible).toBe(false);
    expect(style(text)).toMatchObject({ ...typeRoles.textRowTitle, color: colors.red700 });
    const tile = screen.UNSAFE_getAllByType(LetterReceiptTile).find(node => node.props.letter === letter);
    expect(style(tile.findByType(View))).toMatchObject({
      width: 36, height: 36, flexShrink: 0, borderRadius: borderRadius.sm,
      backgroundColor: colors.red50, borderWidth: 1.5, borderColor: colors.red100,
    });
  }
});

test('dividers under every row but the last', () => {
  const screen = render(<SessionReceipt rows={rows} />);
  const renderedRows = rows.map(row => screen.getByLabelText(row.accessibilityLabel));
  renderedRows.slice(0, -1).forEach(row => expect(style(row)).toMatchObject({
    borderBottomWidth: 1, borderBottomColor: tints.rule, minHeight: 52, gap: 16,
  }));
  expect(style(renderedRows[2]).borderBottomWidth ?? 0).toBe(0);
  expect(style(screen.getByText('Children'))).toMatchObject({ ...typeRoles.textSectionLabel, color: colors.textSecondary });
  expect(screen.getByText('Children').props.numberOfLines).toBe(1);
});

test('a wrapped text value turns left-aligned with the label on the first line', () => {
  const screen = render(<SessionReceipt rows={rows} />);
  const value = () => screen.getByText('Anelisa & Athenkosi');
  expect(style(value())).toMatchObject({ ...typeRoles.textRowTitle, color: colors.text, textAlign: 'right', flex: 1, paddingVertical: 8 });
  expect(value().props.numberOfLines).toBeUndefined();
  fireEvent(value(), 'textLayout', { nativeEvent: { lines: [{}, {}] } });
  expect(style(value()).textAlign).toBe('left');
  expect(style(screen.getByText('Children')).marginTop).toBe(11);
  expect(style(screen.getByLabelText(rows[0].accessibilityLabel)).alignItems).toBe('flex-start');
  fireEvent(value(), 'textLayout', { nativeEvent: { lines: [{}] } });
  expect(style(value()).textAlign).toBe('right');
  expect(style(screen.getByLabelText(rows[0].accessibilityLabel)).alignItems).toBe('center');
});

test('letter tiles start right-aligned and switch to flex-start only once they wrap', () => {
  const screen = render(<SessionReceipt rows={rows} />);
  const letters = () => screen.getByTestId('receipt-letters');
  expect(style(letters())).toMatchObject({ justifyContent: 'flex-end', flexWrap: 'wrap', gap: 6, maxWidth: 246, flex: 1, paddingVertical: 8 });
  // Native onLayout includes both 8dp paddings: a single 36dp tile row is 52dp tall.
  fireEvent(letters(), 'layout', { nativeEvent: { layout: { width: 246, height: 52 } } });
  expect(style(letters()).justifyContent).toBe('flex-end');
  fireEvent(letters(), 'layout', { nativeEvent: { layout: { width: 246, height: 78 } } });
  expect(style(letters()).justifyContent).toBe('flex-start');
  expect(style(screen.getByText('Letters')).marginTop).toBe(18);
  expect(style(screen.getByLabelText(rows[1].accessibilityLabel)).alignItems).toBe('flex-start');
  fireEvent(letters(), 'layout', { nativeEvent: { layout: { width: 246, height: 52 } } });
  expect(style(letters()).justifyContent).toBe('flex-end');
});

test('all eight letters remain in the wrapping receipt', () => {
  const manyRows = buildReceiptRows({ letters: ['s', 'm', 'n', 'l', 'a', 'e', 'i', 'o'] });
  const screen = render(<SessionReceipt rows={manyRows} />);
  expect(screen.UNSAFE_getAllByType(LetterReceiptTile)).toHaveLength(8);
  expect(screen.queryByText(/more/)).toBeNull();
});

test('no rows renders nothing', () => {
  expect(render(<SessionReceipt rows={[]} />).toJSON()).toBeNull();
});
