jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'ea-1' } }) }));
jest.mock('../src/hooks/useAssessableChildren', () => ({ useAssessableChildren: () => mockRoster }));
jest.mock('../src/services/activeProgrammeGate', () => ({ getActiveProgrammeGate: jest.fn() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => ({ triggerBackgroundSync: mockSync }) }));
jest.mock('../src/assessment-questions', () => ({
  ...jest.requireActual('../src/assessment-questions'),
  questionComponentFor: jest.fn(),
  bundledItemSetFor: jest.fn((...args) => jest.requireActual('../src/assessment-questions').bundledItemSetFor(...args)),
}));

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { act, configure, fireEvent, waitFor } from '@testing-library/react-native';
import { AllProviders } from '../test-support/renderWithProviders';
import { renderInTestStack } from '../test-support/renderInTestStack';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { getActiveProgrammeGate } from '../src/services/activeProgrammeGate';
import { bundledItemSetFor, questionComponentFor, skippedResult,
  WELA_PLUS_FULL_2024_1 as BATTERY } from '../src/assessment-questions';
import BatteryQuestionScreen from '../src/screens/assessments/battery/BatteryQuestionScreen';

jest.setTimeout(30000);
configure({ asyncUtilTimeout: 5000 });

const mockSync = jest.fn();
const CHILD = { id: 'child-1', first_name: 'Lwazi', last_name: 'Mbeki', is_delivery: false,
  class_id: 'class-1', grade: '2', home_language: 'isiXhosa', membership_id: 'membership-1' };
const ID = '9f3c2a10-5b7e-4c1d-8e2f-0123456789ab';
const QUESTION = BATTERY.questions[5];
const clone = value => JSON.parse(JSON.stringify(value));
const decide = count => BATTERY.questions.slice(0, count).map((question, index) => ({
  id: `answer-${index}`, question_code: question.question_code, stopped_reason: 'completed', score: 34,
  total_items: 60, derived: {},
}));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
let mockRoster, mockQuestionProps, run, repositories, handle, result;
function MockQuestion(props) {
  mockQuestionProps = props;
  return <View>
    <Pressable accessibilityRole="button" onPress={props.onStart}><Text>Start test</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => { props.onStart(); props.onComplete(result); }}>
      <Text>Finish test</Text>
    </Pressable>
    <Pressable accessibilityRole="button" onPress={() => props.onComplete(skippedResult(QUESTION, run.language, 'skipped_tired'))}>
      <Text>Skip in Question</Text>
    </Pressable>
  </View>;
}
function EmptyScreen() { return null; }
function renderHost(params = { runId: ID, questionCode: QUESTION.question_code }) {
  let navigation, rerenderHost;
  function Host(props) {
    navigation = props.navigation;
    const [, force] = React.useReducer(value => value + 1, 0);
    rerenderHost = force;
    return <BatteryQuestionScreen {...props} />;
  }
  function Wrapper({ children }) {
    return <AllProviders motion={{ motionLevel: 'still', reduceMotion: true, tier: 'high' }}>
      <SignedInEAContext.Provider value={{ handle, repositories }}>{children}</SignedInEAContext.Provider>
    </AllProviders>;
  }
  const screen = renderInTestStack({ wrapper: Wrapper,
    motion: { motionLevel: 'still', reduceMotion: true, tier: 'high' },
    routes: [{ name: 'BatteryOverview', component: EmptyScreen },
      { name: 'BatteryQuestion', component: Host, params }] });
  return { ...screen, get navigation() { return navigation; }, refresh: () => act(() => rerenderHost()) };
}
async function ready(screen) {
  await screen.findByRole('button', { name: 'Start test' });
  return screen;
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRoster = { yourChildren: [], restOfClass: [CHILD], all: [CHILD], loading: false };
  mockQuestionProps = null;
  run = { id: ID, user_id: 'ea-1', child_id: CHILD.id, status: 'in_progress', started_here: 1,
    programme_id: 'programme-1', battery_code: BATTERY.battery_code, battery_version: BATTERY.battery_version,
    language: 'xh', results: decide(5) };
  handle = { userId: 'ea-1', epoch: 1, isCurrent: jest.fn(() => true) };
  repositories = {
    batteryRuns: { getRunWithResults: jest.fn(async () => clone(run)) },
    assessments: { saveQuestionResult: jest.fn().mockResolvedValue({ id: 'saved' }) },
    children: { getChildNamesByIds: jest.fn().mockResolvedValue({ [CHILD.id]: { name: 'Lwazi Mbeki', hidden: false } }) },
  };
  result = { question_code: QUESTION.question_code, question_version: QUESTION.question_version,
    item_set_id: jest.requireActual('../src/assessment-questions').bundledItemSetFor(QUESTION.question_code,
      QUESTION.question_version, 'xh').item_set_id,
    language: 'xh', stopped_reason: 'ea_ended', duration_ms: 1234, items: [],
    derived: { total_correct: 0, total_attempted: 0, percent: 0, capture_mode: 'grid' } };
  getActiveProgrammeGate.mockReset().mockResolvedValue({ hasActiveProgramme: true, programme: { id: 'programme-1' } });
  questionComponentFor.mockReset().mockReturnValue({ Component: MockQuestion, extraProps: {} });
  bundledItemSetFor.mockReset().mockImplementation((...args) =>
    jest.requireActual('../src/assessment-questions').bundledItemSetFor(...args));
});
afterEach(async () => {
  await act(async () => { jest.runOnlyPendingTimers(); });
  jest.useRealTimers();
});

