jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { TextInput as PaperTextInput } from 'react-native-paper';
import { AllProviders } from '../test-support/renderWithProviders';
import EditClassScreen from '../src/screens/children/EditClassScreen';

const mockUpdateClass = jest.fn();
const mockDeleteClass = jest.fn();
const mockGetChildrenInClass = jest.fn(() => []);
const mockIsClassShared = jest.fn(async () => false);
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
    isClassShared: mockIsClassShared,
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
  test.each([
    [/^School \*,/, 'Select school'],
    [/^Grade \*,/, 'Select grade'],
    [/^Home language \*,/, 'Select home language'],
  ])('uses sentence case for %s', (field, title) => {
    const screen = renderScreen();
    fireEvent.press(screen.getByRole('button', { name: field }));
    expect(screen.getByRole('header', { name: title })).toBeTruthy();
  });

  test('uses curly quotes in the class-name example', () => {
    expect(renderScreen().getByPlaceholderText('e.g. “1A”, “2B”')).toBeTruthy();
  });

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

    fireEvent.press(screen.getByRole('button', { name: /^Home language \*,/ }));
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

// Plan O2 item 3 (ADR-0014 D4): Delete class asks in a sheet. When the class is shared (another EA
// created it or teaches it), it can only mean leaving it; otherwise the server decides whether the
// class closes. The class's children never lose their class. Draft copy for Jim's wording pass.
describe('Delete class sheet', () => {
  beforeEach(() => {
    mockIsClassShared.mockResolvedValue(false);
    mockGetChildrenInClass.mockReturnValue([]);
    mockDeleteClass.mockResolvedValue({ success: true });
  });

  test('a shared class is left, not deleted, and stays for the other EAs', async () => {
    mockIsClassShared.mockResolvedValue(true);
    mockGetChildrenInClass.mockReturnValue([{ id: 'child-1' }, { id: 'child-2' }]);
    const screen = renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Delete class' }));
    expect(await screen.findByRole('header', { name: 'Leave 1A?' })).toBeTruthy();
    expect(screen.getByText('1A stays open for the other EAs who teach it. Lessons you saved will still upload. Your children in 1A stay in your list.')).toBeTruthy();
    expect(mockIsClassShared).toHaveBeenCalledWith('class-1');
    fireEvent.press(screen.getByRole('button', { name: 'Leave class' }));
    await waitFor(() => expect(mockDeleteClass).toHaveBeenCalledWith('class-1'));
    expect(mockNavigationGoBack).toHaveBeenCalledTimes(1);
  });

  test('a class only this EA holds may close, and the copy says what happens to its children', async () => {
    mockGetChildrenInClass.mockReturnValue([{ id: 'child-1' }, { id: 'child-2' }]);
    const screen = renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Delete class' }));
    expect(await screen.findByRole('header', { name: 'Delete 1A?' })).toBeTruthy();
    expect(screen.getByText('Lessons you saved will still upload. If another EA also teaches 1A, you only leave it. '
      + 'Otherwise 1A closes and its 2 children leave your list, so first move any child you still teach to another class.')).toBeTruthy();
    expect(screen.queryByText(/become unassigned/)).toBeNull();
    // The open sheet is modal, so its confirm is the only reachable "Delete class" button.
    fireEvent.press(screen.getByRole('button', { name: 'Delete class' }));
    await waitFor(() => expect(mockDeleteClass).toHaveBeenCalledWith('class-1'));
  });

  test('an empty class only this EA holds gets the short copy', async () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Delete class' }));
    expect(await screen.findByRole('header', { name: 'Delete 1A?' })).toBeTruthy();
    expect(screen.getByText('Lessons you saved will still upload. If another EA also teaches 1A, you only leave it.')).toBeTruthy();
  });

  test('Keep class closes the sheet without deleting', async () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Delete class' }));
    await screen.findByRole('header', { name: 'Delete 1A?' });
    fireEvent.press(screen.getByRole('button', { name: 'Keep class' }));
    expect(screen.queryByRole('header', { name: 'Delete 1A?' })).toBeNull();
    expect(mockDeleteClass).not.toHaveBeenCalled();
  });
});
