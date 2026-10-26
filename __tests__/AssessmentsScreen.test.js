jest.mock('../src/assessment-questions', () => ({
  ...jest.requireActual('../src/assessment-questions'), batteryFor: jest.fn(),
}));
jest.mock('../src/hooks/useAssessableChildren', () => ({ useAssessableChildren: jest.fn() }));
import { useAssessableChildren } from '../src/hooks/useAssessableChildren';
beforeEach(() => useAssessableChildren.mockImplementation(() => {
  const state = require('../src/context/ChildrenContext').useChildren();
  const all = state.children ?? state.allChildren ?? [];
  return { all, yourChildren: all, restOfClass: [], loading: false };
}));
jest.mock('../src/services/assessmentHistoryStatus', () => ({
  ...jest.requireActual('../src/services/assessmentHistoryStatus'),
  useAssessmentHistoryStatus: () => ({ running: false, pageVersion: 0, runVersion: 0 }),
}));
import React from 'react';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { createNavigationContainerRef, createNavigatorFactory, NavigationContainer,
  StackRouter, useNavigationBuilder } from '@react-navigation/native';
import { AllProviders } from '../test-support/renderWithProviders';
import { spacing } from '../src/constants/colors';
import { batteryFor, WELA_PLUS_FULL_2024_1 as BATTERY } from '../src/assessment-questions';
import ListRow from '../src/components/common/ListRow';
import SurfaceCard from '../src/components/common/SurfaceCard';
import { STANDALONE_TESTS } from '../src/utils/assessmentRegistry';
import AssessmentsScreen from '../src/screens/main/AssessmentsScreen';
import SelectSheet from '../src/components/common/SelectSheet';

test.each([true, false])('Full EGRA is offered after the default card when present (default: %s)', async hasDefault => {
  mockGate.mockResolvedValue({ hasActiveProgramme: true, programme: hasDefault ? {
    default_battery_code: BATTERY.battery_code, default_battery_version: BATTERY.battery_version,
  } : {} });
  const screen = renderTab();
  await screen.findByRole('header', { name: 'Full EGRA' });
  // No normalizer: the default one turns non-breaking spaces into ordinary spaces.
  expect(screen.getByText('All 4 Questions · isiXhosa, English, Afrikaans or isiZulu · about\u00A06\u00A0min',
    { normalizer: text => text })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Start a Full EGRA' })).not.toBeDisabled();
  const card = screen.UNSAFE_getAllByType(SurfaceCard).at(-1);
  expect(within(card).queryAllByText(/run/i)).toHaveLength(0);
  // Both cards read "Start an assessment"; the EGRA button has its own spoken name.
  expect(within(card).getByText('Start an assessment')).toBeTruthy();
  expect(screen.getAllByRole('header').map(node => node.props.children))
    .toEqual([...(hasDefault ? [BATTERY.title] : []), 'Full EGRA', 'Quick assessments']);
});

test('Full EGRA Start goes directly to child selection once, without a form picker', async () => {
  const screen = renderTab();
  const start = await screen.findByRole('button', { name: 'Start a Full EGRA' });
  expect(screen.UNSAFE_queryAllByType(SelectSheet)).toHaveLength(0);
  act(() => { fireEvent.press(start); fireEvent.press(start); });
  expect(screen.navigation.navigate).toHaveBeenCalledTimes(1);
  expect(screen.navigation.navigate).toHaveBeenCalledWith('AssessmentChildSelect', {
    batteryCode: 'egra', batteryVersion: '2026.1',
  });
  expect(screen.queryByRole('header', { name: 'Choose an EGRA form' })).toBeNull();
  expect(screen.queryByTestId('bottom-sheet-panel')).toBeNull();
});

test('Full EGRA Start during a programme recheck cannot bypass the launch guard', async () => {
  const screen = renderTab();
  await screen.findByRole('button', { name: 'Start a Full EGRA' });
  const pending = deferred();
  act(() => screen.navigationRef.navigate('Away'));
  mockGate.mockReturnValueOnce(pending.promise);
  act(() => screen.navigationRef.goBack());
  const start = screen.getByRole('button', { name: 'Start a Full EGRA' });
  expect(start).toBeDisabled();
  fireEvent.press(start);
  expect(screen.navigation.navigate).not.toHaveBeenCalled();
  await act(async () => pending.resolve({ hasActiveProgramme: false }));
  await screen.findByText(/No active programme/);
  expect(screen.queryByText('Full EGRA')).toBeNull();
});

const mockGetLetterResults = jest.fn();
const mockGetAcademicYears = jest.fn();
const mockGate = jest.fn();
const mockGetUnfinishedRuns = jest.fn();
const mockGetChildNames = jest.fn();
const mockHandle = { userId: 'user-1', epoch: 1, isCurrent: jest.fn(() => true) };
const mockRepositories = {
  assessments: { getLetterResults: mockGetLetterResults },
  academicYears: { getAll: mockGetAcademicYears },
  batteryRuns: { getUnfinishedRunsForUser: mockGetUnfinishedRuns },
  children: { getChildNamesByIds: mockGetChildNames },
};
jest.mock('../src/context/SignedInEAContext', () => ({
  useSignedInEA: () => ({ handle: mockHandle, repositories: mockRepositories }),
}));
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
const mockChildren = [];
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => ({ children: mockChildren }) }));
jest.mock('../src/services/activeProgrammeGate', () => ({ getActiveProgrammeGate: (...args) => mockGate(...args) }));



