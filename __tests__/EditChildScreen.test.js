import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import EditChildScreen from '../src/screens/children/EditChildScreen';
import { READING_LEVELS } from '../src/constants/literacyConstants';

const mockUpdateChild = jest.fn();
const mockDeleteChild = jest.fn();
const mockNavigationGoBack = jest.fn();
let mockChildren;
let mockClasses;
let mockSchools;

const makeChild = (gender = 'female') => ({
  id: 'child-1',
  first_name: 'Amahle',
  last_name: 'Dlamini',
  age: 7,
  gender,
  reading_level: READING_LEVELS[4],
  class_id: 'class-1',
});

jest.mock('react-native-safe-area-context', () => {
  const ReactForMock = require('react');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 320, height: 640 };
  const SafeAreaInsetsContext = ReactForMock.createContext(insets);
  const SafeAreaFrameContext = ReactForMock.createContext(frame);
  return {
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    SafeAreaInsetsContext,
    SafeAreaFrameContext,
    SafeAreaProvider: ({ children }) => children,
    SafeAreaConsumer: SafeAreaInsetsContext.Consumer,
    initialWindowMetrics: { insets, frame },
  };
});

jest.mock('../src/components/children/GroupPickerBottomSheet', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../src/utils/groupHelpers', () => ({
  getGroupColor: () => ({ text: '#000000' }),
  compareGroups: (left, right) => (left.name || '').localeCompare(right.name || ''),
}));

jest.mock('../src/context/ChildrenContext', () => ({
  useChildren: () => ({
    children: mockChildren,
    groups: [],
    childrenGroups: [],
    updateChild: mockUpdateChild,
    deleteChild: mockDeleteChild,
  }),
}));

jest.mock('../src/context/ClassesContext', () => ({
  useClasses: () => ({
    classes: mockClasses,
    schools: mockSchools,
  }),
}));

const route = { params: { childId: 'child-1' } };
const navigation = { goBack: mockNavigationGoBack };

const screenElement = () => (
  <PaperProvider>
    <EditChildScreen route={route} navigation={navigation} />
  </PaperProvider>
);

const renderScreen = () => render(screenElement());

const collectNativeTextInputs = (node) => {
  if (!node) return [];
  const children = Array.isArray(node.children) ? node.children.flatMap(collectNativeTextInputs) : [];
  return node.type === 'TextInput' ? [node, ...children] : children;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockChildren = [makeChild('female')];
  mockClasses = [
    {
      id: 'class-1',
      school_id: 'school-1',
      name: '1A',
      grade: 'Grade 1',
      teacher: 'Noluthando Mbeki',
      home_language: 'isiXhosa',
    },
    {
      id: 'class-2',
      school_id: 'school-2',
      name: '2B',
      grade: 'Grade 2',
      teacher: 'Zanele Moyo',
      home_language: 'English',
    },
  ];
  mockSchools = [
    { id: 'school-1', name: 'Sunrise Primary' },
    { id: 'school-2', name: 'Hilltop School' },
  ];
  mockUpdateChild.mockResolvedValue({ success: true });
});

describe('EditChildScreen', () => {
  test('disables autocorrect, spell check, and autocomplete for typed fields', () => {
    const { toJSON } = renderScreen();
    const editableInputs = collectNativeTextInputs(toJSON())
      .filter(input => input.props.editable !== false);

    expect(editableInputs.length).toBeGreaterThanOrEqual(3);
    for (const input of editableInputs) {
      expect(input.props.autoCorrect).toBe(false);
      expect(input.props.spellCheck).toBe(false);
      expect(input.props.autoComplete).toBe('off');
    }
  });

  test('navigates back immediately after a successful local child update', async () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Save Changes'));

    await waitFor(() => expect(mockUpdateChild).toHaveBeenCalledWith('child-1', expect.objectContaining({
      first_name: 'Amahle',
      last_name: 'Dlamini',
      gender: 'female',
    })));
    expect(mockNavigationGoBack).toHaveBeenCalledTimes(1);
  });

  test('shows and edits the child current reading level', async () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText(READING_LEVELS[4]));
    expect(screen.getByLabelText('Dismiss reading level picker')).toBeTruthy();
    fireEvent.press(screen.getByText(READING_LEVELS[5]));
    fireEvent.press(screen.getByText('Save Changes'));

    await waitFor(() => expect(mockUpdateChild).toHaveBeenCalledWith(
      'child-1',
      expect.objectContaining({ reading_level: READING_LEVELS[5] }),
    ));
  });

  test('stays on the form when local child update fails', async () => {
    mockUpdateChild.mockResolvedValueOnce({ success: false });
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Save Changes'));

    await waitFor(() => expect(mockUpdateChild).toHaveBeenCalled());
    expect(mockNavigationGoBack).not.toHaveBeenCalled();
  });

  test('preserves historic gender values when no new chip is selected', async () => {
    mockChildren = [makeChild('non_binary')];
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Save Changes'));

    await waitFor(() => expect(mockUpdateChild).toHaveBeenCalledWith('child-1', expect.objectContaining({
      gender: 'non_binary',
    })));
  });

  test('renders historic gender values with both chips unselected', () => {
    mockChildren = [makeChild('non_binary')];
    const { getByTestId } = renderScreen();

    expect(getByTestId('edit-child-gender-female').props.accessibilityState)
      .toEqual(expect.objectContaining({ selected: false }));
    expect(getByTestId('edit-child-gender-male').props.accessibilityState)
      .toEqual(expect.objectContaining({ selected: false }));
  });

  test('overwrites a historic gender value only after choosing a male or female chip', async () => {
    mockChildren = [makeChild('unknown')];
    const { getByTestId, getByText } = renderScreen();

    fireEvent.press(getByTestId('edit-child-gender-male'));
    fireEvent.press(getByText('Save Changes'));

    await waitFor(() => expect(mockUpdateChild).toHaveBeenCalledWith('child-1', expect.objectContaining({
      gender: 'male',
    })));
  });

  test('does not reset typed values when background sync refreshes the child object', () => {
    const screen = renderScreen();

    fireEvent.changeText(screen.getByDisplayValue('Amahle'), 'Typed Name');
    mockChildren = [{ ...makeChild('female') }];
    screen.rerender(screenElement());

    expect(screen.getByDisplayValue('Typed Name')).toBeTruthy();
  });

  test('updates the selected class for the correct child without adding Cancel', async () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByLabelText('Choose class for Amahle Dlamini'));
    expect(screen.getByLabelText('Dismiss class picker')).toBeTruthy();
    expect(screen.queryByText('Cancel')).toBeNull();
    fireEvent.press(screen.getByLabelText('Select class 2B'));

    await waitFor(() => expect(mockUpdateChild).toHaveBeenCalledWith(
      'child-1',
      { class_id: 'class-2' },
    ));
  });

  test('clears the current class through the explicit No class option', async () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByLabelText('Choose class for Amahle Dlamini'));
    fireEvent.press(screen.getByLabelText('Select no class'));

    await waitFor(() => expect(mockUpdateChild).toHaveBeenCalledWith(
      'child-1',
      { class_id: null },
    ));
  });

  test('still offers No class when no assignable classes are available', () => {
    mockClasses = [];
    const screen = renderScreen();

    fireEvent.press(screen.getByLabelText('Choose class for Amahle Dlamini'));

    expect(screen.getByLabelText('Select no class')).toBeTruthy();
    expect(screen.queryByText('No classes available. Create a class first.')).toBeNull();
  });
});
