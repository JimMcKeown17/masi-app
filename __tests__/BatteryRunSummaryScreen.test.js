jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'ea-1' } }) }));
jest.mock('../src/hooks/useAssessableChildren', () => ({ useAssessableChildren: () => mockRoster }));
jest.mock('../src/services/activeProgrammeGate', () => ({ getActiveProgrammeGate: jest.fn() }));
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => ({ triggerBackgroundSync: mockSync }) }));
jest.mock('../src/context/ToastContext', () => ({
  ...jest.requireActual('../src/context/ToastContext'), useToast: () => ({ show: mockToast }),
}));
jest.mock('../src/assessment-questions', () => ({
  ...jest.requireActual('../src/assessment-questions'), batteryFor: jest.fn(),
}));

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { act, configure, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { createNavigationContainerRef, createNavigatorFactory, NavigationContainer,
  StackRouter, useNavigationBuilder } from '@react-navigation/native';
import { AllProviders } from '../test-support/renderWithProviders';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { getActiveProgrammeGate } from '../src/services/activeProgrammeGate';
import { batteryFor, WELA_PLUS_FULL_2024_1 as BATTERY } from '../src/assessment-questions';
import { borderRadius, colors } from '../src/constants/colors';
import ListRow from '../src/components/common/ListRow';
import StatusBadge from '../src/components/common/StatusBadge';
import BatteryRunSummaryScreen from '../src/screens/assessments/battery/BatteryRunSummaryScreen';
import BatteryOverviewScreen from '../src/screens/assessments/battery/BatteryOverviewScreen';

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
let mockRoster, run, repositories, handle;
function EmptyScreen() { return null; }
// Preserve inactive screens as native stack does, so blur/refocus tests keep state.
function RetainedStack({ children }) {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, { children });
  return <NavigationContent>{state.routes.map((route, index) => (
    <View key={route.key} style={index === state.index ? { flex: 1 } : { display: 'none' }}>
      {descriptors[route.key].render()}
    </View>
  ))}</NavigationContent>;
}
const Stack = createNavigatorFactory(RetainedStack)();
function renderSummary({ initialRoutes, overviewComponent = EmptyScreen } = {}) {
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
  const routes = initialRoutes ?? [{ name: 'BatteryOverview' }, { name: 'BatteryRunSummary', params: { runId: ID } }];
  const screen = render(<Wrapper>
    <NavigationContainer ref={navigationRef} initialState={{ index: routes.length - 1, routes }}>
      <Stack.Navigator>
        <Stack.Screen name="Entry" component={EmptyScreen} />
        <Stack.Screen name="BatteryOverview" component={overviewComponent} />
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
  mockRoster = { yourChildren: [], restOfClass: [CHILD], all: [CHILD], loading: false };
  run = { id: ID, user_id: 'ea-1', child_id: CHILD.id, status: 'in_progress', started_here: 1,
    programme_id: 'programme-1', battery_code: BATTERY.battery_code, battery_version: BATTERY.battery_version,
    language: 'xh', results: decide(11) };
  handle = { userId: 'ea-1', epoch: 1, isCurrent: jest.fn(() => true) };
  repositories = {
    batteryRuns: { getRunWithResults: jest.fn(async () => clone(run)),
      finalizeRun: jest.fn(async () => { run.status = 'completed'; return { id: ID }; }) },
    children: { getChildNamesByIds: jest.fn().mockResolvedValue({ [CHILD.id]: { name: 'Lwazi Mbeki', hidden: false } }) },
  };
  getActiveProgrammeGate.mockReset().mockResolvedValue({ hasActiveProgramme: true, programme: { id: 'programme-1' } });
  batteryFor.mockReset().mockImplementation((...args) => jest.requireActual('../src/assessment-questions').batteryFor(...args));
});
afterEach(async () => {
  await act(async () => { jest.runOnlyPendingTimers(); });
  jest.useRealTimers();
});

