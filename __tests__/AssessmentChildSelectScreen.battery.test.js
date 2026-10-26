jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'ea-1' } }) }));
jest.mock('../src/hooks/useAssessableChildren', () => ({ useAssessableChildren: () => mockRoster }));
jest.mock('../src/assessment-questions', () => ({
  ...jest.requireActual('../src/assessment-questions'), batteryFor: jest.fn(),
}));

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../src/constants/colors';
import { fontFamilies, typeRoles } from '../src/constants/typography';
import ListRow from '../src/components/common/ListRow';
import { act, configure, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { createNavigationContainerRef, createNavigatorFactory, NavigationContainer,
  StackRouter, useNavigationBuilder } from '@react-navigation/native';
import { AllProviders } from '../test-support/renderWithProviders';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { batteryFor, WELA_PLUS_FULL_2024_1 as BATTERY } from '../src/assessment-questions';
import AssessmentChildSelectScreen from '../src/screens/assessments/AssessmentChildSelectScreen';
import { EGRA_BATTERIES } from '../src/assessment-questions/egra';

test('Full EGRA 2026.1 starts a zu-class child in zu with no language sheet', async () => {
  const child = { ...CHILD, home_language: 'zu' };
  mockRoster = { yourChildren: [], restOfClass: [child], all: [child], loading: false };
  const screen = await ready(renderSelect({ batteryCode: 'egra', batteryVersion: '2026.1' }));
  fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
  await waitFor(() => expect(screen.routes().map(route => route.name)).toEqual(['Entry', 'BatteryOverview']));
  expect(screen.queryByRole('header', { name: 'Select language' })).toBeNull();
  expect(screen.queryByTestId('bottom-sheet-panel')).toBeNull();
  expect(repositories.batteryRuns.startRun).toHaveBeenCalledTimes(1);
  expect(repositories.batteryRuns.startRun).toHaveBeenCalledWith({
    id: expect.any(String), userId: 'ea-1', childId: CHILD.id, classId: CHILD.class_id,
    batteryCode: 'egra', batteryVersion: '2026.1', language: 'zu',
  });
});

test.each([['xh', 'isiXhosa'], ['en', 'English'], ['af', 'Afrikaans'], ['zu', 'isiZulu']])(
  'Full EGRA without a class language offers exactly four languages and can start in %s', async (code, label) => {
    const child = { ...CHILD, home_language: null };
    mockRoster = { yourChildren: [], restOfClass: [child], all: [child], loading: false };
    const screen = await ready(renderSelect({ batteryCode: 'egra', batteryVersion: '2026.1' }));
    fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
    await screen.findByRole('header', { name: 'Select language' });
    const sheet = within(screen.getByTestId('bottom-sheet-panel'));
    const options = sheet.getAllByRole('button').filter(button =>
      typeof button.props.accessibilityState?.selected === 'boolean');
    expect(options.map(button => button.props.accessibilityLabel)).toEqual(['isiXhosa', 'English', 'Afrikaans', 'isiZulu']);
    for (const option of options) expect(option.props.accessibilityState.selected).toBe(false);
    expect(sheet.getByRole('button', { name: 'Start' })).toBeDisabled();
    expect(repositories.batteryRuns.startRun).not.toHaveBeenCalled();
    fireEvent.press(sheet.getByRole('button', { name: label }));
    fireEvent.press(sheet.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.routes()[1].name).toBe('BatteryOverview'));
    expect(repositories.batteryRuns.startRun).toHaveBeenCalledTimes(1);
    expect(repositories.batteryRuns.startRun).toHaveBeenCalledWith({
      id: expect.any(String), userId: 'ea-1', childId: CHILD.id, classId: CHILD.class_id,
      batteryCode: 'egra', batteryVersion: '2026.1', language: code,
    });
  },
);

test.each([
  ['egra', 'Sesotho', 'Sesotho'],
  ['wela_plus_full', 'zu', 'isiZulu'],
])('%s 2026.1 blocks an unsupported class language %s and displays %s', async (batteryCode, language, label) => {
  const child = { ...CHILD, home_language: language };
  mockRoster = { yourChildren: [], restOfClass: [child], all: [child], loading: false };
  const screen = renderSelect({ batteryCode, batteryVersion: '2026.1' });
  await screen.findByText(`Not available in ${label} yet`);
  const row = screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' });
  expect(row).toBeDisabled();
  fireEvent.press(row);
  expect(repositories.batteryRuns.startRun).not.toHaveBeenCalled();
  expect(screen.queryByRole('header', { name: 'Select language' })).toBeNull();
  expect(screen.routes().map(route => route.name)).toEqual(['Entry', 'ChildSelect']);
});

