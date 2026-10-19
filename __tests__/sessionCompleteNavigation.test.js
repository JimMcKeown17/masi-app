import React from 'react';
import { BackHandler } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import { MainNavigator } from '../src/navigation/AppNavigator';

jest.setTimeout(30000);
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'ea-1' } }) }));
const mockHandle = { isCurrent: () => true };
jest.mock('../src/context/SignedInEAContext', () => ({ useSignedInEA: () => ({ handle: mockHandle }) }));
const mockOffline = {
  isOnline: true, isSyncing: false, waitingCount: 3, needsAttentionCount: 0,
  refreshSyncStatus: jest.fn().mockResolvedValue({ waitingCount: 3 }),
};
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockOffline }));
jest.mock('../src/services/sessionsTodayGoal', () => ({
  getSessionsTodayGoal: jest.fn().mockResolvedValue({ target: 3, ceiling: 5, count: 3, state: 'met' }),
}));
jest.mock('../src/hooks/useSessionLaunchGuard', () => ({ useSessionLaunchGuard: () => ({
  warningVisible: false, requestSessionLaunch: jest.fn(), continueAnyway: jest.fn(),
  clockInNow: jest.fn(), dismissWarning: jest.fn(),
}) }));
jest.mock('../src/services/observability', () => ({ registerNavigationContainer: jest.fn(), setObservabilityUser: jest.fn() }));

jest.mock('../src/screens/main/HomeScreen', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return () => <Text>Home screen</Text>;
});
jest.mock('../src/screens/sessions/SessionFormScreen', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  const { toLocalDateString } = require('../src/utils/localDate');
  return ({ navigation }) => <Pressable onPress={() => navigation.replace('SessionComplete', {
    childCount: 1, childNames: ['Amahle'], letters: ['a'], readingLevel: 'Cannot blend',
    sessionDate: toLocalDateString(new Date()),
  })}><Text>Submit</Text></Pressable>;
});
jest.mock('../src/screens/auth/LoginScreen', () => () => null);
jest.mock('../src/screens/auth/ForgotPasswordScreen', () => () => null);
jest.mock('../src/screens/main/TimeTrackingScreen', () => () => null);
jest.mock('../src/screens/main/TimeEntriesListScreen', () => () => null);
jest.mock('../src/screens/main/ChildrenListScreen', () => () => null);
jest.mock('../src/screens/main/AssessmentsScreen', () => () => null);
jest.mock('../src/screens/main/InsightsScreen', () => () => null);
jest.mock('../src/screens/main/ProfileScreen', () => () => null);
jest.mock('../src/screens/children/AddChildScreen', () => () => null);
jest.mock('../src/screens/children/EditChildScreen', () => () => null);
jest.mock('../src/screens/children/CreateClassScreen', () => () => null);
jest.mock('../src/screens/children/EditClassScreen', () => () => null);
jest.mock('../src/screens/children/ClassDetailScreen', () => () => null);
jest.mock('../src/screens/onboarding/ClassOnboardingScreen', () => () => null);
jest.mock('../src/screens/onboarding/ChildOnboardingScreen', () => () => null);
jest.mock('../src/screens/sessions/SessionHistoryScreen', () => () => null);
jest.mock('../src/screens/assessments/AssessmentChildSelectScreen', () => () => null);
jest.mock('../src/screens/assessments/LetterAssessmentScreen', () => () => null);
jest.mock('../src/screens/assessments/SequentialAssessmentScreen', () => () => null);
jest.mock('../src/screens/assessments/AssessmentResultsScreen', () => () => null);
jest.mock('../src/screens/assessments/AssessmentHistoryScreen', () => () => null);
jest.mock('../src/screens/assessments/AssessmentDetailScreen', () => () => null);
jest.mock('../src/screens/assessments/LetterTrackerScreen', () => () => null);
jest.mock('../src/screens/assessments/ChildResultsScreen', () => () => null);
jest.mock('../src/screens/insights/LetterMasteryRankingScreen', () => () => null);
jest.mock('../src/screens/insights/AssessmentRankingScreen', () => () => null);
jest.mock('../src/screens/insights/SessionCountRankingScreen', () => () => null);
jest.mock('../src/screens/main/SyncStatusScreen', () => () => null);

const routeNames = ref => ref.getRootState().routes.map(route => route.name);
async function reachComplete(motionLevel = 'still') {
  const ref = createNavigationContainerRef();
  const screen = renderWithProviders(<NavigationContainer ref={ref}><MainNavigator /></NavigationContainer>, {
    insets: { top: 47, bottom: 34, left: 0, right: 0 },
    motion: { motionLevel, reduceMotion: motionLevel === 'still', tier: motionLevel === 'still' ? 'static' : 'high' },
  });
  await waitFor(() => expect(ref.isReady()).toBe(true));
  act(() => ref.navigate('MainTabs', { screen: 'Children' }));
  await waitFor(() => expect(ref.getCurrentRoute().name).toBe('ChildrenList'));
  act(() => ref.navigate('SessionForm'));
  fireEvent.press(await screen.findByText('Submit'));
  await screen.findByText('Done');
  expect(routeNames(ref)).toEqual(['MainTabs', 'SessionComplete']);
  return { ref, screen };
}

afterEach(() => jest.restoreAllMocks());

test('Children tab → New session → replace → Done lands on Home with one MainTabs', async () => {
  const { ref, screen } = await reachComplete();
  expect(ref.getCurrentOptions()).toEqual(expect.objectContaining({ headerShown: false, gestureEnabled: false }));
  expect(ref.getCurrentOptions().title).toBeUndefined();
  expect(ref.getCurrentOptions().headerLeft).toBeUndefined();
  const done = screen.getByText('Done');
  act(() => { fireEvent.press(done); fireEvent.press(done); });
  await waitFor(() => expect(ref.getCurrentRoute().name).toBe('Home'));
  expect(routeNames(ref)).toEqual(['MainTabs']);
  expect(ref.canGoBack()).toBe(false);
});

test('a plain navigate would have pushed a second MainTabs (guards the v7 gotcha)', async () => {
  const { ref } = await reachComplete();
  act(() => ref.navigate('MainTabs', { screen: 'Home' }));
  await waitFor(() => expect(ref.getCurrentRoute().name).toBe('Home'));
  expect(routeNames(ref)).toEqual(['MainTabs', 'SessionComplete', 'MainTabs']);
});

test('Done then hardware back mid-celebration leaves one MainTabs on Home', async () => {
  const back = jest.spyOn(BackHandler, 'addEventListener');
  const { ref, screen } = await reachComplete('full');
  // The focused screen registers after NavigationContainer's default listener.
  const hardwareBack = back.mock.calls.filter(([event]) => event === 'hardwareBackPress').at(-1)[1];
  const done = screen.getByText('Done');
  act(() => { fireEvent.press(done); expect(hardwareBack()).toBe(true); });
  await waitFor(() => expect(ref.getCurrentRoute().name).toBe('Home'));
  expect(routeNames(ref)).toEqual(['MainTabs']);
  expect(ref.canGoBack()).toBe(false);
});
