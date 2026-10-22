const mockUseClasses = jest.fn();
const mockUseChildren = jest.fn();

jest.mock('@expo/vector-icons', () => new Proxy({}, {
  get: (target, prop) => {
    if (prop === '__esModule') return true;
    if (!target[prop]) target[prop] = () => null;
    return target[prop];
  },
}), { virtual: true });

jest.mock('../src/context/ClassesContext', () => ({
  useClasses: () => mockUseClasses(),
}));

jest.mock('../src/context/ChildrenContext', () => ({
  useChildren: () => mockUseChildren(),
}));

jest.mock('../src/components/children/GroupPickerBottomSheet', () => ({ childId, visible }) => {
  const { Text } = require('react-native');
  return visible ? <Text testID="group-picker">{childId}</Text> : null;
});

import React from 'react';
import { fireEvent, within } from '@testing-library/react-native';
import { FAB, Card } from 'react-native-paper';
import { FlatList, StyleSheet } from 'react-native';
import { renderWithProviders as render } from '../test-support/renderWithProviders';
import { FAB_OVERHANG } from '../src/components/navigation/LockedBottomTabBar';
import ClassDetailScreen from '../src/screens/children/ClassDetailScreen';
import BrandButton from '../src/components/common/BrandButton';

const navigation = {
  setOptions: jest.fn(),
  navigate: jest.fn(),
  popToTop: jest.fn(),
  goBack: jest.fn(),
};

const route = { params: { classId: 'class-1' } };

const renderClassDetail = () => render(
    <ClassDetailScreen navigation={navigation} route={route} />
);

