import React from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { NavigationContext, usePreventRemoveContext } from '@react-navigation/native';
import { AllProviders } from '../test-support/renderWithProviders';
import { renderInTestStack } from '../test-support/renderInTestStack';
import { AuthContext } from '../src/context/AuthContext';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { CURRENT_ITEM_SETS } from '../src/assessment-questions';
import StandaloneTestScreen from '../src/screens/assessments/StandaloneTestScreen';

let mockQuestionProps;
let mockQuestionName;
const mockResult = {
  question_code: 'letter_sounds', question_version: '2026.1',
  item_set_id: 'letter_sounds@2026.1.xh', language: 'xh',
  stopped_reason: 'stop_rule', duration_ms: 20000,
  items: [{ position: 0, item_key: 'a', prompt: 'a', is_correct: true, metadata: { reached: true } }],
  derived: { total_correct: 1, total_attempted: 1, percent: 100, last_attempted_position: 0 },
};
jest.mock('../src/assessment-questions', () => {
  const actual = jest.requireActual('../src/assessment-questions');
  const { Pressable, Text } = require('react-native');
  const question = name => props => {
    mockQuestionName = name;
    mockQuestionProps = props;
    return <Pressable accessibilityRole="button" onPress={() => props.onComplete(mockResult)}>
      <Text>Finish test</Text>
    </Pressable>;
  };
  return {
    ...actual,
    LetterSoundsQuestion: question('LetterSoundsQuestion'),
    ReadWordsQuestion: question('ReadWordsQuestion'),
  };
});
const mockOffline = { triggerBackgroundSync: jest.fn() };
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => mockOffline }));

const user = { id: '11111111-1111-4111-8111-111111111111' };
const child = { id: '22222222-2222-4222-8222-222222222222', first_name: 'Amahle', last_name: 'Dlamini' };
const params = { testCode: 'letter_sounds', child, languageCode: 'xh' };
const saveQuestionResult = jest.fn();
const repositories = { assessments: { saveQuestionResult } };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const makeNavigation = () => {
  const handlers = {};
  return {
    handlers,
    addListener: jest.fn((name, handler) => { handlers[name] = handler; return jest.fn(); }),
    replace: jest.fn(), dispatch: jest.fn(), goBack: jest.fn(),
  };
};
const withData = children => (
  <AuthContext.Provider value={{ user }}>
    <SignedInEAContext.Provider value={{ repositories }}>{children}</SignedInEAContext.Provider>
  </AuthContext.Provider>
);
const renderHost = (navigation = makeNavigation(), routeParams = params) => {
  const wrapper = ({ children }) => <AllProviders>{withData(children)}</AllProviders>;
  function Host(props) {
    return <NavigationContext.Provider value={navigation}>
      <StandaloneTestScreen {...props} navigation={navigation} />
    </NavigationContext.Provider>;
  }
  return {
    navigation,
    ...renderInTestStack({ routes: [{ name: 'StandaloneTest', component: Host, params: routeParams }], wrapper }),
  };
};
const beforeRemove = navigation => {
  const event = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK', source: 'test-route' } } };
  act(() => { navigation.handlers.beforeRemove(event); });
  return event;
};
beforeEach(() => {
  jest.clearAllMocks();
  mockQuestionProps = null;
  mockQuestionName = null;
  saveQuestionResult.mockReset().mockResolvedValue({ id: 'saved' });
});

test.each([
  ['letter_sounds', 'en', 'LetterSoundsQuestion'],
  ['letter_sounds', 'xh', 'LetterSoundsQuestion'],
  ['word_reading', 'en', 'ReadWordsQuestion'],
  ['word_reading', 'xh', 'ReadWordsQuestion'],
])('hosts %s in %s using its package item set', (testCode, languageCode, component) => {
  renderHost(makeNavigation(), { ...params, testCode, languageCode });
  expect(mockQuestionName).toBe(component);
  expect(mockQuestionProps).toMatchObject({
    itemSet: CURRENT_ITEM_SETS[testCode][languageCode], durationSec: 60,
    language: languageCode, childName: 'Amahle Dlamini', allowSkip: false,
  });
  if (testCode === 'word_reading') expect(mockQuestionProps.captureMode).toBe('sequential');
});

