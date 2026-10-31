jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'ea-1' } }) }));
jest.mock('../src/hooks/useAssessableChildren', () => ({ useAssessableChildren: () => mockRealRoster
  ? jest.requireActual('../src/hooks/useAssessableChildren').useAssessableChildren() : mockRoster }));
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: () => mockChildrenContext }));
jest.mock('../src/context/ClassesContext', () => ({ useClasses: () => mockClassesContext }));
jest.mock('../src/services/activeProgrammeGate', () => ({ getActiveProgrammeGate: jest.fn() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => ({ triggerBackgroundSync: mockSync }) }));
jest.mock('../src/context/ToastContext', () => ({
  ...jest.requireActual('../src/context/ToastContext'), useToast: () => ({ show: mockToast }),
}));
jest.mock('../src/assessment-questions', () => ({
  ...jest.requireActual('../src/assessment-questions'), batteryFor: jest.fn(), batteryForNewRun: jest.fn(),
}));

import React from 'react';
import { egraBatteryFor } from '../src/assessment-questions/egra';

test.each([[3, 2, 'completed', '2 / 3'], [0, 0, 'ea_ended', '—']])(
  'EGRA summary names the form, scores comprehension with %i asked without finalization controls', async (asked, score, stoppedReason, scoreText) => {
  const battery = egraBatteryFor('egra', 'dbe-egra-en-fal-2-v1');
  run = { ...run, battery_code: 'egra', battery_version: battery.battery_version, language: 'en',
    results: battery.questions.map((question, index) => ({ id: `egra-${index}`, question_code: question.question_code,
      stopped_reason: index === 3 ? stoppedReason : 'completed', score: index === 3 ? score : 34, total_items: index === 3 ? 5 : 60,
      derived: index === 3 ? { questions_asked: asked } : {} })) };
  const screen = renderSummary();
  await screen.findByText(`${battery.title} · English · 4 of 4 decided`);
  expect(screen.UNSAFE_getAllByType(ListRow)).toHaveLength(4);
  expect(screen.getByRole('text', { name: `4. Story comprehension, Done, ${scoreText}` })).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByText(/Writing Sheet/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Finalize assessment' })).toBeNull();
});
import { Text, View } from 'react-native';
import { act, configure, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { createNavigationContainerRef, createNavigatorFactory, NavigationContainer,
  StackRouter, useNavigationBuilder } from '@react-navigation/native';
import { AllProviders } from '../test-support/renderWithProviders';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { getActiveProgrammeGate } from '../src/services/activeProgrammeGate';
import { batteryFor, batteryForNewRun, WELA_PLUS_FULL_2024_1 as BATTERY } from '../src/assessment-questions';
import ListRow from '../src/components/common/ListRow';
import StatusBadge from '../src/components/common/StatusBadge';
import BatteryRunSummaryScreen from '../src/screens/assessments/battery/BatteryRunSummaryScreen';

jest.setTimeout(30000);
configure({ asyncUtilTimeout: 5000 });

const mockToast = jest.fn();
const mockSync = jest.fn();
const CHILD = { id: 'child-1', first_name: 'Lwazi', last_name: 'Mbeki', is_delivery: false,
  class_id: 'class-1', grade: '2', home_language: 'isiXhosa', membership_id: 'membership-1' };
const ID = '9f3c2a10-5b7e-4c1d-8e2f-0123456789ab';
const clone = value => JSON.parse(JSON.stringify(value));
const decide = count => BATTERY.questions.slice(0, count).map((question, index) => ({
  id: `answer-${index}`, question_code: question.question_code,
  stopped_reason: index === 2 ? 'skipped_tired' : 'completed',
  score: index === 0 ? 34 : 4, total_items: index === 0 ? 60 : 10, derived: {},
}));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
let mockRoster, mockRealRoster, mockChildrenContext, mockClassesContext, run, repositories, handle;
function EmptyScreen() { return null; }
// Preserve inactive screens as native stack does, so blur/refocus tests keep state.
function RetainedStack({ children }) {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, { children });
  return <NavigationContent>{state.routes.map((route, index) => (
    <View key={route.key} style={index === state.index ? { flex: 1 } : { display: 'none' }}>
      {index === state.index && <Text accessibilityRole="header">{descriptors[route.key].options.title}</Text>}
      {descriptors[route.key].render()}
    </View>
  ))}</NavigationContent>;
}
const Stack = createNavigatorFactory(RetainedStack)();
function renderSummary({ initialRoutes, params = {}, realRoster = false } = {}) {
  mockRealRoster = realRoster;
  let navigation, rerenderHost;
  function Host(props) {
    navigation = props.navigation;
    const [, force] = React.useReducer(value => value + 1, 0);
    rerenderHost = force;
    return <BatteryRunSummaryScreen {...props} />;
  }
  function Wrapper({ children }) {
    return <AllProviders motion={{ motionLevel: 'still', reduceMotion: true, tier: 'high' }}>
      <SignedInEAContext.Provider value={{ handle, repositories }}>{children}</SignedInEAContext.Provider>
    </AllProviders>;
  }
  const navigationRef = createNavigationContainerRef();
  const routes = initialRoutes ?? [{ name: 'BatteryOverview' }, { name: 'BatteryRunSummary', params: { runId: ID, ...params } }];
  const screen = render(<Wrapper>
    <NavigationContainer ref={navigationRef} initialState={{ index: routes.length - 1, routes }}>
      <Stack.Navigator>
        <Stack.Screen name="MainTabs" component={EmptyScreen} />
        <Stack.Screen name="AssessmentChildSelect" component={EmptyScreen} />
        <Stack.Screen name="Entry" component={EmptyScreen} />
        <Stack.Screen name="BatteryOverview" component={EmptyScreen} />
        <Stack.Screen name="BatteryRunSummary" component={Host} />
        <Stack.Screen name="Away" component={EmptyScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  </Wrapper>);
  return { ...screen, navigationRef, get navigation() { return navigation; },
    routeNames: () => navigationRef.getRootState().routes.map(route => route.name),
    refresh: () => act(() => rerenderHost()) };
}
async function ready(screen) {
  await screen.findByText(`${BATTERY.title} · isiXhosa · ${run.results.length} of 11 decided`);
  return screen;
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRealRoster = false;
  mockChildrenContext = { children: [], rosterVersion: 0 };
  mockClassesContext = { classes: [], assignmentsVersion: 0 };
  mockRoster = { yourChildren: [], restOfClass: [CHILD], all: [CHILD], loading: false };
  run = { id: ID, user_id: 'ea-1', child_id: CHILD.id, status: 'in_progress', started_here: 1,
    programme_id: 'programme-1', battery_code: BATTERY.battery_code, battery_version: BATTERY.battery_version,
    language: 'xh', results: decide(11) };
  handle = { userId: 'ea-1', epoch: 1, isCurrent: jest.fn(() => true) };
  repositories = {
    batteryRuns: { getRunWithResults: jest.fn(async () => clone(run)),
      finalizeRun: jest.fn(async () => { run.status = 'completed'; return { id: ID }; }) },
    children: { getAssessableChildren: jest.fn(async () => clone(mockRoster.all)), getChildNamesByIds: jest.fn().mockResolvedValue({ [CHILD.id]: { name: 'Lwazi Mbeki', hidden: false } }) },
  };
  getActiveProgrammeGate.mockReset().mockResolvedValue({ hasActiveProgramme: true, programme: { id: 'programme-1' } });
  batteryForNewRun.mockReset().mockImplementation((...args) => jest.requireActual('../src/assessment-questions').batteryForNewRun(...args));
  batteryFor.mockReset().mockImplementation((...args) => jest.requireActual('../src/assessment-questions').batteryFor(...args));
});
afterEach(async () => {
  await act(async () => { jest.runOnlyPendingTimers(); });
  jest.useRealTimers();
});

test('eligible run: child name, run code, "WelaPLUS · isiXhosa · 11 of 11 decided", first four rows and "Show all 11" expands', async () => {
  const screen = await ready(renderSummary());
  expect(screen.getByText('Lwazi Mbeki')).toBeTruthy();
  expect(screen.UNSAFE_getAllByType(StatusBadge).some(badge => badge.props.label === 'KWY-2M4')).toBe(true);
  expect(getActiveProgrammeGate).toHaveBeenCalledWith({ handle, userId: 'ea-1' });
  expect(repositories.children.getChildNamesByIds).not.toHaveBeenCalled();
  const rows = screen.UNSAFE_getAllByType(ListRow);
  expect(rows).toHaveLength(4);
  expect(rows[0].props.subtitle).toBe('Done');
  expect(within(rows[0]).UNSAFE_getByType(StatusBadge).props).toMatchObject({ label: '34 / 60', tone: 'success' });
  expect(rows[2].props.subtitle).toBe('Child is tired');
  expect(screen.getByLabelText(`3. ${BATTERY.questions[2].title}, Skipped, Child is tired`)).toBeTruthy();
  expect(within(rows[2]).getByText('Skipped')).toBeTruthy();
  expect(screen.queryByText('Letter writing')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Show all 11' }));
  expect(screen.UNSAFE_getAllByType(ListRow)).toHaveLength(11);
  expect(screen.getByText('Letter writing')).toBeTruthy();
});



test.each([['completed', 'Finalized', 'success'], ['abandoned', 'Abandoned', 'neutral']])(
  '%s run: read-only, %s badge, no checklist, no Finalize', async (status, label, tone) => {
    run.status = status;
    const screen = await ready(renderSummary());
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.UNSAFE_getAllByType(StatusBadge).find(badge => badge.props.label === label).props.tone).toBe(tone);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finalize assessment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abandon assessment' })).toBeNull();
    expect(screen.UNSAFE_getAllByType(ListRow)).toHaveLength(4);
    expect(repositories.batteryRuns.finalizeRun).not.toHaveBeenCalled();
  },
);

test('pulled run (started_here 0): read-only with "Started on another phone"', async () => {
  run.started_here = 0;
  const screen = await ready(renderSummary());
  expect(screen.getByText('Started on another phone')).toBeTruthy();
  expect(screen.UNSAFE_getAllByType(StatusBadge).find(badge => badge.props.label === 'Open').props.tone).toBe('warning');
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Finalize assessment' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Abandon assessment' })).toBeNull();
});

