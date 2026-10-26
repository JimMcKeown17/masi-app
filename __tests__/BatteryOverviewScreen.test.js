jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'ea-1' } }) }));
jest.mock('../src/hooks/useAssessableChildren', () => ({ useAssessableChildren: () => mockRealRoster
  ? jest.requireActual('../src/hooks/useAssessableChildren').useAssessableChildren() : mockRoster }));
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => mockChildrenContext }));
jest.mock('../src/context/ClassesContext', () => ({ useClasses: () => mockClassesContext }));
jest.mock('../src/services/activeProgrammeGate', () => ({ getActiveProgrammeGate: jest.fn() }));
jest.mock('../src/context/ToastContext', () => ({
  ...jest.requireActual('../src/context/ToastContext'), useToast: () => ({ show: mockToast }),
}));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => ({ triggerBackgroundSync: mockSync }) }));
jest.mock('../src/assessment-questions', () => ({
  ...jest.requireActual('../src/assessment-questions'),
  batteryFor: jest.fn((...args) => jest.requireActual('../src/assessment-questions').batteryFor(...args)),
}));

import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { act, configure, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { createNavigationContainerRef, createNavigatorFactory, NavigationContainer,
  StackRouter, useNavigationBuilder } from '@react-navigation/native';
import { AllProviders } from '../test-support/renderWithProviders';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { getActiveProgrammeGate } from '../src/services/activeProgrammeGate';
import { batteryFor, MANUAL_SKIP_REASONS, skippedResult, WELA_PLUS_FULL_2024_1 as BATTERY } from '../src/assessment-questions';
import { colors, spacing } from '../src/constants/colors';
import { fontFamilies } from '../src/constants/typography';
import InlineNote from '../src/components/common/InlineNote';
import ListRow from '../src/components/common/ListRow';
import StatusBadge from '../src/components/common/StatusBadge';
import BatteryOverviewScreen from '../src/screens/assessments/battery/BatteryOverviewScreen';
import { egraBatteryFor } from '../src/assessment-questions/egra';

test.each(['completed', 'skipped_tired'])('EGRA persists comprehension auto-skip after zero/skipped story (%s), with no Writing Sheet', async stoppedReason => {
  const battery = egraBatteryFor('egra', 'dbe-egra-en-hl-1-v1');
  run = { ...run, battery_code: 'egra', battery_version: battery.battery_version, language: 'en',
    results: battery.questions.slice(0, 3).map((question, index) => ({ ...resultRow(question, index),
      ...(index === 2 ? { stopped_reason: stoppedReason, score: 0 } : {}) })) };
  const screen = renderOverview();
  await screen.findByText(`${battery.title} · English · 4 of 4 decided`);
  expect(repositories.assessments.saveQuestionResult).toHaveBeenCalledTimes(1);
  expect(repositories.assessments.saveQuestionResult).toHaveBeenCalledWith({
    assessmentId: expect.any(String), userId: 'ea-1', childId: CHILD.id, batteryRunId: ID,
    result: skippedResult(battery.questions[3], 'en', 'skipped_prerequisite_unmet'),
  });
  expect(screen.getByText('Skipped · No story words read')).toBeTruthy();
  expect(screen.queryByText(/Writing Sheet/)).toBeNull();
  screen.refresh();
  expect(repositories.assessments.saveQuestionResult).toHaveBeenCalledTimes(1);
  expect(run.results[3].stopped_reason).toBe('skipped_prerequisite_unmet');
});

test('EGRA first Question is offered without the Writing Sheet reminder', async () => {
  const battery = egraBatteryFor('egra', 'dbe-egra-en-fal-2-v1');
  run = { ...run, battery_code: 'egra', battery_version: battery.battery_version, language: 'en', results: [] };
  const screen = renderOverview();
  await screen.findByRole('button', { name: 'Start Letter sounds' });
  expect(screen.getByText(`${battery.title} · English · 0 of 4 decided`)).toBeTruthy();
  expect(screen.queryByText(/Writing Sheet/)).toBeNull();
});

jest.setTimeout(30000);
configure({ asyncUtilTimeout: 5000 });

const mockToast = jest.fn();
const mockSync = jest.fn();
const CHILD = { id: 'child-1', first_name: 'Lwazi', last_name: 'Mbeki', is_delivery: false,
  class_id: 'class-1', grade: '2', home_language: 'isiXhosa', membership_id: 'membership-1' };
const ID = '9f3c2a10-5b7e-4c1d-8e2f-0123456789ab';
let mockRoster, mockRealRoster, mockChildrenContext, mockClassesContext, run, repositories, handle;
const clone = value => JSON.parse(JSON.stringify(value));
const resultRow = (question, index = 0) => ({ id: `assessment-${index}`, question_code: question.question_code,
  stopped_reason: 'completed', score: 34, total_items: 60, derived: {} });
const decide = count => BATTERY.questions.slice(0, count).map(resultRow);
const writingGateBattery = () => ({ ...BATTERY, prerequisites: {
  [BATTERY.questions[4].question_code]: { depends_on: BATTERY.questions[0].question_code,
    minScore: 50, on_unmet_reason: 'skipped_prerequisite_unmet' },
} });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function EmptyScreen() { return null; }
// Native stack retains the overview underneath a Question. Keep routes mounted
// here so focus tests also cover async work that settles while it is blurred.
function RetainedStack({ children }) {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, { children });
  return <NavigationContent>{state.routes.map((route, index) => (
    <View key={route.key} style={index === state.index ? { flex: 1 } : { display: 'none' }}>
      {descriptors[route.key].render()}
    </View>
  ))}</NavigationContent>;
}
const Stack = createNavigatorFactory(RetainedStack)();
function renderOverview({ realRoster = false } = {}) {
  mockRealRoster = realRoster;
  const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() };
  let rerenderHost;
  function Host() {
    const [, force] = React.useReducer(value => value + 1, 0);
    rerenderHost = force;
    return <BatteryOverviewScreen navigation={navigation} route={{ params: { runId: ID } }} />;
  }
  function Wrapper({ children }) {
    return <AllProviders motion={{ motionLevel: 'still', reduceMotion: true, tier: 'high' }}>
      <SignedInEAContext.Provider value={{ handle, repositories }}>{children}</SignedInEAContext.Provider>
    </AllProviders>;
  }
  const navigationRef = createNavigationContainerRef();
  const screen = render(<Wrapper>
    <NavigationContainer ref={navigationRef} initialState={{ index: 1,
      routes: [{ name: 'Entry' }, { name: 'BatteryOverview' }] }}>
      <Stack.Navigator>
        <Stack.Screen name="Entry" component={EmptyScreen} />
        <Stack.Screen name="BatteryOverview" component={Host} />
        <Stack.Screen name="Away" component={EmptyScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  </Wrapper>);
  return { ...screen, navigationRef, navigation, refresh: () => act(() => rerenderHost()) };
}
async function ready(screen) {
  await screen.findByText(`${BATTERY.title} · isiXhosa · ${run.results.length} of 11 decided`);
  return screen;
}
const openSkip = (screen, index = 5) => fireEvent.press(screen.getByRole('button', { name: `Skip ${BATTERY.questions[index].title}` }));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRealRoster = false;
  mockChildrenContext = { children: [], rosterVersion: 0 };
  mockClassesContext = { classes: [], assignmentsVersion: 0 };
  mockRoster = { yourChildren: [], restOfClass: [CHILD], all: [CHILD], loading: false };
  run = { id: ID, user_id: 'ea-1', child_id: CHILD.id, status: 'in_progress', started_here: 1,
    programme_id: 'programme-1', battery_code: BATTERY.battery_code, battery_version: BATTERY.battery_version,
    language: 'xh', results: decide(4) };
  handle = { userId: 'ea-1', epoch: 1, isCurrent: jest.fn(() => true) };
  repositories = {
    batteryRuns: { getRunWithResults: jest.fn(async () => clone(run)), abandonRun: jest.fn().mockResolvedValue({ id: ID }) },
    assessments: { saveQuestionResult: jest.fn(async ({ result }) => {
      run.results.push({ question_code: result.question_code, stopped_reason: result.stopped_reason,
        score: result.derived.total_correct, total_items: result.items.length, derived: result.derived });
    }) },
    children: { getAssessableChildren: jest.fn(async () => clone(mockRoster.all)), getChildNamesByIds: jest.fn().mockResolvedValue({ [CHILD.id]: { name: 'Lwazi Mbeki', hidden: false } }) },
  };
  getActiveProgrammeGate.mockReset().mockResolvedValue({ hasActiveProgramme: true, programme: { id: 'programme-1' } });
  batteryFor.mockReset().mockImplementation((...args) => jest.requireActual('../src/assessment-questions').batteryFor(...args));
});

