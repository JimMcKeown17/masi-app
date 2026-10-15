jest.mock('../test-support/handleServiceMocks', () => ({
startSessionHistoryPull: jest.fn(),
resetSessionHistoryStatusForActorChange: jest.fn()
}));


jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { __reset, __setDatabaseFactory } from 'expo-sqlite';
import { ChildrenProvider, useChildren } from '../src/context/ChildrenContext';
import { initializeTestDatabase, closeDefaultTestHandle, getTestWriter } from '../test-support/testDatabase';
import { runMigrations } from '../src/db/migrations';
import { syncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const mockPullPreloadedChildData = jest.fn();

jest.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('../src/context/OfflineContext', () => ({
  useOffline: () => ({
    isOnline: true,
    refreshSyncStatus: jest.fn(),
    isSyncing: false,
  }),
}));

jest.mock('../src/services/preloadedChildData', () => ({
  ...jest.requireActual('../src/services/preloadedChildData'),
  pullPreloadedChildData: (...args) => mockPullPreloadedChildData(...args),
}));

const wrapper = ({ children }) => (
  <ChildrenProvider>{children}</ChildrenProvider>
);

let testDb;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await closeDefaultTestHandle();
  __reset();
  testDb = createBetterSqliteTestDatabase();
  __setDatabaseFactory(async () => testDb);
  await initializeTestDatabase();

  const db = await getTestWriter();
  expect(db).toBe(testDb);
  await seedCoreData(db);
  await testDb.execAsync('PRAGMA foreign_keys = ON');
  await syncOutboxRepository.enqueue({
    tableName: 'children',
    recordId: 'child-9',
    operation: 'hard_delete',
    payload: { id: 'child-9' },
    ownerUserId: 'user-1',
  });

  const successfulScope = (rows) => ({
    ok: true,
    rows,
    complete: true,
    failureKind: null,
  });
  mockPullPreloadedChildData.mockResolvedValue({
    activeProgrammeId: 'programme-a',
    scopes: {
      programmeAssignment: successfulScope([{ programme_id: 'programme-a' }]),
      children: successfulScope([]),
      classes: successfulScope([]),
      childEaAssignments: successfulScope([{
        id: 'cea-9',
        child_id: 'child-9',
        user_id: 'user-1',
        created_by: 'user-1',
        synced: true,
        children: {
          id: 'child-9',
          first_name: 'Deleted',
          last_name: 'Child',
          created_by: 'user-1',
          synced: true,
        },
      }]),
      childProgrammeEnrollments: successfulScope([{
        id: 'cpe-9',
        child_id: 'child-9',
        programme_id: 'programme-a',
        created_by: 'user-1',
        synced: true,
      }]),
      childClassMemberships: successfulScope([{
        id: 'ccm-9',
        child_id: 'child-9',
        class_id: 'class-1',
        academic_year_id: 'year-2026',
        created_by: 'user-1',
        synced: true,
      }]),
      groups: successfulScope([]),
      groupEaAssignments: successfulScope([]),
      childrenGroups: successfulScope([]),
    },
  });
});

afterEach(async () => {
  await closeDefaultTestHandle();
  __reset();
});

test.each([false, true])('editing then deleting a pulled child keeps the context deletion contract (history=%s)', async (hasHistory) => {
  await testDb.runAsync('delete from sync_outbox');
  const { result } = renderHook(() => useChildren(), { wrapper });
  await waitFor(() => expect(result.current.children.map(row => row.id)).toContain('child-9'));
  if (hasHistory) {
    await testDb.runAsync(`
      insert into assessments (id, user_id, child_id, programme_id, assessment_type, assessment_date)
      values ('assessment-1', 'user-1', 'child-9', 'programme-a', 'letter_egra', '2026-10-15')
    `);
  }
  await act(async () => {
    expect(await result.current.updateChild('child-9', { first_name: 'Edited' })).toEqual({ success: true });
  });
  await act(async () => {
    expect(await result.current.deleteChild('child-9')).toEqual({ success: true });
  });

  expect(result.current.children.map(row => row.id)).not.toContain('child-9');
  const child = await testDb.getFirstAsync("select archived_at from children where id = 'child-9'");
  const operations = await testDb.getAllAsync("select operation from sync_outbox where table_name = 'children' order by operation");
  if (hasHistory) {
    expect(child.archived_at).toEqual(expect.any(String));
    expect(operations).toEqual([{ operation: 'archive' }, { operation: 'update' }]);
    expect(await testDb.getFirstAsync('select count(*) as count from assessments')).toEqual({ count: 1 });
  } else {
    expect(child).toBeNull();
    expect(operations).toEqual([{ operation: 'hard_delete' }]);
  }
  await act(async () => { await result.current.loadChildren(); });
  expect(result.current.children.map(row => row.id)).not.toContain('child-9');
});

test('pending hard-delete filtering avoids FK-invalid relationship resurrection', async () => {
  expect(await testDb.getFirstAsync('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
  expect(await testDb.getFirstAsync("select count(*) as count from children where id = 'child-9'"))
    .toEqual({ count: 0 });
  expect(await testDb.getAllAsync("PRAGMA foreign_key_list('child_ea_assignments')"))
    .toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'children', from: 'child_id', to: 'id' }),
    ]));
  const fkProofDb = createBetterSqliteTestDatabase();
  await runMigrations(fkProofDb);
  try {
    await fkProofDb.execAsync('PRAGMA foreign_keys = OFF');
    await fkProofDb.runAsync(`
      insert into child_ea_assignments (id, user_id, child_id, created_by)
      values ('fk-proof', 'user-1', 'child-9', 'user-1')
    `);
    expect(await fkProofDb.getAllAsync("PRAGMA foreign_key_check('child_ea_assignments')"))
      .toEqual([
        expect.objectContaining({
          table: 'child_ea_assignments',
          parent: 'children',
        }),
      ]);
    await fkProofDb.runAsync("delete from child_ea_assignments where id = 'fk-proof'");
    await fkProofDb.execAsync('PRAGMA foreign_keys = ON');
  } finally {
    await fkProofDb.closeAsync();
  }

  const { result } = renderHook(() => useChildren(), { wrapper });

  await waitFor(() => expect(mockPullPreloadedChildData).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' })));
  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.children.map((row) => row.id)).not.toContain('child-9');
  expect(await testDb.getFirstAsync("select count(*) as count from children where id = 'child-9'"))
    .toEqual({ count: 0 });
  for (const tableName of [
    'child_ea_assignments',
    'child_programme_enrollments',
    'child_class_memberships',
  ]) {
    expect(await testDb.getFirstAsync(
      `select count(*) as count from ${tableName} where child_id = 'child-9'`
    )).toEqual({ count: 0 });
  }
});
