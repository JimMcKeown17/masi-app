jest.mock('../src/services/supabaseClient', () => ({
  supabase: {
    from: jest.fn(() => ({
      upsert: jest.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { storage } from '../src/utils/storage';
import { syncTableByName, getSyncStatus } from '../src/services/offlineSync';
import { supabase } from '../src/services/supabaseClient';
import { resolveDatabase } from '../src/db/repositories/repositoryRuntime';

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

describe('pending session outbox handling', () => {
  test('refuses to create sessions when the user has no active programme assignment', async () => {
    await expect(storage.saveSession(makePendingSession()))
      .rejects.toThrow(/No active programme assignment/i);

    const status = await getSyncStatus();
    const db = await resolveDatabase();

    expect(supabase.from).not.toHaveBeenCalled();
    expect(await db.getFirstAsync('select count(*) as count from sessions')).toEqual({ count: 0 });
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
    expect(status.failedItems).toEqual([]);
  });

  test('posts real-programme sessions while stripping local pending markers and view-model arrays', async () => {
    const db = await resolveDatabase();
    await db.runAsync(`
      insert into programmes (id, code, name, sync_status)
      values ('programme-1', 'lit', 'Literacy', 'synced')
    `);
    await storage.saveSession(makePendingSession({
      programme_id: 'programme-1',
      session_type: 'Literacy Coach',
      session_type_id: 'legacy-job-title',
    }));

    const result = await syncTableByName('sessions');

    expect(result.success).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith('sessions');
    const upsert = supabase.from.mock.results[0].value.upsert;
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'session-1',
        programme_id: 'programme-1',
      }),
      expect.objectContaining({ onConflict: 'id' })
    );
    expect(upsert.mock.calls[0][0]).not.toHaveProperty('_pendingJobTitleResolve');
    expect(upsert.mock.calls[0][0]).not.toHaveProperty('pendingSessionTypeCode');
    expect(upsert.mock.calls[0][0]).not.toHaveProperty('pendingSessionTypeName');
    expect(upsert.mock.calls[0][0]).not.toHaveProperty('session_type');
    expect(upsert.mock.calls[0][0]).not.toHaveProperty('session_type_id');
    expect(upsert.mock.calls[0][0]).not.toHaveProperty('children_ids');
    expect(upsert.mock.calls[0][0]).not.toHaveProperty('group_ids');

    const [session] = await storage.getSessions();
    expect(session.synced).toBe(true);
  });
});