afterEach(async () => {
  await act(async () => { jest.runOnlyPendingTimers(); });
  jest.useRealTimers();
});

test('header line "WelaPLUS · isiXhosa · 4 of 11 decided" and the run code badge', async () => {
  const screen = await ready(renderOverview());
  expect(screen.UNSAFE_getAllByType(StatusBadge).some(badge => badge.props.label === 'KWY-2M4')).toBe(true);
  expect(screen.navigation.setOptions).toHaveBeenCalledWith({ title: 'Lwazi Mbeki' });
  expect(getActiveProgrammeGate).toHaveBeenCalledWith({ handle, userId: 'ea-1' });
  expect(repositories.children.getChildNamesByIds).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Start Letter writing' })).toBeTruthy();
});

test('rows: done shows score / max and a success badge; skipped shows reason; next highlighted with ⋯; later rows Not started', async () => {
  run.results[2] = { ...run.results[2], stopped_reason: 'skipped_tired', score: 0 };
  const screen = await ready(renderOverview());
  const rows = screen.UNSAFE_getAllByType(ListRow);
  expect(rows).toHaveLength(11);
  expect(within(rows[0]).getByText('Done')).toBeTruthy();
  expect(within(rows[0]).UNSAFE_getByType(StatusBadge).props).toMatchObject({ label: '34 / 60', tone: 'success' });
  expect(within(rows[2]).getByText('Skipped · Child is tired')).toBeTruthy();
  expect(within(rows[2]).UNSAFE_getByType(StatusBadge).props).toMatchObject({ label: 'Skipped', tone: 'neutral' });
  expect(StyleSheet.flatten(rows[4].props.style)).toMatchObject({ backgroundColor: colors.red50 });
  expect(screen.getByRole('button', { name: 'Skip Letter writing' })).toHaveTextContent('⋯');
  expect(within(rows[5]).getByText('Not started · 1 min')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Skip Letter sounds' })).toBeNull();
});

test('only the next Question is startable: footer "Start Letter writing" navigates with that code; tapping a later row does nothing', async () => {
  const screen = await ready(renderOverview());
  fireEvent.press(screen.getByText('Reading words'));
  expect(screen.navigation.navigate).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Start Letter writing' }));
  expect(screen.navigation.navigate).toHaveBeenCalledWith('BatteryQuestion', { runId: ID, questionCode: BATTERY.questions[4].question_code });
});

test('writing-sheet reminder shows before the first writing-sheet Question and names the run code and child', async () => {
  const screen = await ready(renderOverview());
  const reminder = screen.UNSAFE_getAllByType(InlineNote).find(note => note.props.tone === 'warning');
  const note = within(reminder);
  expect(note.getByText("Next is Letter writing. Write assessment code KWY-2M4 and Lwazi's name on the Writing Sheet before you hand it over.")).toBeTruthy();
  expect(StyleSheet.flatten(note.getByText('KWY-2M4').props.style).fontFamily).toBe(fontFamilies.textBold);
});

test('⋯ opens "Skip Reading words?" with the five package reasons; confirm disabled until a reason is picked', async () => {
  const screen = await ready(renderOverview());
  openSkip(screen);
  expect(screen.getByText('Skip Reading words?')).toBeTruthy();
  expect(screen.getByText("It is saved as skipped with your reason. You can't undo a skip in this assessment.")).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Skip Question' })).toBeDisabled();
  MANUAL_SKIP_REASONS.forEach(({ label }) => expect(screen.getByRole('button', { name: label })).toBeTruthy());
  fireEvent.press(screen.getByRole('button', { name: 'Child is tired' }));
  expect(screen.getByRole('button', { name: 'Skip Question' })).not.toBeDisabled();
  expect(repositories.assessments.saveQuestionResult).not.toHaveBeenCalled();
});

test('confirming a skip saves skippedResult with batteryRunId and refreshes the row', async () => {
  const screen = await ready(renderOverview());
  openSkip(screen);
  fireEvent.press(screen.getByRole('button', { name: 'Child is tired' }));
  fireEvent.press(screen.getByRole('button', { name: 'Skip Question' }));
  await waitFor(() => expect(repositories.assessments.saveQuestionResult).toHaveBeenCalledTimes(1));
  expect(repositories.assessments.saveQuestionResult).toHaveBeenCalledWith({
    assessmentId: expect.any(String), userId: 'ea-1', childId: CHILD.id, batteryRunId: ID,
    result: skippedResult(BATTERY.questions[5], 'xh', 'skipped_tired'),
  });
  await screen.findByText(`${BATTERY.title} · isiXhosa · 5 of 11 decided`);
  expect(screen.UNSAFE_getAllByType(ListRow)[5].props.subtitle).toBe('Skipped · Child is tired');
  expect(mockSync).toHaveBeenCalledTimes(1);
});

test('a skip of a Question that is no longer undecided (QUESTION_ALREADY_DECIDED) refreshes without an error toast', async () => {
  repositories.assessments.saveQuestionResult.mockImplementationOnce(async ({ result }) => {
    run.results.push({ question_code: result.question_code, stopped_reason: 'completed', score: 5, total_items: 10, derived: {} });
    throw Object.assign(new Error('already decided'), { code: 'QUESTION_ALREADY_DECIDED' });
  });
  const screen = await ready(renderOverview());
  openSkip(screen);
  fireEvent.press(screen.getByRole('button', { name: 'Other reason' }));
  fireEvent.press(screen.getByRole('button', { name: 'Skip Question' }));
  await screen.findByText(`${BATTERY.title} · isiXhosa · 5 of 11 decided`);
  expect(mockToast).not.toHaveBeenCalled();
  expect(screen.UNSAFE_getAllByType(ListRow)[5].props.subtitle).toBe('Done');
});

test('all decided: footer becomes "Review and finalize" and opens BatteryRunSummary', async () => {
  run.results = decide(11);
  const screen = await ready(renderOverview());
  fireEvent.press(screen.getByRole('button', { name: 'Review and finalize' }));
  expect(screen.navigation.navigate).toHaveBeenCalledWith('BatteryRunSummary', { runId: ID });
  expect(screen.queryByText(/Next is/)).toBeNull();
});

test('Abandon assessment asks via ConfirmSheet, then abandons and goes back', async () => {
  const screen = await ready(renderOverview());
  fireEvent.press(screen.getByRole('button', { name: 'Abandon assessment' }));
  expect(screen.getByText('Abandon this assessment?')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Keep going' })).toBeTruthy();
  expect(repositories.batteryRuns.abandonRun).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Abandon' }));
  await waitFor(() => expect(screen.navigation.goBack).toHaveBeenCalledTimes(1));
  expect(repositories.batteryRuns.abandonRun).toHaveBeenCalledWith(ID);
  await waitFor(() => expect(screen.queryByTestId('bottom-sheet-panel')).toBeNull());
});

test('autoSkips from the evaluator are saved once as skipped_prerequisite_unmet (test battery with a gate)', async () => {
  const question = BATTERY.questions[4];
  batteryFor.mockReturnValue(writingGateBattery());
  const screen = renderOverview();
  await screen.findByText(`${BATTERY.title} · isiXhosa · 5 of 11 decided`);
  expect(repositories.assessments.saveQuestionResult).toHaveBeenCalledTimes(1);
  expect(repositories.assessments.saveQuestionResult.mock.calls[0][0].result)
    .toEqual(skippedResult(question, 'xh', 'skipped_prerequisite_unmet'));
  screen.refresh();
  expect(repositories.assessments.saveQuestionResult).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Start Reading words' })).toBeTruthy();
});

test.each(['child', 'none', 'different'])(
  'child no longer in the assessable roster, or active programme gone or different: read-only note and only Abandon (%s)', async kind => {
    if (kind === 'child') mockRoster = { ...mockRoster, restOfClass: [], all: [] };
    if (kind === 'none') getActiveProgrammeGate.mockResolvedValue({ hasActiveProgramme: false, programme: null });
    if (kind === 'different') getActiveProgrammeGate.mockResolvedValue({ hasActiveProgramme: true, programme: { id: 'other' } });
    const screen = renderOverview();
    expect(await screen.findByText('This child is no longer assigned to you — you can abandon this assessment.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Abandon assessment' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Start / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Skip / })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Review and finalize' })).toBeNull();
    expect(repositories.assessments.saveQuestionResult).not.toHaveBeenCalled();
    if (kind === 'child') {
      expect(repositories.children.getChildNamesByIds).toHaveBeenCalledWith([CHILD.id]);
      expect(screen.navigation.setOptions).toHaveBeenCalledWith({ title: 'Lwazi Mbeki' });
    }
  },
);

test.each([{ started_here: 0 }, { status: 'completed' }, { status: 'abandoned' }])(
  'pulled or terminal run: replaces to BatteryRunSummary (%p)', async changes => {
    Object.assign(run, changes);
    const screen = renderOverview();
    await waitFor(() => expect(screen.navigation.replace).toHaveBeenCalledWith('BatteryRunSummary', { runId: ID }));
    expect(screen.queryByRole('button', { name: /^Start / })).toBeNull();
    expect(repositories.assessments.saveQuestionResult).not.toHaveBeenCalled();
  },
);

test('reloads on focus after returning from a Question', async () => {
  const screen = await ready(renderOverview());
  act(() => screen.navigationRef.navigate('Away'));
  run.results = decide(5);
  act(() => screen.navigationRef.goBack());
  await screen.findByText(`${BATTERY.title} · isiXhosa · 5 of 11 decided`);
  expect(screen.getByRole('button', { name: 'Start Reading words' })).toBeTruthy();
  expect(repositories.batteryRuns.getRunWithResults).toHaveBeenCalledTimes(2);
});

test('refocus refresh keeps previous rows visible and prevents Start until the refresh completes', async () => {
  const screen = await ready(renderOverview());
  const pending = deferred();
  act(() => screen.navigationRef.navigate('Away'));
  repositories.batteryRuns.getRunWithResults.mockReturnValueOnce(pending.promise);
  act(() => screen.navigationRef.goBack());
  expect(screen.getByText(`${BATTERY.title} · isiXhosa · 4 of 11 decided`)).toBeTruthy();
  expect(screen.UNSAFE_getAllByType(ListRow)).toHaveLength(11);
  expect(screen.queryByLabelText('Loading assessment')).toBeNull();
  const start = screen.getByRole('button', { name: 'Start Letter writing' });
  expect(start).toBeDisabled();
  fireEvent.press(start);
  expect(screen.navigation.navigate).not.toHaveBeenCalled();
  run.results = decide(5);
  await act(async () => pending.resolve(clone(run)));
  await screen.findByText(`${BATTERY.title} · isiXhosa · 5 of 11 decided`);
  fireEvent.press(screen.getByRole('button', { name: 'Start Reading words' }));
  expect(screen.navigation.navigate).toHaveBeenCalledTimes(1);
  expect(screen.navigation.navigate).toHaveBeenCalledWith('BatteryQuestion', {
    runId: ID, questionCode: BATTERY.questions[5].question_code,
  });
});

test('double tap on Start next pushes one screen', async () => {
  const screen = await ready(renderOverview());
  const button = screen.getByRole('button', { name: 'Start Letter writing' });
  act(() => { fireEvent.press(button); fireEvent.press(button); });
  expect(screen.navigation.navigate).toHaveBeenCalledTimes(1);
});

test('does not treat an empty assessable list as authoritative while loading', async () => {
  mockRoster = { ...mockRoster, all: [], restOfClass: [], loading: true };
  const screen = renderOverview();
  expect(screen.getByLabelText('Loading assessment')).toBeTruthy();
  expect(screen.queryByText('This child is no longer assigned to you — you can abandon this assessment.')).toBeNull();
  expect(screen.queryByRole('button', { name: /^Start / })).toBeNull();
  expect(repositories.assessments.saveQuestionResult).not.toHaveBeenCalled();
  mockRoster = { yourChildren: [], restOfClass: [CHILD], all: [CHILD], loading: false };
  screen.refresh();
  await ready(screen);
  expect(screen.getByRole('button', { name: 'Start Letter writing' })).toBeTruthy();
});

test('holds the screen on a spinner until the active programme gate resolves', async () => {
  const gate = deferred();
  getActiveProgrammeGate.mockReturnValue(gate.promise);
  const screen = renderOverview();
  await waitFor(() => expect(getActiveProgrammeGate).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText('Loading assessment')).toBeTruthy();
  expect(screen.queryByText('This child is no longer assigned to you — you can abandon this assessment.')).toBeNull();
  expect(screen.queryByRole('button', { name: /^Start / })).toBeNull();
  await act(async () => gate.resolve({ hasActiveProgramme: true, programme: { id: 'programme-1' } }));
  await ready(screen);
});

test('a missing battery version is read-only with the exact unavailable copy', async () => {
  run.battery_version = '2099.1';
  const screen = renderOverview();
  expect(await screen.findByText("This assessment isn't available in this version of the app.")).toBeTruthy();
  expect(batteryFor).toHaveBeenCalledWith(run.battery_code, '2099.1');
  expect(screen.queryByRole('button', { name: /^Start / })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Skip / })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Abandon assessment' })).toBeNull();
  expect(repositories.assessments.saveQuestionResult).not.toHaveBeenCalled();
});

test('roster removal while the screen is open removes every capture and skip action', async () => {
  const screen = await ready(renderOverview());
  mockRoster = { ...mockRoster, all: [], restOfClass: [] };
  screen.refresh();
  await screen.findByText('This child is no longer assigned to you — you can abandon this assessment.');
  expect(screen.queryByRole('button', { name: /^Start / })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Skip / })).toBeNull();
});

