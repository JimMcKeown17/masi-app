const mockToast = { show: jest.fn() };
jest.mock('../src/context/ToastContext', () => ({
  ...jest.requireActual('../src/context/ToastContext'),
  useToast: () => mockToast,
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });
import React from 'react';
import { ActivityIndicator } from 'react-native-paper';
import { useAuth } from '../src/context/AuthContext';
import { act, fireEvent, waitFor, within } from '@testing-library/react-native';
import { renderWithProviders as render } from '../test-support/renderWithProviders';
import StatBar from '../src/components/dashboard/StatBar';
import RankedBarRow from '../src/components/dashboard/RankedBarRow';
import SessionCountRankingScreen from '../src/screens/insights/SessionCountRankingScreen';
import { sessionsRepository } from '../src/db/repositories/sessionsRepository';
import { useChildren } from '../src/context/ChildrenContext';
import { useSessionHistoryStatus } from '../src/services/sessionHistoryStatus';

jest.mock('@react-navigation/native', () => ({
  NavigationContext: require('react').createContext(undefined),
  useFocusEffect: (callback) => {
    const React = require('react');
    React.useEffect(() => callback(), [callback]);
  },
}));
jest.mock('../src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: jest.fn() }));
jest.mock('../src/db/repositories/sessionsRepository', () => ({
  ...jest.requireActual('../src/db/repositories/sessionsRepository'),
  sessionsRepository: { getSessions: jest.fn() },
}));
jest.mock('../src/services/sessionHistoryStatus', () => ({
  ...jest.requireActual('../src/services/sessionHistoryStatus'), useSessionHistoryStatus: jest.fn() }));

const containingView = (screen, text) => {
  let node = screen.getByText(text).parent;
  while (node.type !== 'View') node = node.parent;
  return within(node);
};

describe('SessionCountRankingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 'ea-1' } });
    useChildren.mockReturnValue({ children: [{ id: 'child-1', first_name: 'Amahle', last_name: 'D' }] });
    useSessionHistoryStatus.mockReturnValue({ pageVersion: 0, runVersion: 0 });
    sessionsRepository.getSessions.mockResolvedValue([]);
  });

  test.each(['pageVersion', 'runVersion'])('%s refreshes session counts without leaving the screen', async (version) => {
    const screen = render(<SessionCountRankingScreen />);
    await screen.findByText('Total Sessions');
    expect(containingView(screen, 'Total Sessions').getByText('0')).toBeTruthy();
    expect(sessionsRepository.getSessions).toHaveBeenCalledTimes(1);

    // Both this EA's recordings and a previous EA's recordings count for this child.
    sessionsRepository.getSessions.mockResolvedValue([
      { id: 'session-mine', user_id: 'ea-1', children_ids: ['child-1'] },
      { id: 'session-previous', user_id: 'ea-previous', children_ids: ['child-1'] },
    ]);
    useSessionHistoryStatus.mockReturnValue({ pageVersion: 0, runVersion: 0, [version]: 1 });
    screen.rerender(<SessionCountRankingScreen />);

    await waitFor(() => expect(sessionsRepository.getSessions).toHaveBeenCalledTimes(2));
    expect(containingView(screen, 'Total Sessions').getByText('2')).toBeTruthy();
    expect(containingView(screen, 'Amahle D.').getByText('2')).toBeTruthy();
    expect(sessionsRepository.getSessions).toHaveBeenLastCalledWith({ userId: 'ea-1' });
  });

  test('a pending reload keeps rows mounted until the new roster and sessions arrive', async () => {
    const screen = render(<SessionCountRankingScreen />);
    expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    await screen.findByText('Total Sessions');
    const row = screen.getByText('Amahle D.');
    let resolve;
    sessionsRepository.getSessions.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    useChildren.mockReturnValue({ children: [...useChildren().children, { id: 'child-2', first_name: 'New', last_name: 'Child' }] });
    useSessionHistoryStatus.mockReturnValue({ pageVersion: 1, runVersion: 0 });
    screen.rerender(<SessionCountRankingScreen />);
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
    expect(screen.getByText('Amahle D.')).toBe(row);
    expect(screen.queryByText('New C.')).toBeNull();
    await act(async () => resolve([{ id: 'session-1', children_ids: ['child-1', 'child-2'] }]));
    expect(await screen.findByText('New C.')).toBeTruthy();
    expect(containingView(screen, 'Total Sessions').getByText('1')).toBeTruthy();
    expect(screen.getByText('Amahle D.')).toBe(row);
  });

  test('a different EA starts with loading and no previous rows, including after a first-load failure', async () => {
    const screen = render(<SessionCountRankingScreen />);
    await screen.findByText('Amahle D.');
    let reject;
    sessionsRepository.getSessions.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    useAuth.mockReturnValue({ user: { id: 'ea-2' } });
    useChildren.mockReturnValue({ children: [{ id: 'child-2', first_name: 'New', last_name: 'Child' }] });
    screen.rerender(<SessionCountRankingScreen />);
    expect(screen.queryByText('Amahle D.')).toBeNull();
    expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    await act(async () => reject(new Error('read failed')));
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
    expect(screen.queryByText('Amahle D.')).toBeNull();
    expect(screen.getByText("Couldn't load this ranking. Try again.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByText('New C.')).toBeNull();
    expect(screen.queryByText('No children to display')).toBeNull();
    expect(mockToast.show).not.toHaveBeenCalled();
  });

  test('a late older reload cannot overwrite newer counts, and a failed reload keeps them', async () => {
    const screen = render(<SessionCountRankingScreen />);
    await screen.findByText('Total Sessions');
    let resolveOld, resolveNew;
    sessionsRepository.getSessions
      .mockReturnValueOnce(new Promise(done => { resolveOld = done; }))
      .mockReturnValueOnce(new Promise(done => { resolveNew = done; }));
    useSessionHistoryStatus.mockReturnValue({ pageVersion: 1, runVersion: 0 });
    screen.rerender(<SessionCountRankingScreen />);
    useSessionHistoryStatus.mockReturnValue({ pageVersion: 2, runVersion: 0 });
    screen.rerender(<SessionCountRankingScreen />);
    await act(async () => resolveNew([{ id: 'session-1', children_ids: ['child-1'] }]));
    expect(containingView(screen, 'Total Sessions').getByText('1')).toBeTruthy();
    await act(async () => resolveOld([]));
    expect(containingView(screen, 'Total Sessions').getByText('1')).toBeTruthy();
    sessionsRepository.getSessions.mockRejectedValueOnce(new Error('read failed'));
    useSessionHistoryStatus.mockReturnValue({ pageVersion: 3, runVersion: 0 });
    screen.rerender(<SessionCountRankingScreen />);
    await act(async () => {});
    expect(containingView(screen, 'Total Sessions').getByText('1')).toBeTruthy();
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  });

  test('a failed first read shows retry instead of educational conclusions, then a retry shows the ranking', async () => {
    sessionsRepository.getSessions.mockRejectedValueOnce(new Error('read failed'));
    const screen = render(<SessionCountRankingScreen />);
    expect(await screen.findByText("Couldn't load this ranking. Try again.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByText('Amahle D.')).toBeNull();
    expect(screen.queryByText('Not assessed')).toBeNull();
    expect(screen.queryByText('No children to display')).toBeNull();
    expect(screen.UNSAFE_queryByType(StatBar)).toBeNull();
    expect(screen.UNSAFE_queryByType(RankedBarRow)).toBeNull();
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
    expect(mockToast.show).not.toHaveBeenCalled();

    sessionsRepository.getSessions.mockResolvedValueOnce([{ id: 'session-1', children_ids: ['child-1'] }]);
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    // The retry shows progress at once, so a slow read never looks like a dead button.
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeTruthy();
    expect(screen.queryByText("Couldn't load this ranking. Try again.")).toBeNull();
    expect(await screen.findByText('Amahle D.')).toBeTruthy();
    expect(containingView(screen, 'Total Sessions').getByText('1')).toBeTruthy();
    expect(screen.UNSAFE_getByType(RankedBarRow).props.value).toBe(1);
    expect(screen.queryByText("Couldn't load this ranking. Try again.")).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  test('a rejected refresh retains counts and publishes one error toast', async () => {
    sessionsRepository.getSessions.mockResolvedValueOnce([{ id: 'session-1', children_ids: ['child-1'] }]);
    const screen = render(<SessionCountRankingScreen />);
    await screen.findByText('Amahle D.');
    const row = screen.getByText('Amahle D.');
    sessionsRepository.getSessions.mockRejectedValueOnce(new Error('read failed'));
    useSessionHistoryStatus.mockReturnValue({ pageVersion: 1, runVersion: 0 });
    screen.rerender(<SessionCountRankingScreen />);
    await act(async () => {});
    expect(screen.getByText('Amahle D.')).toBe(row);
    expect(containingView(screen, 'Total Sessions').getByText('1')).toBeTruthy();
    expect(screen.UNSAFE_getByType(RankedBarRow).props.value).toBe(1);
    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
    expect(screen.queryByText("Couldn't load this ranking. Try again.")).toBeNull();
    expect(mockToast.show).toHaveBeenCalledTimes(1);
    expect(mockToast.show).toHaveBeenCalledWith({ message: "Couldn't refresh this ranking.", tone: 'error', duration: 3000 });
  });

  test('renders distinct sessions, attendance average, and unattended children as separate statistics', async () => {
    useChildren.mockReturnValue({ children: Array.from({ length: 13 }, (_, i) => ({
      id: `child-${i}`, first_name: `Child${i}`, last_name: 'D',
    })) });
    sessionsRepository.getSessions.mockResolvedValue(Array.from({ length: 20 }, (_, i) => ({
      id: `session-${i}`, children_ids: [`child-${i % 9}`, `child-${(i + 1) % 9}`],
    })));

    const screen = render(<SessionCountRankingScreen />);
    await screen.findByText('Total Sessions');
    expect(containingView(screen, 'Total Sessions').getByText('20')).toBeTruthy();
    expect(containingView(screen, 'Avg / Child').getByText('3.1')).toBeTruthy();
    expect(containingView(screen, '0 Sessions').getByText('4')).toBeTruthy();
  });
});
