import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AssessmentChildSelectScreen from '../src/screens/assessments/AssessmentChildSelectScreen';
import ChildResultsScreen from '../src/screens/assessments/ChildResultsScreen';
import { useAuth } from '../src/context/AuthContext';
import { useChildren } from '../src/context/ChildrenContext';
import { useClasses } from '../src/context/ClassesContext';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { resolveAssessmentRoute } from '../src/utils/assessmentRouting';

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
  assessmentsRepository: {
    getAssessments: jest.fn(),
    countAssessments: jest.fn(),
  },
}));

jest.mock('../src/utils/assessmentRouting', () => ({
  resolveAssessmentRoute: jest.fn(),
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

const routeExpectationByMode = {
  sequential: {
    screenName: 'SequentialAssessment',
    captureMode: 'sequential',
  },
  grid: {
    screenName: 'LetterAssessment',
    captureMode: 'grid',
  },
};

const makeNavigation = () => ({
  navigate: jest.fn(),
});

describe('assessment entry routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useChildren.mockReturnValue({ children: [child] });
    useClasses.mockReturnValue({ classes: [classItem] });
    assessmentsRepository.getAssessments.mockResolvedValue([]);
    assessmentsRepository.countAssessments.mockResolvedValue(0);
  });

  test.each(['sequential', 'grid'])(
    'AssessmentChildSelectScreen routes %s mode through the resolver',
    async (mode) => {
      const resolved = routeExpectationByMode[mode];
      resolveAssessmentRoute.mockResolvedValueOnce(resolved);
      const navigation = makeNavigation();

      const screen = render(
        <AssessmentChildSelectScreen
          navigation={navigation}
          route={{ params: { assessmentType: 'letter_egra' } }}
        />
      );

      await waitFor(() => expect(screen.getByText('Amahle Dlamini')).toBeTruthy());
      fireEvent.press(screen.getByText('Amahle Dlamini'));

      await waitFor(() => {
        expect(resolveAssessmentRoute).toHaveBeenCalledTimes(1);
        expect(navigation.navigate).toHaveBeenCalledWith(
          resolved.screenName,
          expect.objectContaining({
            child,
            captureMode: resolved.captureMode,
            assessmentType: 'letter_egra',
            attemptNumber: 1,
          })
        );
      });
    }
  );

  test('AssessmentChildSelectScreen resolves attempt number at launch while preload is pending', async () => {
    assessmentsRepository.getAssessments.mockReturnValue(new Promise(() => {}));
    assessmentsRepository.countAssessments.mockResolvedValue(3);
    resolveAssessmentRoute.mockResolvedValue(routeExpectationByMode.sequential);
    const navigation = makeNavigation();

    const screen = render(
      <AssessmentChildSelectScreen
        navigation={navigation}
        route={{ params: { assessmentType: 'letter_egra' } }}
      />
    );

    fireEvent.press(screen.getByText('Amahle Dlamini'));

    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith(
      'SequentialAssessment',
      expect.objectContaining({ attemptNumber: 4 })
    ));
    expect(assessmentsRepository.countAssessments).toHaveBeenCalledWith({
      userId: 'user-1',
      childId: 'child-1',
      assessmentType: 'letter_egra',
    });
  });

  test.each(['sequential', 'grid'])(
    'ChildResultsScreen routes %s mode through the resolver',
    async (mode) => {
      const resolved = routeExpectationByMode[mode];
      resolveAssessmentRoute.mockResolvedValueOnce(resolved);
      const navigation = makeNavigation();

      const screen = render(
        <ChildResultsScreen
          navigation={navigation}
          route={{ params: { child, classItem } }}
        />
      );

      fireEvent.press(screen.getAllByText('Run Assessment')[0]);

      await waitFor(() => {
        expect(resolveAssessmentRoute).toHaveBeenCalledTimes(1);
        expect(navigation.navigate).toHaveBeenCalledWith(
          resolved.screenName,
          expect.objectContaining({
            child,
            captureMode: resolved.captureMode,
            assessmentType: 'letter_egra',
            attemptNumber: 1,
          })
        );
      });
    }
  );
});
