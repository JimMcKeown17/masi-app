jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { TextInput as PaperTextInput } from 'react-native-paper';
import { AllProviders } from '../test-support/renderWithProviders';
import EditClassScreen from '../src/screens/children/EditClassScreen';

const mockUpdateClass = jest.fn();
const mockDeleteClass = jest.fn();
const mockGetChildrenInClass = jest.fn(() => []);
const mockNavigationGoBack = jest.fn();
let mockClasses;
let mockSchools;

jest.mock('../src/context/ClassesContext', () => ({
  useClasses: () => ({
    schools: mockSchools,
    classes: mockClasses,
    updateClass: mockUpdateClass,
    deleteClass: mockDeleteClass,
    getChildrenInClass: mockGetChildrenInClass,
  }),
}));

const route = { params: { classId: 'class-1' } };
const navigation = { goBack: mockNavigationGoBack };

const classScreenElement = () => (
  <AllProviders>
    <EditClassScreen route={route} navigation={navigation} />
  </AllProviders>
);

const renderScreen = () => render(classScreenElement());

const collectNativeTextInputs = (node) => {
  if (!node) return [];
  const children = Array.isArray(node.children) ? node.children.flatMap(collectNativeTextInputs) : [];
  return node.type === 'TextInput' ? [node, ...children] : children;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSchools = [
    { id: 'school-1', name: 'Sunrise Primary' },
    { id: 'school-2', name: 'Hilltop School' },
  ];
  mockClasses = [{
    id: 'class-1',
    school_id: 'school-1',
    name: '1A',
    grade: 'Grade 1',
    teacher: 'Noluthando Mbeki',
    home_language: 'isiXhosa',
  }];
  mockUpdateClass.mockResolvedValue({ success: true });
});

describe('EditClassScreen', () => {
  test('disables autocorrect, spell check, and autocomplete for typed fields', () => {
    const { toJSON } = renderScreen();
    const editableInputs = collectNativeTextInputs(toJSON())
      .filter(input => input.props.editable !== false);

    expect(editableInputs.length).toBeGreaterThanOrEqual(2);
    for (const input of editableInputs) {
      expect(input.props.autoCorrect).toBe(false);
      expect(input.props.spellCheck).toBe(false);
      expect(input.props.autoComplete).toBe('off');
    }
  });

  test('navigates back immediately after a successful local class update', async () => {
    const { getByText, queryByTestId } = renderScreen();

    fireEvent.press(getByText('Save changes'));

    await waitFor(() => expect(mockUpdateClass).toHaveBeenCalledWith('class-1', expect.objectContaining({
      name: '1A',
      teacher: 'Noluthando Mbeki',
    })));
    expect(mockNavigationGoBack).toHaveBeenCalledTimes(1);
    expect(queryByTestId('toast')).toBeNull();
  });

  test('stays on the form when local class update fails', async () => {
    mockUpdateClass.mockResolvedValueOnce({ success: false });
    const { getByText, getByRole } = renderScreen();

    fireEvent.press(getByText('Save changes'));

    await waitFor(() => expect(mockUpdateClass).toHaveBeenCalled());
    expect(mockNavigationGoBack).not.toHaveBeenCalled();
    expect(getByRole('alert')).toHaveTextContent('Error updating class');
  });

  test('does not reset typed values when background sync refreshes the class object', () => {
    const screen = renderScreen();

    fireEvent.changeText(screen.getByDisplayValue('1A'), 'Typed Class');
    mockClasses = [{ ...mockClasses[0] }];
    screen.rerender(classScreenElement());

    expect(screen.getByDisplayValue('Typed Class')).toBeTruthy();
  });

  test('saves the selected school id, grade, and home language', async () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByRole('button', { name: /^School \*,/ }));
    fireEvent.press(screen.getByText('Hilltop School'));
    expect(screen.getByRole('button', { name: 'School *, Hilltop School' })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: /^Grade \*,/ }));
    fireEvent.press(screen.getByText('Grade 2'));

    fireEvent.press(screen.getByRole('button', { name: /^Home Language \*,/ }));
    fireEvent.press(screen.getByText('English'));

    fireEvent.press(screen.getByText('Save changes'));

    await waitFor(() => expect(mockUpdateClass).toHaveBeenCalledWith('class-1', expect.objectContaining({
      school_id: 'school-2',
      grade: 'Grade 2',
      home_language: 'English',
    })));
  });

  test('keeps the visible Cancel action on the school picker', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByRole('button', { name: /^School \*,/ }));

    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  test('enables search only for the school picker', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByRole('button', { name: /^School \*,/ }));
    expect(screen.getByLabelText('Search options')).toBeTruthy();

    fireEvent.press(screen.getByText('Cancel'));
    fireEvent.press(screen.getByRole('button', { name: /^Grade \*,/ }));
    expect(screen.queryByLabelText('Search options')).toBeNull();
  });
});

test('a missing class name is an alert note on its named field', () => {
  const screen = renderScreen();
  fireEvent.changeText(screen.getByDisplayValue('1A'), '');
  fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Class name is required');
  expect(screen.getByLabelText('Class Name *, error: Class name is required')).toBeTruthy();
  expect(mockUpdateClass).not.toHaveBeenCalled();
});

test('uses shared fields without a duplicate page title', () => {
  const screen = renderScreen();
  expect(screen.UNSAFE_queryAllByType(PaperTextInput)).toHaveLength(0);
  expect(screen.queryByText('Edit Class')).toBeNull();
});