function EmptyScreen() { return null; }
function RetainedStack({ children }) {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, { children });
  return <NavigationContent>{state.routes.map((route, index) => (
    <View key={route.key} style={index === state.index ? { flex: 1 } : { display: 'none' }}>
      {descriptors[route.key].render()}
    </View>
  ))}</NavigationContent>;
}
const Stack = createNavigatorFactory(RetainedStack)();
function renderTab(navigation = { navigate: jest.fn() }, insets) {
  const navigationRef = createNavigationContainerRef();
  let refresh;
  function Host() {
    const [, force] = React.useReducer(value => value + 1, 0);
    refresh = force;
    return <AssessmentsScreen navigation={navigation} />;
  }
  const screen = render(<AllProviders motion={{ motionLevel: 'still', reduceMotion: true, tier: 'high' }} insets={insets}>
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator>
        <Stack.Screen name="Assessments" component={Host} />
        <Stack.Screen name="Away" component={EmptyScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  </AllProviders>);
  return { ...screen, navigation, navigationRef, refresh: () => act(() => refresh()) };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 23, 15, 0));
  jest.clearAllMocks();
  mockHandle.isCurrent.mockReturnValue(true);
  mockGetUnfinishedRuns.mockResolvedValue([]);
  mockGetChildNames.mockResolvedValue({});
  batteryFor.mockImplementation((...args) => jest.requireActual('../src/assessment-questions').batteryFor(...args));
  mockChildren.splice(0);
  mockGate.mockResolvedValue({ hasActiveProgramme: true });
  mockGetLetterResults.mockResolvedValue([]);
  mockGetAcademicYears.mockResolvedValue([
    { id: 'year-2026', starts_on: '2026-01-01', ends_on: '2026-12-31', is_active: 1 },
  ]);
});

