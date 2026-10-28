import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { NavigationContext, usePreventRemoveContext } from '@react-navigation/native';
import { AllProviders } from '../test-support/renderWithProviders';
import { renderInTestStack } from '../test-support/renderInTestStack';
import { AuthContext } from '../src/context/AuthContext';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { CURRENT_ITEM_SETS, SHARED_READING_SETS, sharedInstructionsFor, tokens } from '../src/assessment-questions';
import StandaloneTestScreen from '../src/screens/assessments/StandaloneTestScreen';

let mockQuestionProps;
let mockQuestionName;
let mockUseRealQuestion = false;
const mockResult = {
  question_code: 'letter_sounds', question_version: '2026.1',
  item_set_id: 'letter_sounds@2026.1.xh', language: 'xh',
  stopped_reason: 'stop_rule', duration_ms: 20000,
  items: [{ position: 0, item_key: 'a', prompt: 'a', is_correct: true, metadata: { reached: true } }],
  derived: { total_correct: 1, total_attempted: 1, percent: 100, last_attempted_position: 0 },
};
jest.mock('../src/assessment-questions', () => {
  const actual = jest.requireActual('../src/assessment-questions');
  const { Pressable, Text, View } = require('react-native');
  const question = name => props => {
    mockQuestionName = name;
    mockQuestionProps = props;
    if (mockUseRealQuestion) {
      const Question = actual[name];
      return <Question {...props} />;
    }
    return <View>
      <Pressable accessibilityRole="button" onPress={() => props.onStart?.()}>
        <Text>Start test</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => { props.onStart?.(); props.onComplete(mockResult); }}>
        <Text>Finish test</Text>
      </Pressable>
    </View>;
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
  mockUseRealQuestion = false;
  saveQuestionResult.mockReset().mockResolvedValue({ id: 'saved' });
});

test.each([
  ['letter_sounds', 'en', 'LetterSoundsQuestion'],
  ['letter_sounds', 'xh', 'LetterSoundsQuestion'],
  ['letter_sounds', 'af', 'LetterSoundsQuestion'],
  ['letter_sounds', 'zu', 'LetterSoundsQuestion'],
  ['word_reading', 'en', 'ReadWordsQuestion'],
  ['word_reading', 'xh', 'ReadWordsQuestion'],
  ['word_reading', 'af', 'ReadWordsQuestion'],
  ['word_reading', 'zu', 'ReadWordsQuestion'],
])('hosts %s in %s using its package item set', (testCode, languageCode, component) => {
  renderHost(makeNavigation(), { ...params, testCode, languageCode });
  expect(mockQuestionName).toBe(component);
  expect(mockQuestionProps).toMatchObject({
    itemSet: CURRENT_ITEM_SETS[testCode][languageCode], durationSec: 60,
    instructions: sharedInstructionsFor(testCode, languageCode),
    language: languageCode, childName: 'Amahle Dlamini', allowSkip: false, endNoun: 'test',
  });
  expect(mockQuestionProps).not.toHaveProperty('captureMode');
});

