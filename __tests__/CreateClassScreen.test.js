import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import CreateClassScreen from '../src/screens/children/CreateClassScreen';

const mockAddClass = jest.fn().mockResolvedValue({ success: true });
const mockNavigationGoBack = jest.fn();

jest.mock('../src/context/ClassesContext', () => ({
  useClasses: () => ({
    schools: [
      { id: 'school-1', name: 'Sunrise Primary' },
      { id: 'school-2', name: 'Hilltop School' },
    ],
    addClass: mockAddClass,
  }),
}));

const navigation = { goBack: mockNavigationGoBack };

const renderScreen = () =>
  render(
    <PaperProvider>
      <CreateClassScreen navigation={navigation} />
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

describe('CreateClassScreen', () => {
  test('renders all form fields', () => {
    const { getAllByText } = renderScreen();
    expect(getAllByText('School *').length).toBeGreaterThan(0);
    expect(getAllByText('Grade *').length).toBeGreaterThan(0);
    expect(getAllByText('Class Name *').length).toBeGreaterThan(0);
    expect(getAllByText('Teacher *').length).toBeGreaterThan(0);
    expect(getAllByText('Home Language *').length).toBeGreaterThan(0);
  });

  test('validates required fields on submit', async () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Create Class'));

    await waitFor(() => {
      expect(getByText('School is required')).toBeTruthy();
      expect(getByText('Grade is required')).toBeTruthy();
      expect(getByText('Class name is required')).toBeTruthy();
      expect(getByText('Teacher is required')).toBeTruthy();
      expect(getByText('Home language is required')).toBeTruthy();
    });

    expect(mockAddClass).not.toHaveBeenCalled();
  });

  test('renders Create Class submit button', () => {
    const { getByText } = renderScreen();
    expect(getByText('Create Class')).toBeTruthy();
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
});
