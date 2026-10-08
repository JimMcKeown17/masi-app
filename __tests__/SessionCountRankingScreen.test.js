import React from 'react';
import { render, waitFor, within } from '@testing-library/react-native';
import SessionCountRankingScreen from '../src/screens/insights/SessionCountRankingScreen';
import { sessionsRepository } from '../src/db/repositories/sessionsRepository';
import { useChildren } from '../src/context/ChildrenContext';
import { useSessionHistoryStatus } from '../src/services/sessionHistoryStatus';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback) => {
    const React = require('react');
    React.useEffect(() => callback(), [callback]);
  },
}));
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'ea-1' } }) }));
jest.mock('../src/context/ChildrenContext', () => ({ useChildren: jest.fn() }));
jest.mock('../src/db/repositories/sessionsRepository', () => ({
  sessionsRepository: { getSessions: jest.fn() },
}));
jest.mock('../src/services/sessionHistoryStatus', () => ({ useSessionHistoryStatus: jest.fn() }));

const containingView = (screen, text) => {
  let node = screen.getByText(text).parent;
  while (node.type !== 'View') node = node.parent;
  return within(node);
};

describe('SessionCountRankingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  test('a history refresh keeps the current figures on screen instead of flashing a spinner', async () => {
    const screen = render(<SessionCountRankingScreen />);
    await screen.findByText('Total Sessions');
    let releaseReload;
    sessionsRepository.getSessions.mockImplementationOnce(
      () => new Promise((resolve) => { releaseReload = resolve; })
    );
    useSessionHistoryStatus.mockReturnValue({ pageVersion: 1, runVersion: 0 });
    screen.rerender(<SessionCountRankingScreen />);
    await waitFor(() => expect(sessionsRepository.getSessions).toHaveBeenCalledTimes(2));
    // While the reload is in flight, the screen still shows its figures.
    expect(screen.getByText('Total Sessions')).toBeTruthy();
    releaseReload([{ id: 'session-1', children_ids: ['child-1'] }]);
    await waitFor(() => expect(containingView(screen, 'Total Sessions').getByText('1')).toBeTruthy());
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