test('shows active-year letter coverage, result total and latest raw average score', async () => {
  mockChildren.push(...['a', 'b', 'c', 'd'].map(id => ({ id })));
  mockGetLetterResults.mockResolvedValue([
    { id: 'a-old', child_id: 'a', question_code: 'letter_sounds', stopped_reason: 'completed', assessment_date: '2026-02-02', score: 10 },
    { id: 'a-latest', child_id: 'a', question_code: 'letter_sounds', stopped_reason: 'completed', assessment_date: '2026-03-02', score: 18 },
    { id: 'b-run-q1', child_id: 'b', user_id: 'other-ea', battery_run_id: 'run-b', question_code: 'letter_sounds', stopped_reason: 'stop_rule', assessment_date: '2026-03-02', score: 8 },
    { id: 'c-skipped', child_id: 'c', question_code: 'letter_sounds', stopped_reason: 'skipped_tired', assessment_date: '2026-03-02', score: 0 },
    { id: 'd-last-year', child_id: 'd', question_code: 'letter_sounds', stopped_reason: 'completed', assessment_date: '2025-12-31', score: 60 },
    { id: 'inactive-child', child_id: 'hidden', question_code: 'letter_sounds', stopped_reason: 'completed', assessment_date: '2026-03-02', score: 60 },
  ]);
  const screen = renderTab();
  await screen.findByText('Avg score');
  expect(screen.getByText('50%')).toBeTruthy();
  expect(screen.getByText('3')).toBeTruthy();
  expect(screen.getByText('13')).toBeTruthy();
  expect(screen.queryByText('13%')).toBeNull();
  expect(screen.queryByText('Avg Accuracy')).toBeNull();
  expect(mockGetLetterResults).toHaveBeenCalledWith({ userId: 'user-1' });
});

test('shows zero evidence when academic years exist but none is active', async () => {
  mockChildren.push({ id: 'a' });
  mockGetAcademicYears.mockResolvedValue([
    { id: 'year-2026', starts_on: '2026-01-01', ends_on: '2026-12-31', is_active: false },
  ]);
  mockGetLetterResults.mockResolvedValue([
    { child_id: 'a', question_code: 'letter_sounds', stopped_reason: 'completed', assessment_date: '2026-06-01', score: 30 },
  ]);
  const screen = renderTab();
  await screen.findByText('Avg score');
  expect(screen.getByText('0%')).toBeTruthy();
  expect(screen.getAllByText('0')).toHaveLength(2);
  expect(screen.queryByText('30')).toBeNull();
});

test('quick assessments are compact rows titled from STANDALONE_TESTS and still navigate with testCode', async () => {
  const navigation = { navigate: jest.fn() };
  const screen = renderTab(navigation);
  await screen.findByText('Letter Sounds');
  expect(screen.getByText('Word Reading')).toBeTruthy();
  expect(screen.getByText('60-second letter sound test')).toBeTruthy();
  expect(screen.getByText('60-second word reading test')).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Quick assessments' })).toBeTruthy();
  expect(screen.UNSAFE_getAllByType(ListRow).map(row => row.props.title)).toEqual(STANDALONE_TESTS.map(test => test.title));
  expect(screen.UNSAFE_queryAllByType(SurfaceCard)).toHaveLength(1);
  fireEvent.press(screen.getByRole('button', { name: 'Letter Sounds, 60-second letter sound test' }));
  expect(navigation.navigate).toHaveBeenLastCalledWith('AssessmentChildSelect', { testCode: 'letter_sounds' });
  fireEvent.press(screen.getByRole('button', { name: 'Word Reading, 60-second word reading test' }));
  expect(navigation.navigate).toHaveBeenLastCalledWith('AssessmentChildSelect', { testCode: 'word_reading' });
  fireEvent.press(screen.getByText('View history'));
  expect(navigation.navigate).toHaveBeenLastCalledWith('AssessmentHistory');
});

test('retains the active-programme gate for starting tests', async () => {
  mockGate.mockResolvedValue({ hasActiveProgramme: false });
  const screen = renderTab();
  await screen.findByText(/No active programme/);
  expect(screen.queryByText('Start assessment')).toBeNull();
});