test.each(EGRA_BATTERIES)('$title starts in the form language instead of the class language, with no language sheet', async battery => {
  const child = { ...CHILD, home_language: battery.fixedLanguage === 'xh' ? 'en' : 'xh' };
  mockRoster = { yourChildren: [], restOfClass: [child], all: [child], loading: false };
  const screen = await ready(renderSelect({ batteryCode: 'egra', batteryVersion: battery.battery_version }));
  fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
  await waitFor(() => expect(screen.routes().map(route => route.name)).toEqual(['Entry', 'BatteryOverview']));
  expect(screen.queryByRole('header', { name: 'Select language' })).toBeNull();
  expect(repositories.batteryRuns.startRun).toHaveBeenCalledTimes(1);
  expect(repositories.batteryRuns.startRun).toHaveBeenCalledWith({
    id: expect.any(String), userId: 'ea-1', childId: CHILD.id, classId: CHILD.class_id,
    batteryCode: 'egra', batteryVersion: battery.battery_version, language: battery.fixedLanguage,
  });
});


test('an EGRA form names its own language in the header, not the class language', async () => {
  const screen = await ready(renderSelect({ batteryCode: 'egra', batteryVersion: 'dbe-egra-en-fal-2-v1' }));
  expect(screen.getByText('English FAL EGRA 2 · in English')).toBeTruthy();
  expect(screen.queryByText("English FAL EGRA 2 · in the child's class language")).toBeNull();
});

test('WelaPLUS picker still lets an Afrikaans child resume an unfinished EGRA, but not start WelaPLUS', async () => {
  const child = { ...CHILD, home_language: 'af' };
  mockRoster = { yourChildren: [child], restOfClass: [], all: [child], loading: false };
  repositories.batteryRuns.getUnfinishedRunsForUser.mockResolvedValue([unfinished({
    battery_code: 'egra', battery_version: 'dbe-egra-af-hl-1-v1', language: 'af', question_count: 2,
  })]);
  const screen = await ready(renderSelect());
  expect(screen.getByText('Not available in Afrikaans yet')).toBeTruthy();
  expect(screen.getByText('Unfinished 2/4')).toBeTruthy();
  const row = screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' });
  expect(row).not.toBeDisabled();
  fireEvent.press(row);
  await screen.findByRole('header', { name: 'Lwazi has an unfinished assessment' });
  expect(screen.getByText('Afrikaans EGRA 1 · Started Tue 14:05 · 2 of 4 Questions done · code KWY-2M4')).toBeTruthy();
  expect(screen.getByText("WelaPLUS isn't available in Afrikaans yet, so this assessment can only be resumed.")).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Abandon it and start new' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Resume' }));
  await waitFor(() => expect(screen.routes()[1]).toMatchObject({ name: 'BatteryOverview', params: { runId: ID } }));
  expect(repositories.batteryRuns.startRun).not.toHaveBeenCalled();
});

configure({ asyncUtilTimeout: 5000 });
const CHILD = { id: 'child-1', first_name: 'Lwazi', last_name: 'Mbeki', class_id: 'membership-class',
  grade: '2', home_language: 'xh', membership_id: 'membership-1', is_delivery: false };