test('a stale handle cannot publish a late load or navigate', async () => {
  const pending = deferred();
  repositories.batteryRuns.getRunWithResults.mockReturnValue(pending.promise);
  const screen = renderOverview();
  handle.isCurrent.mockReturnValue(false);
  await act(async () => pending.resolve(clone(run)));
  expect(screen.queryByRole('button', { name: /^Start / })).toBeNull();
  expect(screen.navigation.setOptions).not.toHaveBeenCalled();
  expect(screen.navigation.replace).not.toHaveBeenCalled();
});

test('a skip completing while blurred does not leave the next action disabled on return', async () => {
  const pending = deferred();
  const save = repositories.assessments.saveQuestionResult.getMockImplementation();
  repositories.assessments.saveQuestionResult.mockImplementationOnce(async args => {
    await pending.promise;
    return save(args);
  });
  const screen = await ready(renderOverview());
  openSkip(screen, 4);
  fireEvent.press(screen.getByRole('button', { name: 'Child is tired' }));
  fireEvent.press(screen.getByRole('button', { name: 'Skip Question' }));
  act(() => screen.navigationRef.navigate('Away'));
  await act(async () => pending.resolve());
  expect(mockToast).not.toHaveBeenCalled();
  expect(mockSync).not.toHaveBeenCalled();
  act(() => screen.navigationRef.goBack());
  await screen.findByText(`${BATTERY.title} · isiXhosa · 5 of 11 decided`);
  expect(screen.getByRole('button', { name: 'Start Reading words' })).not.toBeDisabled();
});