test('double completion before save resolves saves and navigates once; the guard lasts until commit', async () => {
  const pending = deferred();
  saveQuestionResult.mockReturnValue(pending.promise);
  const screen = renderHost();
  const complete = mockQuestionProps.onComplete;
  act(() => { complete(mockResult); complete(mockResult); });
  expect(saveQuestionResult).toHaveBeenCalledTimes(1);
  expect(saveQuestionResult).toHaveBeenCalledWith({
    assessmentId: expect.any(String), result: mockResult,
    childId: child.id, userId: user.id, captureMode: 'sequential',
  });
  const event = beforeRemove(screen.navigation);
  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  expect(screen.getByText("This result isn't saved yet.")).toBeTruthy();
  expect(screen.navigation.replace).not.toHaveBeenCalled();
  expect(screen.navigation.dispatch).not.toHaveBeenCalled();
  expect(mockOffline.triggerBackgroundSync).not.toHaveBeenCalled();

  await act(async () => { pending.resolve({ id: 'saved' }); });
  expect(screen.navigation.replace).toHaveBeenCalledTimes(1);
  expect(screen.navigation.replace).toHaveBeenCalledWith('AssessmentResults', {
    ...params, assessmentId: saveQuestionResult.mock.calls[0][0].assessmentId,
  });
  expect(mockOffline.triggerBackgroundSync).toHaveBeenCalledTimes(1);
  expect(screen.navigation.replace.mock.invocationCallOrder[0])
    .toBeLessThan(mockOffline.triggerBackgroundSync.mock.invocationCallOrder[0]);
  expect(beforeRemove(screen.navigation).preventDefault).not.toHaveBeenCalled();
  act(() => { complete(mockResult); });
  expect(saveQuestionResult).toHaveBeenCalledTimes(1);
});

test('a failed save keeps its result and id; rapid retry taps start only one more save', async () => {
  const pending = deferred();
  saveQuestionResult.mockRejectedValueOnce(new Error('SQLite busy')).mockReturnValueOnce(pending.promise);
  const screen = renderHost();
  fireEvent.press(screen.getByText('Finish test'));
  expect(await screen.findByText("Couldn't save — try again")).toBeTruthy();
  const original = saveQuestionResult.mock.calls[0][0];
  const retry = screen.getByRole('button', { name: 'Try again' });
  act(() => { fireEvent.press(retry); fireEvent.press(retry); });
  expect(saveQuestionResult).toHaveBeenCalledTimes(2);
  expect(saveQuestionResult.mock.calls[1][0]).toEqual(original);
  expect(saveQuestionResult.mock.calls[1][0].result).toBe(original.result);
  expect(screen.navigation.replace).not.toHaveBeenCalled();
  expect(beforeRemove(screen.navigation).preventDefault).toHaveBeenCalledTimes(1);
  await act(async () => { pending.resolve({ id: 'saved' }); });
  expect(screen.navigation.replace).toHaveBeenCalledTimes(1);
});

test('failed-save leave guard stays active until Discard dispatches the original action', async () => {
  saveQuestionResult.mockRejectedValueOnce(new Error('disk full'));
  const screen = renderHost();
  fireEvent.press(screen.getByText('Finish test'));
  await screen.findByText("Couldn't save — try again");
  fireEvent.press(screen.getByLabelText('Dismiss save error'));
  const event = beforeRemove(screen.navigation);
  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  expect(screen.getByText("This result isn't saved yet.")).toBeTruthy();
  expect(screen.navigation.replace).not.toHaveBeenCalled();
  expect(screen.navigation.dispatch).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Discard' }));
  expect(screen.navigation.dispatch).toHaveBeenCalledTimes(1);
  expect(screen.navigation.dispatch).toHaveBeenCalledWith(event.data.action);
  expect(screen.navigation.goBack).not.toHaveBeenCalled();
  expect(beforeRemove(screen.navigation).preventDefault).not.toHaveBeenCalled();
  expect(saveQuestionResult).toHaveBeenCalledTimes(1);
});

test('a save failure while confirming leave keeps one sheet open and offers retry after Keep result', async () => {
  const pending = deferred();
  saveQuestionResult.mockReturnValue(pending.promise);
  const screen = renderHost();
  fireEvent.press(screen.getByText('Finish test'));
  beforeRemove(screen.navigation);
  await act(async () => { pending.reject(new Error('disk full')); });
  expect(screen.getByText("This result isn't saved yet.")).toBeTruthy();
  expect(screen.queryByText("Couldn't save — try again")).toBeNull();
  expect(screen.navigation.dispatch).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Keep result' }));
  expect(await screen.findByText("Couldn't save — try again")).toBeTruthy();
});

test('Discard before completion shows End the test? and leaves without saving', () => {
  const screen = renderHost();
  const event = beforeRemove(screen.navigation);
  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  expect(screen.getByText('End the test?')).toBeTruthy();
  expect(screen.navigation.dispatch).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Discard' }));
  expect(screen.navigation.dispatch).toHaveBeenCalledWith(event.data.action);
  expect(saveQuestionResult).not.toHaveBeenCalled();
});

test('cancelling discard keeps the leave guard active', () => {
  const screen = renderHost();
  beforeRemove(screen.navigation);
  fireEvent.press(screen.getByRole('button', { name: 'Keep testing' }));
  expect(screen.navigation.dispatch).not.toHaveBeenCalled();
  expect(beforeRemove(screen.navigation).preventDefault).toHaveBeenCalledTimes(1);
});