const ID = '9f3c2a10-5b7e-4c1d-8e2f-0123456789ab';
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
let mockRoster, repositories, handle;
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
function renderSelect(params = { batteryCode: BATTERY.battery_code, batteryVersion: BATTERY.battery_version }) {
  let navigation, refresh;
  function Host(props) {
    navigation = props.navigation;
    const [, force] = React.useReducer(value => value + 1, 0);
    refresh = force;
    return <AssessmentChildSelectScreen {...props} />;
  }
  const navigationRef = createNavigationContainerRef();
  const screen = render(<AllProviders motion={{ motionLevel: 'still', reduceMotion: true, tier: 'high' }}>
    <SignedInEAContext.Provider value={{ handle, repositories }}>
      <NavigationContainer ref={navigationRef} initialState={{ index: 1,
        routes: [{ name: 'Entry' }, { name: 'ChildSelect', params }] }}>
        <Stack.Navigator>
          <Stack.Screen name="Entry" component={EmptyScreen} />
          <Stack.Screen name="ChildSelect" component={Host} />
          <Stack.Screen name="BatteryOverview" component={EmptyScreen} />
          <Stack.Screen name="StandaloneTest" component={EmptyScreen} />
          <Stack.Screen name="Away" component={EmptyScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SignedInEAContext.Provider>
  </AllProviders>);
  return { ...screen, navigationRef, get navigation() { return navigation; },
    refresh: () => act(() => refresh()),
    routes: () => navigationRef.getRootState().routes };
}
async function ready(screen) {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' })).not.toBeDisabled());
  return screen;
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 23, 15, 0));
  jest.clearAllMocks();
  mockRoster = { yourChildren: [], restOfClass: [CHILD], all: [CHILD], loading: false };
  handle = { userId: 'ea-1', epoch: 1, isCurrent: jest.fn(() => true) };
  repositories = {
    assessments: { getQuestionResults: jest.fn().mockResolvedValue([]) },
    batteryRuns: { getRunsForUser: jest.fn().mockResolvedValue([]), getUnfinishedRunsForUser: jest.fn().mockResolvedValue([]),
      startRun: jest.fn().mockImplementation(async ({ id }) => ({ id })) },
  };
  batteryFor.mockReset().mockImplementation((...args) => jest.requireActual('../src/assessment-questions').batteryFor(...args));
});
afterEach(async () => {
  await act(async () => jest.runOnlyPendingTimers());
  jest.useRealTimers();
});

test('header subtitle reads "WelaPLUS · the language comes from the child\'s class"', async () => {
  const screen = await ready(renderSelect());
  expect(screen.getByText("WelaPLUS · in the child's class language")).toBeTruthy();
  expect(repositories.assessments.getQuestionResults).not.toHaveBeenCalled();
});

test.each([['af', 'Afrikaans'], ['isiZulu', 'isiZulu']])(
  'class language %s outside battery.languages: disabled row, labelled unavailable caption, no start', async (language, label) => {
    const child = { ...CHILD, home_language: language };
    mockRoster = { yourChildren: [child], restOfClass: [], all: [child], loading: false };
    const screen = renderSelect();
    await screen.findByText(`Not available in ${label} yet`);
    expect(StyleSheet.flatten(screen.getByText(`Grade 2 · ${label}`).props.style).color).toBe(colors.textSecondary);
    expect(StyleSheet.flatten(screen.getByText('Lwazi Mbeki').props.style).color).toBe(colors.disabled);
    expect(StyleSheet.flatten(screen.getByText(`Not available in ${label} yet`).props.style)).toMatchObject({
      fontSize: typeRoles.textCaption.fontSize, fontFamily: fontFamilies.textSemi, color: colors.warningText,
    });
    expect(StyleSheet.flatten(screen.getByText('LM', { includeHiddenElements: true }).props.style).color).toBe(colors.disabled);
    expect(StyleSheet.flatten(screen.getByTestId('avatar', { includeHiddenElements: true }).props.style).backgroundColor).toBe(colors.border);
    expect(screen.UNSAFE_getByType(ListRow).props.trailing).toBeUndefined();
    const row = screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' });
    expect(row).toBeDisabled();
    expect(row.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(row);
    expect(repositories.batteryRuns.startRun).not.toHaveBeenCalled();
    expect(screen.queryByRole('header', { name: 'Select language' })).toBeNull();
    expect(screen.routes().map(route => route.name)).toEqual(['Entry', 'ChildSelect']);
  },
);

test('ECD and Grade R children are offered in Your children then Rest of the class; either section can start with its membership class', async () => {
  const ecd = { ...CHILD, id: 'ecd', first_name: 'Amahle', grade: 'ECD', is_delivery: true };
  const gradeR = { ...CHILD, grade: 'R' };
  mockRoster = { yourChildren: [ecd], restOfClass: [gradeR], all: [ecd, gradeR], loading: false };
  const screen = await ready(renderSelect());
  expect(screen.getAllByRole('header').map(node => node.props.children)).toEqual(['Your children', 'Rest of the class']);
  expect(screen.getByText('ECD · isiXhosa')).toBeTruthy();
  expect(screen.getByText('Grade R · isiXhosa')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
  await waitFor(() => expect(screen.routes().map(route => route.name)).toEqual(['Entry', 'BatteryOverview']));
  expect(repositories.batteryRuns.startRun).toHaveBeenCalledTimes(1);
  const input = repositories.batteryRuns.startRun.mock.calls[0][0];
  expect(input).toEqual({ id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
    userId: 'ea-1', childId: CHILD.id, classId: 'membership-class', batteryCode: BATTERY.battery_code,
    batteryVersion: BATTERY.battery_version, language: 'xh' });
  expect(screen.routes()[1].params).toEqual({ runId: input.id });
});

test('class language not set: picker lists only battery.languages, has no default, and confirmation starts in the picked language', async () => {
  const child = { ...CHILD, home_language: null, class_id: null };
  mockRoster = { yourChildren: [child], restOfClass: [], all: [child], loading: false };
  const screen = await ready(renderSelect());
  expect(screen.getByText('Grade 2 · class language not set')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
  await screen.findByRole('header', { name: 'Select language' });
  expect(screen.getByRole('button', { name: 'English' }).props.accessibilityState.selected).toBe(false);
  expect(screen.getByRole('button', { name: 'isiXhosa' }).props.accessibilityState.selected).toBe(false);
  expect(screen.queryByText('Afrikaans')).toBeNull();
  expect(screen.queryByText('isiZulu')).toBeNull();
  expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'English' }));
  expect(repositories.batteryRuns.startRun).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Start' }));
  await waitFor(() => expect(screen.routes()[1].name).toBe('BatteryOverview'));
  expect(repositories.batteryRuns.startRun).toHaveBeenCalledWith(expect.objectContaining({ language: 'en', classId: null }));
});

