jest.mock('../src/hooks/useAssessableChildren', () => ({ useAssessableChildren: () => {
  const { children } = require('../src/context/ChildrenContext').useChildren();
  return { all: children, yourChildren: children, restOfClass: [], loading: false };
} }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AssessmentChildSelectScreen from '../src/screens/assessments/AssessmentChildSelectScreen';
import ChildResultsScreen from '../src/screens/assessments/ChildResultsScreen';
import { useAuth } from '../src/context/AuthContext';
import { useChildren } from '../src/context/ChildrenContext';
import { useClasses } from '../src/context/ClassesContext';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';

jest.mock('react-native-paper', () => {
  const React = require('react');
  const {
    Pressable,
    Text: NativeText,
    TextInput,
    View,
  } = require('react-native');

  const Text = ({ children, ...props }) => <NativeText {...props}>{children}</NativeText>;
  const Button = ({ children, onPress, ...props }) => (
    <Pressable onPress={onPress} {...props}>
      <NativeText>{children}</NativeText>
    </Pressable>
  );
  const Searchbar = ({ placeholder, value, onChangeText, ...props }) => (
    <TextInput
      placeholder={placeholder}
      value={value}
      onChangeText={onChangeText}
      {...props}
    />
  );
  const Portal = ({ children }) => <>{children}</>;
  const Dialog = ({ visible, children }) => (visible ? <View>{children}</View> : null);
  Dialog.Title = Text;
  Dialog.Content = View;
  Dialog.Actions = View;
  const RadioButton = {
    Group: ({ children }) => <View>{children}</View>,
    Item: ({ label, onPress }) => (
      <Pressable onPress={onPress}>
        <NativeText>{label}</NativeText>
      </Pressable>
    ),
  };
  const Card = ({ children, onPress, ...props }) => (
    <Pressable onPress={onPress} disabled={!onPress} {...props}>
      {children}
    </Pressable>
  );
  Card.Content = View;

  return {
    Text,
    Searchbar,
    Portal,
    Dialog,
    Button,
    RadioButton,
    Card,
  };
});

jest.mock('@react-navigation/native', () => ({
  NavigationContext: require('react').createContext(undefined),
  useFocusEffect: (callback) => {
    const React = require('react');
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock('../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../src/context/ChildrenContext', () => ({
  useChildren: jest.fn(),
}));

jest.mock('../src/context/ClassesContext', () => ({
  useClasses: jest.fn(),
}));

jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  ...jest.requireActual('../src/db/repositories/assessmentsRepository'),
  assessmentsRepository: {
    getQuestionResults: jest.fn(),
  },
}));


jest.mock('../src/components/assessment/LetterMasteryPanel', () => () => null);

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const child = {
  id: 'child-1',
  first_name: 'Amahle',
  last_name: 'Dlamini',
  class_id: 'class-1',
};

const classItem = {
  id: 'class-1',
  name: 'Grade 1A',
  home_language: 'English',
};

const makeNavigation = () => ({
  navigate: jest.fn(),
});

describe('assessment entry routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete child.home_language;
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useChildren.mockReturnValue({ children: [child] });
    useClasses.mockReturnValue({ classes: [classItem] });
    assessmentsRepository.getQuestionResults.mockResolvedValue([]);
  });

  test.each(['letter_sounds', 'word_reading'])(
    'child select launches %s once without waiting for its history preload', async (testCode) => {
      child.home_language = 'English';
      assessmentsRepository.getQuestionResults.mockReturnValue(new Promise(() => {}));
      const navigation = makeNavigation();
      const screen = render(<AssessmentChildSelectScreen navigation={navigation} route={{ params: { testCode } }} />);
      fireEvent.press(screen.getByText('Amahle Dlamini'));
      fireEvent.press(screen.getByText('Amahle Dlamini'));
      expect(navigation.navigate).toHaveBeenCalledTimes(1);
      expect(navigation.navigate).toHaveBeenCalledWith('StandaloneTest', { testCode, child, languageCode: 'en' });
      expect(assessmentsRepository.getQuestionResults).toHaveBeenCalledWith({ userId: 'user-1', questionCodes: [testCode] });
    },
  );

  test.each(['letter_sounds', 'word_reading'])(
    'child results launches %s once with the detected class language', async (testCode) => {
      const navigation = makeNavigation();
      const screen = render(<ChildResultsScreen navigation={navigation} route={{ params: { child, classItem } }} />);
      const button = screen.getAllByText('Assess now')[testCode === 'letter_sounds' ? 0 : 1];
      fireEvent.press(button);
      fireEvent.press(button);
      expect(navigation.navigate).toHaveBeenCalledTimes(1);
      expect(navigation.navigate).toHaveBeenCalledWith('StandaloneTest', { testCode, child, languageCode: 'en' });
      await waitFor(() => expect(assessmentsRepository.getQuestionResults).toHaveBeenCalled());
    },
  );

  test.each(['letter_sounds', 'word_reading'])('child results launches %s for an Afrikaans class in af', async (testCode) => {
    const navigation = makeNavigation();
    const screen = render(<ChildResultsScreen navigation={navigation} route={{ params: {
      child, classItem: { ...classItem, home_language: 'Afrikaans' },
    } }} />);
    fireEvent.press(screen.getAllByText('Assess now')[testCode === 'letter_sounds' ? 0 : 1]);
    expect(navigation.navigate).toHaveBeenCalledWith('StandaloneTest', { testCode, child, languageCode: 'af' });
    await waitFor(() => expect(assessmentsRepository.getQuestionResults).toHaveBeenCalled());
  });

  test.each(['letter_sounds', 'word_reading'])('child results launches %s for an isiZulu class in zu', async testCode => {
    const navigation = makeNavigation();
    const screen = render(<ChildResultsScreen navigation={navigation} route={{ params: {
      child, classItem: { ...classItem, home_language: 'isiZulu' },
    } }} />);
    fireEvent.press(screen.getAllByText('Assess now')[testCode === 'letter_sounds' ? 0 : 1]);
    expect(navigation.navigate).toHaveBeenCalledWith('StandaloneTest', { testCode, child, languageCode: 'zu' });
    await waitFor(() => expect(assessmentsRepository.getQuestionResults).toHaveBeenCalled());
  });

  test('child results sends unknown languages to child select without a fallback', async () => {
    const navigation = makeNavigation();
    const screen = render(<ChildResultsScreen navigation={navigation} route={{ params: {
      child, classItem: { ...classItem, home_language: 'Sesotho' },
    } }} />);
    fireEvent.press(screen.getAllByText('Assess now')[0]);
    expect(navigation.navigate).toHaveBeenCalledWith('AssessmentChildSelect', { testCode: 'letter_sounds' });
    await waitFor(() => expect(assessmentsRepository.getQuestionResults).toHaveBeenCalled());
  });
});
