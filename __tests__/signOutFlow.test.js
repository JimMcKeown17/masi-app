import React from 'react';
import { ActivityIndicator } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Button, PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSignOutFlow } from '../src/hooks/useSignOutFlow';
import SignOutSheets from '../src/components/profile/SignOutSheets';
import { HandleDisposeFailedError, StaleActorError } from '../src/session/staleActor';

const CLOCK_TITLE = "You're still clocked in.";
const UNSENT_SUBTITLE = "If you sign out, they'll upload next time you sign in on this phone.";
const UNKNOWN_TITLE = "Couldn't check for work that hasn't uploaded.";
const UNKNOWN_SUBTITLE = 'If you sign out, anything not uploaded stays on this phone until you sign in here again.';

const Providers = ({ children }) => (
  <SafeAreaProvider initialMetrics={{
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 0, left: 0, right: 0, bottom: 0 },
  }}>
    <PaperProvider>{children}</PaperProvider>
  </SafeAreaProvider>
);

function Harness({ deps }) {
  const flow = useSignOutFlow(deps);
  return <>
    <Button onPress={flow.start}>Sign Out</Button>
    <SignOutSheets {...flow} isOnline={deps.isOnline} />
  </>;
}

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

const setup = ({ clockedIn = false, unsent = 0, online = true, clockOutOk = true, uploadClears = false } = {}) => {
  const state = { unsent };
  const deps = {
    signOut: jest.fn(async () => ({ error: null })),
    countUnsent: jest.fn(async () => ({ total: state.unsent, byTable: {} })),
    isClockedIn: clockedIn,
    clockOut: jest.fn(async () => { if (clockOutOk) state.unsent += 1; return clockOutOk; }),
    isOnline: online,
    syncNow: jest.fn(async () => { if (uploadClears) state.unsent = 0; return { success: true }; }),
  };
  const utils = render(<Providers><Harness deps={deps} /></Providers>);
  return { ...utils, deps, state };
};

const press = async (screen, label) => {
  await act(async () => { fireEvent.press(screen.getByText(label)); });
};

const expectNoSheet = (screen) => {
  expect(screen.queryByText(CLOCK_TITLE)).toBeNull();
  expect(screen.queryByText(UNSENT_SUBTITLE)).toBeNull();
  expect(screen.queryByText(UNKNOWN_TITLE)).toBeNull();
};

