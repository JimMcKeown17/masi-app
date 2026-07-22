const mockUseAuth = jest.fn();
const mockUseChildren = jest.fn();
const mockUseClasses = jest.fn();
const mockGetAssessments = jest.fn();
const mockCountAssessments = jest.fn();
const mockResolveAssessmentRoute = jest.fn();

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
  useFocusEffect: (callback) => {
    const ReactForMock = require('react');
    ReactForMock.useEffect(() => callback(), [callback]);
  },
}));

jest.mock('../src/context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => mockUseChildren() }));
jest.mock('../src/context/ClassesContext', () => ({ useClasses: () => mockUseClasses() }));
jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  assessmentsRepository: {
    getAssessments: (...args) => mockGetAssessments(...args),
    countAssessments: (...args) => mockCountAssessments(...args),
  },
}));
jest.mock('../src/utils/assessmentRouting', () => ({
  resolveAssessmentRoute: (...args) => mockResolveAssessmentRoute(...args),
}));

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import AssessmentChildSelectScreen from '../src/screens/assessments/AssessmentChildSelectScreen';
import { ISIXHOSA_LETTER_SET } from '../src/constants/egraConstants';

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
      }],
    });
    mockUseClasses.mockReturnValue({
      classes: [{ id: 'class-1', name: 'Grade 1A', home_language: null }],
    });
    mockGetAssessments.mockResolvedValue([]);
    mockCountAssessments.mockResolvedValue(0);
    mockResolveAssessmentRoute.mockResolvedValue({
      screenName: 'SequentialAssessment',
      captureMode: 'sequential',
    });
  });

  test('retains a cancelled language draft and starts only after confirmation', async () => {
    const navigation = { navigate: jest.fn() };
    const screen = render(
      <PaperProvider settings={{ icon: () => null }}>
        <AssessmentChildSelectScreen
          navigation={navigation}
          route={{ params: { assessmentType: 'letter_egra' } }}
        />
      </PaperProvider>,
    );

    await waitFor(() => expect(screen.getByText('Amahle Dlamini')).toBeTruthy());
    fireEvent.press(screen.getByText('Amahle Dlamini'));

    expect(screen.getByLabelText('Dismiss assessment language picker')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
    fireEvent.press(screen.getByText('isiXhosa'));
    expect(navigation.navigate).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Cancel'));

    fireEvent.press(screen.getByText('Amahle Dlamini'));
    fireEvent.press(screen.getByText('Start'));

    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith(
      'SequentialAssessment',
      expect.objectContaining({
        letterSet: ISIXHOSA_LETTER_SET,
        captureMode: 'sequential',
      }),
    ));
  });

  test('normalizes a Xhosa class language and starts with the isiXhosa item set', async () => {
    mockUseClasses.mockReturnValue({
      classes: [{ id: 'class-1', name: 'Grade 1A', home_language: 'Xhosa' }],
    });
    const navigation = { navigate: jest.fn() };
    const screen = render(
      <PaperProvider settings={{ icon: () => null }}>
        <AssessmentChildSelectScreen
          navigation={navigation}
          route={{ params: { assessmentType: 'letter_egra' } }}
        />
      </PaperProvider>,
    );

    await waitFor(() => expect(screen.getByText('Amahle Dlamini')).toBeTruthy());
    fireEvent.press(screen.getByText('Amahle Dlamini'));

    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith(
      'SequentialAssessment',
      expect.objectContaining({
        letterSet: ISIXHOSA_LETTER_SET,
        captureMode: 'sequential',
      }),
    ));
    expect(screen.queryByLabelText('Dismiss assessment language picker')).toBeNull();
  });
});