test('coverage uses the assessable roster when delivery contains only one of two children', async () => {
  mockChildren.push({ id: 'delivery' });
  useAssessableChildren.mockReturnValue({ all: [...mockChildren, { id: 'control' }], loading: false });
  mockGetLetterResults.mockResolvedValue([{ child_id: 'delivery', question_code: 'letter_sounds',
    stopped_reason: 'completed', assessment_date: '2026-06-01', score: 10 }]);
  const screen = renderTab();
  expect(await screen.findByText('50%')).toBeTruthy();
});


test('battery card: title, "All 11 Questions · English or isiXhosa · about 30 min", Start an assessment navigates with code+version', async () => {
  mockGate.mockResolvedValue({ hasActiveProgramme: true, programme: {
    id: 'programme-1', default_battery_code: BATTERY.battery_code, default_battery_version: BATTERY.battery_version,
  } });
  const navigation = { navigate: jest.fn() };
  const screen = renderTab(navigation);
  await screen.findByText(BATTERY.title);
  expect(screen.getByText('All 11 Questions · English or isiXhosa · about\u00A030\u00A0min', { normalizer: text => text })).toBeTruthy();
  expect(screen.UNSAFE_getAllByType(SurfaceCard)).toHaveLength(2);
  expect(batteryFor).toHaveBeenCalledWith(BATTERY.battery_code, BATTERY.battery_version);
  fireEvent.press(screen.getByLabelText('Start an assessment'));
  expect(navigation.navigate).toHaveBeenCalledWith('AssessmentChildSelect', {
    batteryCode: BATTERY.battery_code, batteryVersion: BATTERY.battery_version,
  });
});

test.each([
  ['no battery on the programme', {}],
  ['unknown battery code', { default_battery_code: 'unknown', default_battery_version: BATTERY.battery_version }],
  ['unknown battery version', { default_battery_code: BATTERY.battery_code, default_battery_version: 'unknown' }],
])('%s: no battery card, quick rows still shown', async (_label, programme) => {
  mockGate.mockResolvedValue({ hasActiveProgramme: true, programme });
  const screen = renderTab();
  await screen.findByRole('header', { name: 'Quick assessments' });
  expect(screen.queryByText(BATTERY.title)).toBeNull();
  expect(screen.queryByLabelText('Start an assessment')).toBeNull();
  expect(screen.UNSAFE_queryAllByType(SurfaceCard)).toHaveLength(1);
  for (const test of STANDALONE_TESTS) expect(screen.getByText(test.title)).toBeTruthy();
});

test('fixture battery card uses its own title, question count, duration and fixedLanguage label', async () => {
  const fixture = { ...BATTERY, battery_code: 'fixture', battery_version: '1', title: 'Fixture reading',
    questions: BATTERY.questions.slice(0, 2), aboutMinutes: 7, languages: ['en', 'xh'], fixedLanguage: 'af' };
  batteryFor.mockReturnValue(fixture);
  mockGate.mockResolvedValue({ hasActiveProgramme: true, programme: {
    default_battery_code: fixture.battery_code, default_battery_version: fixture.battery_version,
  } });
  const screen = renderTab();
  await screen.findByText(fixture.title);
  expect(screen.getByText('All 2 Questions · Afrikaans · about\u00A07\u00A0min', { normalizer: text => text })).toBeTruthy();
  expect(screen.queryByText(/English or isiXhosa/)).toBeNull();
});

test('tab content scrolls with safe-area bottom padding', async () => {
  const screen = renderTab(undefined, { top: 0, bottom: 34, left: 0, right: 0 });
  await screen.findByText('View history');
  const scroll = screen.UNSAFE_getByType(ScrollView);
  const style = StyleSheet.flatten(scroll.props.contentContainerStyle);
  expect(style.paddingBottom).toBe(34 + spacing.lg);
  expect(style.paddingHorizontal).toBe(spacing.lg);
});


afterEach(async () => {
  await act(async () => jest.runOnlyPendingTimers());
  jest.useRealTimers();
});