test.each(['child', 'none', 'different'])(
  'unassigned run is read-only with the overview note (%s)', async kind => {
    if (kind === 'child') mockRoster = { ...mockRoster, all: [], restOfClass: [] };
    if (kind === 'none') getActiveProgrammeGate.mockResolvedValue({ hasActiveProgramme: false, programme: null });
    if (kind === 'different') getActiveProgrammeGate.mockResolvedValue({ programme: { id: 'other' } });
    const screen = await ready(renderSummary());
    expect(screen.getByText('This child is no longer assigned to you — you can abandon this assessment.')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finalize assessment' })).toBeNull();
    expect(repositories.batteryRuns.finalizeRun).not.toHaveBeenCalled();
    if (kind === 'child') {
      expect(repositories.children.getChildNamesByIds).toHaveBeenCalledWith([CHILD.id]);
      expect(screen.getByText('Lwazi Mbeki')).toBeTruthy();
    }
  },
);

test('refocus refresh keeps the previous expanded rows visible and stays read-only until fresh data resolves', async () => {
  const screen = await ready(renderSummary());
  fireEvent.press(screen.getByRole('button', { name: 'Show all 11' }));
  const pending = deferred();
  act(() => screen.navigationRef.navigate('Away'));
  repositories.batteryRuns.getRunWithResults.mockReturnValueOnce(pending.promise);
  act(() => screen.navigationRef.goBack());
  expect(screen.getByText('Lwazi Mbeki')).toBeTruthy();
  expect(screen.UNSAFE_getAllByType(ListRow)).toHaveLength(11);
  expect(screen.queryByLabelText('Loading assessment')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Finalize assessment' })).toBeNull();
  expect(repositories.batteryRuns.finalizeRun).not.toHaveBeenCalled();
  await act(async () => pending.resolve(clone(run)));
  await ready(screen);
  expect(repositories.batteryRuns.finalizeRun).not.toHaveBeenCalled();
});

test('waits for the assessable roster and programme gate on initial load', async () => {
  const pending = deferred();
  getActiveProgrammeGate.mockReturnValue(pending.promise);
  mockRoster = { yourChildren: [], restOfClass: [], all: [], loading: true };
  const screen = renderSummary();
  expect(screen.getByLabelText('Loading assessment')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Finalize assessment' })).toBeNull();
  expect(screen.queryByText('This child is no longer assigned to you — you can abandon this assessment.')).toBeNull();
  mockRoster = { yourChildren: [], restOfClass: [CHILD], all: [CHILD], loading: false };
  screen.refresh();
  expect(screen.getByLabelText('Loading assessment')).toBeTruthy();
  await act(async () => pending.resolve({ programme: { id: 'programme-1' } }));
  await ready(screen);
  expect(screen.queryByRole('checkbox')).toBeNull();
});

test('roster reload keeps cached summary data without treating an empty loading list as unassigned', async () => {
  const screen = await ready(renderSummary());
  mockRoster = { yourChildren: [], restOfClass: [], all: [], loading: true };
  screen.refresh();
  expect(screen.getByText('Lwazi Mbeki')).toBeTruthy();
  expect(screen.UNSAFE_getAllByType(ListRow)).toHaveLength(4);
  expect(screen.queryByLabelText('Loading assessment')).toBeNull();
  expect(screen.queryByText('This child is no longer assigned to you — you can abandon this assessment.')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Finalize assessment' })).toBeNull();
  expect(repositories.batteryRuns.finalizeRun).not.toHaveBeenCalled();
  mockRoster = { ...mockRoster, loading: false };
  screen.refresh();
  await screen.findByText('This child is no longer assigned to you — you can abandon this assessment.');
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Finalize assessment' })).toBeNull();
});

test('a refresh that finds a changed programme keeps the summary read-only', async () => {
  const screen = await ready(renderSummary());
  act(() => screen.navigationRef.navigate('Away'));
  getActiveProgrammeGate.mockResolvedValue({ programme: { id: 'other' } });
  act(() => screen.navigationRef.goBack());
  await screen.findByText('This child is no longer assigned to you — you can abandon this assessment.');
  expect(screen.queryByRole('button', { name: 'Finalize assessment' })).toBeNull();
  expect(repositories.batteryRuns.finalizeRun).not.toHaveBeenCalled();
});



test('a stale handle cannot publish a late initial load', async () => {
  const pending = deferred();
  repositories.batteryRuns.getRunWithResults.mockReturnValue(pending.promise);
  const screen = renderSummary();
  handle.isCurrent.mockReturnValue(false);
  await act(async () => pending.resolve(clone(run)));
  expect(screen.queryByText('Lwazi Mbeki')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Finalize assessment' })).toBeNull();
});

test('an incomplete open run has no checklist or Finalize action', async () => {
  run.results = decide(10);
  const screen = await ready(renderSummary());
  expect(screen.getByText('Open')).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Finalize assessment' })).toBeNull();
});

test('an unavailable battery version is read-only with its run code and exact unavailable copy', async () => {
  run.battery_version = '2099.1';
  const screen = renderSummary();
  await screen.findByText("This assessment isn't available in this version of the app.");
  expect(batteryFor).toHaveBeenCalledWith(run.battery_code, '2099.1');
  expect(screen.UNSAFE_getAllByType(StatusBadge).some(badge => badge.props.label === 'KWY-2M4')).toBe(true);
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Finalize assessment' })).toBeNull();
});

test('a load failure offers retry, and preserves the full assessable first_name', async () => {
  repositories.batteryRuns.getRunWithResults.mockRejectedValueOnce(new Error('disk unavailable'));
  const child = { ...CHILD, first_name: 'Lwazi Junior' };
  mockRoster = { yourChildren: [], restOfClass: [child], all: [child], loading: false };
  const screen = renderSummary();
  await screen.findByText("Couldn't load this assessment. Try again.");
  expect(screen.queryByRole('button', { name: 'Finalize assessment' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await ready(screen);
  expect(screen.getByText('Lwazi Junior Mbeki')).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
});




test.each([
  ['in_progress', 1, 11, 'Assessment summary'],
  ['completed', 1, 11, 'Assessment summary'],
  ['abandoned', 1, 11, 'Assessment summary'],
  ['in_progress', 0, 11, 'Assessment summary'],
  ['in_progress', 1, 4, 'Assessment summary'],
])('summary header for status %s, started_here %s and %s decided is %s', async (status, startedHere, count, title) => {
  run.status = status;
  run.started_here = startedHere;
  run.results = decide(count);
  const screen = await ready(renderSummary());
  expect(screen.getByRole('header', { name: title })).toBeTruthy();
});


test('an abandoned run summary labels undecided Questions Not started without a Next row', async () => {
  run.status = 'abandoned';
  run.results = [];
  const screen = await ready(renderSummary());
  expect(screen.getByText('Abandoned')).toBeTruthy();
  expect(screen.getByLabelText('1. Letter sounds, Not started · 1 min')).toBeTruthy();
  expect(screen.getByLabelText('2. Listen to a story, Not started')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Show all 11' }));
  expect(screen.getByLabelText('5. Letter writing, Not started')).toBeTruthy();
  expect(screen.queryByText(/^Next(?: ·|$)/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Finalize assessment' })).toBeNull();
});

test('an eligible open summary is read-only with no checklist or finish footer', async () => {
  const screen = await ready(renderSummary({ params: { finalized: true } }));
  expect(screen.getByRole('header', { name: 'Assessment summary' })).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByText('Before you finish')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Finalize assessment' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Assess next child' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Back to Assess' })).toBeNull();
});

test('just-finalized summary offers Assess next child using the stored battery identity', async () => {
  run.status = 'completed';
  const screen = await ready(renderSummary({ params: { finalized: true } }));
  expect(screen.getByRole('button', { name: 'Back to Assess' })).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Finalize assessment' })).toBeNull();
  expect(batteryForNewRun).toHaveBeenCalledWith(run.battery_code, run.battery_version);
  fireEvent.press(screen.getByRole('button', { name: 'Assess next child' }));
  expect(screen.navigationRef.getCurrentRoute()).toMatchObject({ name: 'AssessmentChildSelect',
    params: { batteryCode: run.battery_code, batteryVersion: run.battery_version } });
  expect(screen.routeNames()).toEqual(['BatteryOverview', 'AssessmentChildSelect']);
});

test('Back to Assess pops to MainTabs with the Assessments tab selected', async () => {
  run.status = 'completed';
  const screen = await ready(renderSummary({ initialRoutes: [
    { name: 'MainTabs' }, { name: 'Entry' },
    { name: 'BatteryRunSummary', params: { runId: ID, finalized: true } },
  ] }));
  fireEvent.press(screen.getByRole('button', { name: 'Back to Assess' }));
  expect(screen.routeNames()).toEqual(['MainTabs']);
  expect(screen.navigationRef.getCurrentRoute().params).toEqual({ screen: 'Assessments' });
});

test.each([undefined, false, 'true'])('history summary has no finish footer (finalized: %s)', async finalized => {
  run.status = 'completed';
  const screen = await ready(renderSummary({ params: { finalized } }));
  expect(screen.queryByRole('button', { name: 'Assess next child' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Back to Assess' })).toBeNull();
});

test('a form rejected for new runs offers only Back to Assess after finalization', async () => {
  run.status = 'completed';
  batteryForNewRun.mockReturnValue(null);
  const screen = await ready(renderSummary({ params: { finalized: true } }));
  expect(batteryForNewRun).toHaveBeenCalledWith(run.battery_code, run.battery_version);
  expect(screen.queryByRole('button', { name: 'Assess next child' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Back to Assess' })).toBeTruthy();
});

test('an abandoned summary has no finish footer even with finalized true', async () => {
  run.status = 'abandoned';
  const screen = await ready(renderSummary({ params: { finalized: true } }));
  expect(screen.queryByRole('button', { name: 'Assess next child' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Back to Assess' })).toBeNull();
});


test('an unavailable completed form still offers Back to Assess after finalization', async () => {
  run.status = 'completed';
  run.battery_version = '2099.1';
  const screen = renderSummary({ params: { finalized: true } });
  await screen.findByText("This assessment isn't available in this version of the app.");
  expect(screen.queryByRole('button', { name: 'Assess next child' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Back to Assess' })).toBeTruthy();
});

test('the summary row reads the rate', async () => {
  const battery = jest.requireActual('../src/assessment-questions').MASI_MATHS_2026_1_DRAFT;
  run = { ...run, battery_code: battery.battery_code, battery_version: battery.battery_version, language: 'en',
    results: battery.questions.map(question => ({ id: question.question_code, question_code: question.question_code,
      stopped_reason: 'completed', score: 14, total_items: 20, derived: question.question_code === 'egma_number_id' ? { correct_per_minute: 17.9 } : {} })) };
  const screen = renderSummary();
  await screen.findByText('Maths assessment · English · 17 of 17 decided');
  fireEvent.press(screen.getByRole('button', { name: 'Show all 17' }));
  expect(screen.getByRole('text', { name: '5. Read big numbers, Done, 14 / 20 · 18 per minute' })).toBeTruthy();
});
