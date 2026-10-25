import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { render, fireEvent, within } from '@testing-library/react-native';
import { LastAttemptedSheet } from '../LastAttemptedSheet';
import { tokens } from '../../theme/tokens';
import { BottomBar, PrimaryButton, SecondaryButton, TextLink, TileGroups, UiText } from '../../ui';

const labels = ['a', 'n', 'i', 't'];

test('pick an item then Confirm reports its index', () => {
  const onConfirm = jest.fn();
  const r = render(<LastAttemptedSheet labels={labels} defaultIndex={0} onConfirm={onConfirm} />);
  fireEvent.press(r.getByLabelText('i, item 3'));
  fireEvent.press(r.getByText('Confirm'));
  expect(onConfirm).toHaveBeenCalledWith(2);
});
test('Reached the end reports the last index', () => {
  const onConfirm = jest.fn();
  const r = render(<LastAttemptedSheet labels={labels} defaultIndex={0} onConfirm={onConfirm} />);
  fireEvent.press(r.getByText('Reached the end'));
  expect(onConfirm).toHaveBeenCalledWith(3);
});
test('Nothing attempted reports -1', () => {
  const onConfirm = jest.fn();
  const r = render(<LastAttemptedSheet labels={labels} defaultIndex={0} onConfirm={onConfirm} />);
  fireEvent.press(r.getByText('Nothing attempted'));
  expect(onConfirm).toHaveBeenCalledWith(-1);
});
test('Cancel appears only when onCancel is given', () => {
  const onCancel = jest.fn();
  const withCancel = render(<LastAttemptedSheet labels={labels} defaultIndex={0} onConfirm={jest.fn()} onCancel={onCancel} />);
  fireEvent.press(withCancel.getByText('Cancel'));
  expect(onCancel).toHaveBeenCalledTimes(1);
  const noCancel = render(<LastAttemptedSheet labels={labels} defaultIndex={0} onConfirm={jest.fn()} />);
  expect(noCancel.queryByText('Cancel')).toBeNull();
});

test('the selected cell is outlined in ink, never red', () => {
  const r = render(<LastAttemptedSheet labels={labels} defaultIndex={0} onConfirm={jest.fn()} />);
  expect(r.getByLabelText('a, item 1')).toHaveStyle({ borderColor: tokens.color.ink, borderWidth: 1 });
  expect(within(r.getByLabelText('a, item 1')).getByTestId('current-ring', { includeHiddenElements: true })).toHaveStyle({ borderColor: tokens.color.ink, borderWidth: 3 });
  fireEvent.press(r.getByLabelText('i, item 3'));
  expect(r.getByLabelText('i, item 3')).toHaveStyle({ borderColor: tokens.color.ink, borderWidth: 1 });
  expect(within(r.getByLabelText('i, item 3')).getByTestId('current-ring', { includeHiddenElements: true })).toHaveStyle({ borderColor: tokens.color.ink, borderWidth: 3 });
  expect(r.getByLabelText('i, item 3').props.accessibilityState).toMatchObject({ selected: true });
  expect(r.getByLabelText('a, item 1').props.accessibilityState).toMatchObject({ selected: false });
  for (const element of r.UNSAFE_root.findAll((node: { type: unknown }) => typeof node.type === 'string')) {
    const style = StyleSheet.flatten(element.props.style);
    expect(style?.backgroundColor).not.toBe(tokens.color.primary);
    expect(style?.borderColor).not.toBe(tokens.color.primary);
    expect(style?.color).not.toBe(tokens.color.primary);
  }
});

test('cells after the selection read as not reached', () => {
  const r = render(<LastAttemptedSheet labels={labels} defaultIndex={1} onConfirm={jest.fn()} />);
  expect(r.getByText('i')).toHaveStyle({ color: tokens.color.notReached });
  expect(r.getByText('t')).toHaveStyle({ color: tokens.color.notReached });
  expect(r.getByText('a')).toHaveStyle({ color: tokens.color.ink });
  expect(r.getByText('n')).toHaveStyle({ color: tokens.color.ink });
  fireEvent.press(r.getByLabelText('t, item 4'));
  expect(r.getByText('i')).toHaveStyle({ color: tokens.color.ink });
  expect(r.getByLabelText('n, item 2')).toHaveStyle({ borderWidth: 1, borderColor: tokens.color.line });
  fireEvent.press(r.getByLabelText('a, item 1'));
  expect(r.getByText('n')).toHaveStyle({ color: tokens.color.notReached });
  expect(r.getByText('t')).toHaveStyle({ color: tokens.color.notReached });
});