const CHILD = { id: 'child-1', first_name: 'Lwazi', last_name: 'Mbeki', is_delivery: false };
const RUN_ID = '9f3c2a10-5b7e-4c1d-8e2f-0123456789ab';
const unfinished = (overrides = {}) => ({ id: RUN_ID, child_id: CHILD.id, question_count: 4,
  battery_code: BATTERY.battery_code, battery_version: BATTERY.battery_version,
  started_at: new Date(2026, 9, 20, 14, 5).toISOString(), ...overrides });
function withBattery() {
  mockGate.mockResolvedValue({ hasActiveProgramme: true, programme: {
    id: 'programme-1', default_battery_code: BATTERY.battery_code, default_battery_version: BATTERY.battery_version,
  } });
}

test('unfinished runs listed under the card with "WelaPLUS · 4 of 11 done · Tue 14:05 · KWY-2M4", tap opens overview', async () => {
  withBattery();
  useAssessableChildren.mockReturnValue({ all: [CHILD], loading: false });
  mockGetUnfinishedRuns.mockResolvedValue([unfinished()]);
  const navigation = { navigate: jest.fn() };
  const screen = renderTab(navigation);
  await screen.findByRole('header', { name: 'Unfinished assessments' });
  expect(screen.getAllByRole('header').map(node => node.props.children)).toEqual([BATTERY.title, 'Full EGRA', 'Unfinished assessments', 'Quick assessments']);
  expect(screen.getByText('Lwazi Mbeki')).toBeTruthy();
  expect(screen.getByText('WelaPLUS · 4 of 11 done · Tue 14:05 · KWY-2M4')).toBeTruthy();
  expect(mockGetUnfinishedRuns).toHaveBeenCalledWith('user-1');
  expect(mockGetChildNames).not.toHaveBeenCalled();
  const row = screen.getByRole('button', { name: 'Lwazi Mbeki, WelaPLUS · 4 of 11 done · Tue 14:05 · KWY-2M4' });
  expect(within(row).getByText('LM', { includeHiddenElements: true })).toBeTruthy();
  fireEvent.press(row);
  expect(navigation.navigate).toHaveBeenCalledWith('BatteryOverview', { runId: RUN_ID });
});

test('no unfinished runs: the "Unfinished assessments" header is absent', async () => {
  withBattery();
  const screen = renderTab();
  await screen.findByText('Avg score');
  expect(screen.queryByRole('header', { name: 'Unfinished assessments' })).toBeNull();
});

test('zero decided Questions shows "WelaPLUS · Not started · Today 09:12 · R2C-8WT"', async () => {
  withBattery();
  useAssessableChildren.mockReturnValue({ all: [CHILD], loading: false });
  mockGetUnfinishedRuns.mockResolvedValue([unfinished({ id: 'c0988e68-2222-4333-8444-555555555555', question_count: 0,
    started_at: new Date(2026, 9, 23, 9, 12).toISOString() })]);
  const screen = renderTab();
  await screen.findByText('WelaPLUS · Not started · Today 09:12 · R2C-8WT');
});

