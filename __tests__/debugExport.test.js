let mockWrittenContent;

jest.mock('expo-file-system/next', () => ({
  Paths: { cache: '/tmp' },
  File: jest.fn().mockImplementation(function MockFile(_path, filename) {
    this.uri = `file:///tmp/${filename}`;
    this.exists = false;
    this.delete = jest.fn();
    this.create = jest.fn();
    this.write = jest.fn((content) => {
      mockWrittenContent = content;
    });
  }),
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-constants', () => ({
  expoConfig: {
    version: '1.2.0',
    runtimeVersion: { policy: 'appVersion' },
    ios: { buildNumber: '1' },
    android: { versionCode: 1 },
    updates: { url: 'https://u.expo.dev/test-project' },
    extra: {
      supabaseTarget: 'sqlite-staging',
      supabaseProjectId: 'segygjzpujphwvrubusm',
    },
  },
}), { virtual: true });

jest.mock('../src/utils/runtimeDiagnostics', () => ({
  getRuntimeDiagnostics: () => ({
    application: { id: 'org.masinyusane.masi', version: '1.2.0', build: '47' },
    device: { modelName: 'Pixel 8a', osName: 'Android', osVersion: '15' },
    update: { id: 'update-123', channel: 'production', runtimeVersion: '1.2.0' },
    backend: { target: 'sqlite-staging', projectId: 'segygjzpujphwvrubusm' },
    sqlite: { schemaVersion: 8 },
  }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase } from '../src/db/client';
import { debugDump } from '../src/db/debugDump';
import { runMigrations, CURRENT_SCHEMA_VERSION } from '../src/db/migrations';
import { exportDatabase, exportLogs } from '../src/utils/debugExport';
import { logger } from '../src/utils/logger';

beforeEach(async () => {
  mockWrittenContent = null;
  await AsyncStorage.clear();
});

describe('debug database export metadata', () => {
  test('exports SQLite database state with app metadata and sync diagnostics', async () => {
    const db = await getDatabase();
    await runMigrations(db);
    await AsyncStorage.setItem('@sessions', JSON.stringify([]));
    await db.runAsync(`
      insert into sync_state (scope, last_pulled_at, cursor)
      values ('reference_data', '2026-05-22T12:00:00.000Z', 'cursor-1')
    `);
    await db.runAsync(`
      insert into sync_outbox (
        id,
        table_name,
        record_id,
        operation,
        payload,
        status,
        retry_count,
        last_error
      )
      values
        ('sessions:session-1:insert', 'sessions', 'session-1', 'insert', '{"id":"session-1"}', 'failed', 2, 'network down'),
        ('assessments:assessment-1:insert', 'assessments', 'assessment-1', 'insert', '{"id":"assessment-1"}', 'terminal', 1, 'RLS denied')
    `);

    const result = await exportDatabase();

    expect(result).toEqual({ success: true });
    const exported = JSON.parse(mockWrittenContent);
    expect(exported.sqlite_refactor_build).toBe('plan-6');
    expect(exported.app_version).toBe('1.2.0');
    expect(exported.releaseMetadata).toEqual(expect.objectContaining({
      appVersion: '1.2.0',
      supabaseTarget: 'sqlite-staging',
      supabaseProjectId: 'segygjzpujphwvrubusm',
    }));
    expect(exported.runtimeDiagnostics).toEqual(expect.objectContaining({
      application: expect.objectContaining({ build: '47' }),
      device: expect.objectContaining({ modelName: 'Pixel 8a', osVersion: '15' }),
      update: expect.objectContaining({ id: 'update-123' }),
    }));
    expect(exported.database.database).toBe('sqlite');
    expect(exported.database.releaseMetadata).toEqual(expect.objectContaining({
      supabaseTarget: 'sqlite-staging',
      supabaseProjectId: 'segygjzpujphwvrubusm',
    }));
    expect(exported.database.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(exported.database.tableCounts).toEqual(expect.objectContaining({
      sync_outbox: 2,
      sync_state: 1,
    }));
    expect(exported.database.syncState).toEqual([
      expect.objectContaining({
        scope: 'reference_data',
        lastPulledAt: '2026-05-22T12:00:00.000Z',
        cursor: 'cursor-1',
      }),
    ]);
    expect(exported.database.failedOutboxRows).toEqual([
      expect.objectContaining({
        tableName: 'sessions',
        recordId: 'session-1',
        status: 'failed',
        retryCount: 2,
        lastError: 'network down',
      }),
      expect.objectContaining({
        tableName: 'assessments',
        recordId: 'assessment-1',
        status: 'terminal',
        retryCount: 1,
        lastError: 'RLS denied',
      }),
    ]);
    expect(exported.database['@sessions']).toBeUndefined();
  });

  test('logs export still shares persisted logger output', async () => {
    logger.addLog('WARN', ['plan 6 log export']);

    const result = await exportLogs();

    expect(result).toEqual({ success: true });
    expect(mockWrittenContent).toContain('WARN: plan 6 log export');
  });

  test('marks abnormal sync diagnostic query failures instead of reporting empty queues', async () => {
    const failingDiagnosticDb = {
      getFirstAsync: jest.fn(async (sql) => {
        if (sql.includes('PRAGMA user_version')) return { user_version: CURRENT_SCHEMA_VERSION };
        return { count: 0 };
      }),
      getAllAsync: jest.fn(async (sql) => {
        if (sql.includes('sqlite_master')) return [
          { name: 'sync_state' },
          { name: 'sync_outbox' },
        ];
        if (sql.includes('schema_migrations')) return [];
        if (sql.includes('from sync_state')) throw new Error('sync_state unreadable');
        if (sql.includes('from sync_outbox')) throw new Error('sync_outbox unreadable');
        return [];
      }),
    };

    const dump = await debugDump(failingDiagnosticDb);

    expect(dump.syncState).toEqual({
      error: 'Error: sync_state unreadable',
    });
    expect(dump.failedOutboxRows).toEqual({
      error: 'Error: sync_outbox unreadable',
    });
  });
});