test.each(['af', null, 'xh'])(
  'fixedLanguage bypasses the gate and picker for class language %s, using a registered fixture battery', async homeLanguage => {
    const fixture = { title: 'Fixture reading', battery_code: 'fixture_reading', battery_version: '1', aboutMinutes: 2,
      languages: ['en'], fixedLanguage: 'en', questions: BATTERY.questions.slice(0, 2), prerequisites: {} };
    batteryFor.mockImplementation((code, version) => code === fixture.battery_code && version === fixture.battery_version ? fixture : null);
    const child = { ...CHILD, home_language: homeLanguage };
    mockRoster = { yourChildren: [child], restOfClass: [], all: [child], loading: false };
    const screen = await ready(renderSelect({ batteryCode: fixture.battery_code, batteryVersion: fixture.battery_version }));
    expect(screen.getByText('Fixture reading · in English')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
    await waitFor(() => expect(screen.routes()[1].name).toBe('BatteryOverview'));
    expect(repositories.batteryRuns.startRun).toHaveBeenCalledWith(expect.objectContaining({
      batteryCode: fixture.battery_code, batteryVersion: fixture.battery_version, language: 'en',
    }));
    expect(screen.queryByRole('header', { name: 'Select language' })).toBeNull();
    expect(BATTERY.fixedLanguage).toBeUndefined();
  },
);

function unfinished(overrides = {}) {
  return { id: ID, child_id: CHILD.id, battery_code: BATTERY.battery_code, battery_version: BATTERY.battery_version,
    language: 'xh', question_count: 4, started_at: new Date(2026, 9, 20, 14, 5).toISOString(), ...overrides };
}

test('unfinished run shows Unfinished 4/11; tapping opens the sheet with exact title, local start time, run code and saved-count warning', async () => {
  repositories.batteryRuns.getUnfinishedRunsForUser.mockResolvedValue([unfinished()]);
  const screen = await ready(renderSelect());
  expect(repositories.batteryRuns.getUnfinishedRunsForUser).toHaveBeenCalledWith('ea-1');
  expect(await screen.findByText('Unfinished 4/11')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
  await screen.findByRole('header', { name: 'Lwazi has an unfinished assessment' });
  expect(screen.getByText('WelaPLUS · Started Tue 14:05 · 4 of 11 Questions done · code KWY-2M4')).toBeTruthy();
  expect(screen.getByText("Starting new closes the old assessment as abandoned. Its 4 saved Questions stay in Lwazi's history.")).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Abandon it and start new' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  expect(repositories.batteryRuns.startRun).not.toHaveBeenCalled();
});

test.each(['Resume', 'Abandon it and start new', 'Cancel'])(
  'unfinished sheet: %s has the required navigation/write behavior', async action => {
    repositories.batteryRuns.getUnfinishedRunsForUser.mockResolvedValue([unfinished()]);
    const screen = await ready(renderSelect());
    fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
    await screen.findByRole('header', { name: 'Lwazi has an unfinished assessment' });
    const button = screen.getByRole('button', { name: action });
    act(() => { fireEvent.press(button); fireEvent.press(button); });
    if (action === 'Cancel') {
      await waitFor(() => expect(screen.queryByRole('header', { name: 'Lwazi has an unfinished assessment' })).toBeNull());
      expect(screen.routes()[1].name).toBe('ChildSelect');
      expect(repositories.batteryRuns.startRun).not.toHaveBeenCalled();
      return;
    }
    await waitFor(() => expect(screen.routes().map(route => route.name)).toEqual(['Entry', 'BatteryOverview']));
    if (action === 'Resume') {
      expect(screen.routes()[1].params).toEqual({ runId: ID });
      expect(repositories.batteryRuns.startRun).not.toHaveBeenCalled();
    } else {
      expect(repositories.batteryRuns.startRun).toHaveBeenCalledTimes(1);
      expect(repositories.batteryRuns.startRun).toHaveBeenCalledWith(expect.objectContaining({
        abandonRunId: ID, childId: CHILD.id, classId: CHILD.class_id, language: 'xh',
        batteryCode: BATTERY.battery_code, batteryVersion: BATTERY.battery_version,
      }));
      const newId = repositories.batteryRuns.startRun.mock.calls[0][0].id;
      expect(newId).not.toBe(ID);
      expect(screen.routes()[1].params).toEqual({ runId: newId });
    }
  },
);

test('UNFINISHED_RUN_EXISTS race opens the unfinished sheet for error.runId instead of showing an error', async () => {
  const raceId = '11111111-2222-4333-8444-555555555555';
  repositories.batteryRuns.startRun.mockRejectedValueOnce(Object.assign(new Error('race'), {
    code: 'UNFINISHED_RUN_EXISTS', runId: raceId,
  }));
  repositories.batteryRuns.getUnfinishedRunsForUser.mockResolvedValueOnce([])
    .mockResolvedValue([unfinished({ child_id: 'another-child' }), unfinished({ id: raceId, question_count: 2 })]);
  const screen = await ready(renderSelect());
  fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
  await screen.findByRole('header', { name: 'Lwazi has an unfinished assessment' });
  expect(screen.getByText(/2 of 11 Questions done/)).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Resume' }));
  await waitFor(() => expect(screen.routes()[1].params).toEqual({ runId: raceId }));
  expect(repositories.batteryRuns.startRun).toHaveBeenCalledTimes(1);
});

test('double tap on a child starts exactly one run, and no navigation happens before the write resolves', async () => {
  const pending = deferred();
  repositories.batteryRuns.startRun.mockReturnValueOnce(pending.promise);
  const screen = await ready(renderSelect());
  const row = screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' });
  act(() => { fireEvent.press(row); fireEvent.press(row); });
  expect(repositories.batteryRuns.startRun).toHaveBeenCalledTimes(1);
  expect(screen.routes()[1].name).toBe('ChildSelect');
  await act(async () => pending.resolve({ id: ID }));
  await waitFor(() => expect(screen.routes()[1].params).toEqual({ runId: ID }));
});

test('abandon and start new with no class language first asks for a language; cancel writes nothing, confirmation keeps abandonRunId', async () => {
  const child = { ...CHILD, home_language: null };
  mockRoster = { yourChildren: [child], restOfClass: [], all: [child], loading: false };
  repositories.batteryRuns.getUnfinishedRunsForUser.mockResolvedValue([unfinished()]);
  const screen = await ready(renderSelect());
  const openAbandon = async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Abandon it and start new' }));
    await screen.findByRole('header', { name: 'Select language' });
  };
  await openAbandon();
  expect(repositories.batteryRuns.startRun).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('header', { name: 'Select language' })).toBeNull());
  expect(repositories.batteryRuns.startRun).not.toHaveBeenCalled();
  await openAbandon();
  fireEvent.press(screen.getByRole('button', { name: 'isiXhosa' }));
  fireEvent.press(screen.getByRole('button', { name: 'Start' }));
  await waitFor(() => expect(screen.routes()[1].name).toBe('BatteryOverview'));
  expect(repositories.batteryRuns.startRun).toHaveBeenCalledWith(expect.objectContaining({ abandonRunId: ID, language: 'xh' }));
});