test('TestFrame title "6 · Reading words", subtitle "Lwazi Mbeki · isiXhosa · KWY-2M4"', async () => {
  const screen = await ready(renderHost());
  expect(screen.getByText('6 · Reading words')).toBeTruthy();
  expect(screen.getByText('Lwazi Mbeki · isiXhosa · KWY-2M4')).toBeTruthy();
  expect(getActiveProgrammeGate).toHaveBeenCalledWith({ handle, userId: 'ea-1' });
  expect(repositories.children.getChildNamesByIds).not.toHaveBeenCalled();
});

test('passes itemSet === bundledItemSetFor(code, version, language), language, instructions[language], durationSec, childName, allowSkip and extraProps', async () => {
  questionComponentFor.mockReturnValue({ Component: MockQuestion, extraProps: { markingPolarity: 'tap_wrong' } });
  await ready(renderHost());
  expect(bundledItemSetFor).toHaveBeenCalledWith(QUESTION.question_code, QUESTION.question_version, 'xh');
  const expected = jest.requireActual('../src/assessment-questions').bundledItemSetFor(
    QUESTION.question_code, QUESTION.question_version, 'xh');
  expect(mockQuestionProps.itemSet).toBe(expected);
  expect(mockQuestionProps).toMatchObject({ language: 'xh', instructions: QUESTION.instructions.xh,
    durationSec: 60, childName: 'Lwazi Mbeki', allowSkip: true, markingPolarity: 'tap_wrong',
    onStart: expect.any(Function), onComplete: expect.any(Function) });
  expect(mockQuestionProps.captureMode).toBeUndefined();
});

