// __tests__/AttentionArea.test.js
jest.mock('@expo/vector-icons', () => ({ Ionicons: jest.fn(() => null) }), { virtual: true });
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import AttentionArea from '../src/components/home/AttentionArea';
import IconTile from '../src/components/common/IconTile';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import { colors, tints } from '../src/constants/colors';

const items = [
  { key: 'auto_clock_out:time-1', kind: 'auto_clock_out', tone: 'warning', title: 'Clocked out after 10 hours',
    subtitle: 'Automatic · Wed · check hours', accessibilityLabel: 'Clocked out automatically after 10 hours, Wed. Check your hours',
    route: 'TimeEntriesList', dismissible: true, entryId: 'time-1' },
  { key: 'assessment_due', kind: 'assessment_due', tone: 'neutral', title: '1 child to assess',
    subtitle: '11 of 12 children assessed', accessibilityLabel: '1 child to assess. 11 of 12 children assessed. Open Assess',
    route: 'Assessments', dismissible: true },
];

test('renders nothing when empty', () => {
  const screen = render(<AttentionArea items={[]} onOpen={jest.fn()} onDismiss={jest.fn()} />);
  expect(screen.toJSON()).toBeNull();
});

test('a lesson in progress has a canvas play icon, a chevron, and opens without a dismiss button', () => {
  const item = {
    key: 'lesson_in_progress:draft-1', kind: 'lesson_in_progress', tone: 'neutral',
    title: 'Lesson in progress', subtitle: 'Amahle & Lulu · Resume',
    accessibilityLabel: 'Lesson in progress with Amahle and Lulu. Resume',
    route: 'Lesson', params: { draftId: 'draft-1' }, dismissible: false,
  };
  const onOpen = jest.fn();
  const onDismiss = jest.fn();
  Ionicons.mockClear();
  const screen = render(<AttentionArea items={[item]} onOpen={onOpen} onDismiss={onDismiss} />);
  const tile = screen.UNSAFE_getByType(IconTile);
  expect(tile.props).toMatchObject({ icon: 'play-circle-outline', tone: 'canvas', iconSize: 22 });
  expect(StyleSheet.flatten(tile.findByType('View').props.style).backgroundColor).toBe(colors.background);
  expect(Ionicons.mock.calls.some(([props]) => props.name === 'play-circle-outline' && props.size === 22)).toBe(true);
  expect(Ionicons.mock.calls.some(([props]) => props.name === 'chevron-forward')).toBe(true);
  expect(screen.getByText('Lesson in progress')).toBeTruthy();
  expect(screen.getByText('Amahle & Lulu · Resume')).toBeTruthy();
  expect(screen.queryByLabelText('Dismiss: Lesson in progress')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: item.accessibilityLabel }));
  expect(onOpen).toHaveBeenCalledWith(item);
  expect(onDismiss).not.toHaveBeenCalled();
});

test('cards open and dismiss independently', () => {
  const onOpen = jest.fn();
  const onDismiss = jest.fn();
  const screen = render(<AttentionArea items={items} onOpen={onOpen} onDismiss={onDismiss} />);
  expect(screen.getByLabelText('Needs your attention')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Clocked out automatically after 10 hours, Wed. Check your hours'));
  fireEvent.press(screen.getByLabelText('Dismiss: Clocked out after 10 hours'));
  expect(onOpen).toHaveBeenCalledWith(items[0]);
  expect(onDismiss).toHaveBeenCalledWith(items[0]);
});

test('the card border is tints.rule and the tile is a 40dp IconTile with a 22dp glyph', () => {
  const screen = render(<AttentionArea items={items} onOpen={jest.fn()} onDismiss={jest.fn()} />);
  const tiles = screen.UNSAFE_getAllByType(IconTile);
  expect(tiles).toHaveLength(2);
  for (const [index, item] of items.entries()) {
    const button = screen.getByLabelText(item.accessibilityLabel);
    let card = button.parent;
    while (card && !StyleSheet.flatten(card.props.style)?.borderWidth) card = card.parent;
    expect(StyleSheet.flatten(card.props.style).borderColor).toBe(tints.rule);
    const tile = tiles[index];
    expect(tile.props.iconSize).toBe(22);
    expect(StyleSheet.flatten(tile.findByType('View').props.style)).toMatchObject({
      width: 40, height: 40, borderRadius: 14,
      backgroundColor: index === 0 ? colors.warningBg : colors.background,
    });
    expect(Ionicons.mock.calls.some(([props]) => props.name === (index === 0 ? 'alarm-outline' : 'clipboard-outline')
      && props.size === 22 && props.color === (index === 0 ? colors.warningText : colors.text))).toBe(true);
    const pressable = screen.UNSAFE_root.find((node) => node.props.accessibilityLabel === item.accessibilityLabel
      && typeof node.props.style === 'function');
    expect(StyleSheet.flatten(pressable.props.style({ pressed: true })).backgroundColor).toBe(tints.pressed);
  }
});