test('a roster identity change during in-flight auto-skips does not reread the run or save twice', async () => {
  batteryFor.mockReturnValue(writingGateBattery());
  const pending = deferred();
  const save = repositories.assessments.saveQuestionResult.getMockImplementation();
  repositories.assessments.saveQuestionResult.mockImplementationOnce(async args => {
    await pending.promise;
    return save(args);
  });
  const screen = renderOverview();
  await waitFor(() => expect(repositories.assessments.saveQuestionResult).toHaveBeenCalledTimes(1));
  mockRoster = { ...mockRoster, all: [CHILD] };
  screen.refresh();
  expect(screen.getByLabelText('Loading assessment')).toBeTruthy();
  expect(repositories.batteryRuns.getRunWithResults).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve());
  await screen.findByText(`${BATTERY.title} · isiXhosa · 5 of 11 decided`);
  expect(repositories.assessments.saveQuestionResult).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Start Reading words' })).not.toBeDisabled();
});

test('double confirming a skip writes once while its save is pending', async () => {
  const pending = deferred();
  const save = repositories.assessments.saveQuestionResult.getMockImplementation();
  repositories.assessments.saveQuestionResult.mockImplementationOnce(async args => {
    await pending.promise;
    return save(args);
  });
  const screen = await ready(renderOverview());
  openSkip(screen);
  fireEvent.press(screen.getByRole('button', { name: 'Child is tired' }));
  const confirm = screen.getByRole('button', { name: 'Skip Question' });
  act(() => { fireEvent.press(confirm); fireEvent.press(confirm); });
  expect(repositories.assessments.saveQuestionResult).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Start Letter writing' })).toBeDisabled();
  await act(async () => pending.resolve());
  await screen.findByText(`${BATTERY.title} · isiXhosa · 5 of 11 decided`);
});