test('shows the standalone header and passes the registry instructions', () => {
  const asanda = { ...child, first_name: 'Asanda', last_name: 'Moose' };
  const screen = renderHost(makeNavigation(), { ...params, child: asanda });

  expect(screen.getByText('Letter Sounds')).toBeTruthy();
  expect(screen.getByText('Asanda Moose · isiXhosa')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Close test' })).toBeTruthy();
  expect(mockQuestionProps.instructions).toBe(sharedInstructionsFor('letter_sounds', 'xh'));
});

test('shows Afrikaans in the standalone header', () => {
  expect(renderHost(makeNavigation(), { ...params, languageCode: 'af' }).getByText('Amahle Dlamini · Afrikaans')).toBeTruthy();
});

test('Close before Start leaves immediately without an end sheet', () => {
  const screen = renderHost();

  fireEvent.press(screen.getByRole('button', { name: 'Close test' }));

  expect(screen.navigation.goBack).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Leave without saving?')).toBeNull();
});

test('Close after Start is guarded by the leave sheet', () => {
  const wrapper = ({ children }) => <AllProviders>{withData(children)}</AllProviders>;
  const screen = renderInTestStack({
    routes: [
      { name: 'Entry', component: EmptyScreen },
      { name: 'StandaloneTest', component: StandaloneTestScreen, params },
    ],
    initialIndex: 1, wrapper,
  });
  fireEvent.press(screen.getByText('Start test'));

  fireEvent.press(screen.getByRole('button', { name: 'Close test' }));

  expect(screen.routeNames()).toEqual(['Entry', 'StandaloneTest']);
  expect(screen.getByText('Leave without saving?')).toBeTruthy();
});

test('double completion before save resolves saves and navigates once; the guard lasts until commit', async () => {
  const pending = deferred();
  saveQuestionResult.mockReturnValue(pending.promise);
  const screen = renderHost();
  const complete = mockQuestionProps.onComplete;
  act(() => { mockQuestionProps.onStart(); complete(mockResult); complete(mockResult); });
  expect(saveQuestionResult).toHaveBeenCalledTimes(1);
  expect(saveQuestionResult).toHaveBeenCalledWith({
    assessmentId: expect.any(String), result: mockResult,
    childId: child.id, userId: user.id, captureMode: 'sequential',
  });
  const event = beforeRemove(screen.navigation);
  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('leave-confirmation') === null).toBe(true);
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
  fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
  const event = beforeRemove(screen.navigation);
  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Leave without saving?')).toBeTruthy();
  expect(screen.navigation.replace).not.toHaveBeenCalled();
  expect(screen.navigation.dispatch).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Discard result' }));
  expect(screen.navigation.dispatch).toHaveBeenCalledTimes(1);
  expect(screen.navigation.dispatch).toHaveBeenCalledWith(event.data.action);
  expect(screen.navigation.goBack).not.toHaveBeenCalled();
  expect(beforeRemove(screen.navigation).preventDefault).not.toHaveBeenCalled();
  expect(saveQuestionResult).toHaveBeenCalledTimes(1);
});

