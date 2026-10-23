global.__MASI_NO_DEFAULT_HANDLE__ = true;
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, waitFor, within } from '@testing-library/react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import AddChildSheet from '../src/components/lessons/AddChildSheet';
import MakeGroupSheet from '../src/components/lessons/MakeGroupSheet';
import PutInGroupSheet from '../src/components/lessons/PutInGroupSheet';
import { getGroupDotColor } from '../src/utils/groupHelpers';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

const children = [
  { id: 'x', first_name: 'Xola', last_name: 'Child' },
  { id: 'e', first_name: 'Ênê', last_name: 'Child', class_id: 'class-1' },
  { id: 'a2', first_name: 'Aviwe', last_name: 'Zulu', class_id: 'class-2' },
  { id: 'a1', first_name: ' Aviwe ', last_name: ' McKeown ', class_id: 'class-1' },
];
const classes = [{ id: 'class-1', name: 'Grade 1A' }, { id: 'class-2', name: 'Grade 2B' }];
const labels = ['Aviwe McKeown, Grade 1A', 'Aviwe Zulu, Grade 2B', 'Ênê Child, Grade 1A', 'Xola Child'];
const handle = { isCurrent: () => true };

test('Add a child tells children apart with full names, known classes and locale order', async () => {
  const onAdd = jest.fn(async () => {});
  const onDismiss = jest.fn();
  const view = renderWithProviders(<AddChildSheet visible children={children} classes={classes} onAdd={onAdd} onDismiss={onDismiss} />);
  expect(view.getAllByRole('radio').map(row => row.props.accessibilityLabel)).toEqual(labels);
  expect(view.getByText('Aviwe McKeown')).toBeTruthy();
  expect(view.getAllByText('Grade 1A')).toHaveLength(2);
  fireEvent.press(view.getByRole('radio', { name: labels[0] }));
  await waitFor(() => expect(onAdd).toHaveBeenCalledWith('a1'));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

test('Put in a group uses visible child names, stable group order and the identity dot, with a name fallback', async () => {
  const groups = [{ id: 'g10', name: 'Group 10' }, { id: 'g2', name: 'Group 2' }, { id: 'g1', name: 'Group 1' }];
  const getChildrenInGroup = id => id === 'g1' ? children : id === 'g2' ? [children[1]] : [];
  const addChildToGroup = jest.fn(async () => ({ success: true }));
  const view = renderWithProviders(<PutInGroupSheet visible childId="new-child" groups={groups}
    getChildrenInGroup={getChildrenInGroup} addChildToGroup={addChildToGroup} handle={handle} onDismiss={jest.fn()} />);
  const rows = view.getAllByRole('button').filter(row => ['Aviwe & Aviwe & Ênê & Xola', 'Ênê', 'Group 10', 'New group'].includes(row.props.accessibilityLabel));
  expect(rows.map(row => row.props.accessibilityLabel)).toEqual(['Aviwe & Aviwe & Ênê & Xola', 'Ênê', 'Group 10', 'New group']);
  rows.slice(0, 3).forEach((row, index) => {
    expect(StyleSheet.flatten(within(row).getByTestId('group-dot').props.style).backgroundColor).toBe(getGroupDotColor(index));
  });
  fireEvent.press(rows[1]);
  await waitFor(() => expect(addChildToGroup).toHaveBeenCalledWith('new-child', 'g2'));
  expect(groups.map(group => group.id)).toEqual(['g10', 'g2', 'g1']);
});

test('Make a group tells children apart with full names, known classes and locale order', async () => {
  const makeGroup = jest.fn(async () => ({ success: true }));
  const view = renderWithProviders(<MakeGroupSheet visible ungrouped={children} classes={classes}
    makeGroup={makeGroup} handle={handle} onDismiss={jest.fn()} />);
  expect(view.getAllByRole('checkbox').map(row => row.props.accessibilityLabel)).toEqual(labels);
  expect(view.getByText('Aviwe McKeown')).toBeTruthy();
  expect(view.getByText('Grade 2B')).toBeTruthy();
  fireEvent.press(view.getByRole('checkbox', { name: labels[1] }));
  fireEvent.press(view.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(makeGroup).toHaveBeenCalledWith(['a2']));
});
