jest.mock('../src/hooks/useActiveProgrammeSubject', () => ({ useActiveProgrammeSubject: jest.fn() }));
import { useActiveProgrammeSubject } from '../src/hooks/useActiveProgrammeSubject';
beforeEach(() => useActiveProgrammeSubject.mockReturnValue({ subject: 'reading', isMaths: false, loading: false }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { colors, tints } from '../src/constants/colors';
import { render, fireEvent, waitFor, within } from '@testing-library/react-native';
import { AllProviders } from '../test-support/renderWithProviders';
import EditChildScreen from '../src/screens/children/EditChildScreen';
import { READING_LEVELS } from '../src/constants/literacyConstants';

const mockUpdateChild = jest.fn();
const mockDeleteChild = jest.fn();
const mockNavigationGoBack = jest.fn();
let mockChildren;
let mockClasses;
let mockSchools;
let mockGroups;
let mockChildrenGroups;

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
  getGroupDotColor: () => '#1565C0',
  compareGroups: (left, right) => (left.name || '').localeCompare(right.name || ''),
}));

jest.mock('../src/context/ChildrenContext', () => ({
  useChildren: () => ({
    children: mockChildren,
    groups: mockGroups,
    childrenGroups: mockChildrenGroups,
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
  <AllProviders>
    <EditChildScreen route={route} navigation={navigation} />
  </AllProviders>
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
  mockGroups = [];
  mockChildrenGroups = [];
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
  test('the reading-level picker button uses the domain sentence case', () => {
    expect(renderScreen().getByText('Current reading level')).toBeTruthy();
  });

  test.each([
    ['Choose class for Amahle Dlamini', 'Choose class'],
    ['Choose current reading level for Amahle Dlamini', 'Current reading level'],
  ])('uses sentence case for the sheet opened by %s', (label, title) => {
    const screen = renderScreen();
    fireEvent.press(screen.getByLabelText(label));
    expect(screen.getByRole('header', { name: title })).toBeTruthy();
  });

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
    const { getByRole, queryByTestId } = renderScreen();

    fireEvent.press(getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockUpdateChild).toHaveBeenCalledWith('child-1', expect.objectContaining({
      first_name: 'Amahle',
      last_name: 'Dlamini',
      gender: 'female',
    })));
    expect(mockNavigationGoBack).toHaveBeenCalledTimes(1);
    expect(queryByTestId('toast')).toBeNull();
  });

  test('shows and edits the child current reading level', async () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText(READING_LEVELS[4]));
    expect(screen.getByLabelText('Dismiss reading level picker')).toBeTruthy();
    fireEvent.press(screen.getByText(READING_LEVELS[5]));
    fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockUpdateChild).toHaveBeenCalledWith(
      'child-1',
      expect.objectContaining({ reading_level: READING_LEVELS[5] }),
    ));
  });

  test('stays on the form when local child update fails', async () => {
    mockUpdateChild.mockResolvedValueOnce({ success: false });
    const { getByRole } = renderScreen();

    fireEvent.press(getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockUpdateChild).toHaveBeenCalled());
    expect(mockNavigationGoBack).not.toHaveBeenCalled();
    expect(getByRole('alert')).toHaveTextContent('Error updating child');
  });

  test('preserves historic gender values when no new chip is selected', async () => {
    mockChildren = [makeChild('non_binary')];
    const { getByRole } = renderScreen();

    fireEvent.press(getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockUpdateChild).toHaveBeenCalledWith('child-1', expect.objectContaining({
      gender: 'non_binary',
    })));
  });

  test('renders historic gender values with both chips unselected', () => {
    mockChildren = [makeChild('non_binary')];
    const { getByTestId } = renderScreen();

    expect(getByTestId('edit-child-gender-female').props.accessibilityState)
      .toEqual(expect.objectContaining({ checked: false }));
    expect(getByTestId('edit-child-gender-male').props.accessibilityState)
      .toEqual(expect.objectContaining({ checked: false }));
  });

  test('overwrites a historic gender value only after choosing a male or female chip', async () => {
    mockChildren = [makeChild('unknown')];
    const { getByTestId, getByRole } = renderScreen();

    fireEvent.press(getByTestId('edit-child-gender-male'));
    fireEvent.press(getByRole('button', { name: 'Save changes' }));

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
    expect(within(screen.getByTestId('toast')).getByText('Class updated')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('toast-status', { includeHiddenElements: true }).props.style).backgroundColor).toBe(colors.success);
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

test('validation exposes an alert and the field error name', () => {
  const screen = renderScreen();
  fireEvent.changeText(screen.getByDisplayValue('Amahle'), '');
  fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
  expect(screen.getByRole('alert')).toHaveTextContent('First name is required');
  expect(screen.getByLabelText('First Name *, error: First name is required')).toBeTruthy();
  expect(mockUpdateChild).not.toHaveBeenCalled();
});

test('Delete child keeps the confirmation and deletes only after confirmation', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockDeleteChild.mockResolvedValueOnce({ success: true });
  const screen = renderScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Delete child' }));
  expect(mockDeleteChild).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith('Delete Child', 'Are you sure you want to remove this child?', expect.any(Array));
  await alert.mock.calls[0][2].find(action => action.text === 'Delete').onPress();
  expect(mockDeleteChild).toHaveBeenCalledWith('child-1');
  expect(mockNavigationGoBack).toHaveBeenCalledTimes(1);
  alert.mockRestore();
});

test('leaves the page title to the navigator', () => {
  const screen = renderScreen();
  expect(screen.queryByText('Edit Child')).toBeNull();
});


test('the current group shows the shared dot and an ink name with the default field edge', () => {
  mockGroups = [{ id: 'g1', name: 'Lions' }];
  mockChildrenGroups = [{ child_id: 'child-1', group_id: 'g1' }];
  const screen = renderScreen();
  const field = screen.getByRole('button', { name: 'Choose group for Amahle Dlamini' });
  expect(StyleSheet.flatten(within(field).getByTestId('group-dot').props.style)).toMatchObject({ backgroundColor: '#1565C0', width: 10, height: 10 });
  expect(StyleSheet.flatten(within(field).getByText('Lions').props.style).color).toBe(colors.text);
  expect(StyleSheet.flatten(field.props.style)).toMatchObject({ borderColor: tints.control, borderWidth: 1.5 });
});

test('numeracy hides reading level', () => {
  useActiveProgrammeSubject.mockReturnValue({ subject: 'maths', isMaths: true, loading: false });
  const screen = renderScreen();
  expect(screen.queryByText('Current reading level', { includeHiddenElements: true })).toBeNull();
  expect(screen.queryByText('This level pre-fills the next literacy session and changes when the child progresses.')).toBeNull();
  expect(screen.queryByLabelText(/Choose current reading level/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
});
test.each([READING_LEVELS[4], null, ''])('saving keeps the stored reading level (%p)', async reading_level => {
  useActiveProgrammeSubject.mockReturnValue({ subject: 'maths', isMaths: true, loading: false });
  mockChildren = [{ ...makeChild(), reading_level }];
  const screen = renderScreen();
  fireEvent.changeText(screen.getByDisplayValue('Amahle'), 'Amended');
  fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(mockUpdateChild).toHaveBeenCalledWith('child-1', expect.objectContaining({
    first_name: 'Amended', reading_level,
  })));
});