test('a save failure after Back during save offers retry; Keep result restores that error', async () => {
  const pending = deferred();
  saveQuestionResult.mockReturnValue(pending.promise);
  const screen = renderHost();
  fireEvent.press(screen.getByText('Finish test'));
  beforeRemove(screen.navigation);
  expect(screen.queryByTestId('leave-confirmation') === null).toBe(true);
  await act(async () => { pending.reject(new Error('disk full')); });
  expect(screen.getByTestId('save-error')).toBeTruthy();
  expect(screen.UNSAFE_queryAllByType(Modal).length).toBe(0);
  expect(screen.queryByTestId('leave-confirmation') === null).toBe(true);
  expect(screen.navigation.dispatch).not.toHaveBeenCalled();
  beforeRemove(screen.navigation);
  expect(screen.getByText('Leave without saving?')).toBeTruthy();
  expect(screen.queryByTestId('save-error')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Keep result' }));
  expect(await screen.findByText("Couldn't save — try again")).toBeTruthy();
});

test('Discard answers before completion shows Leave without saving? and leaves without saving', () => {
  const screen = renderHost();
  act(() => { mockQuestionProps.onStart(); });
  const event = beforeRemove(screen.navigation);
  expect(event.preventDefault).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Leave without saving?')).toBeTruthy();
  expect(screen.navigation.dispatch).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Discard answers' }));
  expect(screen.navigation.dispatch).toHaveBeenCalledWith(event.data.action);
  expect(saveQuestionResult).not.toHaveBeenCalled();
});

test('cancelling discard keeps the leave guard active', () => {
  const screen = renderHost();
  act(() => { mockQuestionProps.onStart(); });
  beforeRemove(screen.navigation);
  fireEvent.press(screen.getByRole('button', { name: 'Keep marking' }));
  expect(screen.navigation.dispatch).not.toHaveBeenCalled();
  expect(beforeRemove(screen.navigation).preventDefault).toHaveBeenCalledTimes(1);
});

test('discarding a deferred result prevents late completion from saving or navigating', async () => {
  const screen = renderHost();
  const complete = mockQuestionProps.onComplete;
  act(() => mockQuestionProps.onStart());
  const event = beforeRemove(screen.navigation);
  act(() => complete(mockResult));
  fireEvent.press(screen.getByRole('button', { name: 'Discard result' }));
  expect(screen.navigation.dispatch).toHaveBeenCalledWith(event.data.action);
  act(() => complete(mockResult));
  expect(saveQuestionResult).not.toHaveBeenCalled();
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

test.each([null, 'st'])('a missing item set for %p renders an error and never substitutes English', languageCode => {
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
  expect(screen.queryByTestId('leave-confirmation') === null).toBe(true);
  await act(async () => { pending.resolve({ id: 'saved' }); });
  expect(screen.routeNames()).toEqual(['Entry', 'AssessmentResults']);
});

test('native dismissal is free before Start, then stays prevented through save failure until retry succeeds', async () => {
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
  expect(nativeGuards[routeKey]).toBeUndefined();

  fireEvent.press(screen.getByText('Start test'));
  expect(nativeGuards[routeKey]?.preventRemove).toBe(true);
  fireEvent.press(screen.getByText('Finish test'));
  fireEvent.press(screen.getByRole('button', { name: 'Close test' }));
  act(() => screen.navigationRef.goBack());
  expect(nativeGuards[routeKey]?.preventRemove).toBe(true);
  expect(screen.queryByTestId('leave-confirmation') === null).toBe(true);
  expect(screen.routeNames()).toEqual(['Entry', 'StandaloneTest']);
  await act(async () => { firstSave.reject(new Error('disk full')); });
  expect(nativeGuards[routeKey]?.preventRemove).toBe(true);
  act(() => { screen.navigationRef.goBack(); });
  expect(screen.routeNames()).toEqual(['Entry', 'StandaloneTest']);
  expect(screen.getByText('Leave without saving?')).toBeTruthy();
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

test('the container leaves the bottom inset to the Question', () => {
  const screen = renderHost();
  const root = screen.UNSAFE_getByType(StandaloneTestScreen).findAllByType(View)[0];
  expect(StyleSheet.flatten(root.props.style).paddingBottom).toBeUndefined();
});


test.each(['letter_sounds', 'word_reading'])('the real standalone %s capture keeps the End test link and sheet', testCode => {
  mockUseRealQuestion = true;
  const screen = renderHost(makeNavigation(), { ...params, testCode });
  fireEvent.press(screen.getByText('Start'));
  fireEvent.press(screen.getByRole('button', { name: 'End test' }));
  expect(screen.getByRole('header', { name: 'End this test?' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Keep marking' })).toBeTruthy();
});


test('isiZulu Word Reading passes side B and the exact practice words', () => {
  renderHost(makeNavigation(), { ...params, testCode: 'word_reading', languageCode: 'zu' });
  expect(mockQuestionProps.instructions).toBe(sharedInstructionsFor('word_reading', 'zu'));
  expect(mockQuestionProps.instructions).toContain('Reading Card side B');
  expect(mockQuestionProps.instructions).toContain('usisi');
  expect(mockQuestionProps.instructions).toContain('icici');
});

test.each(['letter_sounds', 'word_reading'].flatMap(code =>
  ['xh', 'en', 'af', 'zu'].map(language => [code, language]),
))('real shared %s in %s renders, marks, and saves without mutating its frozen set', async (testCode, languageCode) => {
  mockUseRealQuestion = true;
  const set = SHARED_READING_SETS[testCode][languageCode];
  const before = JSON.stringify(set);
  expect(Object.isFrozen(set)).toBe(true);
  if (testCode === 'letter_sounds') {
    expect(set.rows.flat()).toHaveLength(languageCode === 'zu' ? 110 : 100);
    expect(set.rows.every(row => Object.isFrozen(row) && row.length === 10)).toBe(true);
  } else {
    expect(set.row_lengths).toEqual(Array(10).fill(languageCode === 'zu' ? 5 : 8));
    expect(set.words.every(word => Object.isFrozen(word))).toBe(true);
  }
  const screen = renderHost(makeNavigation(), { ...params, testCode, languageCode });
  expect(mockQuestionProps.itemSet).toBe(set);
  expect(screen.getByText(sharedInstructionsFor(testCode, languageCode))).toBeTruthy();
  fireEvent.press(screen.getByText('Start'));
  const pageLabel = testCode === 'word_reading' && languageCode !== 'zu'
    ? 'Card row 1 · page 1 of 10'
    : `Card rows 1–2 · page 1 of ${testCode === 'letter_sounds' && languageCode === 'zu' ? 6 : 5}`;
  expect(screen.getByLabelText(pageLabel)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Correct' }));
  fireEvent.press(screen.getByRole('button', { name: 'Incorrect' }));
  fireEvent.press(screen.getByRole('button', { name: 'Correct' }));
  fireEvent.press(screen.getByRole('button', { name: 'End test' }));
  fireEvent.press(screen.getByRole('button', { name: 'End test' }));
  await waitFor(() => expect(saveQuestionResult).toHaveBeenCalledTimes(1));
  const { result } = saveQuestionResult.mock.calls[0][0];
  expect(result).toMatchObject({
    question_code: testCode, question_version: '2026.3',
    item_set_id: `${testCode}@2026.3.${languageCode}`, language: languageCode,
    derived: { total_correct: 2, total_attempted: 3 },
  });
  expect(JSON.stringify(set)).toBe(before);
  expect(Object.isFrozen(set)).toBe(true);
});


test.each(['Close test', 'navigation Back'])(
  'real quick-test %s distinguishes saving End from discarding answers and keeps marking', leaveVia => {
    mockUseRealQuestion = true;
    const wrapper = ({ children }) => <AllProviders>{withData(children)}</AllProviders>;
    const screen = renderInTestStack({ routes: [
      { name: 'Entry', component: EmptyScreen },
      { name: 'StandaloneTest', component: StandaloneTestScreen, params },
    ], initialIndex: 1, wrapper });
    const leave = () => leaveVia === 'Close test'
      ? fireEvent.press(screen.getByRole('button', { name: 'Close test' }))
      : act(() => screen.navigationRef.goBack());
    fireEvent.press(screen.getByText('Start'));
    fireEvent.press(screen.getByRole('button', { name: 'Correct' }));
    fireEvent.press(screen.getByRole('button', { name: 'End test' }));
    const endTitle = screen.getByRole('header').props.children;
    expect(endTitle).toBe('End this test?');
    expect(screen.getByRole('button', { name: 'End test' })).toHaveStyle({ backgroundColor: tokens.color.primary });
    fireEvent.press(screen.getByRole('button', { name: 'Keep marking' }));
    leave();
    expect(screen.getByTestId('leave-confirmation')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Leave without saving?' }).props.children).not.toBe(endTitle);
    expect(screen.getByText("Amahle's answers on this test won't be saved.")).toBeTruthy();
    expect(screen.queryByText('End the test?')).toBeNull();
    expect(screen.getByRole('button', { name: 'Discard answers' })).toHaveStyle({ backgroundColor: tokens.color.primary });
    expect(screen.routeNames()).toEqual(['Entry', 'StandaloneTest']);
    fireEvent.press(screen.getByRole('button', { name: 'Keep marking' }));
    expect(screen.queryByTestId('leave-confirmation') === null).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Correct' }));
    fireEvent.press(screen.getByRole('button', { name: 'End test' }));
    expect(screen.getByText(/^2 marked\./)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Keep marking' }));
    leave();
    fireEvent.press(screen.getByRole('button', { name: 'Discard answers' }));
    expect(screen.routeNames()).toEqual(['Entry']);
    expect(saveQuestionResult).not.toHaveBeenCalled();
  },
);


test.each(['Amahle', ''])('quick-test save error can be dismissed and the unsaved result kept (%p first name)', async firstName => {
  saveQuestionResult.mockRejectedValueOnce(new Error('disk full'));
  const wrapper = ({ children }) => <AllProviders>{withData(children)}</AllProviders>;
  const screen = renderInTestStack({ routes: [
    { name: 'Entry', component: EmptyScreen },
    { name: 'StandaloneTest', component: StandaloneTestScreen, params: { ...params, child: { ...child, first_name: firstName } } },
    { name: 'AssessmentResults', component: EmptyScreen },
  ], initialIndex: 1, wrapper });
  fireEvent.press(screen.getByText('Start test'));
  fireEvent.press(screen.getByRole('button', { name: 'Close test' }));
  expect(screen.getByText(`${firstName ? `${firstName}'s answers` : 'The answers'} on this test won't be saved.`)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Keep marking' }));
  fireEvent.press(screen.getByText('Finish test'));
  await screen.findByText("Couldn't save — try again");
  expect(screen.getByTestId('save-error')).toBeTruthy();
  expect(screen.UNSAFE_queryAllByType(Modal).length).toBe(0);
  expect(screen.getByText('Your result is still here. Try saving it again.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Try again' })).toHaveStyle({ backgroundColor: tokens.color.ink });
  fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
  expect(screen.queryByTestId('save-error')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Close test' }));
  expect(screen.getByTestId('leave-confirmation')).toBeTruthy();
  expect(screen.UNSAFE_queryAllByType(Modal).length).toBe(0);
  expect(screen.getByRole('header', { name: 'Leave without saving?' })).toBeTruthy();
  expect(screen.getByText(`${firstName ? `${firstName}'s result` : 'This result'} isn't saved yet. If you leave now, it will be lost.`)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Discard result' })).toHaveStyle({ backgroundColor: tokens.color.primary });
  expect(screen.queryByTestId('save-error')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Keep result' }));
  expect(screen.getByTestId('save-error')).toBeTruthy();
  expect(screen.UNSAFE_queryAllByType(Modal).length).toBe(0);
  expect(screen.queryByTestId('leave-confirmation') === null).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.routeNames()).toEqual(['Entry', 'AssessmentResults']));
  expect(saveQuestionResult).toHaveBeenCalledTimes(2);
  expect(saveQuestionResult.mock.calls[1][0]).toEqual(saveQuestionResult.mock.calls[0][0]);
});

function renderRealQuestion() {
  mockUseRealQuestion = true;
  const wrapper = ({ children }) => <AllProviders>{withData(children)}</AllProviders>;
  return renderInTestStack({ routes: [
    { name: 'Entry', component: EmptyScreen },
    { name: 'StandaloneTest', component: StandaloneTestScreen, params },
    { name: 'AssessmentResults', component: EmptyScreen },
  ], initialIndex: 1, wrapper });
}
function endRealQuestion(screen) {
  fireEvent.press(screen.getByRole('button', { name: 'Start' }));
  fireEvent.press(screen.getByRole('button', { name: 'Correct' }));
  fireEvent.press(screen.getByRole('button', { name: 'End test' }));
  fireEvent.press(screen.getByRole('button', { name: 'End test' }));
}

describe('real quick-test save and leave handovers', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(async () => {
    await act(async () => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  test('End to immediate save failure, then leave to Keep result, uses only host sheets', async () => {
    saveQuestionResult.mockRejectedValueOnce(new Error('disk full'));
    const screen = renderRealQuestion();
    endRealQuestion(screen);
    await screen.findByTestId('save-error');
    expect(screen.UNSAFE_queryAllByType(Modal).length).toBe(0);
    fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    fireEvent.press(screen.getByRole('button', { name: 'Close test' }));
    expect(screen.getByTestId('leave-confirmation')).toBeTruthy();
    expect(screen.UNSAFE_queryAllByType(Modal).length).toBe(0);
    fireEvent.press(screen.getByRole('button', { name: 'Keep result' }));
    expect(screen.getByTestId('save-error')).toBeTruthy();
    expect(screen.UNSAFE_queryAllByType(Modal).length).toBe(0);
    expect(saveQuestionResult).toHaveBeenCalledTimes(1);
  });

  test.each(['Discard result', 'Keep result'])('timer expiry during leave waits for %s', async decision => {
    const screen = renderRealQuestion();
    fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    fireEvent.press(screen.getByRole('button', { name: 'Correct' }));
    fireEvent.press(screen.getByRole('button', { name: 'Close test' }));
    expect(screen.getByTestId('leave-confirmation')).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(61000));
    expect(screen.getByText("Amahle's result isn't saved yet. If you leave now, it will be lost.")).toBeTruthy();
    expect(saveQuestionResult).not.toHaveBeenCalled();
    expect(screen.UNSAFE_queryAllByType(Modal).length).toBe(0);
    fireEvent.press(screen.getByRole('button', { name: decision }));
    await waitFor(() => expect(screen.routeNames()).toEqual(decision === 'Discard result' ? ['Entry'] : ['Entry', 'AssessmentResults']));
    expect(saveQuestionResult).toHaveBeenCalledTimes(decision === 'Discard result' ? 0 : 1);
    if (decision === 'Keep result') expect(saveQuestionResult.mock.calls[0][0].result).toMatchObject({
      stopped_reason: 'timer', derived: { total_correct: 1, total_attempted: 1 },
      items: expect.arrayContaining([expect.objectContaining({ position: 0, is_correct: true })]),
    });
  });

  test.each(['resolve', 'reject'])('Close and navigation Back during a pending real save wait for %s', async outcome => {
    const pending = deferred();
    saveQuestionResult.mockReturnValueOnce(pending.promise);
    const screen = renderRealQuestion();
    endRealQuestion(screen);
    fireEvent.press(screen.getByRole('button', { name: 'Close test' }));
    act(() => screen.navigationRef.goBack());
    expect(screen.routeNames()).toEqual(['Entry', 'StandaloneTest']);
    expect(screen.queryByTestId('leave-confirmation') === null).toBe(true);
    await act(async () => pending[outcome](outcome === 'reject' ? new Error('disk full') : { id: 'saved' }));
    if (outcome === 'resolve') expect(screen.routeNames()).toEqual(['Entry', 'AssessmentResults']);
    else {
      expect(screen.getByTestId('save-error')).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
      fireEvent.press(screen.getByRole('button', { name: 'Close test' }));
      expect(screen.getByRole('button', { name: 'Discard result' })).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: 'Discard result' }));
      expect(screen.routeNames()).toEqual(['Entry']);
    }
    expect(saveQuestionResult).toHaveBeenCalledTimes(1);
  });
});