test('with nothing selected all cells are idle and Confirm still reports the default', () => {
  const onConfirm = jest.fn();
  const r = render(<LastAttemptedSheet labels={labels} defaultIndex={-1} onConfirm={onConfirm} />);
  labels.forEach((label, index) => {
    expect(r.getByLabelText(`${label}, item ${index + 1}`)).toHaveStyle({ borderWidth: 1, borderColor: tokens.color.line });
    expect(r.getByLabelText(`${label}, item ${index + 1}`).props.accessibilityState).toMatchObject({ selected: false });
    expect(r.getByText(label)).toHaveStyle({ color: tokens.color.ink });
  });
  expect(r.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  fireEvent.press(r.getByRole('button', { name: 'Confirm' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onConfirm).toHaveBeenCalledWith(-1);
});

test('the heading and helper scroll with the cells inside TileGroups', () => {
  const r = render(<LastAttemptedSheet labels={labels} defaultIndex={0} onConfirm={jest.fn()} />);
  const scroller = r.UNSAFE_getByType(TileGroups).findByType(ScrollView);
  expect(scroller.findAllByType(UiText).map((text: { props: { children?: React.ReactNode } }) => text.props.children)).toEqual([
    'Last item attempted', 'Tap the last item the child attempted.',
  ]);
  expect(scroller.findAllByProps({ accessibilityLabel: 'a, item 1' }).length).toBeGreaterThan(0);
});

test.each([true, false])('the footer has one wrapping link row followed by Confirm with onCancel=%s', canCancel => {
  const r = render(<LastAttemptedSheet labels={labels} defaultIndex={0} onConfirm={jest.fn()} onCancel={canCancel ? jest.fn() : undefined} />);
  const bar = r.UNSAFE_getByType(BottomBar);
  const linkLabels = ['Reached the end', 'Nothing attempted', ...(canCancel ? ['Cancel'] : [])];
  const links = bar.findAllByType(TextLink);
  expect(links.map((link: { props: { label: string } }) => link.props.label)).toEqual(linkLabels);
  expect(bar.findAllByType(SecondaryButton)).toHaveLength(0);
  const row = links[0].parent;
  for (const link of links) expect(link.parent).toBe(row);
  expect(StyleSheet.flatten(row?.props.style)).toMatchObject({
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    columnGap: tokens.space.xl, rowGap: tokens.space.xs,
  });
  linkLabels.forEach(label => expect(r.getByRole('button', { name: label })).toBeTruthy());
  const primaryButtons = bar.findAllByType(PrimaryButton);
  expect(primaryButtons).toHaveLength(1);
  expect(primaryButtons[0].props.label).toBe('Confirm');
  expect(bar.props.children).toHaveLength(2);
  expect(bar.props.children[0].type).toBe(View);
  expect(bar.props.children[1].type).toBe(PrimaryButton);
});


test('a null default leaves every tile idle and requires a choice before Confirm', () => {
  const onConfirm = jest.fn();
  const r = render(<LastAttemptedSheet labels={labels} defaultIndex={null} onConfirm={onConfirm} />);
  const confirm = r.getByRole('button', { name: 'Confirm' });
  expect(confirm.props.accessibilityState).toMatchObject({ disabled: true });
  expect(confirm).toBeDisabled();
  fireEvent.press(confirm);
  expect(onConfirm).not.toHaveBeenCalled();
  expect(r.queryAllByTestId('current-ring', { includeHiddenElements: true })).toHaveLength(0);
  labels.forEach((label, index) => {
    const tile = r.getByLabelText(`${label}, item ${index + 1}`);
    expect(tile.props.accessibilityState).toMatchObject({ selected: false });
    expect(tile).toHaveStyle({ borderWidth: 1, borderColor: tokens.color.line });
    expect(r.getByText(label)).toHaveStyle({ color: tokens.color.ink });
  });
  fireEvent.press(r.getByLabelText('i, item 3'));
  expect(r.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  expect(r.getByLabelText('i, item 3').props.accessibilityState).toMatchObject({ selected: true });
  expect(within(r.getByLabelText('i, item 3')).getByTestId('current-ring', { includeHiddenElements: true })).toHaveStyle({ borderColor: tokens.color.ink, borderWidth: 3 });
  fireEvent.press(r.getByRole('button', { name: 'Confirm' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onConfirm).toHaveBeenCalledWith(2);
});


test.each([['Reached the end', 3], ['Nothing attempted', -1]] as const)(
  'with a null default %s confirms in one tap', (label, index) => {
    const onConfirm = jest.fn();
    const r = render(<LastAttemptedSheet labels={labels} defaultIndex={null} onConfirm={onConfirm} />);
    fireEvent.press(r.getByRole('button', { name: label }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(index);
  },
);

test('with a null default Cancel still acts in one tap', () => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  const r = render(<LastAttemptedSheet labels={labels} defaultIndex={null} onConfirm={onConfirm} onCancel={onCancel} />);
  fireEvent.press(r.getByRole('button', { name: 'Cancel' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});