test('a child outside the assessable roster uses the SQLite name and shows "Child no longer assigned"', async () => {
  withBattery();
  mockGetUnfinishedRuns.mockResolvedValue([unfinished()]);
  mockGetChildNames.mockResolvedValue({ [CHILD.id]: { name: 'Lwazi Mbeki', hidden: false } });
  const navigation = { navigate: jest.fn() };
  const screen = renderTab(navigation);
  await screen.findByText('Lwazi Mbeki');
  expect(screen.getByText('Child no longer assigned')).toBeTruthy();
  expect(mockGetChildNames).toHaveBeenCalledWith([CHILD.id]);
  const row = screen.getByRole('button', { name: 'Lwazi Mbeki, Child no longer assigned, WelaPLUS · 4 of 11 done · Tue 14:05 · KWY-2M4' });
  expect(within(row).getByText('LM', { includeHiddenElements: true })).toBeTruthy();
  fireEvent.press(row);
  expect(navigation.navigate).toHaveBeenCalledWith('BatteryOverview', { runId: RUN_ID });
});

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('refocus reloads unfinished runs and stats; an older blurred read cannot overwrite the newer rows', async () => {
  withBattery();
  useAssessableChildren.mockReturnValue({ all: [CHILD], loading: false });
  mockGetUnfinishedRuns.mockResolvedValue([unfinished()]);
  const screen = renderTab();
  await screen.findByText('WelaPLUS · 4 of 11 done · Tue 14:05 · KWY-2M4');
  const older = deferred();
  act(() => screen.navigationRef.navigate('Away'));
  mockGetUnfinishedRuns.mockReturnValueOnce(older.promise);
  act(() => screen.navigationRef.goBack());
  await waitFor(() => expect(mockGetUnfinishedRuns).toHaveBeenCalledTimes(2));
  act(() => screen.navigationRef.navigate('Away'));
  mockGetUnfinishedRuns.mockResolvedValue([unfinished({ question_count: 6 })]);
  act(() => screen.navigationRef.goBack());
  await screen.findByText('WelaPLUS · 6 of 11 done · Tue 14:05 · KWY-2M4');
  expect(mockGetLetterResults).toHaveBeenCalledTimes(3);
  await act(async () => older.resolve([unfinished({ question_count: 1 })]));
  expect(screen.getByText('WelaPLUS · 6 of 11 done · Tue 14:05 · KWY-2M4')).toBeTruthy();
  expect(screen.queryByText('WelaPLUS · 1 of 11 done · Tue 14:05 · KWY-2M4')).toBeNull();
});

test('refocus keeps the prior rows while the programme gate resolves, blocks capture navigation, and applies a lost assignment', async () => {
  withBattery();
  useAssessableChildren.mockReturnValue({ all: [CHILD], loading: false });
  mockGetUnfinishedRuns.mockResolvedValue([unfinished()]);
  const screen = renderTab();
  await screen.findByText('WelaPLUS · 4 of 11 done · Tue 14:05 · KWY-2M4');
  const pending = deferred();
  act(() => screen.navigationRef.navigate('Away'));
  mockGate.mockReturnValueOnce(pending.promise);
  act(() => screen.navigationRef.goBack());
  expect(screen.getByText('Lwazi Mbeki')).toBeTruthy();
  expect(screen.getByText(BATTERY.title)).toBeTruthy();
  expect(screen.getByLabelText('Start an assessment')).toBeDisabled();
  const quick = screen.getByRole('button', { name: 'Letter Sounds, 60-second letter sound test' });
  expect(quick).toBeDisabled();
  fireEvent.press(screen.getByLabelText('Start an assessment'));
  fireEvent.press(quick);
  expect(screen.navigation.navigate).not.toHaveBeenCalled();
  await act(async () => pending.resolve({ hasActiveProgramme: false, programme: null }));
  await screen.findByText(/No active programme/);
  expect(screen.queryByLabelText('Start an assessment')).toBeNull();
  expect(screen.queryByRole('header', { name: 'Quick assessments' })).toBeNull();
});