test('eligible run: child name, run code, "WelaPLUS · isiXhosa · 11 of 11 decided", first four rows and "Show all 11" expands', async () => {
  const screen = await ready(renderSummary());
  expect(screen.getByText('Lwazi Mbeki')).toBeTruthy();
  expect(screen.getByText('KWY-2M4')).toBeTruthy();
  expect(getActiveProgrammeGate).toHaveBeenCalledWith({ handle, userId: 'ea-1' });
  expect(repositories.children.getChildNamesByIds).not.toHaveBeenCalled();
  const rows = screen.UNSAFE_getAllByType(ListRow);
  expect(rows).toHaveLength(4);
  expect(rows[0].props.subtitle).toBe('Done');
  expect(within(rows[0]).UNSAFE_getByType(StatusBadge).props).toMatchObject({ label: '34 / 60', tone: 'success' });
  expect(rows[2].props.subtitle).toBe('Skipped · Child tired');
  expect(within(rows[2]).getByText('Skipped')).toBeTruthy();
  expect(screen.queryByText('Letter writing')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Show all 11' }));
  expect(screen.UNSAFE_getAllByType(ListRow)).toHaveLength(11);
  expect(screen.getByText('Letter writing')).toBeTruthy();
});

test('one checklist row "Write run code KWY-2M4 and Lwazi\'s name on the Writing Sheet"; Finalize disabled with "Tick the box to finalize" until ticked', async () => {
  const screen = await ready(renderSummary());
  const label = "Write run code KWY-2M4 and Lwazi's name on the Writing Sheet";
  const checkbox = screen.getByRole('checkbox', { name: label });
  expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  expect(checkbox.props.accessibilityState).toMatchObject({ checked: false });
  expect(StyleSheet.flatten(checkbox.props.style).minHeight).toBeGreaterThanOrEqual(48);
  const boxStyle = () => checkbox.findAllByType(View).map(node => StyleSheet.flatten(node.props.style))
    .find(style => style?.borderWidth === 1);
  expect(boxStyle()).toMatchObject({ borderRadius: borderRadius.sm, borderColor: colors.fieldEdge });
  expect(screen.getByRole('button', { name: 'Finalize run' })).toBeDisabled();
  expect(screen.getByText('Tick the box to finalize')).toBeTruthy();
  fireEvent.press(checkbox);
  expect(screen.getByRole('checkbox', { name: label }).props.accessibilityState).toMatchObject({ checked: true });
  expect(boxStyle()).toMatchObject({ backgroundColor: colors.primary, borderColor: colors.primary });
  expect(screen.getByRole('button', { name: 'Finalize run' })).not.toBeDisabled();
  expect(screen.queryByText('Tick the box to finalize')).toBeNull();
  fireEvent.press(screen.getByRole('checkbox', { name: label }));
  expect(screen.getByRole('button', { name: 'Finalize run' })).toBeDisabled();
  expect(repositories.batteryRuns.finalizeRun).not.toHaveBeenCalled();
});

test('battery without a writing-sheet Question: no checklist, Finalize enabled', async () => {
  const battery = { ...BATTERY, questions: BATTERY.questions.filter(question => question.materials?.item !== 'writing_sheet') };
  batteryFor.mockReturnValue(battery);
  run.results = run.results.filter(result => battery.questions.some(question => question.question_code === result.question_code));
  const screen = renderSummary();
  const button = await screen.findByRole('button', { name: 'Finalize run' });
  expect(button).not.toBeDisabled();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByText('Tick the box to finalize')).toBeNull();
  expect(screen.getByText(`${BATTERY.title} · isiXhosa · 8 of 8 decided`)).toBeTruthy();
});

