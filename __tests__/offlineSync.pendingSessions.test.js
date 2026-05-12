jest.mock('../src/services/supabaseClient', () => ({
  supabase: {
    from: jest.fn(() => ({
      upsert: jest.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { storage } from '../src/utils/storage';
import { syncTableByName } from '../src/services/offlineSync';
import { supabase } from '../src/services/supabaseClient';

const makePendingSession = (overrides = {}) => ({
  id: 'session-1',
  user_id: 'user-1',
  session_date: '2026-05-12',
  children_ids: [],
  group_ids: [],
  activities: {},
  notes: null,
  synced: false,
  _pendingJobTitleResolve: true,
  pendingSessionTypeCode: 'literacy_coach',
  pendingSessionTypeName: 'Literacy Coach',
  created_at: '2026-05-12T10:00:00.000Z',
  updated_at: '2026-05-12T10:00:00.000Z',
  ...overrides,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  supabase.from.mockClear();
});

describe('pending session_type_id sync resolution', () => {
  test('does not post a pending session when no profile or job title cache can resolve it', async () => {
    await storage.saveSession(makePendingSession());

    const result = await syncTableByName('sessions');

    expect(supabase.from).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.failed).toBe(1);

    const [session] = await storage.getSessions();
    expect(session.synced).toBe(false);
    expect(session._pendingJobTitleResolve).toBe(true);

    const meta = await storage.getSyncMeta();
    expect(meta.lastErrors['SESSIONS_session-1']).toContain('session_type_id');
    expect(meta.failedItems).toEqual([]);
  });

  test('enriches from cached job titles, clears local markers, and posts', async () => {
    await storage.saveJobTitles([
      { id: 'job-1', code: 'literacy_coach', name: 'Literacy Coach' },
    ]);
    await storage.saveSession(makePendingSession());

    const result = await syncTableByName('sessions');

    expect(result.success).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith('sessions');
    const upsert = supabase.from.mock.results[0].value.upsert;
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'session-1',
        session_type_id: 'job-1',
      }),
      expect.objectContaining({ onConflict: 'id' })
    );
    expect(upsert.mock.calls[0][0]).not.toHaveProperty('_pendingJobTitleResolve');
    expect(upsert.mock.calls[0][0]).not.toHaveProperty('pendingSessionTypeCode');
    expect(upsert.mock.calls[0][0]).not.toHaveProperty('pendingSessionTypeName');

    const [session] = await storage.getSessions();
    expect(session.session_type_id).toBe('job-1');
    expect(session.synced).toBe(true);
    expect(session).not.toHaveProperty('_pendingJobTitleResolve');
    expect(session).not.toHaveProperty('pendingSessionTypeCode');
    expect(session).not.toHaveProperty('pendingSessionTypeName');
  });

  test('uses cached normalized profile jobTitleId before lookup cache', async () => {
    await storage.saveUserProfile({
      id: 'user-1',
      jobTitleId: 'job-from-profile',
      jobTitleCode: 'literacy_coach',
      jobTitleName: 'Literacy Coach',
    });
    await storage.saveSession(makePendingSession());

    const result = await syncTableByName('sessions');

    expect(result.success).toBe(true);
    const upsert = supabase.from.mock.results[0].value.upsert;
    expect(upsert.mock.calls[0][0].session_type_id).toBe('job-from-profile');
  });
});