test('unfinished-run load failure keeps stats and quick assessments usable and offers a manual Retry', async () => {
  withBattery();
  mockGetUnfinishedRuns.mockRejectedValueOnce(new Error('disk busy'));
  const screen = renderTab();
  await screen.findByText("Couldn't load unfinished assessments. Try again.");
  expect(screen.getByText('Avg score')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Letter Sounds, 60-second letter sound test' })).not.toBeDisabled();
  expect(screen.getByLabelText('Start an assessment')).not.toBeDisabled();
  mockGetUnfinishedRuns.mockResolvedValue([unfinished()]);
  mockGetChildNames.mockResolvedValue({ [CHILD.id]: { name: 'Lwazi Mbeki', hidden: false } });
  fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('Lwazi Mbeki');
  expect(screen.queryByText("Couldn't load unfinished assessments. Try again.")).toBeNull();
  expect(mockGetUnfinishedRuns).toHaveBeenCalledTimes(2);
});

test.each(['Start an assessment', 'Lwazi Mbeki, WelaPLUS · 4 of 11 done · Tue 14:05 · KWY-2M4'])(
  'double tap on %s navigates once; the launch guard resets on refocus', async label => {
    withBattery();
    useAssessableChildren.mockReturnValue({ all: [CHILD], loading: false });
    mockGetUnfinishedRuns.mockResolvedValue([unfinished()]);
    const screen = renderTab();
    await screen.findByText('WelaPLUS · 4 of 11 done · Tue 14:05 · KWY-2M4');
    const button = screen.getByLabelText(label);
    act(() => { fireEvent.press(button); fireEvent.press(button); });
    expect(screen.navigation.navigate).toHaveBeenCalledTimes(1);
    act(() => screen.navigationRef.navigate('Away'));
    act(() => screen.navigationRef.goBack());
    await waitFor(() => expect(screen.getByLabelText(label)).not.toBeDisabled());
    fireEvent.press(screen.getByLabelText(label));
    expect(screen.navigation.navigate).toHaveBeenCalledTimes(2);
  },
);

test('initial programme resolve keeps the spinner and hides all capture entry points', async () => {
  const pending = deferred();
  mockGate.mockReturnValueOnce(pending.promise);
  const screen = renderTab();
  expect(screen.UNSAFE_getByType(require('react-native-paper').ActivityIndicator)).toBeTruthy();
  expect(screen.queryByRole('header', { name: 'Quick assessments' })).toBeNull();
  expect(screen.queryByLabelText('Start an assessment')).toBeNull();
  await act(async () => pending.resolve({ hasActiveProgramme: false, programme: null }));
  await screen.findByText(/No active programme/);
  expect(mockGetUnfinishedRuns).not.toHaveBeenCalled();
});

test('programme read error retains the existing quick-assessment fallback', async () => {
  const error = new Error('gate read failed');
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    mockGate.mockRejectedValueOnce(error);
    const screen = renderTab();
    await screen.findByRole('header', { name: 'Quick assessments' });
    expect(screen.getByLabelText('Start a Full EGRA')).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Letter Sounds, 60-second letter sound test' })).not.toBeDisabled();
    expect(log).toHaveBeenCalledWith('Error resolving active programme gate:', error);
  } finally { log.mockRestore(); }
});

