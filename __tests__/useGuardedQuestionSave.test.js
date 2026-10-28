import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { usePreventRemoveContext } from '@react-navigation/native';
import { renderInTestStack } from '../test-support/renderInTestStack';
import { useGuardedQuestionSave } from '../src/hooks/useGuardedQuestionSave';

const RESULT = { question_code: 'test', items: [], derived: { total_correct: 0 } };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function EntryScreen() { return null; }

function renderHost(persist, fatalCodes = ['RUN_NOT_WRITABLE']) {
  let current;
  let nativeGuards;
  const onSaved = jest.fn();
  function Host({ navigation }) {
    current = useGuardedQuestionSave({ navigation, persist, onSaved, fatalCodes });
    nativeGuards = usePreventRemoveContext().preventedRoutes;
    return <View>
      <Pressable accessibilityRole="button" accessibilityLabel="Start" onPress={current.onStart}><Text>Start</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Complete" onPress={() => current.onComplete(RESULT)}><Text>Complete</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Retry" onPress={current.retry}><Text>Retry</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss save error" onPress={current.dismissSaveError}><Text>Dismiss save error</Text></Pressable>
      {current.saveError && <Text>Save error</Text>}
      {current.fatalError && <Text accessibilityRole="alert">Fatal: {current.fatalError}</Text>}
      {current.leaveSheet.visible && <View testID="discard-sheet">
        <Text>{current.leaveSheet.hasResult ? 'Discard result?' : 'Discard test?'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Discard" onPress={current.leaveSheet.onConfirm}><Text>Discard</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel discard" onPress={current.leaveSheet.onCancel}><Text>Cancel discard</Text></Pressable>
      </View>}
    </View>;
  }
  const screen = renderInTestStack({ routes: [
    { name: 'Entry', component: EntryScreen },
    { name: 'Question', component: Host },
  ] });
  const routeKey = screen.navigationRef.getRootState().routes[1].key;
  return { ...screen, onSaved, state: () => current, nativeGuard: () => nativeGuards[routeKey] };
}

test('a fatal save refusal exposes its code instead of a retry error and releases the leave guard', async () => {
  const persist = jest.fn().mockRejectedValue({ code: 'RUN_NOT_WRITABLE' });
  const screen = renderHost(persist);
  fireEvent.press(screen.getByRole('button', { name: 'Start' }));
  expect(screen.nativeGuard()?.preventRemove).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'Complete' }));
  expect(await screen.findByText('Fatal: RUN_NOT_WRITABLE')).toBeTruthy();
  expect(screen.state()).toMatchObject({ result: RESULT, fatalError: 'RUN_NOT_WRITABLE', saveError: false });
  expect(screen.queryByText('Save error')).toBeNull();
  expect(screen.state().leaveSheet.visible).toBe(false);
  expect(screen.nativeGuard()).toBeUndefined();
  expect(screen.onSaved).not.toHaveBeenCalled();
  act(() => { screen.navigationRef.goBack(); });
  expect(screen.routeNames()).toEqual(['Entry']);
  expect(screen.queryByTestId('discard-sheet') === null).toBe(true);
  expect(persist).toHaveBeenCalledTimes(1);
});

test('a fatal refusal after Back during save shows the fatal state once', async () => {
  const pending = deferred();
  const persist = jest.fn().mockReturnValue(pending.promise);
  const screen = renderHost(persist);
  fireEvent.press(screen.getByRole('button', { name: 'Start' }));
  fireEvent.press(screen.getByRole('button', { name: 'Complete' }));
  act(() => { screen.navigationRef.goBack(); });
  expect(screen.queryByTestId('discard-sheet') === null).toBe(true);
  expect(screen.state().leaveSheet.hasResult).toBe(true);
  expect(screen.routeNames()).toEqual(['Entry', 'Question']);

  await act(async () => { pending.reject({ code: 'RUN_NOT_WRITABLE' }); });
  expect(screen.queryByTestId('discard-sheet') === null).toBe(true);
  expect(screen.getAllByText('Fatal: RUN_NOT_WRITABLE')).toHaveLength(1);
  expect(screen.state().saveError).toBe(false);
  expect(screen.nativeGuard()).toBeUndefined();
  expect(screen.onSaved).not.toHaveBeenCalled();
  act(() => { screen.state().onComplete(RESULT); screen.state().retry(); });
  expect(persist).toHaveBeenCalledTimes(1);
  expect(screen.getAllByText('Fatal: RUN_NOT_WRITABLE')).toHaveLength(1);
  act(() => { screen.navigationRef.goBack(); });
  expect(screen.routeNames()).toEqual(['Entry']);
});