test('blur and refocus refresh unfinished runs without releasing a pending start guard', async () => {
  const pending = deferred();
  repositories.batteryRuns.startRun.mockReturnValueOnce(pending.promise);
  const screen = await ready(renderSelect());
  fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
  act(() => screen.navigationRef.navigate('Away'));
  act(() => screen.navigationRef.goBack());
  await ready(screen);
  expect(repositories.batteryRuns.getUnfinishedRunsForUser).toHaveBeenCalledTimes(2);
  fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
  expect(repositories.batteryRuns.startRun).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve({ id: ID }));
  await waitFor(() => expect(screen.routes()[1].params).toEqual({ runId: ID }));
});

test('unfinished-run load failure offers Retry and keeps starting blocked until a successful reload', async () => {
  repositories.batteryRuns.getUnfinishedRunsForUser.mockRejectedValueOnce(new Error('disk busy'));
  const screen = renderSelect();
  await screen.findByText("Couldn't load unfinished assessments. Try again.");
  const row = screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' });
  expect(row).toBeDisabled();
  fireEvent.press(row);
  expect(repositories.batteryRuns.startRun).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  await ready(screen);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(repositories.batteryRuns.getUnfinishedRunsForUser).toHaveBeenCalledTimes(2);
  fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
  await waitFor(() => expect(screen.routes()[1].name).toBe('BatteryOverview'));
});