describe('Profile sign-out questions (T13)', () => {
  test('1: asks about the open shift first, then counts the work including clock-out', async () => {
    const screen = setup({ clockedIn: true, unsent: 2 });
    await press(screen, 'Sign Out');
    expect(screen.getByText(CLOCK_TITLE)).toBeTruthy();
    expect(screen.deps.countUnsent).not.toHaveBeenCalled();

    await press(screen, 'Clock out now');

    expect(screen.deps.clockOut).toHaveBeenCalledTimes(1);
    expect(screen.getByText("3 items haven't uploaded yet.")).toBeTruthy();
    expect(screen.getByText(UNSENT_SUBTITLE)).toBeTruthy();
    expect(screen.queryByText(CLOCK_TITLE)).toBeNull();
    expect(screen.deps.signOut).not.toHaveBeenCalled();
  });

  test('2: signs out immediately when there is no open shift or unsent work', async () => {
    const screen = setup();
    await press(screen, 'Sign Out');
    expect(screen.deps.signOut).toHaveBeenCalledTimes(1);
    expectNoSheet(screen);
  });

  test('3: can stay clocked in and sign out when there is no unsent work', async () => {
    const screen = setup({ clockedIn: true });
    await press(screen, 'Sign Out');
    await press(screen, 'Stay clocked in and sign out');
    expect(screen.deps.signOut).toHaveBeenCalledTimes(1);
    expect(screen.deps.clockOut).not.toHaveBeenCalled();
  });

  test('an unsent check prevents a later clock-out from racing its zero-count sign-out', async () => {
    const count = deferred();
    const clockOut = deferred();
    const screen = setup({ clockedIn: true });
    let clockOutPending = false;
    const signedOutDuringClockOut = jest.fn();
    screen.deps.countUnsent.mockReturnValue(count.promise);
    screen.deps.clockOut.mockImplementation(async () => {
      clockOutPending = true;
      await clockOut.promise;
      clockOutPending = false;
      return true;
    });
    screen.deps.signOut.mockImplementation(async () => {
      if (clockOutPending) signedOutDuringClockOut();
      return { error: null };
    });
    try {
      await press(screen, 'Sign Out');
      await press(screen, 'Stay clocked in and sign out');
      const clockOutDisabled = screen.getByRole('button', { name: 'Clock out now' })
        .props.accessibilityState.disabled;
      await press(screen, 'Clock out now');
      await act(async () => { count.resolve({ total: 0, byTable: {} }); });

      expect(signedOutDuringClockOut).not.toHaveBeenCalled();
      expect(clockOutDisabled).toBe(true);
      expect(screen.deps.clockOut).not.toHaveBeenCalled();
      expect(screen.deps.signOut).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => { clockOut.resolve(); });
    }
  });

  test('Cancel stays available during a held unsent check and ignores its later zero result', async () => {
    const count = deferred();
    const screen = setup({ clockedIn: true });
    screen.deps.countUnsent.mockReturnValue(count.promise);
    await press(screen, 'Sign Out');
    await press(screen, 'Stay clocked in and sign out');
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeDisabled();
    await press(screen, 'Cancel');
    await act(async () => { count.resolve({ total: 0, byTable: {} }); });

    expect(screen.deps.signOut).not.toHaveBeenCalled();
    expectNoSheet(screen);
  });

  test('a repeated Sign Out tap during the initial count does not start another check', async () => {
    const count = deferred();
    const screen = setup();
    screen.deps.countUnsent.mockReturnValue(count.promise);
    await press(screen, 'Sign Out');
    await press(screen, 'Sign Out');
    await act(async () => { count.resolve({ total: 1, byTable: {} }); });

    expect(screen.deps.countUnsent).toHaveBeenCalledTimes(1);
    expect(screen.getByText("1 item hasn't uploaded yet.")).toBeTruthy();
    expect(screen.deps.signOut).not.toHaveBeenCalled();
  });

  test('4: an incomplete clock-out leaves the question open with its error', async () => {
    const screen = setup({ clockedIn: true, clockOutOk: false });
    await press(screen, 'Sign Out');
    await press(screen, 'Clock out now');
    expect(screen.getByText(CLOCK_TITLE)).toBeTruthy();
    expect(screen.getByText("Couldn't clock out. Try again, or choose another option.")).toBeTruthy();
    expect(screen.deps.countUnsent).not.toHaveBeenCalled();
    expect(screen.deps.signOut).not.toHaveBeenCalled();
  });

  test('5: offline work uses singular copy and disables upload but permits sign-out', async () => {
    const screen = setup({ unsent: 1, online: false });
    await press(screen, 'Sign Out');
    expect(screen.getByText("1 item hasn't uploaded yet.")).toBeTruthy();
    expect(screen.getByText(UNSENT_SUBTITLE)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'No connection' })).toBeDisabled();
    await press(screen, 'No connection');
    expect(screen.deps.syncNow).not.toHaveBeenCalled();
    await press(screen, 'Sign out anyway');
    expect(screen.deps.signOut).toHaveBeenCalledTimes(1);
  });

  test('6: a successful upload re-counts and signs out without another tap', async () => {
    const screen = setup({ unsent: 2, uploadClears: true });
    await press(screen, 'Sign Out');
    await press(screen, 'Try uploading now');
    expect(screen.deps.syncNow).toHaveBeenCalledWith({ force: true });
    expect(screen.deps.countUnsent).toHaveBeenCalledTimes(2);
    expect(screen.deps.signOut).toHaveBeenCalledTimes(1);
    expectNoSheet(screen);
  });

  test('7: work left after an upload refreshes the question without signing out', async () => {
    const screen = setup({ unsent: 2 });
    screen.deps.syncNow.mockImplementation(async () => { screen.state.unsent = 1; });
    await press(screen, 'Sign Out');
    await press(screen, 'Try uploading now');
    expect(screen.getByText("1 item hasn't uploaded yet.")).toBeTruthy();
    expect(screen.deps.signOut).not.toHaveBeenCalled();
  });

  test.each([true, false])('8: Cancel closes the question (clockedIn=%s)', async (clockedIn) => {
    const screen = setup({ clockedIn, unsent: 2 });
    await press(screen, 'Sign Out');
    await press(screen, 'Cancel');
    expectNoSheet(screen);
    expect(screen.deps.signOut).not.toHaveBeenCalled();
  });

  test('9: a pending upload shows its progress and refuses repeated taps', async () => {
    const upload = deferred();
    const screen = setup({ unsent: 2 });
    screen.deps.syncNow.mockReturnValue(upload.promise);
    await press(screen, 'Sign Out');
    await press(screen, 'Try uploading now');
    expect(screen.getByRole('button', { name: 'Uploading…' })).toBeDisabled();
    expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    await press(screen, 'Uploading…');
    expect(screen.deps.syncNow).toHaveBeenCalledTimes(1);
    await act(async () => { upload.resolve(); });
  });

  test('10: cancelling an upload prevents its eventual success from signing out', async () => {
    const upload = deferred();
    const screen = setup({ unsent: 2, uploadClears: true });
    screen.deps.syncNow.mockImplementation(async () => { await upload.promise; screen.state.unsent = 0; });
    await press(screen, 'Sign Out');
    await press(screen, 'Try uploading now');
    await press(screen, 'Cancel');
    await act(async () => { upload.resolve(); });
    expect(screen.deps.signOut).not.toHaveBeenCalled();
    expect(screen.deps.countUnsent).toHaveBeenCalledTimes(1);
    expectNoSheet(screen);
  });

  test('11: dismissing during clock-out prevents its result from advancing the questions', async () => {
    const clockOut = deferred();
    const screen = setup({ clockedIn: true });
    screen.deps.clockOut.mockReturnValue(clockOut.promise);
    await press(screen, 'Sign Out');
    await press(screen, 'Clock out now');
    expect(screen.getByText('Clocking out…')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Dismiss clock-out question'));
    await act(async () => { clockOut.resolve(true); });
    expect(screen.deps.countUnsent).not.toHaveBeenCalled();
    expect(screen.deps.signOut).not.toHaveBeenCalled();
    expectNoSheet(screen);
  });

  test('12: a new attempt works after Cancel while the old upload is still running', async () => {
    const upload = deferred();
    const screen = setup({ unsent: 2 });
    screen.deps.syncNow.mockReturnValue(upload.promise);
    await press(screen, 'Sign Out');
    await press(screen, 'Try uploading now');
    await press(screen, 'Cancel');
    screen.state.unsent = 0;
    await press(screen, 'Sign Out');
    expect(screen.deps.signOut).toHaveBeenCalledTimes(1);
    await act(async () => { upload.resolve(); });
    expect(screen.deps.signOut).toHaveBeenCalledTimes(1);
    expectNoSheet(screen);
  });

  test('13: an unreadable count asks explicitly and allows sign-out anyway', async () => {
    const screen = setup();
    screen.deps.countUnsent.mockRejectedValue(new HandleDisposeFailedError());
    await press(screen, 'Sign Out');
    expect(screen.getByText(UNKNOWN_TITLE)).toBeTruthy();
    expect(screen.getByText(UNKNOWN_SUBTITLE)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.deps.signOut).not.toHaveBeenCalled();
    await press(screen, 'Sign out anyway');
    expect(screen.deps.signOut).toHaveBeenCalledTimes(1);
  });

  test('13: Try again can recover the count and sign out with no work remaining', async () => {
    const screen = setup();
    screen.deps.countUnsent.mockRejectedValueOnce(new HandleDisposeFailedError());
    await press(screen, 'Sign Out');
    await press(screen, 'Try again');
    expect(screen.deps.countUnsent).toHaveBeenCalledTimes(2);
    expect(screen.deps.signOut).toHaveBeenCalledTimes(1);
    expectNoSheet(screen);
  });

  test('14: a stale-actor count failure neither opens a question nor signs out', async () => {
    const screen = setup();
    screen.deps.countUnsent.mockRejectedValue(new StaleActorError());
    await press(screen, 'Sign Out');
    expectNoSheet(screen);
    expect(screen.deps.signOut).not.toHaveBeenCalled();
  });

  test('unmounting while uploading prevents the later result from signing out', async () => {
    const upload = deferred();
    const screen = setup({ unsent: 2 });
    screen.deps.syncNow.mockImplementation(async () => { await upload.promise; screen.state.unsent = 0; });
    await press(screen, 'Sign Out');
    await press(screen, 'Try uploading now');
    screen.unmount();
    await act(async () => { upload.resolve(); });
    expect(screen.deps.signOut).not.toHaveBeenCalled();
    expect(screen.deps.countUnsent).toHaveBeenCalledTimes(1);
  });

  test('dismissal while rechecking an unreadable count ignores its late zero result', async () => {
    const count = deferred();
    const screen = setup();
    screen.deps.countUnsent
      .mockRejectedValueOnce(new HandleDisposeFailedError())
      .mockReturnValueOnce(count.promise);
    await press(screen, 'Sign Out');
    await press(screen, 'Try again');
    fireEvent.press(screen.getByLabelText('Dismiss unsent work question'));
    await act(async () => { count.resolve({ total: 0, byTable: {} }); });
    expectNoSheet(screen);
    expect(screen.deps.signOut).not.toHaveBeenCalled();
  });
});