test('a failed skip shows an error and leaves the Question undecided for a retry', async () => {
  repositories.assessments.saveQuestionResult.mockRejectedValueOnce(new Error('disk unavailable'));
  const screen = await ready(renderOverview());
  openSkip(screen, 4);
  fireEvent.press(screen.getByRole('button', { name: 'Child is tired' }));
  fireEvent.press(screen.getByRole('button', { name: 'Skip Question' }));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ tone: 'error',
    message: "Couldn't skip this Question. Try again." }));
  await ready(screen);
  expect(screen.getByRole('button', { name: 'Start Letter writing' })).not.toBeDisabled();
  openSkip(screen, 4);
  expect(screen.getByRole('button', { name: 'Skip Question' })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Other reason' }));
  fireEvent.press(screen.getByRole('button', { name: 'Skip Question' }));
  await screen.findByText(`${BATTERY.title} · isiXhosa · 5 of 11 decided`);
  expect(repositories.assessments.saveQuestionResult).toHaveBeenCalledTimes(2);
});

const layout = (screen, testID, values) => fireEvent(screen.getByTestId(testID), 'layout', {
  nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 64, ...values } },
});
test('Next row below the viewport scrolls fully above the footer with md clearance, only once per Question', async () => {
  run.results = decide(7);
  const screen = await ready(renderOverview());
  const scrollTo = screen.UNSAFE_getByType(ScrollView).instance.scrollTo;
  scrollTo.mockClear();
  layout(screen, 'battery-overview-scroll', { height: 400 });
  layout(screen, 'battery-question-list', { y: 80, height: 800 });
  layout(screen, `battery-row-${BATTERY.questions[7].question_code}`, { y: 448, height: 80 });
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 80 + 448 + 80 - 400 + spacing.md, animated: true });
  fireEvent.scroll(screen.getByTestId('battery-overview-scroll'), { nativeEvent: { contentOffset: { y: 0 } } });
  layout(screen, `battery-row-${BATTERY.questions[7].question_code}`, { y: 448, height: 90 });
  screen.refresh();
  expect(scrollTo).toHaveBeenCalledTimes(1);
  layout(screen, `battery-row-${BATTERY.questions[8].question_code}`, { y: 538, height: 80 });
  run.results = decide(8);
  act(() => screen.navigationRef.navigate('Away'));
  act(() => screen.navigationRef.goBack());
  await screen.findByText('WelaPLUS · isiXhosa · 8 of 11 decided');
  expect(scrollTo).toHaveBeenCalledTimes(1); // the old Not started geometry is stale
  layout(screen, `battery-row-${BATTERY.questions[8].question_code}`, { y: 548, height: 90 });
  expect(scrollTo).toHaveBeenCalledTimes(2);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 80 + 548 + 90 - 400 + spacing.md, animated: true });
});

