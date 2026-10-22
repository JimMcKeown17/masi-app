import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { render, within } from '@testing-library/react-native';
import { tokens } from '../../theme/tokens';
import { MarkTile } from '../MarkTile';
import { TileGroups } from '../TileGroups';
import { UiText } from '../Text';

const groups = [
  { key: 'first', testID: 'sentence-1', heading: 'Sentence 1', items: [{ position: 0, text: 'there' }, { position: 1, text: 'how' }] },
  { key: 'second', testID: 'sentence-2', heading: 'Sentence 2', items: [{ position: 2, text: 'there' }] },
];
const renderTile = (item: { position: number; text: string }) => <MarkTile key={item.position} variant="pill" state="idle" text={item.text} accessibilityLabel={`item ${item.position}`} />;

test.each([false, true])('TileGroups owns 16dp horizontal and vertical content gutters with card=%s', card => {
  const r = render(<TileGroups groups={groups} card={card} renderTile={renderTile} />);
  expect(StyleSheet.flatten(r.UNSAFE_getByType(ScrollView).props.contentContainerStyle)).toMatchObject({
    paddingHorizontal: tokens.space.lg, paddingVertical: tokens.space.lg, gap: tokens.space.lg,
  });
});

test('TileGroups renders a heading per group and wraps tiles in a vertical ScrollView', () => {
  const r = render(<TileGroups groups={groups} testID="groups" renderTile={renderTile} />);
  expect(r.UNSAFE_getByType(ScrollView).props.horizontal ?? false).toBe(false);
  expect(r.getByTestId('groups')).toBeTruthy();
  for (const group of groups) {
    const container = r.getByTestId(group.testID);
    expect(within(container).getByText(group.heading)).toHaveStyle({ fontSize: tokens.font.label, color: tokens.color.muted });
    expect(container.findByType(UiText).props).toMatchObject({ variant: 'label', tone: 'muted' });
    const tiles = within(container).getAllByLabelText(/^item \d+$/);
    expect(tiles.map(tile => tile.props.accessibilityLabel)).toEqual(group.items.map(item => `item ${item.position}`));
    let row = tiles[0].parent;
    while (row && typeof row.type !== 'string') row = row.parent;
    expect(row).toHaveStyle({ flexDirection: 'row', flexWrap: 'wrap', gap: 8 });
  }
});

test('card groups have a white rounded padded surface around each heading and wrapping row', () => {
  const r = render(<TileGroups groups={groups} card renderTile={renderTile} />);
  for (const group of groups) {
    expect(r.getByTestId(group.testID)).toHaveStyle({ backgroundColor: tokens.color.surface, borderRadius: tokens.radius.card, padding: tokens.space.lg });
  }
});

test('headings and cards are optional and empty groups render safely', () => {
  const r = render(<TileGroups groups={[{ key: 'empty', items: [] }, { key: 'plain', testID: 'plain', items: groups[0].items }]} renderTile={renderTile} />);
  expect(r.UNSAFE_queryByType(UiText)).toBeNull();
  expect(r.getAllByLabelText(/^item \d+$/)).toHaveLength(2);
  expect(r.getByTestId('plain')).not.toHaveStyle({ backgroundColor: tokens.color.surface });
  r.rerender(<TileGroups groups={[]} renderTile={renderTile} />);
  expect(r.queryAllByLabelText(/^item \d+$/)).toHaveLength(0);
});
