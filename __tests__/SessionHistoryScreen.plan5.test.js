import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import SessionHistoryScreen from '../src/screens/sessions/SessionHistoryScreen';
import { useAuth } from '../src/context/AuthContext';
import { useOffline } from '../src/context/OfflineContext';
import { useLookupsContext } from '../src/context/LookupsContext';
import { sessionsRepository } from '../src/db/repositories/sessionsRepository';
import { storage } from '../src/utils/storage';
import { supabase } from '../src/services/supabaseClient';

jest.mock('../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../src/context/OfflineContext', () => ({
  useOffline: jest.fn(),
}));

jest.mock('../src/context/LookupsContext', () => ({
  useLookupsContext: jest.fn(),
}));

jest.mock('../src/db/repositories/sessionsRepository', () => ({
  sessionsRepository: {
    getSessions: jest.fn(),
  },
}));

jest.mock('../src/utils/storage', () => ({
  storage: {
    getSessions: jest.fn(),
    setItem: jest.fn(),
  },
  STORAGE_KEYS: {
    SESSIONS: '@sessions',
  },
}));

jest.mock('../src/services/supabaseClient', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('SessionHistoryScreen Plan 5 behavior', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-21T12:00:00.000Z'));

    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    useOffline.mockReturnValue({ isOnline: true });
    useLookupsContext.mockReturnValue({
      jobTitles: [{ id: 'job-title-1', name: 'Literacy session' }],
    });
    sessionsRepository.getSessions.mockResolvedValue([
      {
        id: 'session-1',
        user_id: 'user-1',
        session_type_id: 'job-title-1',
        session_date: '2026-05-20',
        children_ids: ['child-1', 'child-2'],
        activities: {
          letters_focused: ['a', 'm'],
          session_reading_level: 'early',
        },
        synced: false,
        created_at: '2026-05-20T10:00:00.000Z',
      },
      {
        id: 'session-other-user',
        user_id: 'user-2',
        session_date: '2026-05-20',
        children_ids: ['child-3'],
        activities: {},
        synced: true,
        created_at: '2026-05-20T10:00:00.000Z',
      },
    ]);
    storage.getSessions.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('loads recent session history from SQLite without screen-owned Supabase or storage pulls', async () => {
    const { getByText, queryByText } = render(<SessionHistoryScreen />);

    await waitFor(() => expect(getByText('Literacy session')).toBeTruthy());

    expect(getByText('Pending sync')).toBeTruthy();
    expect(getByText('A, M')).toBeTruthy();
    expect(queryByText('No sessions yet. Record your first session!')).toBeNull();
    expect(sessionsRepository.getSessions).toHaveBeenCalledTimes(1);
    expect(storage.getSessions).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
