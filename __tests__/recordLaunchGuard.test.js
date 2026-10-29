import React from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import LockedBottomTabBar from '../src/components/navigation/LockedBottomTabBar';
import { getActiveProgrammeGate } from '../src/services/activeProgrammeGate';
import { CLOCK_IN_STATUS, getClockInStatusForUser } from '../src/utils/timeEntryStatus';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
const mockHandleSignIn = jest.fn();
jest.mock('../src/context/TimeTrackingContext', () => ({ useTimeTracking: () => ({ handleSignIn: mockHandleSignIn }) }));
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'ea-1' } }) }));
jest.mock('../src/services/activeProgrammeGate', () => ({ getActiveProgrammeGate: jest.fn() }));
jest.mock('../src/utils/timeEntryStatus', () => ({
  CLOCK_IN_STATUS: { CLOCKED_IN: 'CLOCKED_IN', NOT_CLOCKED_IN: 'NOT_CLOCKED_IN' },
  getClockInStatusForUser: jest.fn(),
}));

const state = {
  index: 0,
  routes: ['Home', 'Children', 'Insights', 'Assessments'].map((name) => ({ key: name, name })),
};
const navigation = { navigate: jest.fn(), emit: jest.fn() };
const renderBar = () => renderWithProviders(
  <LockedBottomTabBar state={state} descriptors={{}} navigation={navigation} />
);

beforeEach(() => {
  jest.clearAllMocks();
  getActiveProgrammeGate.mockResolvedValue({ hasActiveProgramme: true });
  getClockInStatusForUser.mockResolvedValue(CLOCK_IN_STATUS.NOT_CLOCKED_IN);
});

test('recording while clocked out shows the D8 sheet and keeps the explicit continue path', async () => {
  const screen = renderBar();
  fireEvent.press(screen.getByLabelText('Record a session'));
  expect(await screen.findByText('You are not clocked in.')).toBeTruthy();
  expect(navigation.navigate).not.toHaveBeenCalledWith('SessionForm');
  fireEvent.press(screen.getByText('Record without clocking in'));
  expect(navigation.navigate).toHaveBeenCalledWith('SessionForm');
});

test('Clock in now clocks in once, reports progress, and continues straight to Record', async () => {
  let resolveClockIn;
  mockHandleSignIn.mockReturnValue(new Promise(resolve => { resolveClockIn = resolve; }));
  const screen = renderBar();
  fireEvent.press(screen.getByLabelText('Record a session'));
  await screen.findByText('You are not clocked in.');
  fireEvent.press(screen.getByRole('button', { name: 'Clock in now' }));
  expect(mockHandleSignIn).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Clocking in…' }).props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  expect(screen.getByRole('button', { name: 'Record without clocking in' }).props.accessibilityState.disabled).toBe(true);
  expect(navigation.navigate).not.toHaveBeenCalled();
  await act(async () => { resolveClockIn(true); });
  expect(navigation.navigate).toHaveBeenCalledTimes(1);
  expect(navigation.navigate).toHaveBeenCalledWith('SessionForm');
  expect(navigation.navigate).not.toHaveBeenCalledWith('TimeTracking');
  expect(screen.queryByText('You are not clocked in.')).toBeNull();
});

test('an EA who is clocked in goes straight to the form', async () => {
  getClockInStatusForUser.mockResolvedValue(CLOCK_IN_STATUS.CLOCKED_IN);
  const screen = renderBar();
  fireEvent.press(screen.getByLabelText('Record a session'));
  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('SessionForm'));
  expect(screen.queryByText('You are not clocked in.')).toBeNull();
});

const openClockIn = async () => {
  let resolveClockIn;
  mockHandleSignIn.mockReturnValue(new Promise(resolve => { resolveClockIn = resolve; }));
  const screen = renderBar();
  fireEvent.press(screen.getByLabelText('Record a session'));
  await screen.findByText('You are not clocked in.');
  fireEvent.press(screen.getByRole('button', { name: 'Clock in now' }));
  return { screen, resolveClockIn };
};

test('a failed clock-in leaves the sheet open and ready to retry', async () => {
  const { screen, resolveClockIn } = await openClockIn();
  await act(async () => { resolveClockIn(false); });
  expect(navigation.navigate).not.toHaveBeenCalled();
  expect(screen.getByText('You are not clocked in.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Clock in now' }).props.accessibilityState).toMatchObject({ busy: false, disabled: false });
  mockHandleSignIn.mockResolvedValueOnce(true);
  fireEvent.press(screen.getByRole('button', { name: 'Clock in now' }));
  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('SessionForm'));
  expect(mockHandleSignIn).toHaveBeenCalledTimes(2);
});

test.each(['Cancel', 'Dismiss clock-in warning'])('dismiss via %s during clock-in prevents late navigation', async label => {
  const { screen, resolveClockIn } = await openClockIn();
  fireEvent.press(screen.getByRole('button', { name: label }));
  expect(screen.queryByText('You are not clocked in.')).toBeNull();
  await act(async () => { resolveClockIn(true); });
  expect(navigation.navigate).not.toHaveBeenCalled();
  expect(screen.queryByText('You are not clocked in.')).toBeNull();
});

test('unmount during clock-in prevents late navigation', async () => {
  const { screen, resolveClockIn } = await openClockIn();
  screen.unmount();
  await act(async () => { resolveClockIn(true); });
  expect(navigation.navigate).not.toHaveBeenCalled();
});

test('double tap Clock in now and continue-anyway during clock-in cannot double navigate', async () => {
  const { screen, resolveClockIn } = await openClockIn();
  fireEvent.press(screen.getByRole('button', { name: 'Clocking in…' }));
  fireEvent.press(screen.getByRole('button', { name: 'Record without clocking in' }));
  expect(mockHandleSignIn).toHaveBeenCalledTimes(1);
  expect(navigation.navigate).not.toHaveBeenCalled();
  await act(async () => { resolveClockIn(true); });
  expect(navigation.navigate).toHaveBeenCalledTimes(1);
});
