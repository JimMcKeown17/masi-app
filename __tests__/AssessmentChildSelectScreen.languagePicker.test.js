jest.mock('../src/hooks/useAssessableChildren', () => ({ useAssessableChildren: jest.fn() }));
import { useAssessableChildren } from '../src/hooks/useAssessableChildren';
beforeEach(() => useAssessableChildren.mockImplementation(() => {
  const state = require('../src/context/ChildrenContext').useChildren();
  const all = state.children ?? state.allChildren ?? [];
  return { all, yourChildren: all, restOfClass: [], loading: false };
}));
const mockUseAuth = jest.fn();
const mockUseChildren = jest.fn();
const mockUseClasses = jest.fn();
const mockGetQuestionResults = jest.fn();

jest.mock('@expo/vector-icons', () => new Proxy({}, {
  get: (target, prop) => {
    if (prop === '__esModule') return true;
    if (!target[prop]) target[prop] = () => null;
    return target[prop];
  },
}), { virtual: true });

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => ({
  __esModule: true,
  default: () => null,
}), { virtual: true });

jest.mock('react-native-safe-area-context', () => {
  const ReactForMock = require('react');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 320, height: 640 };
  const SafeAreaInsetsContext = ReactForMock.createContext(insets);
  const SafeAreaFrameContext = ReactForMock.createContext(frame);
  return {
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    SafeAreaInsetsContext,
    SafeAreaFrameContext,
    SafeAreaProvider: ({ children }) => children,
    SafeAreaConsumer: SafeAreaInsetsContext.Consumer,
    initialWindowMetrics: { insets, frame },
  };
});

jest.mock('@react-navigation/native', () => ({
  NavigationContext: require('react').createContext(undefined),
  useFocusEffect: (callback) => {
    const ReactForMock = require('react');
    ReactForMock.useEffect(() => callback(), [callback]);
  },
}));

jest.mock('../src/context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => mockUseChildren() }));
jest.mock('../src/context/ClassesContext', () => ({ useClasses: () => mockUseClasses() }));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  ...jest.requireActual('../src/db/repositories/assessmentsRepository'),
  assessmentsRepository: {
    getQuestionResults: (...args) => mockGetQuestionResults(...args),
  },
}));

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import AssessmentChildSelectScreen from '../src/screens/assessments/AssessmentChildSelectScreen';
import SelectSheet from '../src/components/common/SelectSheet';