test('last-run history failure leaves unfinished runs visible and resumable without an error note', async () => {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    repositories.batteryRuns.getRunsForUser.mockRejectedValue(new Error('history read failed'));
    repositories.batteryRuns.getUnfinishedRunsForUser.mockResolvedValue([unfinished()]);
    const screen = await ready(renderSelect());
    expect(screen.getByText('Unfinished 4/11')).toBeTruthy();
    expect(screen.queryByText(/last assessed/)).toBeNull();
    expect(screen.queryByText("Couldn't load unfinished assessments. Try again.")).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(warning).toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
    await screen.findByRole('header', { name: 'Lwazi has an unfinished assessment' });
    expect(screen.getByRole('button', { name: 'Resume' })).not.toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(screen.routes()[1].params).toEqual({ runId: ID }));
    expect(repositories.batteryRuns.startRun).not.toHaveBeenCalled();
  } finally {
    warning.mockRestore();
  }
});

test('last-run history that never resolves does not delay starting a run', async () => {
  repositories.batteryRuns.getRunsForUser.mockReturnValue(deferred().promise);
  const screen = await ready(renderSelect());
  expect(screen.queryByText(/last assessed/)).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
  await waitFor(() => expect(screen.routes()[1].name).toBe('BatteryOverview'));
  expect(repositories.batteryRuns.startRun).toHaveBeenCalledTimes(1);
});

test('failed abandon-and-start keeps the saved run sheet open with an accessible error and permits a manual retry', async () => {
  repositories.batteryRuns.getUnfinishedRunsForUser.mockResolvedValue([unfinished()]);
  repositories.batteryRuns.startRun.mockRejectedValueOnce(new Error('disk full'));
  const screen = await ready(renderSelect());
  fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Abandon it and start new' }));
  await screen.findByText("Couldn't start this assessment. Try again.");
  expect(screen.getByRole('header', { name: 'Lwazi has an unfinished assessment' })).toBeTruthy();
  expect(screen.routes()[1].name).toBe('ChildSelect');
  fireEvent.press(screen.getByRole('button', { name: 'Abandon it and start new' }));
  await waitFor(() => expect(screen.routes()[1].name).toBe('BatteryOverview'));
  expect(repositories.batteryRuns.startRun).toHaveBeenCalledTimes(2);
  expect(repositories.batteryRuns.startRun.mock.calls.every(([input]) => input.abandonRunId === ID)).toBe(true);
});

