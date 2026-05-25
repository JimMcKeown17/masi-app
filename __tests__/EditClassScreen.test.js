import React from 'react';
import { render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import EditClassScreen from '../src/screens/children/EditClassScreen';

const mockUpdateClass = jest.fn();
const mockDeleteClass = jest.fn();
const mockGetChildrenInClass = jest.fn(() => []);
const mockNavigationGoBack = jest.fn();

jest.mock('../src/context/ClassesContext', () => ({
  useClasses: () => ({
    schools: [{ id: 'school-1', name: 'Sunrise Primary' }],
    classes: [{
      id: 'class-1',
      school_id: 'school-1',
      name: '1A',
      grade: 'Grade 1',
      teacher: 'Noluthando Mbeki',
      home_language: 'isiXhosa',
    }],
    updateClass: mockUpdateClass,
    deleteClass: mockDeleteClass,
    getChildrenInClass: mockGetChildrenInClass,
  }),
}));

const route = { params: { classId: 'class-1' } };
const navigation = { goBack: mockNavigationGoBack };

const renderScreen = () =>
  render(
    <PaperProvider>
      <EditClassScreen route={route} navigation={navigation} />
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
});