test('materials block "Hand Lwazi" / "Reading Card · side B" / "Footer: WelaPLUS 2024.1 · XH · side B" until onStart, then hidden', async () => {
  const screen = await ready(renderHost());
  expect(screen.getByText('Hand Lwazi')).toBeTruthy();
  expect(screen.getByText('Reading Card · side B')).toBeTruthy();
  expect(screen.getByText('Footer: WelaPLUS 2024.1 · XH · side B')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Start test' }));
  expect(screen.queryByText('Hand Lwazi')).toBeNull();
  expect(screen.queryByText('Reading Card · side B')).toBeNull();
  expect(screen.queryByText('Footer: WelaPLUS 2024.1 · XH · side B')).toBeNull();
});

test('oral Question shows "No materials, oral"', async () => {
  run.results = decide(2);
  const question = BATTERY.questions[2];
  const screen = await ready(renderHost({ runId: ID, questionCode: question.question_code }));
  expect(screen.getByText('No materials, oral')).toBeTruthy();
  expect(screen.queryByText('Hand Lwazi')).toBeNull();
  expect(mockQuestionProps.instructions).toBe(question.instructions.xh);
  expect(mockQuestionProps.instructions).not.toBe(question.instructions.en);
});

test('real ReadWordsQuestion in a real stack: Start hides the materials block and Back then shows the discard sheet', async () => {
  questionComponentFor.mockImplementation(jest.requireActual('../src/assessment-questions').questionComponentFor);
  const screen = renderHost();
  fireEvent.press(await screen.findByRole('button', { name: 'Start' }));
  expect(screen.queryByText('Hand Lwazi')).toBeNull();
  act(() => screen.navigationRef.goBack());
  expect(screen.routeNames()).toEqual(['BatteryOverview', 'BatteryQuestion']);
  expect(screen.getByText('End the test?')).toBeTruthy();
  expect(repositories.assessments.saveQuestionResult).not.toHaveBeenCalled();
});

test('onComplete saves once with batteryRunId and goes back to the overview', async () => {
  const pending = deferred();
  repositories.assessments.saveQuestionResult.mockReturnValue(pending.promise);
  const screen = await ready(renderHost());
  const back = jest.spyOn(screen.navigation, 'goBack');
  const complete = mockQuestionProps.onComplete;
  act(() => { mockQuestionProps.onStart(); complete(result); complete({ ...result, duration_ms: 9999 }); });
  expect(repositories.assessments.saveQuestionResult).toHaveBeenCalledTimes(1);
  expect(repositories.assessments.saveQuestionResult).toHaveBeenCalledWith({
    assessmentId: expect.any(String), result, childId: CHILD.id, userId: 'ea-1', batteryRunId: ID, captureMode: 'grid',
  });
  expect(repositories.assessments.saveQuestionResult.mock.calls[0][0].result).toBe(result);
  expect(screen.routeNames()).toEqual(['BatteryOverview', 'BatteryQuestion']);
  expect(mockSync).not.toHaveBeenCalled();
  await act(async () => pending.resolve({ id: 'saved' }));
  expect(screen.routeNames()).toEqual(['BatteryOverview']);
  expect(back).toHaveBeenCalledTimes(1);
  expect(mockSync).toHaveBeenCalledTimes(1);
  expect(back.mock.invocationCallOrder[0]).toBeLessThan(mockSync.mock.invocationCallOrder[0]);
});

test('in-Question skip result is saved through the same path before capture starts', async () => {
  const screen = await ready(renderHost());
  fireEvent.press(screen.getByRole('button', { name: 'Skip in Question' }));
  await waitFor(() => expect(screen.routeNames()).toEqual(['BatteryOverview']));
  expect(repositories.assessments.saveQuestionResult).toHaveBeenCalledTimes(1);
  expect(repositories.assessments.saveQuestionResult).toHaveBeenCalledWith({
    assessmentId: expect.any(String), childId: CHILD.id, userId: 'ea-1', batteryRunId: ID, captureMode: null,
    result: skippedResult(QUESTION, 'xh', 'skipped_tired'),
  });
  expect(mockSync).toHaveBeenCalledTimes(1);
});

test('leaving mid-capture shows the discard sheet and saves nothing', async () => {
  const screen = await ready(renderHost());
  fireEvent.press(screen.getByRole('button', { name: 'Start test' }));
  fireEvent.press(screen.getByRole('button', { name: 'Close test' }));
  expect(screen.getByText('End the test?')).toBeTruthy();
  expect(screen.getByText('Leave without saving a result?')).toBeTruthy();
  expect(screen.routeNames()).toEqual(['BatteryOverview', 'BatteryQuestion']);
  fireEvent.press(screen.getByRole('button', { name: 'Keep testing' }));
  act(() => screen.navigationRef.goBack());
  expect(screen.getByText('End the test?')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Discard' }));
  expect(screen.routeNames()).toEqual(['BatteryOverview']);
  expect(repositories.assessments.saveQuestionResult).not.toHaveBeenCalled();
});

test('save failure shows "Couldn\'t save — try again" and retry saves the same result', async () => {
  repositories.assessments.saveQuestionResult.mockRejectedValueOnce(new Error('disk full'));
  const screen = await ready(renderHost());
  fireEvent.press(screen.getByRole('button', { name: 'Finish test' }));
  await screen.findByText("Couldn't save — try again");
  const first = repositories.assessments.saveQuestionResult.mock.calls[0][0];
  expect(screen.routeNames()).toEqual(['BatteryOverview', 'BatteryQuestion']);
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.routeNames()).toEqual(['BatteryOverview']));
  expect(repositories.assessments.saveQuestionResult).toHaveBeenCalledTimes(2);
  expect(repositories.assessments.saveQuestionResult.mock.calls[1][0]).toEqual(first);
  expect(repositories.assessments.saveQuestionResult.mock.calls[1][0].result).toBe(first.result);
});

