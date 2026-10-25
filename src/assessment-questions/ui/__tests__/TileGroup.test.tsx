import React from 'react';
import { render, within } from '@testing-library/react-native';
import { tokens } from '../../theme/tokens';
import { MarkTile } from '../MarkTile';
import { TileGroup } from '../TileGroup';
import { UiText } from '../Text';

const groups = [
  { key: 'first', testID: 'sentence-1', heading: 'Sentence 1', items: [{ position: 0, text: 'there' }, { position: 1, text: 'how' }] },
  { key: 'second', testID: 'sentence-2', heading: 'Sentence 2', items: [{ position: 2, text: 'there' }] },
];
const renderTile = (item: { position: number; text: string }) => <MarkTile key={item.position} variant="pill" state="idle" text={item.text} accessibilityLabel={`item ${item.position}`} />;

const renderGroups = (value: ReadonlyArray<{ key: string; testID?: string; heading?: string; items: typeof groups[number]['items'] }>, card = false) => <>
  {value.map(group => <TileGroup key={group.key} testID={group.testID} heading={group.heading} card={card}>
    {group.items.map(renderTile)}
  </TileGroup>)}
</>;

test('TileGroup renders each heading and wraps tiles in reading order', () => {
  const r = render(renderGroups(groups));
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
  const r = render(renderGroups(groups, true));
  for (const group of groups) {
    expect(r.getByTestId(group.testID)).toHaveStyle({ backgroundColor: tokens.color.surface, borderRadius: tokens.radius.card, padding: tokens.space.lg });
  }
});

test('headings and cards are optional and empty groups render safely', () => {
  const r = render(renderGroups([{ key: 'empty', items: [] }, { key: 'plain', testID: 'plain', items: groups[0].items }]));
  expect(r.UNSAFE_queryByType(UiText)).toBeNull();
  expect(r.getAllByLabelText(/^item \d+$/)).toHaveLength(2);
  expect(r.getByTestId('plain')).not.toHaveStyle({ backgroundColor: tokens.color.surface });
  r.rerender(<TileGroup testID="empty">{[]}</TileGroup>);
  expect(r.getByTestId('empty')).toBeTruthy();
  expect(r.queryAllByLabelText(/^item \d+$/)).toHaveLength(0);
});