test('Next row already fully visible does not scroll or fight later EA scrolling', async () => {
  const screen = await ready(renderOverview());
  const scrollTo = screen.UNSAFE_getByType(ScrollView).instance.scrollTo;
  scrollTo.mockClear();
  layout(screen, `battery-row-${BATTERY.questions[4].question_code}`, { y: 100, height: 64 });
  layout(screen, 'battery-question-list', { y: 80, height: 800 });
  layout(screen, 'battery-overview-scroll', { height: 400 });
  expect(scrollTo).not.toHaveBeenCalled();
  fireEvent.scroll(screen.getByTestId('battery-overview-scroll'), { nativeEvent: { contentOffset: { y: 300 } } });
  layout(screen, 'battery-overview-scroll', { height: 350 });
  expect(scrollTo).not.toHaveBeenCalled();
});

test('retry after a refresh error reveals the same Next Question again using only the remounted list geometry', async () => {
  run.results = decide(7);
  const screen = await ready(renderOverview());
  const nextRow = `battery-row-${BATTERY.questions[7].question_code}`;
  const firstScrollTo = screen.UNSAFE_getByType(ScrollView).instance.scrollTo;
  firstScrollTo.mockClear();
  layout(screen, 'battery-overview-scroll', { height: 400 });
  layout(screen, 'battery-question-list', { y: 80, height: 800 });
  layout(screen, nextRow, { y: 448, height: 80 });
  expect(firstScrollTo).toHaveBeenCalledTimes(1);
  expect(firstScrollTo).toHaveBeenLastCalledWith({ y: 80 + 448 + 80 - 400 + spacing.md, animated: true });
  // The old instance's manual offset must not affect the new list, which mounts at the top.
  fireEvent.scroll(screen.getByTestId('battery-overview-scroll'), { nativeEvent: { contentOffset: { y: 900 } } });
  repositories.batteryRuns.getRunWithResults.mockRejectedValueOnce(new Error('refresh failed'));
  act(() => screen.navigationRef.navigate('Away'));
  act(() => screen.navigationRef.goBack());
  await screen.findByText("Couldn't load this assessment. Try again.");
  expect(screen.queryByTestId('battery-overview-scroll')).toBeNull();
  firstScrollTo.mockClear();
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await ready(screen);
  const scrollTo = screen.UNSAFE_getByType(ScrollView).instance.scrollTo;
  expect(scrollTo).not.toHaveBeenCalled();
  layout(screen, nextRow, { y: 500, height: 90 });
  expect(scrollTo).not.toHaveBeenCalled();
  layout(screen, 'battery-question-list', { y: 110, height: 900 });
  expect(scrollTo).not.toHaveBeenCalled();
  layout(screen, 'battery-overview-scroll', { height: 350 });
  expect(scrollTo).toHaveBeenCalledTimes(1);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 110 + 500 + 90 - 350 + spacing.md, animated: true });
  fireEvent.scroll(screen.getByTestId('battery-overview-scroll'), { nativeEvent: { contentOffset: { y: 0 } } });
  layout(screen, nextRow, { y: 500, height: 100 });
  expect(scrollTo).toHaveBeenCalledTimes(1);
});