describe('AssessmentChildSelectScreen language picker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
    mockUseChildren.mockReturnValue({
      children: [{
        id: 'child-1',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        class_id: 'class-1',
        home_language: null,
      }],
    });
    mockUseClasses.mockReturnValue({
      classes: [{ id: 'class-1', name: 'Grade 1A', home_language: null }],
    });
    mockGetQuestionResults.mockResolvedValue([]);
  });

  test('search filters children and Clear search restores them', async () => {
    const screen = render(<PaperProvider><AssessmentChildSelectScreen navigation={{ navigate: jest.fn() }} route={{ params: { testCode: 'letter_sounds' } }} /></PaperProvider>);
    await screen.findByText('Amahle Dlamini');
    fireEvent.changeText(screen.getByLabelText('Search children...'), 'missing');
    expect(screen.queryByText('Amahle Dlamini')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText('Amahle Dlamini')).toBeTruthy();
  });

  test('retains a cancelled language draft and starts only after confirmation', async () => {
    const navigation = { navigate: jest.fn() };
    const screen = render(
      <PaperProvider settings={{ icon: () => null }}>
        <AssessmentChildSelectScreen
          navigation={navigation}
          route={{ params: { testCode: 'letter_sounds' } }}
        />
      </PaperProvider>,
    );

    await waitFor(() => expect(screen.getByText('Amahle Dlamini')).toBeTruthy());
    fireEvent.press(screen.getByText('Amahle Dlamini'));

    expect(screen.getByLabelText('Dismiss assessment language picker')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Select language' })).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
    fireEvent.press(screen.getByText('isiXhosa'));
    expect(navigation.navigate).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Cancel'));

    fireEvent.press(screen.getByText('Amahle Dlamini'));
    fireEvent.press(screen.getByText('Start'));

    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith(
      'StandaloneTest',
      { testCode: 'letter_sounds', child: mockUseChildren().children[0], languageCode: 'xh' },
    ));
  });

  test('normalizes an isiXhosa class language and starts with its code', async () => {
    mockUseChildren().children[0].home_language = 'isiXhosa';
    mockUseClasses.mockReturnValue({
      classes: [{ id: 'class-1', name: 'Grade 1A', home_language: 'isiXhosa' }],
    });
    const navigation = { navigate: jest.fn() };
    const screen = render(
      <PaperProvider settings={{ icon: () => null }}>
        <AssessmentChildSelectScreen
          navigation={navigation}
          route={{ params: { testCode: 'letter_sounds' } }}
        />
      </PaperProvider>,
    );

    await waitFor(() => expect(screen.getByText('Amahle Dlamini')).toBeTruthy());
    fireEvent.press(screen.getByText('Amahle Dlamini'));

    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith(
      'StandaloneTest',
      { testCode: 'letter_sounds', child: mockUseChildren().children[0], languageCode: 'xh' },
    ));
    expect(screen.queryByLabelText('Dismiss assessment language picker')).toBeNull();
  });

  test.each(['letter_sounds', 'word_reading'])('an Afrikaans class starts %s in Afrikaans without asking', async (testCode) => {
    mockUseChildren().children[0].home_language = 'Afrikaans';
    mockUseClasses.mockReturnValue({ classes: [{ id: 'class-1', name: 'Grade 1A', home_language: 'Afrikaans' }] });
    const navigation = { navigate: jest.fn() };
    const screen = render(<PaperProvider settings={{ icon: () => null }}><AssessmentChildSelectScreen
      navigation={navigation} route={{ params: { testCode } }} /></PaperProvider>);
    await screen.findByText('Amahle Dlamini');
    fireEvent.press(screen.getByText('Amahle Dlamini'));
    expect(navigation.navigate).toHaveBeenCalledWith('StandaloneTest', { testCode, child: mockUseChildren().children[0], languageCode: 'af' });
    expect(screen.queryByLabelText('Dismiss assessment language picker')).toBeNull();
  });

  test.each(['letter_sounds', 'word_reading'])('an isiZulu class starts %s in isiZulu without asking', async testCode => {
    mockUseChildren().children[0].home_language = 'isiZulu';
    mockUseClasses.mockReturnValue({ classes: [{ id: 'class-1', home_language: 'isiZulu' }] });
    const navigation = { navigate: jest.fn() };
    const screen = render(<PaperProvider settings={{ icon: () => null }}><AssessmentChildSelectScreen
      navigation={navigation} route={{ params: { testCode } }} /></PaperProvider>);
    await screen.findByText('Amahle Dlamini');
    fireEvent.press(screen.getByText('Amahle Dlamini'));
    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledWith('StandaloneTest', {
      testCode, child: mockUseChildren().children[0], languageCode: 'zu',
    });
    expect(screen.queryByLabelText('Dismiss assessment language picker')).toBeNull();
  });

  test.each([
    [null, 'class-1'],
    ['Sesotho', 'class-1'],
    [undefined, null],
  ])('asks for an available language for %s and class %s without preselecting English', async (homeLanguage, classId) => {
    const child = { ...mockUseChildren().children[0], class_id: classId, home_language: homeLanguage };
    mockUseChildren.mockReturnValue({ children: [child] });
    mockUseClasses.mockReturnValue({ classes: [{ id: 'class-1', home_language: homeLanguage }] });
    const navigation = { navigate: jest.fn() };
    const screen = render(<PaperProvider settings={{ icon: () => null }}><AssessmentChildSelectScreen
      navigation={navigation} route={{ params: { testCode: 'letter_sounds' } }}
    /></PaperProvider>);
    await screen.findByText('Amahle Dlamini');
    fireEvent.press(screen.getByText('Amahle Dlamini'));
    const picker = screen.UNSAFE_getByType(SelectSheet);
    expect(picker.props.options).toEqual([{ key: 'xh', label: 'isiXhosa' }, { key: 'en', label: 'English' }, { key: 'af', label: 'Afrikaans' }, { key: 'zu', label: 'isiZulu' }]);
    expect(picker.props.selectedKey).toBeNull();
    expect(screen.getByRole('button', { name: 'English' }).props.accessibilityState.selected).toBe(false);
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    fireEvent.press(screen.getByText('Start'));
    expect(screen.getByRole('header', { name: 'Select language' })).toBeTruthy();
    expect(navigation.navigate).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('isiXhosa'));
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
    expect(navigation.navigate).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Start'));
    expect(navigation.navigate).toHaveBeenCalledWith('StandaloneTest', {
      testCode: 'letter_sounds', child, languageCode: 'xh',
    });
  });

  test('word reading offers only the languages with package item sets', async () => {
    const navigation = { navigate: jest.fn() };
    const screen = render(<PaperProvider settings={{ icon: () => null }}><AssessmentChildSelectScreen
      navigation={navigation} route={{ params: { testCode: 'word_reading' } }}
    /></PaperProvider>);
    await screen.findByText('Amahle Dlamini');
    fireEvent.press(screen.getByText('Amahle Dlamini'));
    expect(screen.UNSAFE_getByType(SelectSheet).props.options.map(option => option.label)).toEqual(['isiXhosa', 'English', 'Afrikaans', 'isiZulu']);
    fireEvent.press(screen.getByText('English'));
    fireEvent.press(screen.getByText('Start'));
    expect(navigation.navigate).toHaveBeenCalledWith('StandaloneTest', {
      testCode: 'word_reading', child: mockUseChildren().children[0], languageCode: 'en',
    });
  });

  test('sorts by the latest result for the requested test, with unassessed children first', async () => {
    const children = [
      { id: 'recent', first_name: 'Amahle', last_name: 'Dlamini' },
      { id: 'older', first_name: 'Buhle', last_name: 'Dlamini' },
      { id: 'new', first_name: 'Zola', last_name: 'Dlamini' },
    ];
    mockUseChildren.mockReturnValue({ children });
    mockGetQuestionResults.mockResolvedValue([
      { child_id: 'recent', assessment_date: '2026-10-20', created_at: '2026-10-20T12:00:00Z', derived: { percent: 90 } },
      { child_id: 'recent', assessment_date: '2026-10-01', created_at: '2026-10-01T12:00:00Z', derived: { percent: 20 } },
      { child_id: 'older', assessment_date: '2026-10-10', created_at: '2026-10-10T12:00:00Z', derived: { percent: 40 } },
    ]);
    const screen = render(<PaperProvider><AssessmentChildSelectScreen navigation={{ navigate: jest.fn() }} route={{ params: { testCode: 'word_reading' } }} /></PaperProvider>);
    await screen.findByText(/Last assessed: Oct 20/);
    expect(mockGetQuestionResults).toHaveBeenCalledWith({ userId: 'user-1', questionCodes: ['word_reading'] });
    expect(screen.getAllByRole('button', { name: /^Select .* for assessment$/ }).map(row => row.props.accessibilityLabel)).toEqual([
      'Select Zola Dlamini for assessment',
      'Select Buhle Dlamini for assessment',
      'Select Amahle Dlamini for assessment',
    ]);
    expect(screen.queryByText(/Last assessed: Oct 1 ·/)).toBeNull();
  });

  test('a cancelled language draft belongs to its child and cannot preselect the next child', async () => {
    const firstChild = mockUseChildren().children[0];
    const secondChild = { ...firstChild, id: 'child-2', first_name: 'Buhle' };
    mockUseChildren.mockReturnValue({ children: [firstChild, secondChild] });
    const navigation = { navigate: jest.fn() };
    const screen = render(<PaperProvider settings={{ icon: () => null }}><AssessmentChildSelectScreen
      navigation={navigation} route={{ params: { testCode: 'letter_sounds' } }}
    /></PaperProvider>);
    await screen.findByText('Amahle Dlamini');
    fireEvent.press(screen.getByText('Amahle Dlamini'));
    fireEvent.press(screen.getByText('English'));
    fireEvent.press(screen.getByText('Cancel'));
    expect(navigation.navigate).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Buhle Dlamini'));
    expect(screen.getByRole('button', { name: 'English' }).props.accessibilityState.selected).toBe(false);
    expect(screen.getByRole('button', { name: 'isiXhosa' }).props.accessibilityState.selected).toBe(false);
    fireEvent.press(screen.getByText('Start'));
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('header', { name: 'Select language' })).toBeTruthy();

    fireEvent.press(screen.getByText('isiXhosa'));
    fireEvent.press(screen.getByText('Start'));
    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledWith('StandaloneTest', {
      testCode: 'letter_sounds', child: secondChild, languageCode: 'xh',
    });
  });

});