test.each(['Discard', 'Cancel discard'])('completion during a leave decision waits for %s and retains the first result', async decision => {
  const persist = jest.fn().mockResolvedValue(undefined);
  const screen = renderHost(persist);
  fireEvent.press(screen.getByText('Start'));
  // Use a callback from before the leave opened, and queue a different result.
  const complete = screen.state().onComplete;
  act(() => screen.navigationRef.goBack());
  act(() => { complete(RESULT); complete({ ...RESULT, duration_ms: 9999 }); });
  expect(screen.state().leaveSheet.hasResult).toBe(true);
  expect(persist).not.toHaveBeenCalled();
  expect(screen.nativeGuard()?.preventRemove).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: decision }));
  await act(async () => {});
  if (decision === 'Discard') {
    expect(screen.routeNames()).toEqual(['Entry']);
    act(() => complete(RESULT));
    expect(persist).not.toHaveBeenCalled();
    expect(screen.onSaved).not.toHaveBeenCalled();
  } else {
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(RESULT);
    expect(screen.onSaved).toHaveBeenCalledTimes(1);
    expect(screen.nativeGuard()).toBeUndefined();
  }
});

test.each(['resolve', 'reject'])('Back during an in-flight save holds the route without a leave decision until %s', async outcome => {
  const pending = deferred();
  const persist = jest.fn().mockReturnValue(pending.promise);
  const screen = renderHost(persist);
  fireEvent.press(screen.getByText('Start'));
  fireEvent.press(screen.getByText('Complete'));
  act(() => screen.navigationRef.goBack());
  expect(screen.routeNames()).toEqual(['Entry', 'Question']);
  expect(screen.nativeGuard()?.preventRemove).toBe(true);
  expect(screen.queryByTestId('discard-sheet') === null).toBe(true);
  await act(async () => pending[outcome](outcome === 'reject' ? new Error('disk full') : undefined));
  if (outcome === 'resolve') {
    expect(screen.onSaved).toHaveBeenCalledTimes(1);
    expect(screen.nativeGuard()).toBeUndefined();
  } else {
    expect(screen.getByText('Save error')).toBeTruthy();
    expect(screen.nativeGuard()?.preventRemove).toBe(true);
    act(() => screen.navigationRef.goBack());
    expect(screen.getByText('Discard result?')).toBeTruthy();
    fireEvent.press(screen.getByText('Discard'));
    expect(screen.routeNames()).toEqual(['Entry']);
    expect(screen.onSaved).not.toHaveBeenCalled();
  }
  expect(persist).toHaveBeenCalledTimes(1);
});

// BatteryQuestionScreen calls onStart() just before onComplete() so a timer completion is always
// guarded. A completion queued behind Discard must not re-arm the guard and strand the EA.
test('a completion queued behind Discard cannot re-arm the leave guard', () => {
  const persist = jest.fn();
  const screen = renderHost(persist);
  fireEvent.press(screen.getByRole('button', { name: 'Start' }));
  act(() => { screen.navigationRef.goBack(); });
  expect(screen.getByTestId('discard-sheet')).toBeTruthy();
  act(() => {
    // One batch, before React commits: Discard, then the queued timer completion.
    screen.state().leaveSheet.onConfirm();
    screen.state().onStart();
    screen.state().onComplete(RESULT);
  });
  expect(screen.routeNames()).toEqual(['Entry']);
  expect(persist).not.toHaveBeenCalled();
});
