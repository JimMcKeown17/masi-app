import AsyncStorage from '@react-native-async-storage/async-storage';
import { storage } from '../src/utils/storage';

const loadSanitizer = () => require('../src/services/asyncStorageSanitizer');

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('asyncStorageSanitizer', () => {
  test('strips child legacy keys, enriches sessions, clears retry metadata, and is idempotent', async () => {
    expect(loadSanitizer).not.toThrow();
    const { runSanitizer } = loadSanitizer();

    await storage.saveChild({
      id: 'child-1',
      first_name: 'A',
      class: 'Legacy Class',
      school: 'Legacy School',
      teacher: 'Legacy Teacher',
      class_id: null,
      synced: false,
    });
    await storage.saveSession({
      id: 'session-1',
      session_type: 'Literacy Coach',
      synced: false,
    });
    await storage.recordRetryAttempt('CHILDREN', 'child-1');
    await storage.setLastSyncError('CHILDREN', 'child-1', 'PGRST204');
    await storage.addFailedItem('CHILDREN', 'child-1', 'PGRST204');
    await storage.recordRetryAttempt('SESSIONS', 'session-1');
    await storage.setLastSyncError('SESSIONS', 'session-1', 'missing session_type_id');
    await storage.addFailedItem('SESSIONS', 'session-1', 'missing session_type_id');

    const result = await runSanitizer({
      userId: 'user-1',
      jobTitlesCache: [{ id: 'job-1', code: 'literacy_coach', name: 'Literacy Coach' }],
    });

    expect(result.childrenLegacyKeysStripped.mutated).toBe(1);
    expect(result.sessionsEnriched.mutated).toBe(1);

    const [child] = await storage.getChildren();
    expect(child).not.toHaveProperty('class');
    expect(child).not.toHaveProperty('school');
    expect(child).not.toHaveProperty('teacher');
    expect(child.synced).toBe(false);

    const reviewLog = await storage.getItem('@sanitizer_review_log');
    expect(reviewLog[0]).toEqual(expect.objectContaining({
      table: 'children',
      id: 'child-1',
      reason: 'class_id_missing_after_legacy_key_strip',
    }));

    const [session] = await storage.getSessions();
    expect(session.session_type).toBe('Literacy Coach');
    expect(session.session_type_id).toBe('job-1');
    expect(session.synced).toBe(false);

    const meta = await storage.getSyncMeta();
    expect(meta.retryAttempts).toEqual({});
    expect(meta.lastErrors).toEqual({});
    expect(meta.failedItems).toEqual([]);

    const state = await storage.getSanitizerState('user-1');
    expect(state.childrenLegacyKeysStripped.done).toBe(true);
    expect(state.childrenLegacyKeysStripped.taskVersion).toBe(1);
    expect(state.childrenLegacyKeysStripped.completedAt).toBeTruthy();
    expect(state.sessionsEnriched.done).toBe(true);
    expect(state.sessionsEnriched.taskVersion).toBe(1);
    expect(state.sessionsEnriched.completedAt).toBeTruthy();

    const snapshot = {
      children: await storage.getChildren(),
      sessions: await storage.getSessions(),
      state: await storage.getSanitizerState('user-1'),
    };

    const secondResult = await runSanitizer({
      userId: 'user-1',
      jobTitlesCache: [{ id: 'job-1', code: 'literacy_coach', name: 'Literacy Coach' }],
    });

    expect(secondResult.childrenLegacyKeysStripped.skipped).toBe(true);
    expect(secondResult.sessionsEnriched.skipped).toBe(true);
    expect(await storage.getChildren()).toEqual(snapshot.children);
    expect(await storage.getSessions()).toEqual(snapshot.sessions);
    expect(await storage.getSanitizerState('user-1')).toEqual(snapshot.state);
  });

  test('does not mark sessionsEnriched done when job title cache is empty', async () => {
    const { runSanitizer } = loadSanitizer();
    await storage.saveSession({
      id: 'session-1',
      session_type: 'Literacy Coach',
      synced: false,
    });

    const result = await runSanitizer({ userId: 'user-1', jobTitlesCache: [] });

    expect(result.sessionsEnriched.done).toBe(false);
    expect(result.sessionsEnriched.lastAttemptAt).toBeTruthy();

    const [session] = await storage.getSessions();
    expect(session.session_type_id).toBeUndefined();

    const state = await storage.getSanitizerState('user-1');
    expect(state.sessionsEnriched.done).toBe(false);
    expect(state.sessionsEnriched.taskVersion).toBe(1);
    expect(state.sessionsEnriched.lastAttemptAt).toBeTruthy();
  });
});