test('Finalize calls finalizeRun with every battery question_code, then shows the read-only summary with a "Finalized" badge', async () => {
  const pending = deferred();
  repositories.batteryRuns.finalizeRun.mockImplementationOnce(async () => {
    await pending.promise;
    run.status = 'completed';
    return { id: ID };
  });
  const screen = await ready(renderSummary());
  fireEvent.press(screen.getByRole('checkbox'));
  const button = screen.getByRole('button', { name: 'Finalize run' });
  act(() => { fireEvent.press(button); fireEvent.press(button); });
  expect(repositories.batteryRuns.finalizeRun).toHaveBeenCalledTimes(1);
  expect(repositories.batteryRuns.finalizeRun).toHaveBeenCalledWith(ID, {
    questionCodes: BATTERY.questions.map(question => question.question_code),
  });
  expect(screen.getByRole('button', { name: 'Finalize run' })).toBeDisabled();
  expect(mockSync).not.toHaveBeenCalled();
  await act(async () => pending.resolve());
  await screen.findByText('Finalized');
  expect(screen.UNSAFE_getAllByType(StatusBadge).find(badge => badge.props.label === 'Finalized').props.tone).toBe('success');
  expect(screen.routeNames()).toEqual(['BatteryOverview', 'BatteryRunSummary']);
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Finalize run' })).toBeNull();
  expect(screen.getByText('Lwazi Mbeki')).toBeTruthy();
  expect(mockSync).toHaveBeenCalledTimes(1);
});

test('RUN_INCOMPLETE on finalize returns to the overview', async () => {
  repositories.batteryRuns.finalizeRun.mockRejectedValueOnce(Object.assign(new Error('missing decision'), { code: 'RUN_INCOMPLETE' }));
  const screen = await ready(renderSummary());
  fireEvent.press(screen.getByRole('checkbox'));
  fireEvent.press(screen.getByRole('button', { name: 'Finalize run' }));
  await waitFor(() => expect(screen.routeNames()).toEqual(['BatteryOverview']));
  expect(mockSync).not.toHaveBeenCalled();
  expect(mockToast).not.toHaveBeenCalled();
});