test('Next row above the current scroll offset scrolls back to its top with md clearance', async () => {
  const screen = await ready(renderOverview());
  const scrollTo = screen.UNSAFE_getByType(ScrollView).instance.scrollTo;
  scrollTo.mockClear();
  fireEvent.scroll(screen.getByTestId('battery-overview-scroll'), { nativeEvent: { contentOffset: { y: 300 } } });
  layout(screen, 'battery-overview-scroll', { height: 400 });
  layout(screen, 'battery-question-list', { y: 80, height: 800 });
  layout(screen, `battery-row-${BATTERY.questions[4].question_code}`, { y: 100, height: 64 });
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 180 - spacing.md, animated: true });
});

test('an open abandon sheet survives a sync roster refetch and its confirm abandons instead of starting a Question', async () => {
  run.results = [];
  const screen = await ready(renderOverview({ realRoster: true }));
  fireEvent.press(screen.getByRole('button', { name: 'Abandon assessment' }));
  mockChildrenContext = { ...mockChildrenContext, rosterVersion: 1 };
  screen.refresh();
  await waitFor(() => expect(repositories.children.getAssessableChildren).toHaveBeenCalledTimes(2));
  await act(async () => {});
  expect(screen.getByText('Abandon this assessment?')).toBeTruthy();
  expect(repositories.batteryRuns.getRunWithResults).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole('button', { name: 'Abandon' }));
  await waitFor(() => expect(screen.navigation.goBack).toHaveBeenCalledTimes(1));
  expect(repositories.batteryRuns.abandonRun).toHaveBeenCalledWith(ID);
  expect(screen.navigation.navigate).not.toHaveBeenCalled();
});