test.each(['RUN_NOT_WRITABLE', 'QUESTION_ALREADY_DECIDED'])(
  '%s shows "This assessment is closed" with "Back to assessment", no retry', async code => {
    repositories.assessments.saveQuestionResult.mockRejectedValueOnce(Object.assign(new Error('refused'), { code }));
    const screen = await ready(renderHost());
    const complete = mockQuestionProps.onComplete;
    fireEvent.press(screen.getByRole('button', { name: 'Finish test' }));
    await screen.findByText('This assessment is closed');
    expect(screen.getByText("This answer can't be saved because the assessment is no longer open.")).toBeTruthy();
    expect(screen.queryByText("Couldn't save — try again")).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start test' })).toBeNull();
    act(() => complete(result));
    fireEvent.press(screen.getByRole('button', { name: 'Back to assessment' }));
    expect(screen.routeNames()).toEqual(['BatteryOverview']);
    expect(repositories.assessments.saveQuestionResult).toHaveBeenCalledTimes(1);
    expect(mockSync).not.toHaveBeenCalled();
  },
);

test.each([4, 6])('opening a Question that is already decided or not next renders the closed state, not the component (%i decided)', async count => {
  run.results = decide(count);
  const screen = renderHost();
  await screen.findByText('This assessment is closed');
  expect(screen.getByRole('button', { name: 'Back to assessment' })).toBeTruthy();
  expect(mockQuestionProps).toBeNull();
  expect(repositories.assessments.saveQuestionResult).not.toHaveBeenCalled();
});

test('the materials eyebrow uses the full first_name from the assessable row', async () => {
  const child = { ...CHILD, first_name: 'Lwazi Junior' };
  mockRoster = { yourChildren: [], restOfClass: [child], all: [child], loading: false };
  const screen = await ready(renderHost());
  expect(screen.getByText('Hand Lwazi Junior')).toBeTruthy();
  expect(mockQuestionProps.childName).toBe('Lwazi Junior Mbeki');
});

test('waits for the whole-class roster and programme gate before presenting capture', async () => {
  const pending = deferred();
  getActiveProgrammeGate.mockReturnValue(pending.promise);
  mockRoster = { yourChildren: [], restOfClass: [], all: [], loading: true };
  const screen = renderHost();
  expect(screen.getByLabelText('Loading assessment Question')).toBeTruthy();
  expect(mockQuestionProps).toBeNull();
  expect(screen.queryByText('This assessment is closed')).toBeNull();
  mockRoster = { yourChildren: [], restOfClass: [CHILD], all: [CHILD], loading: false };
  screen.refresh();
  expect(screen.getByLabelText('Loading assessment Question')).toBeTruthy();
  expect(mockQuestionProps).toBeNull();
  await act(async () => pending.resolve({ programme: { id: 'programme-1' } }));
  await ready(screen);
});