test.each([['completed', 'Finalized', 'success'], ['abandoned', 'Abandoned', 'neutral']])(
  '%s run: read-only, %s badge, no checklist, no Finalize', async (status, label, tone) => {
    run.status = status;
    const screen = await ready(renderSummary());
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.UNSAFE_getAllByType(StatusBadge).find(badge => badge.props.label === label).props.tone).toBe(tone);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finalize run' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abandon run' })).toBeNull();
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
  expect(screen.queryByRole('button', { name: 'Finalize run' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Abandon run' })).toBeNull();
});

test.each(['child', 'none', 'different'])(
  'unassigned run is read-only with the overview note (%s)', async kind => {
    if (kind === 'child') mockRoster = { ...mockRoster, all: [], restOfClass: [] };
    if (kind === 'none') getActiveProgrammeGate.mockResolvedValue({ hasActiveProgramme: false, programme: null });
    if (kind === 'different') getActiveProgrammeGate.mockResolvedValue({ programme: { id: 'other' } });
    const screen = await ready(renderSummary());
    expect(screen.getByText('This child is no longer assigned to you — you can abandon this run.')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finalize run' })).toBeNull();
    expect(repositories.batteryRuns.finalizeRun).not.toHaveBeenCalled();
    if (kind === 'child') {
      expect(repositories.children.getChildNamesByIds).toHaveBeenCalledWith([CHILD.id]);
      expect(screen.getByText('Lwazi Mbeki')).toBeTruthy();
    }
  },
);

test('refocus refresh keeps the previous expanded rows visible and blocks Finalize until fresh data resolves', async () => {
  const screen = await ready(renderSummary());
  fireEvent.press(screen.getByRole('checkbox'));
  fireEvent.press(screen.getByRole('button', { name: 'Show all 11' }));
  const pending = deferred();
  act(() => screen.navigationRef.navigate('Away'));
  repositories.batteryRuns.getRunWithResults.mockReturnValueOnce(pending.promise);
  act(() => screen.navigationRef.goBack());
  expect(screen.getByText('Lwazi Mbeki')).toBeTruthy();
  expect(screen.UNSAFE_getAllByType(ListRow)).toHaveLength(11);
  expect(screen.queryByLabelText('Loading assessment run')).toBeNull();
  expect(screen.getByRole('button', { name: 'Finalize run' })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Finalize run' }));
  expect(repositories.batteryRuns.finalizeRun).not.toHaveBeenCalled();
  await act(async () => pending.resolve(clone(run)));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Finalize run' })).not.toBeDisabled());
  fireEvent.press(screen.getByRole('button', { name: 'Finalize run' }));
  await screen.findByText('Finalized');
  expect(repositories.batteryRuns.finalizeRun).toHaveBeenCalledTimes(1);
});

test('waits for the assessable roster and programme gate on initial load', async () => {
  const pending = deferred();
  getActiveProgrammeGate.mockReturnValue(pending.promise);
  mockRoster = { yourChildren: [], restOfClass: [], all: [], loading: true };
  const screen = renderSummary();
  expect(screen.getByLabelText('Loading assessment run')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Finalize run' })).toBeNull();
  expect(screen.queryByText('This child is no longer assigned to you — you can abandon this run.')).toBeNull();
  mockRoster = { yourChildren: [], restOfClass: [CHILD], all: [CHILD], loading: false };
  screen.refresh();
  expect(screen.getByLabelText('Loading assessment run')).toBeTruthy();
  await act(async () => pending.resolve({ programme: { id: 'programme-1' } }));
  await ready(screen);
  expect(screen.getByRole('checkbox')).toBeTruthy();
});

test('roster reload keeps cached summary data without treating an empty loading list as unassigned', async () => {
  const screen = await ready(renderSummary());
  fireEvent.press(screen.getByRole('checkbox'));
  mockRoster = { yourChildren: [], restOfClass: [], all: [], loading: true };
  screen.refresh();
  expect(screen.getByText('Lwazi Mbeki')).toBeTruthy();
  expect(screen.UNSAFE_getAllByType(ListRow)).toHaveLength(4);
  expect(screen.queryByLabelText('Loading assessment run')).toBeNull();
  expect(screen.queryByText('This child is no longer assigned to you — you can abandon this run.')).toBeNull();
  expect(screen.getByRole('button', { name: 'Finalize run' })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Finalize run' }));
  expect(repositories.batteryRuns.finalizeRun).not.toHaveBeenCalled();
  mockRoster = { ...mockRoster, loading: false };
  screen.refresh();
  await screen.findByText('This child is no longer assigned to you — you can abandon this run.');
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Finalize run' })).toBeNull();
});

test('a refresh that finds a changed programme removes finalization controls', async () => {
  const screen = await ready(renderSummary());
  fireEvent.press(screen.getByRole('checkbox'));
  act(() => screen.navigationRef.navigate('Away'));
  getActiveProgrammeGate.mockResolvedValue({ programme: { id: 'other' } });
  act(() => screen.navigationRef.goBack());
  await screen.findByText('This child is no longer assigned to you — you can abandon this run.');
  expect(screen.queryByRole('button', { name: 'Finalize run' })).toBeNull();
  expect(repositories.batteryRuns.finalizeRun).not.toHaveBeenCalled();
});

test('a generic finalize failure shows an error, reloads, and permits a manual retry', async () => {
  repositories.batteryRuns.finalizeRun.mockRejectedValueOnce(new Error('disk full'));
  const screen = await ready(renderSummary());
  fireEvent.press(screen.getByRole('checkbox'));
  fireEvent.press(screen.getByRole('button', { name: 'Finalize run' }));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ tone: 'error',
    message: "Couldn't finalize this run. Try again." }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Finalize run' })).not.toBeDisabled());
  expect(mockSync).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Finalize run' }));
  await screen.findByText('Finalized');
  expect(repositories.batteryRuns.finalizeRun).toHaveBeenCalledTimes(2);
  expect(mockSync).toHaveBeenCalledTimes(1);
});

test('a finalize completing while blurred requests sync and is read back as Finalized on return', async () => {
  const pending = deferred();
  repositories.batteryRuns.finalizeRun.mockImplementationOnce(async () => {
    await pending.promise;
    run.status = 'completed';
    return { id: ID };
  });
  const screen = await ready(renderSummary());
  fireEvent.press(screen.getByRole('checkbox'));
  fireEvent.press(screen.getByRole('button', { name: 'Finalize run' }));
  act(() => screen.navigationRef.navigate('Away'));
  await act(async () => pending.resolve());
  expect(mockSync).toHaveBeenCalledTimes(1);
  expect(mockToast).not.toHaveBeenCalled();
  act(() => screen.navigationRef.goBack());
  await screen.findByText('Finalized');
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Finalize run' })).toBeNull();
  expect(repositories.batteryRuns.finalizeRun).toHaveBeenCalledTimes(1);
});

test('a stale handle cannot publish a late finalize result, navigate or request sync', async () => {
  const pending = deferred();
  repositories.batteryRuns.finalizeRun.mockReturnValue(pending.promise);
  const screen = await ready(renderSummary());
  fireEvent.press(screen.getByRole('checkbox'));
  fireEvent.press(screen.getByRole('button', { name: 'Finalize run' }));
  handle.isCurrent.mockReturnValue(false);
  await act(async () => pending.resolve({ id: ID }));
  expect(screen.queryByText('Finalized')).toBeNull();
  expect(screen.routeNames()).toEqual(['BatteryOverview', 'BatteryRunSummary']);
  expect(mockSync).not.toHaveBeenCalled();
  expect(mockToast).not.toHaveBeenCalled();
});

test('a stale handle cannot publish a late initial load', async () => {
  const pending = deferred();
  repositories.batteryRuns.getRunWithResults.mockReturnValue(pending.promise);
  const screen = renderSummary();
  handle.isCurrent.mockReturnValue(false);
  await act(async () => pending.resolve(clone(run)));
  expect(screen.queryByText('Lwazi Mbeki')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Finalize run' })).toBeNull();
});

test('an incomplete open run has no checklist or Finalize action', async () => {
  run.results = decide(10);
  const screen = await ready(renderSummary());
  expect(screen.getByText('Open')).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Finalize run' })).toBeNull();
});

test('an unavailable battery version is read-only with its run code and exact unavailable copy', async () => {
  run.battery_version = '2099.1';
  const screen = renderSummary();
  await screen.findByText("This run's assessment isn't available in this version of the app.");
  expect(batteryFor).toHaveBeenCalledWith(run.battery_code, '2099.1');
  expect(screen.getByText('KWY-2M4')).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Finalize run' })).toBeNull();
});

test('a load failure offers retry, and the checklist preserves the full assessable first_name', async () => {
  repositories.batteryRuns.getRunWithResults.mockRejectedValueOnce(new Error('disk unavailable'));
  const child = { ...CHILD, first_name: 'Lwazi Junior' };
  mockRoster = { yourChildren: [], restOfClass: [child], all: [child], loading: false };
  const screen = renderSummary();
  await screen.findByText("Couldn't load this run. Try again.");
  expect(screen.queryByRole('button', { name: 'Finalize run' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await ready(screen);
  expect(screen.getByRole('checkbox', { name: "Write run code KWY-2M4 and Lwazi Junior's name on the Writing Sheet" })).toBeTruthy();
});

test('a post-finalize read failure retries the read without finalizing the run twice', async () => {
  const screen = await ready(renderSummary());
  repositories.batteryRuns.getRunWithResults.mockRejectedValueOnce(new Error('read unavailable'));
  fireEvent.press(screen.getByRole('checkbox'));
  fireEvent.press(screen.getByRole('button', { name: 'Finalize run' }));
  await screen.findByText("Couldn't load this run. Try again.");
  expect(screen.queryByRole('button', { name: 'Finalize run' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByText('Finalized');
  expect(repositories.batteryRuns.finalizeRun).toHaveBeenCalledTimes(1);
});

test('finalize removes the closed overview so Back reaches the screen below it without re-pushing the summary', async () => {
  const screen = await ready(renderSummary({ overviewComponent: BatteryOverviewScreen, initialRoutes: [
    { name: 'Entry' }, { name: 'BatteryOverview', params: { runId: ID } },
    { name: 'BatteryRunSummary', params: { runId: ID } },
  ] }));
  const summaryKey = screen.navigationRef.getCurrentRoute().key;
  fireEvent.press(screen.getByRole('checkbox'));
  fireEvent.press(screen.getByRole('button', { name: 'Finalize run' }));
  await screen.findByText('Finalized');
  expect(screen.navigationRef.getCurrentRoute().key).toBe(summaryKey);
  act(() => screen.navigationRef.goBack());
  await waitFor(() => expect(screen.routeNames()).toEqual(['Entry']));
  expect(screen.navigationRef.getCurrentRoute().name).toBe('Entry');
  expect(screen.queryByText('Finalized')).toBeNull();
});

test('finalize removes every matching overview beneath the summary and preserves unrelated routes and keys', async () => {
  const otherId = '8e3c2a10-5b7e-4c1d-8e2f-0123456789ab';
  const screen = await ready(renderSummary({ initialRoutes: [
    { name: 'Entry' }, { name: 'BatteryOverview', params: { runId: otherId } },
    { name: 'BatteryOverview', params: { runId: ID } },
    { name: 'BatteryOverview', params: { runId: ID } },
    { name: 'BatteryRunSummary', params: { runId: ID } },
  ] }));
  const before = screen.navigationRef.getRootState();
  const expectedKeys = [before.routes[0].key, before.routes[1].key, before.routes[4].key];
  fireEvent.press(screen.getByRole('checkbox'));
  fireEvent.press(screen.getByRole('button', { name: 'Finalize run' }));
  await screen.findByText('Finalized');
  await waitFor(() => expect(screen.navigationRef.getRootState().routes.map(route => route.key)).toEqual(expectedKeys));
  expect(screen.navigationRef.getRootState().index).toBe(2);
  act(() => screen.navigationRef.goBack());
  expect(screen.navigationRef.getCurrentRoute().params.runId).toBe(otherId);
});

test('finalize navigation cleanup waits for a failed read to be retried into the read-only summary', async () => {
  const screen = await ready(renderSummary({ overviewComponent: BatteryOverviewScreen, initialRoutes: [
    { name: 'Entry' }, { name: 'BatteryOverview', params: { runId: ID } },
    { name: 'BatteryRunSummary', params: { runId: ID } },
  ] }));
  repositories.batteryRuns.getRunWithResults.mockRejectedValueOnce(new Error('read unavailable'));
  fireEvent.press(screen.getByRole('checkbox'));
  fireEvent.press(screen.getByRole('button', { name: 'Finalize run' }));
  await screen.findByText("Couldn't load this run. Try again.");
  expect(screen.routeNames()).toEqual(['Entry', 'BatteryOverview', 'BatteryRunSummary']);
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByText('Finalized');
  act(() => screen.navigationRef.goBack());
  await waitFor(() => expect(screen.routeNames()).toEqual(['Entry']));
  expect(repositories.batteryRuns.finalizeRun).toHaveBeenCalledTimes(1);
});

test('RUN_INCOMPLETE preserves the real overview beneath the summary and returns to it', async () => {
  repositories.batteryRuns.finalizeRun.mockRejectedValueOnce(Object.assign(new Error('missing decision'), { code: 'RUN_INCOMPLETE' }));
  const screen = await ready(renderSummary({ overviewComponent: BatteryOverviewScreen, initialRoutes: [
    { name: 'Entry' }, { name: 'BatteryOverview', params: { runId: ID } },
    { name: 'BatteryRunSummary', params: { runId: ID } },
  ] }));
  fireEvent.press(screen.getByRole('checkbox'));
  fireEvent.press(screen.getByRole('button', { name: 'Finalize run' }));
  await waitFor(() => expect(screen.routeNames()).toEqual(['Entry', 'BatteryOverview']));
  expect(await screen.findByRole('button', { name: 'Review and finalize' })).toBeTruthy();
  expect(mockSync).not.toHaveBeenCalled();
});
