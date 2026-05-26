import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import AddChildScreen from '../src/screens/children/AddChildScreen';
import { GENDER_OPTIONS } from '../src/constants/options';

// Mock the contexts
const mockAddChild = jest.fn().mockResolvedValue({ success: true });
const mockNavigationGoBack = jest.fn();

jest.mock('../src/context/ChildrenContext', () => ({
  useChildren: () => ({
    addChild: mockAddChild,
  }),
}));

jest.mock('../src/context/ClassesContext', () => ({
  useClasses: () => ({
    classes: [
      {
        id: 'class-1',
        name: '1A',
        grade: 'Grade 1',
        teacher: 'Ms. Smith',
        school_id: 'school-1',
        home_language: 'isiXhosa',
      },
    ],
    schools: [{ id: 'school-1', name: 'Sunrise Primary' }],
  }),
}));

const route = { params: { classId: 'class-1' } };
const navigation = { goBack: mockNavigationGoBack };

const renderScreen = () =>
  render(
    <PaperProvider>
      <AddChildScreen route={route} navigation={navigation} />
    </PaperProvider>
  );

const collectNativeTextInputs = (node) => {
  if (!node) return [];
  const children = Array.isArray(node.children) ? node.children.flatMap(collectNativeTextInputs) : [];
  return node.type === 'TextInput' ? [node, ...children] : children;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AddChildScreen', () => {
  test('renders expected fields (first name, last name, age, gender)', () => {
    const { getAllByText } = renderScreen();
    // React Native Paper TextInput renders labels in multiple nodes
    expect(getAllByText('First Name *').length).toBeGreaterThan(0);
    expect(getAllByText('Last Name *').length).toBeGreaterThan(0);
    expect(getAllByText('Age').length).toBeGreaterThan(0);
    expect(getAllByText('Gender').length).toBeGreaterThan(0);
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

  test('gender options are only male and female', () => {
    expect(GENDER_OPTIONS).toEqual([
      { label: 'Female', value: 'female' },
      { label: 'Male', value: 'male' },
    ]);
  });

  test('does NOT render teacher or school input fields', () => {
    const { queryAllByText } = renderScreen();
    // "Teacher" text may appear in class info card as part of class details,
    // but should not appear as an input label
    const teacherInputs = queryAllByText('Teacher');
    // If "Teacher" appears, it's only in the info banner, not as a standalone label
    expect(teacherInputs.length).toBeLessThanOrEqual(0);
    expect(queryAllByText('School').length).toBe(0);
  });

  test('shows class info banner', () => {
    const { getByText } = renderScreen();
    expect(getByText('1A')).toBeTruthy();
    expect(getByText(/Sunrise Primary/)).toBeTruthy();
  });

  test('validates required fields', async () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Add Child'));

    await waitFor(() => {
      expect(getByText('First name is required')).toBeTruthy();
      expect(getByText('Last name is required')).toBeTruthy();
    });

    expect(mockAddChild).not.toHaveBeenCalled();
  });

  test('navigates back immediately after a successful local child save', async () => {
    mockAddChild.mockResolvedValueOnce({ success: true });
    const { getAllByDisplayValue, getByText } = renderScreen();
    const inputs = getAllByDisplayValue('');

    fireEvent.changeText(inputs[0], 'Amahle');
    fireEvent.changeText(inputs[1], 'Dlamini');
    fireEvent.press(getByText('Add Child'));

    await waitFor(() => expect(mockAddChild).toHaveBeenCalledWith(expect.objectContaining({
      first_name: 'Amahle',
      last_name: 'Dlamini',
      class_id: 'class-1',
    })));
    expect(mockNavigationGoBack).toHaveBeenCalledTimes(1);
  });

  test('stays on the form when local child save fails', async () => {
    mockAddChild.mockResolvedValueOnce({ success: false });
    const { getAllByDisplayValue, getByText } = renderScreen();
    const inputs = getAllByDisplayValue('');

    fireEvent.changeText(inputs[0], 'Amahle');
    fireEvent.changeText(inputs[1], 'Dlamini');
    fireEvent.press(getByText('Add Child'));

    await waitFor(() => expect(mockAddChild).toHaveBeenCalled());
    expect(mockNavigationGoBack).not.toHaveBeenCalled();
  });
});
