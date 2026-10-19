jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { TextInput as PaperTextInput } from 'react-native-paper';
import { AllProviders } from '../test-support/renderWithProviders';
import CreateClassScreen from '../src/screens/children/CreateClassScreen';

const mockAddClass = jest.fn().mockResolvedValue({ success: true });
const mockNavigationGoBack = jest.fn();
const mockNavigationReplace = jest.fn();
let mockProfile;

jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ profile: mockProfile }),
}));

jest.mock('../src/context/ClassesContext', () => ({
  useClasses: () => ({
    schools: [
      { id: 'school-1', name: 'Sunrise Primary' },
      { id: 'school-2', name: 'Hilltop School' },
    ],
    addClass: mockAddClass,
  }),
}));

const navigation = {
  goBack: mockNavigationGoBack,
  replace: mockNavigationReplace,
};

const screenElement = (route) => (
  <AllProviders>
    <CreateClassScreen navigation={navigation} route={route} />
  </AllProviders>
);

const renderScreen = (route) => render(screenElement(route));

const collectNativeTextInputs = (node) => {
  if (!node) return [];
  const children = Array.isArray(node.children) ? node.children.flatMap(collectNativeTextInputs) : [];
  return node.type === 'TextInput' ? [node, ...children] : children;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile = null;
  mockAddClass.mockResolvedValue({ success: true });
});

const completeNonSchoolRequiredFields = ({ getByLabelText, getByRole, getByText }) => {
  fireEvent.press(getByRole('button', { name: /^Grade \*,/ }));
  fireEvent.press(getByText('Grade 1'));

  fireEvent.changeText(getByLabelText('Class Name *'), '1A');
  fireEvent.changeText(getByLabelText('Teacher *'), 'Noluthando Mbeki');

  fireEvent.press(getByRole('button', { name: /^Home Language \*,/ }));
  fireEvent.press(getByText('isiXhosa'));
};

const completeRequiredFields = (screen) => {
  fireEvent.press(screen.getByRole('button', { name: /^School \*,/ }));
  fireEvent.press(screen.getByText('Sunrise Primary'));
  completeNonSchoolRequiredFields(screen);
};

describe('CreateClassScreen', () => {
  test('preloads the profile school and submits its school id', async () => {
    mockProfile = { schoolId: 'school-2', schoolName: 'Hilltop School' };
    const screen = renderScreen();

    expect(screen.getByRole('button', { name: 'School *, Hilltop School' })).toBeTruthy();
    completeNonSchoolRequiredFields(screen);
    fireEvent.press(screen.getByText('Create class'));

    await waitFor(() => expect(mockAddClass).toHaveBeenCalledWith(expect.objectContaining({
      school_id: 'school-2',
    })));
  });

  test('fills an untouched school field when the profile arrives asynchronously', () => {
    const screen = renderScreen();
    expect(screen.getByRole('button', { name: 'School *, ' })).toBeTruthy();

    mockProfile = { schoolId: 'school-2', schoolName: 'Hilltop School' };
    screen.rerender(screenElement());

    expect(screen.getByRole('button', { name: 'School *, Hilltop School' })).toBeTruthy();
  });

  test('keeps and submits a user-selected school after the profile refreshes', async () => {
    mockProfile = { schoolId: 'school-2', schoolName: 'Hilltop School' };
    const screen = renderScreen();

    fireEvent.press(screen.getByRole('button', { name: /^School \*,/ }));
    fireEvent.press(screen.getByText('Sunrise Primary'));
    mockProfile = { schoolId: 'school-2', schoolName: 'Hilltop School' };
    screen.rerender(screenElement());

    expect(screen.getByRole('button', { name: 'School *, Sunrise Primary' })).toBeTruthy();
    completeNonSchoolRequiredFields(screen);
    fireEvent.press(screen.getByText('Create class'));

    await waitFor(() => expect(mockAddClass).toHaveBeenCalledWith(expect.objectContaining({
      school_id: 'school-1',
    })));
  });

  test('keeps the school field empty when the profile has no school', () => {
    mockProfile = { schoolId: null, schoolName: null };
    const screen = renderScreen();

    expect(screen.getByRole('button', { name: 'School *, ' })).toBeTruthy();
  });

  test('renders all form fields', () => {
    const { getAllByText } = renderScreen();
    expect(getAllByText('School *').length).toBeGreaterThan(0);
    expect(getAllByText('Grade *').length).toBeGreaterThan(0);
    expect(getAllByText('Class Name *').length).toBeGreaterThan(0);
    expect(getAllByText('Teacher *').length).toBeGreaterThan(0);
    expect(getAllByText('Home Language *').length).toBeGreaterThan(0);
  });

  test('validates required fields on submit', async () => {
    const { getByText, getAllByRole, getByLabelText } = renderScreen();

    fireEvent.press(getByText('Create class'));

    await waitFor(() => {
      expect(getByText('School is required')).toBeTruthy();
      expect(getByText('Grade is required')).toBeTruthy();
      expect(getByText('Class name is required')).toBeTruthy();
      expect(getByText('Teacher is required')).toBeTruthy();
      expect(getByText('Home language is required')).toBeTruthy();
    });

    expect(getAllByRole('alert')[2]).toHaveTextContent('Class name is required');
    expect(getByLabelText('Class Name *, error: Class name is required')).toBeTruthy();
    expect(mockAddClass).not.toHaveBeenCalled();
  });

  test('renders Create class submit button', () => {
    const { getByText } = renderScreen();
    expect(getByText('Create class')).toBeTruthy();
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

  test('navigates back immediately after a successful local class create', async () => {
    const screen = renderScreen();
    completeRequiredFields(screen);

    fireEvent.press(screen.getByText('Create class'));

    await waitFor(() => expect(mockAddClass).toHaveBeenCalledWith(expect.objectContaining({
      school_id: 'school-1',
      grade: 'Grade 1',
      name: '1A',
      teacher: 'Noluthando Mbeki',
      home_language: 'isiXhosa',
    })));
    expect(mockNavigationGoBack).toHaveBeenCalledTimes(1);
    expect(mockNavigationReplace).not.toHaveBeenCalled();
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  test('advances onboarding to the child step with the created class', async () => {
    mockAddClass.mockResolvedValueOnce({
      success: true,
      classData: { id: 'class-new' },
    });
    const screen = renderScreen({ params: { onboarding: true } });
    completeRequiredFields(screen);

    fireEvent.press(screen.getByText('Create class'));

    await waitFor(() => expect(mockAddClass).toHaveBeenCalledWith(
      expect.objectContaining({ name: '1A' }),
      { onboarding: true }
    ));
    await waitFor(() => expect(mockNavigationReplace).toHaveBeenCalledWith(
      'ChildOnboarding',
      { classId: 'class-new' }
    ));
    expect(screen.queryByTestId('toast')).toBeNull();
    expect(mockNavigationGoBack).not.toHaveBeenCalled();
  });

  test('stays on the form when local class create fails', async () => {
    mockAddClass.mockResolvedValueOnce({ success: false });
    const screen = renderScreen();
    completeRequiredFields(screen);

    fireEvent.press(screen.getByText('Create class'));

    await waitFor(() => expect(mockAddClass).toHaveBeenCalled());
    expect(screen.getByRole('alert')).toHaveTextContent('Error creating class');
    expect(mockNavigationGoBack).not.toHaveBeenCalled();
  });
});

test('uses shared fields without a duplicate page title', () => {
  const screen = renderScreen();
  expect(screen.UNSAFE_queryAllByType(PaperTextInput)).toHaveLength(0);
  expect(screen.queryByText('Create New Class')).toBeNull();
});
