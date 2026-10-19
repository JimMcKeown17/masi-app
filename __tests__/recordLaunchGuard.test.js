import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../test-support/renderWithProviders';
import LockedBottomTabBar from '../src/components/navigation/LockedBottomTabBar';
import { getActiveProgrammeGate } from '../src/services/activeProgrammeGate';
import { CLOCK_IN_STATUS, getClockInStatusForUser } from '../src/utils/timeEntryStatus';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });
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

test('the D8 sheet can send the EA to clock in', async () => {
  const screen = renderBar();
  fireEvent.press(screen.getByLabelText('Record a session'));
  expect(await screen.findByText('You are not clocked in.')).toBeTruthy();
  fireEvent.press(screen.getByText('Clock in now'));
  expect(navigation.navigate).toHaveBeenCalledWith('TimeTracking');
});

test('an EA who is clocked in goes straight to the form', async () => {
  getClockInStatusForUser.mockResolvedValue(CLOCK_IN_STATUS.CLOCKED_IN);
  const screen = renderBar();
  fireEvent.press(screen.getByLabelText('Record a session'));
  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('SessionForm'));
  expect(screen.queryByText('You are not clocked in.')).toBeNull();
});
