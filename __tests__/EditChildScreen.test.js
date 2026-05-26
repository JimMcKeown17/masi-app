import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import EditChildScreen from '../src/screens/children/EditChildScreen';

const mockUpdateChild = jest.fn();
const mockDeleteChild = jest.fn();
const mockNavigationGoBack = jest.fn();
let mockChildren;

const makeChild = (gender = 'female') => ({
  id: 'child-1',
  first_name: 'Amahle',
  last_name: 'Dlamini',
  age: 7,
  gender,
  class_id: 'class-1',
});

jest.mock('react-native-safe-area-context', () => {
  const ReactForMock = require('react');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    useSafeAreaInsets: () => insets,
    SafeAreaInsetsContext: ReactForMock.createContext(insets),
    SafeAreaProvider: ({ children }) => <>{children}</>,
  };
});

jest.mock('../src/components/children/GroupPickerBottomSheet', () => ({
  __esModule: true,
  default: () => null,
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
    classes: [{
      id: 'class-1',
      school_id: 'school-1',
      name: '1A',
      grade: 'Grade 1',
      teacher: 'Noluthando Mbeki',
      home_language: 'isiXhosa',
    }],
    schools: [{ id: 'school-1', name: 'Sunrise Primary' }],
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
});
