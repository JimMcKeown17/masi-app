import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
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
  <PaperProvider>
    <EditClassScreen route={route} navigation={navigation} />
  </PaperProvider>
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
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Save Changes'));

    await waitFor(() => expect(mockUpdateClass).toHaveBeenCalledWith('class-1', expect.objectContaining({
      name: '1A',
      teacher: 'Noluthando Mbeki',
    })));
    expect(mockNavigationGoBack).toHaveBeenCalledTimes(1);
  });

  test('stays on the form when local class update fails', async () => {
    mockUpdateClass.mockResolvedValueOnce({ success: false });
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Save Changes'));

    await waitFor(() => expect(mockUpdateClass).toHaveBeenCalled());
    expect(mockNavigationGoBack).not.toHaveBeenCalled();
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
    const pickerButtons = screen.getAllByTestId('right-icon-adornment');

    fireEvent.press(pickerButtons[0]);
    fireEvent.press(screen.getByText('Hilltop School'));
    expect(screen.getByDisplayValue('Hilltop School')).toBeTruthy();

    fireEvent.press(pickerButtons[1]);
    fireEvent.press(screen.getByText('Grade 2'));

    fireEvent.press(pickerButtons[2]);
    fireEvent.press(screen.getByText('English'));

    fireEvent.press(screen.getByText('Save Changes'));

    await waitFor(() => expect(mockUpdateClass).toHaveBeenCalledWith('class-1', expect.objectContaining({
      school_id: 'school-2',
      grade: 'Grade 2',
      home_language: 'English',
    })));
  });

  test('keeps the visible Cancel action on the school picker', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getAllByTestId('right-icon-adornment')[0]);

    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  test('enables search only for the school picker', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getAllByTestId('right-icon-adornment')[0]);
    expect(screen.getByLabelText('Search options')).toBeTruthy();

    fireEvent.press(screen.getByText('Cancel'));
    fireEvent.press(screen.getAllByTestId('right-icon-adornment')[1]);
    expect(screen.queryByLabelText('Search options')).toBeNull();
  });
});