test('missing SQLite name falls back to "Child no longer assigned" and remains navigable', async () => {
  mockGetUnfinishedRuns.mockResolvedValue([unfinished()]);
  const screen = renderTab();
  await screen.findByText('Child no longer assigned');
  expect(screen.queryByText('undefined')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Child no longer assigned, WelaPLUS · 4 of 11 done · Tue 14:05 · KWY-2M4' }));
  expect(screen.navigation.navigate).toHaveBeenCalledWith('BatteryOverview', { runId: RUN_ID });
});

test('name lookup batches only missing child IDs, once each, and preserves roster names for control children', async () => {
  useAssessableChildren.mockReturnValue({ all: [CHILD], loading: false });
  mockGetUnfinishedRuns.mockResolvedValue([unfinished(),
    unfinished({ id: '11111111-2222-4333-8444-555555555555', child_id: 'gone' }),
    unfinished({ id: '22222222-2222-4333-8444-555555555555', child_id: 'gone' })]);
  mockGetChildNames.mockResolvedValue({ gone: { name: 'Nomsa Ndlovu', hidden: true } });
  const screen = renderTab();
  await screen.findByText('Lwazi Mbeki');
  expect(screen.getAllByText('Nomsa Ndlovu')).toHaveLength(2);
  expect(screen.getAllByText('Child no longer assigned')).toHaveLength(2);
  expect(mockGetChildNames).toHaveBeenCalledTimes(1);
  expect(mockGetChildNames).toHaveBeenCalledWith(['gone']);
});

test('a loading roster is not authoritative for the unassigned note', async () => {
  const all = [];
  useAssessableChildren.mockReturnValue({ all, loading: true });
  mockGetUnfinishedRuns.mockResolvedValue([unfinished()]);
  mockGetChildNames.mockResolvedValue({ [CHILD.id]: { name: 'Lwazi Mbeki', hidden: false } });
  const screen = renderTab();
  await screen.findByText('Lwazi Mbeki');
  expect(screen.queryByText('Child no longer assigned')).toBeNull();
  useAssessableChildren.mockReturnValue({ all, loading: false });
  screen.refresh();
  expect(screen.getByText('Child no longer assigned')).toBeTruthy();
});

test.each(['gate', 'runs', 'names'])('stale EA handle cannot publish a late %s read', async stage => {
  withBattery();
  const pending = deferred();
  if (stage === 'gate') mockGate.mockReturnValueOnce(pending.promise);
  if (stage === 'runs') mockGetUnfinishedRuns.mockReturnValueOnce(pending.promise);
  if (stage === 'names') {
    mockGetUnfinishedRuns.mockResolvedValue([unfinished()]);
    mockGetChildNames.mockReturnValueOnce(pending.promise);
  }
  const screen = renderTab();
  if (stage === 'names') await waitFor(() => expect(mockGetChildNames).toHaveBeenCalled());
  if (stage === 'runs') await waitFor(() => expect(mockGetUnfinishedRuns).toHaveBeenCalled());
  mockHandle.isCurrent.mockReturnValue(false);
  await act(async () => pending.resolve(stage === 'gate' ? { hasActiveProgramme: true, programme: {
    default_battery_code: BATTERY.battery_code, default_battery_version: BATTERY.battery_version,
  } } : stage === 'runs' ? [unfinished()] : { [CHILD.id]: { name: 'Lwazi Mbeki' } }));
  expect(screen.queryByRole('header', { name: 'Unfinished assessments' })).toBeNull();
  if (stage === 'gate') expect(screen.queryByText(BATTERY.title)).toBeNull();
  expect(screen.navigation.navigate).not.toHaveBeenCalled();
});

test('unfinished runs stay reachable when the programme default is unavailable, and use their own battery total', async () => {
  mockGate.mockResolvedValue({ hasActiveProgramme: true, programme: {
    default_battery_code: 'unknown', default_battery_version: 'unknown',
  } });
  useAssessableChildren.mockReturnValue({ all: [CHILD], loading: false });
  mockGetUnfinishedRuns.mockResolvedValue([unfinished()]);
  const screen = renderTab();
  await screen.findByText('WelaPLUS · 4 of 11 done · Tue 14:05 · KWY-2M4');
  expect(screen.queryByLabelText('Start an assessment')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Lwazi Mbeki, WelaPLUS · 4 of 11 done · Tue 14:05 · KWY-2M4' }));
  expect(screen.navigation.navigate).toHaveBeenCalledWith('BatteryOverview', { runId: RUN_ID });
});

test('unfinished EGRA assessment uses its own four-Question total and resumes in the shared overview', async () => {
  withBattery();
  useAssessableChildren.mockReturnValue({ all: [CHILD], loading: false });
  mockGetUnfinishedRuns.mockResolvedValue([unfinished({
    battery_code: 'egra', battery_version: 'dbe-egra-en-fal-2-v1', question_count: 2,
  })]);
  const screen = renderTab();
  fireEvent.press(await screen.findByRole('button', { name: 'Lwazi Mbeki, English FAL EGRA 2 · 2 of 4 done · Tue 14:05 · KWY-2M4' }));
  expect(screen.navigation.navigate).toHaveBeenCalledWith('BatteryOverview', { runId: RUN_ID });
});