test('an EGRA picker shows an unfinished WelaPLUS with its own name and question total', async () => {
  const egra = EGRA_BATTERIES.find(battery => battery.battery_version === 'dbe-egra-en-fal-2-v1');
  repositories.batteryRuns.getUnfinishedRunsForUser.mockResolvedValue([unfinished()]);
  const screen = await ready(renderSelect({ batteryCode: 'egra', batteryVersion: egra.battery_version }));
  expect(await screen.findByText('Unfinished 4/11')).toBeTruthy();
  expect(screen.queryByText('Unfinished 4/4')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
  await screen.findByRole('header', { name: 'Lwazi has an unfinished assessment' });
  expect(screen.getByText('WelaPLUS · Started Tue 14:05 · 4 of 11 Questions done · code KWY-2M4')).toBeTruthy();
  expect(repositories.batteryRuns.startRun).not.toHaveBeenCalled();
});

test('an unfinished assessment this app version does not know shows no total and no name', async () => {
  repositories.batteryRuns.getUnfinishedRunsForUser.mockResolvedValue([unfinished({
    battery_code: 'future_battery', battery_version: '9', question_count: 2,
  })]);
  const screen = await ready(renderSelect());
  expect(await screen.findByText('Unfinished')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
  expect(await screen.findByText('Started Tue 14:05 · 2 Questions done · code KWY-2M4')).toBeTruthy();
});

test('another fixture battery supplies its own supported language and question total, including the unfinished sheet', async () => {
  const fixture = { ...BATTERY, title: 'Fixture reading', battery_code: 'fixture_reading', battery_version: '1',
    languages: ['af'], questions: BATTERY.questions.slice(0, 2) };
  batteryFor.mockReturnValue(fixture);
  const child = { ...CHILD, home_language: 'Afrikaans' };
  mockRoster = { yourChildren: [child], restOfClass: [], all: [child], loading: false };
  repositories.batteryRuns.getUnfinishedRunsForUser.mockResolvedValue([unfinished({ question_count: 1,
    battery_code: fixture.battery_code, battery_version: fixture.battery_version, language: 'af' })]);
  const screen = await ready(renderSelect({ batteryCode: fixture.battery_code, batteryVersion: fixture.battery_version }));
  expect(screen.getByText('Unfinished 1/2')).toBeTruthy();
  expect(screen.queryByText('Not available in Afrikaans yet')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
  expect(await screen.findByText('Fixture reading · Started Tue 14:05 · 1 of 2 Questions done · code KWY-2M4')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Abandon it and start new' }));
  await waitFor(() => expect(screen.routes()[1].name).toBe('BatteryOverview'));
  expect(repositories.batteryRuns.startRun).toHaveBeenCalledWith(expect.objectContaining({
    language: 'af', batteryCode: fixture.battery_code, batteryVersion: fixture.battery_version, abandonRunId: ID,
  }));
});

test('roster and unfinished-run loading keep rows visible but block starting until both finish', async () => {
  const pending = deferred();
  repositories.batteryRuns.getUnfinishedRunsForUser.mockReturnValueOnce(pending.promise);
  const screen = renderSelect();
  expect(screen.getByText('Lwazi Mbeki')).toBeTruthy();
  const row = () => screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' });
  expect(row()).toBeDisabled();
  fireEvent.press(row());
  expect(repositories.batteryRuns.startRun).not.toHaveBeenCalled();
  await act(async () => pending.resolve([]));
  await ready(screen);
  mockRoster = { ...mockRoster, loading: true };
  screen.refresh();
  expect(screen.getByText('Lwazi Mbeki')).toBeTruthy();
  expect(row()).toBeDisabled();
  fireEvent.press(row());
  expect(repositories.batteryRuns.startRun).not.toHaveBeenCalled();
  mockRoster = { ...mockRoster, loading: false };
  screen.refresh();
  await ready(screen);
  fireEvent.press(row());
  await waitFor(() => expect(screen.routes()[1].name).toBe('BatteryOverview'));
});

test.each(['success', 'failure'])('a stale EA handle cannot publish a late start %s', async outcome => {
  const pending = deferred();
  repositories.batteryRuns.startRun.mockReturnValueOnce(pending.promise);
  const screen = await ready(renderSelect());
  fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
  handle.isCurrent.mockReturnValue(false);
  await act(async () => {
    if (outcome === 'success') pending.resolve({ id: ID });
    else pending.reject(new Error('stale write'));
  });
  expect(screen.routes()[1].name).toBe('ChildSelect');
  expect(screen.queryByRole('alert')).toBeNull();
});

test('standalone mode retains the shared two-section roster, search and class-row language launch', async () => {
  const yours = { ...CHILD, id: 'your-child', first_name: 'Amahle', is_delivery: true };
  const rest = { ...CHILD, home_language: 'isiXhosa' };
  mockRoster = { yourChildren: [yours], restOfClass: [rest], all: [yours, rest], loading: false };
  const screen = await ready(renderSelect({ testCode: 'letter_sounds' }));
  expect(screen.getAllByRole('header').map(node => node.props.children)).toEqual(['Your children', 'Rest of the class']);
  expect(repositories.batteryRuns.getUnfinishedRunsForUser).not.toHaveBeenCalled();
  expect(repositories.assessments.getQuestionResults).toHaveBeenCalledWith({ userId: 'ea-1', questionCodes: ['letter_sounds'] });
  fireEvent.changeText(screen.getByPlaceholderText('Search children...'), 'lwazi');
  expect(screen.queryByText('Amahle Mbeki')).toBeNull();
  expect(screen.getByRole('header', { name: 'Rest of the class' })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
  await waitFor(() => expect(screen.routes().map(route => route.name)).toEqual(['Entry', 'ChildSelect', 'StandaloneTest']));
  expect(screen.routes()[2].params).toEqual({ testCode: 'letter_sounds', child: rest, languageCode: 'xh' });
  expect(repositories.batteryRuns.startRun).not.toHaveBeenCalled();
});

test('leaving the picker dismisses its unfinished sheet; refocusing reloads the run count without reopening the sheet', async () => {
  repositories.batteryRuns.getUnfinishedRunsForUser.mockResolvedValueOnce([unfinished()])
    .mockResolvedValue([unfinished({ question_count: 5 })]);
  const screen = await ready(renderSelect());
  fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
  await screen.findByRole('header', { name: 'Lwazi has an unfinished assessment' });
  act(() => screen.navigationRef.navigate('Away'));
  await waitFor(() => expect(Boolean(screen.queryByRole('header', { name: 'Lwazi has an unfinished assessment' }))).toBe(false));
  act(() => screen.navigationRef.goBack());
  await ready(screen);
  expect(Boolean(screen.queryByRole('header', { name: 'Lwazi has an unfinished assessment' }))).toBe(false);
  expect(screen.getByText('Unfinished 5/11')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
  await screen.findByText('WelaPLUS · Started Tue 14:05 · 5 of 11 Questions done · code KWY-2M4');
});

test('battery picker shows the latest finalized run start day for this battery only', async () => {
  repositories.batteryRuns.getRunsForUser.mockResolvedValue([
    unfinished({ status: 'completed', started_at: '2026-09-03T12:00:00Z' }),
    unfinished({ status: 'abandoned', started_at: '2026-10-23T12:00:00Z' }),
    unfinished({ status: 'in_progress', started_at: '2026-10-23T14:00:00Z' }),
    unfinished({ status: 'completed', started_at: '2026-10-23T15:00:00Z', battery_code: 'another_battery' }),
    unfinished({ status: 'completed', started_at: '2026-10-23T16:00:00Z', child_id: 'other-child' }),
    unfinished({ status: 'completed', started_at: '2026-10-19T22:30:00Z', started_here: 0 }),
  ]);
  const screen = await ready(renderSelect());
  expect(screen.getByText('Grade 2 · isiXhosa · last assessed 20 Oct')).toBeTruthy();
  expect(repositories.batteryRuns.getRunsForUser).toHaveBeenCalledWith('ea-1');
});

test('battery picker omits last assessed for unfinished and abandoned runs', async () => {
  repositories.batteryRuns.getRunsForUser.mockResolvedValue([
    unfinished({ status: 'in_progress' }), unfinished({ status: 'abandoned' }),
  ]);
  const screen = await ready(renderSelect());
  expect(screen.getByText('Grade 2 · isiXhosa')).toBeTruthy();
  expect(screen.queryByText(/last assessed/)).toBeNull();
});

test('quick assessment mode does not read or display last battery runs', async () => {
  const screen = renderSelect({ testCode: 'letter_sounds' });
  await waitFor(() => expect(repositories.assessments.getQuestionResults).toHaveBeenCalled());
  expect(repositories.batteryRuns.getRunsForUser).not.toHaveBeenCalled();
  expect(screen.queryByText(/last assessed/)).toBeNull();
});

test.each([
  [0, 'Nothing was saved in it yet.'],
  [1, "Its 1 saved Question stays in Lwazi's history."],
  [2, "Its 2 saved Questions stay in Lwazi's history."],
])('unfinished sheet warning agrees with %s saved Questions and Cancel is centred ink', async (count, copy) => {
  repositories.batteryRuns.getUnfinishedRunsForUser.mockResolvedValue([unfinished({ question_count: count })]);
  const screen = await ready(renderSelect());
  fireEvent.press(screen.getByRole('button', { name: 'Select Lwazi Mbeki for assessment' }));
  expect(await screen.findByText(`Starting new closes the old assessment as abandoned. ${copy}`)).toBeTruthy();
  expect(StyleSheet.flatten(screen.getByText('Cancel').props.style).color).toBe(colors.text);
  expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Cancel' }).props.style).alignSelf).not.toBe('flex-start');
});