test('discarding an in-flight save prevents a late completion from navigating to results', async () => {
  const pending = deferred();
  saveQuestionResult.mockReturnValue(pending.promise);
  const screen = renderHost();
  fireEvent.press(screen.getByText('Finish test'));
  const event = beforeRemove(screen.navigation);
  fireEvent.press(screen.getByRole('button', { name: 'Discard' }));
  expect(screen.navigation.dispatch).toHaveBeenCalledWith(event.data.action);
  await act(async () => { pending.resolve({ id: 'saved' }); });
  expect(screen.navigation.replace).not.toHaveBeenCalled();
});

test('a new screen instance gets a new assessment id', async () => {
  const first = renderHost();
  fireEvent.press(first.getByText('Finish test'));
  await waitFor(() => expect(first.navigation.replace).toHaveBeenCalled());
  const firstId = saveQuestionResult.mock.calls[0][0].assessmentId;
  first.unmount();
  const second = renderHost();
  fireEvent.press(second.getByText('Finish test'));
  await waitFor(() => expect(second.navigation.replace).toHaveBeenCalled());
  expect(saveQuestionResult.mock.calls[1][0].assessmentId).not.toBe(firstId);
});

test.each([null, 'zu', 'af'])('a missing item set for %p renders an error and never substitutes English', languageCode => {
  const screen = renderHost(makeNavigation(), { ...params, languageCode });
  expect(screen.getByText('This test has no card for this language yet.')).toBeTruthy();
  expect(mockQuestionProps).toBeNull();
  expect(saveQuestionResult).not.toHaveBeenCalled();
});

test('the real navigation stack blocks back during save and replaces the route only after commit', async () => {
  const pending = deferred();
  saveQuestionResult.mockReturnValue(pending.promise);
  const wrapper = ({ children }) => <AllProviders>{withData(children)}</AllProviders>;
  const screen = renderInTestStack({
    routes: [
      { name: 'Entry', component: EmptyScreen },
      { name: 'StandaloneTest', component: StandaloneTestScreen, params },
      { name: 'AssessmentResults', component: EmptyScreen },
    ],
    initialIndex: 1, wrapper,
  });
  fireEvent.press(screen.getByText('Finish test'));
  act(() => { screen.navigationRef.goBack(); });
  expect(screen.routeNames()).toEqual(['Entry', 'StandaloneTest']);
  expect(screen.getByText("This result isn't saved yet.")).toBeTruthy();
  await act(async () => { pending.resolve({ id: 'saved' }); });
  expect(screen.routeNames()).toEqual(['Entry', 'AssessmentResults']);
});

test('native dismissal stays prevented from test start through save failure and releases only after a successful retry', async () => {
  const firstSave = deferred();
  const retrySave = deferred();
  saveQuestionResult.mockReturnValueOnce(firstSave.promise).mockReturnValueOnce(retrySave.promise);
  let nativeGuards;
  function ObservedHost(props) {
    nativeGuards = usePreventRemoveContext().preventedRoutes;
    return <StandaloneTestScreen {...props} />;
  }
  function ObservedResults() {
    nativeGuards = usePreventRemoveContext().preventedRoutes;
    return null;
  }
  const wrapper = ({ children }) => <AllProviders>{withData(children)}</AllProviders>;
  const screen = renderInTestStack({
    routes: [
      { name: 'Entry', component: EmptyScreen },
      { name: 'StandaloneTest', component: ObservedHost, params },
      { name: 'AssessmentResults', component: ObservedResults },
    ],
    initialIndex: 1, wrapper,
  });
  const routeKey = screen.navigationRef.getRootState().routes[1].key;
  expect(nativeGuards[routeKey]?.preventRemove).toBe(true);

  fireEvent.press(screen.getByText('Finish test'));
  expect(nativeGuards[routeKey]?.preventRemove).toBe(true);
  await act(async () => { firstSave.reject(new Error('disk full')); });
  expect(nativeGuards[routeKey]?.preventRemove).toBe(true);
  act(() => { screen.navigationRef.goBack(); });
  expect(screen.routeNames()).toEqual(['Entry', 'StandaloneTest']);
  expect(screen.getByText("This result isn't saved yet.")).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Keep result' }));
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(nativeGuards[routeKey]?.preventRemove).toBe(true);
  expect(saveQuestionResult).toHaveBeenCalledTimes(2);

  await act(async () => { retrySave.resolve({ id: 'saved' }); });
  expect(screen.routeNames()).toEqual(['Entry', 'AssessmentResults']);
  expect(nativeGuards[routeKey]).toBeUndefined();
  expect(mockOffline.triggerBackgroundSync).toHaveBeenCalledTimes(1);
});

function EmptyScreen() { return null; }