test.each(['child', 'none', 'different', 'terminal', 'remote'])(
  'non-writable run never presents capture (%s)', async kind => {
    if (kind === 'child') mockRoster = { ...mockRoster, all: [], restOfClass: [] };
    if (kind === 'none') getActiveProgrammeGate.mockResolvedValue({ hasActiveProgramme: false, programme: null });
    if (kind === 'different') getActiveProgrammeGate.mockResolvedValue({ programme: { id: 'other' } });
    if (kind === 'terminal') run.status = 'completed';
    if (kind === 'remote') run.started_here = 0;
    const screen = renderHost();
    await screen.findByText('This assessment is closed');
    expect(mockQuestionProps).toBeNull();
    expect(repositories.assessments.saveQuestionResult).not.toHaveBeenCalled();
    if (kind === 'child') {
      expect(repositories.children.getChildNamesByIds).toHaveBeenCalledWith([CHILD.id]);
      expect(screen.getByText('Lwazi Mbeki · isiXhosa · KWY-2M4', { includeHiddenElements: true })).toBeTruthy();
    }
  },
);

test.each(['battery', 'question', 'language', 'bundle'])(
  'missing or unsupported content never substitutes another item set (%s)', async kind => {
    const params = { runId: ID, questionCode: QUESTION.question_code };
    if (kind === 'battery') run.battery_version = '2099.1';
    if (kind === 'question') params.questionCode = 'unknown_question';
    if (kind === 'language') run.language = 'zu';
    if (kind === 'bundle') bundledItemSetFor.mockReturnValue(null);
    const screen = renderHost(params);
    await screen.findByText('This assessment is closed');
    expect(mockQuestionProps).toBeNull();
    expect(repositories.assessments.saveQuestionResult).not.toHaveBeenCalled();
  },
);

test('roster reload during capture preserves the current presentation and its hidden materials', async () => {
  const screen = await ready(renderHost());
  fireEvent.press(screen.getByRole('button', { name: 'Start test' }));
  mockRoster = { ...mockRoster, loading: true, all: [] };
  screen.refresh();
  expect(screen.getByRole('button', { name: 'Finish test' })).toBeTruthy();
  expect(screen.queryByText('Hand Lwazi')).toBeNull();
  expect(repositories.batteryRuns.getRunWithResults).toHaveBeenCalledTimes(1);
  act(() => screen.navigationRef.goBack());
  expect(screen.getByText('End the test?')).toBeTruthy();
});

test('a load failure can be retried without presenting capture early', async () => {
  repositories.batteryRuns.getRunWithResults.mockRejectedValueOnce(new Error('disk unavailable'));
  const screen = renderHost();
  await screen.findByText("Couldn't load this assessment. Try again.");
  expect(mockQuestionProps).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await ready(screen);
});

test('a stale handle cannot publish a late load', async () => {
  const pending = deferred();
  repositories.batteryRuns.getRunWithResults.mockReturnValue(pending.promise);
  const screen = renderHost();
  handle.isCurrent.mockReturnValue(false);
  await act(async () => pending.resolve(clone(run)));
  expect(screen.getByLabelText('Loading assessment Question')).toBeTruthy();
  expect(mockQuestionProps).toBeNull();
  expect(mockSync).not.toHaveBeenCalled();
});

test('a stale handle cannot navigate or trigger sync after a late save', async () => {
  const pending = deferred();
  repositories.assessments.saveQuestionResult.mockReturnValue(pending.promise);
  const screen = await ready(renderHost());
  fireEvent.press(screen.getByRole('button', { name: 'Finish test' }));
  handle.isCurrent.mockReturnValue(false);
  await act(async () => pending.resolve({ id: 'saved' }));
  expect(screen.routeNames()).toEqual(['BatteryOverview', 'BatteryQuestion']);
  expect(mockSync).not.toHaveBeenCalled();
});
