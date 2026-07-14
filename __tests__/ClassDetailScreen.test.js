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

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import ClassDetailScreen from '../src/screens/children/ClassDetailScreen';

const navigation = {
  setOptions: jest.fn(),
  navigate: jest.fn(),
  popToTop: jest.fn(),
};

const route = { params: { classId: 'class-1' } };

const renderClassDetail = () => render(
  <PaperProvider>
    <ClassDetailScreen navigation={navigation} route={route} />
  </PaperProvider>
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

    expect(screen.getByText('Grade R Blue')).toBeTruthy();
    expect(screen.getByText('No children in this class yet.')).toBeTruthy();
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
