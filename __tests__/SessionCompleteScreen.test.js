import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }), { virtual: true });

const mockUseAuth = jest.fn();
jest.mock('../src/context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));

const mockGetSessionsTodayGoal = jest.fn();
jest.mock('../src/services/sessionsTodayGoal', () => ({
  getSessionsTodayGoal: (...args) => mockGetSessionsTodayGoal(...args),
}));

import SessionCompleteScreen from '../src/screens/sessions/SessionCompleteScreen';

const renderWithPaper = (ui) => render(<PaperProvider>{ui}</PaperProvider>);

describe('SessionCompleteScreen', () => {
  const goBack = jest.fn();
  const navigation = { goBack };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'ea-1' } });
    mockGetSessionsTodayGoal.mockResolvedValue({ target: 3, ceiling: 5, count: 2, state: 'below' });
  });

  test('confirms the session was captured', async () => {
    const screen = renderWithPaper(
      <SessionCompleteScreen navigation={navigation} route={{ params: {} }} />
    );

    await waitFor(() => expect(screen.getByText(/captured/i)).toBeTruthy());
  });

  test('shows updated daily progress from the same source as the ring', async () => {
    const screen = renderWithPaper(
      <SessionCompleteScreen navigation={navigation} route={{ params: {} }} />
    );

    // Same source the Sessions Today ring uses, scoped to the signed-in EA.
    await waitFor(() => expect(mockGetSessionsTodayGoal).toHaveBeenCalledWith({ userId: 'ea-1' }));
    // The ring renders the goal's count (2) — proving the progress is shown.
    await waitFor(() => expect(screen.getByText('2')).toBeTruthy());
  });

  test('confirms how many children the session was captured for', async () => {
    const screen = renderWithPaper(
      <SessionCompleteScreen navigation={navigation} route={{ params: { childCount: 3 } }} />
    );

    await waitFor(() => expect(screen.getByText(/3 children/i)).toBeTruthy());
  });

  test('Done returns the EA to their normal context (no dead-end)', async () => {
    const screen = renderWithPaper(
      <SessionCompleteScreen navigation={navigation} route={{ params: {} }} />
    );

    fireEvent.press(await screen.findByText('Done'));

    expect(goBack).toHaveBeenCalled();
  });
});