test('a selected skip reason survives a sync roster refetch without rereading the run and its confirm saves the skip', async () => {
  const screen = await ready(renderOverview({ realRoster: true }));
  openSkip(screen);
  fireEvent.press(screen.getByRole('button', { name: 'Child is tired' }));
  mockClassesContext = { ...mockClassesContext, assignmentsVersion: 1 };
  screen.refresh();
  await waitFor(() => expect(repositories.children.getAssessableChildren).toHaveBeenCalledTimes(2));
  await act(async () => {});
  expect(repositories.batteryRuns.getRunWithResults).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Skip Reading words?')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Child is tired' }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByRole('button', { name: 'Skip Question' })).not.toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Skip Question' }));
  await screen.findByText(`${BATTERY.title} · isiXhosa · 5 of 11 decided`);
  expect(repositories.assessments.saveQuestionResult).toHaveBeenCalledWith({
    assessmentId: expect.any(String), userId: 'ea-1', childId: CHILD.id, batteryRunId: ID,
    result: skippedResult(BATTERY.questions[5], 'xh', 'skipped_tired'),
  });
  expect(screen.navigation.navigate).not.toHaveBeenCalled();
});

test.each([
  [0, "Nothing was saved in this assessment yet. You can't continue it."],
  [1, "The 1 saved Question stays in Lwazi's history. You can't continue this assessment."],
  [4, "The 4 saved Questions stay in Lwazi's history. You can't continue this assessment."],
])('abandon copy agrees with %i decided Questions, including skips', async (count, body) => {
  run.results = decide(count).map(row => ({ ...row, stopped_reason: 'skipped_tired' }));
  const screen = await ready(renderOverview());
  fireEvent.press(screen.getByRole('button', { name: 'Abandon assessment' }));
  expect(screen.getByText(body)).toBeTruthy();
});

test('a first load attempted during the real roster read resumes exactly once when it settles', async () => {
  const pending = deferred();
  repositories.children.getAssessableChildren.mockReturnValueOnce(pending.promise);
  const screen = renderOverview({ realRoster: true });
  expect(screen.getByLabelText('Loading assessment')).toBeTruthy();
  expect(repositories.batteryRuns.getRunWithResults).not.toHaveBeenCalled();
  await act(async () => pending.resolve([CHILD]));
  await ready(screen);
  expect(repositories.batteryRuns.getRunWithResults).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Start Letter writing' })).not.toBeDisabled();
});

test.each(['abandon', 'skip'])('blur closes the %s sheet before returning to the overview', async kind => {
  const screen = await ready(renderOverview());
  if (kind === 'abandon') fireEvent.press(screen.getByRole('button', { name: 'Abandon assessment' }));
  else openSkip(screen);
  const title = kind === 'abandon' ? 'Abandon this assessment?' : 'Skip Reading words?';
  expect(screen.getByText(title)).toBeTruthy();
  act(() => screen.navigationRef.navigate('Away'));
  await waitFor(() => expect(screen.queryByText(title)).toBeNull());
  act(() => screen.navigationRef.goBack());
  await ready(screen);
  expect(screen.queryByText(title)).toBeNull();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start Letter writing' })).not.toBeDisabled());
  fireEvent.press(screen.getByRole('button', { name: 'Start Letter writing' }));
  expect(screen.navigation.navigate).toHaveBeenCalledTimes(1);
});

test.each(['skip', 'abandon'])('a roster removal updates sheet validity without rereading the run (%s)', async kind => {
  const screen = await ready(renderOverview({ realRoster: true }));
  if (kind === 'skip') {
    openSkip(screen);
    fireEvent.press(screen.getByRole('button', { name: 'Child is tired' }));
  } else fireEvent.press(screen.getByRole('button', { name: 'Abandon assessment' }));
  mockRoster = { ...mockRoster, all: [], restOfClass: [] };
  mockChildrenContext = { ...mockChildrenContext, rosterVersion: 1 };
  screen.refresh();
  await waitFor(() => expect(repositories.children.getAssessableChildren).toHaveBeenCalledTimes(2));
  await act(async () => {});
  expect(repositories.batteryRuns.getRunWithResults).toHaveBeenCalledTimes(1);
  expect(repositories.assessments.saveQuestionResult).not.toHaveBeenCalled();
  if (kind === 'skip') {
    expect(screen.queryByText('Skip Reading words?')).toBeNull();
    expect(screen.getByText('This child is no longer assigned to you — you can abandon this assessment.')).toBeTruthy();
  } else {
    expect(screen.getByText('Abandon this assessment?')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Abandon' }));
    await waitFor(() => expect(screen.navigation.goBack).toHaveBeenCalledTimes(1));
    expect(repositories.batteryRuns.abandonRun).toHaveBeenCalledWith(ID);
  }
  expect(screen.queryByRole('button', { name: /^Start / })).toBeNull();
});