describe('ClassDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseChildren.mockReturnValue({
      groups: [],
      childrenGroups: [],
    });
  });

  test('renders class name and empty message when class is found with no children', () => {
    mockUseClasses.mockReturnValue({
      classes: [{
        id: 'class-1',
        name: 'Grade R Blue',
        school_id: 'school-1',
        grade: 'Grade R',
        teacher: 'Teacher A',
        home_language: 'isiXhosa',
      }],
      schools: [{ id: 'school-1', name: 'Masi Primary' }],
      getChildrenInClass: jest.fn(() => []),
    });

    const screen = renderClassDetail();

    expect(navigation.setOptions).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Grade R Blue' }));
    expect(screen.queryByText('Grade R Blue')).toBeNull();
    expect(screen.getByText('No children in this class yet.')).toBeTruthy();
    expect(screen.UNSAFE_queryByType(FAB)).toBeNull();
  });

  test('renders not-found message when class is not in the classes array', () => {
    mockUseClasses.mockReturnValue({
      classes: [],
      schools: [],
      getChildrenInClass: jest.fn(() => []),
    });

    const screen = renderClassDetail();

    expect(screen.getByText('Class not found.')).toBeTruthy();
  });

  test('the header uses a tertiary Manage classes button that returns to the class list', () => {
    mockUseClasses.mockReturnValue({ classes: [], schools: [], getChildrenInClass: () => [] });
    renderClassDetail();
    const { headerRight } = navigation.setOptions.mock.calls.at(-1)[0];
    const screen = render(headerRight());
    expect(screen.UNSAFE_getByType(BrandButton).props.variant).toBe('tertiary');
    fireEvent.press(screen.getByRole('button', { name: 'Manage classes' }));
    expect(navigation.popToTop).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  test('shows a neutral loading state before deciding the class is missing', () => {
    mockUseClasses.mockReturnValue({
      classes: [],
      schools: [],
      loading: true,
      getChildrenInClass: jest.fn(() => []),
    });

    const screen = renderClassDetail();

    expect(screen.getByText('Loading class…')).toBeTruthy();
    expect(screen.queryByText('Class not found.')).toBeNull();
  });

  test('opens child results from the row and keeps editing as an explicit action', () => {
    const classItem = {
      id: 'class-1',
      name: 'Grade R Blue',
      school_id: 'school-1',
      grade: 'Grade R',
      teacher: 'Teacher A',
      home_language: 'isiXhosa',
    };
    const child = {
      id: 'child-1',
      first_name: 'Amahle',
      last_name: 'Dlamini',
      age: 7,
      synced: true,
    };
    mockUseClasses.mockReturnValue({
      classes: [classItem],
      schools: [{ id: 'school-1', name: 'Masi Primary' }],
      getChildrenInClass: jest.fn(() => [child]),
    });

    const screen = renderClassDetail();

    fireEvent.press(screen.getByLabelText('View results for Amahle Dlamini'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('ChildResults', {
      child,
      classItem,
    });

    fireEvent.press(screen.getByLabelText('Edit Amahle Dlamini'));
    expect(navigation.navigate).toHaveBeenLastCalledWith('EditChild', {
      childId: 'child-1',
    });
  });
});

const classItem = {
  id: 'class-1', name: 'Grade R Blue', school_id: 'school-1', grade: 'Grade R',
  teacher: 'Teacher A', home_language: 'isiXhosa',
};
const child = { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', age: 7, synced: true };
const loadedState = (roster = [child]) => ({
  classes: [classItem], schools: [{ id: 'school-1', name: 'Masi Primary' }], loading: false,
  getChildrenInClass: () => roster,
});
beforeEach(() => {
  jest.clearAllMocks();
  mockUseClasses.mockReturnValue(loadedState());
  mockUseChildren.mockReturnValue({ groups: [], childrenGroups: [] });
});

test('header options carry the class name and Manage classes', () => {
  renderClassDetail();
  expect(navigation.setOptions).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Grade R Blue' }));
  const screen = render(navigation.setOptions.mock.calls.at(-1)[0].headerRight());
  fireEvent.press(screen.getByRole('button', { name: 'Manage classes' }));
  expect(navigation.popToTop).toHaveBeenCalledTimes(1);
});
test.each([true, false])('loading=%s and not-found set an empty title', (loading) => {
  mockUseClasses.mockReturnValue({ ...loadedState([]), classes: [], loading });
  const screen = renderClassDetail();
  expect(navigation.setOptions).toHaveBeenLastCalledWith(expect.objectContaining({ title: '' }));
  expect(screen.getByText(loading ? 'Loading class…' : 'Class not found.')).toBeTruthy();
});
test('class info is on the canvas and Edit class opens its form', () => {
  const screen = renderClassDetail();
  expect(screen.getByText('Masi Primary')).toBeTruthy();
  expect(screen.getByText('Grade R • Teacher A')).toBeTruthy();
  expect(screen.getByText('Language: isiXhosa')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Edit class' }));
  expect(navigation.navigate).toHaveBeenCalledWith('EditClass', { classId: 'class-1' });
  expect(screen.UNSAFE_queryByType(Card)).toBeNull();
});
test('Add child replaces the FAB', () => {
  const screen = renderClassDetail();
  expect(screen.getByRole('header', { name: 'Children (1)' })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Add child' }));
  expect(navigation.navigate).toHaveBeenCalledWith('AddChild', { classId: 'class-1' });
  expect(screen.UNSAFE_queryByType(FAB)).toBeNull();
});
test('empty class keeps its section and explains Add child', () => {
  mockUseClasses.mockReturnValue(loadedState([]));
  const screen = renderClassDetail();
  expect(screen.getByRole('header', { name: 'Children (0)' })).toBeTruthy();
  expect(screen.getByText('No children in this class yet.')).toBeTruthy();
  expect(screen.getByText('Tap Add child to add a child.')).toBeTruthy();
});
test('group chips cycle after six and open the picker for the selected child', () => {
  const second = { ...child, id: 'child-2', first_name: 'Buhle' };
  const third = { ...child, id: 'child-3', first_name: 'Cebo' };
  mockUseClasses.mockReturnValue(loadedState([child, second, third]));
  mockUseChildren.mockReturnValue({
    groups: Array.from({ length: 8 }, (_, i) => ({ id: `g-${i}`, name: `Group ${i + 1}` })),
    childrenGroups: [{ child_id: child.id, group_id: 'g-0' }, { child_id: second.id, group_id: 'g-6' }],
  });
  const screen = renderClassDetail();
  const firstChip = screen.getByRole('button', { name: 'Change group for Amahle Dlamini, currently Group 1' });
  const secondChip = screen.getByRole('button', { name: 'Change group for Buhle Dlamini, currently Group 7' });
  const dot = (chip) => StyleSheet.flatten(within(chip).getByTestId('group-dot', { includeHiddenElements: true }).props.style).backgroundColor;
  expect(dot(secondChip)).toBe(dot(firstChip));
  fireEvent.press(firstChip);
  expect(screen.getByTestId('group-picker')).toHaveTextContent(child.id);
  fireEvent.press(screen.getByRole('button', { name: 'Assign group to Cebo Dlamini' }));
  expect(screen.getByTestId('group-picker')).toHaveTextContent(third.id);
});
test('four separate controls per row include the letter tracker', () => {
  const screen = renderClassDetail();
  const names = ['View results for Amahle Dlamini', 'Assign group to Amahle Dlamini', 'Letter tracker for Amahle Dlamini', 'Edit Amahle Dlamini'];
  names.forEach(name => {
    const button = screen.getByRole('button', { name });
    expect(within(button).getAllByRole('button')).toHaveLength(1);
  });
  fireEvent.press(screen.getByRole('button', { name: names[2] }));
  expect(navigation.navigate).toHaveBeenCalledWith('LetterTracker', { child, classItem });
});
test('Syncing… only for an unsynced child', () => {
  const screen = renderClassDetail();
  expect(screen.queryByText('Syncing…')).toBeNull();
  mockUseClasses.mockReturnValue(loadedState([child, { ...child, id: 'child-2', first_name: 'Buhle', synced: false }]));
  screen.rerender(<ClassDetailScreen navigation={navigation} route={route} />);
  expect(screen.getAllByText('Syncing…')).toHaveLength(1);
});
test('list padding clears the Record button', () => {
  const screen = renderClassDetail();
  expect(StyleSheet.flatten(screen.UNSAFE_getByType(FlatList).props.contentContainerStyle).paddingBottom).toBe(FAB_OVERHANG + 16);
});
test('loading to loaded to loading on the same screen preserves hook order and cached content', () => {
  const error = jest.spyOn(console, 'error');
  try {
    mockUseClasses.mockReturnValue({ ...loadedState([]), classes: [], loading: true });
    const screen = renderClassDetail();
    expect(screen.getByText('Loading class…')).toBeTruthy();
    mockUseClasses.mockReturnValue(loadedState());
    screen.rerender(<ClassDetailScreen navigation={navigation} route={route} />);
    expect(screen.getByText('Masi Primary')).toBeTruthy();
    const list = screen.UNSAFE_getByType(FlatList);
    expect(typeof list.props.onScroll).toBe('function');
    fireEvent.scroll(list, { nativeEvent: { contentOffset: { y: 20 } } });
    expect(navigation.setOptions).toHaveBeenCalledWith({ headerScrolled: true });
    mockUseClasses.mockReturnValue({ ...loadedState(), loading: true });
    screen.rerender(<ClassDetailScreen navigation={navigation} route={route} />);
    expect(screen.getByText('Masi Primary')).toBeTruthy();
    expect(screen.UNSAFE_getByType(FlatList)).toBeTruthy();
    expect(screen.queryByText('Loading class…')).toBeNull();
    expect(error).not.toHaveBeenCalled();
  } finally {
    error.mockRestore();
  }
});

test.each([null, undefined, '', '  \t '])('missing home language %p is shown as Not set', (home_language) => {
  mockUseClasses.mockReturnValue({ ...loadedState([]), classes: [{ ...classItem, home_language }] });
  expect(renderClassDetail().getByText('Language: Not set')).toBeTruthy();
});
