jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

jest.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
const mockRefresh = jest.fn(async () => {});
jest.mock('../src/context/OfflineContext', () => ({ useOffline: () => ({
  isOnline: false, isSyncing: false, refreshSyncStatus: mockRefresh,
}) }));

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { ChildrenProvider, useChildren } from '../src/context/ChildrenContext';
import { SignedInEAContext } from '../src/context/SignedInEAContext';
import { createGroupsRepository } from '../src/db/repositories/groupsRepository';
import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createClassesRepository } from '../src/db/repositories/classesRepository';
import { createMasteryRepository } from '../src/db/repositories/masteryRepository';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';
import { bindTestActor } from '../test-support/actorTestUtils';

let db, children, classes, mastery;
const tables = ['classes', 'class_ea_assignments', 'children', 'child_ea_assignments', 'child_programme_enrollments',
  'child_class_memberships', 'child_group_memberships', 'letter_mastery', 'sync_outbox'];
const snapshot = () => Promise.all(tables.map(table => db.getAllAsync(`select * from ${table} order by id`)));
const assign = (userId = 'user-1', unassignedAt = null) => db.runAsync(`
  insert into child_ea_assignments (id, child_id, user_id, assigned_at, unassigned_at, created_by, sync_status)
  values (?, 'control', ?, '2026-01-15', ?, 'office', 'synced')
`, `assignment-${userId}`, userId, unassignedAt);

// Fixed timestamps: archiveClass uses a fixed archivedAt, so 'now' defaults would make
// this suite fail after that time of day (unassigned_at >= assigned_at CHECK).
beforeEach(async () => {
  db = await createMigratedDatabase(runMigrations);
  await seedCoreData(db);
  await db.runAsync(`insert into class_ea_assignments
    (id, class_id, ea_user_id, programme_id, assigned_at, created_by, sync_status)
    values ('class-grant', 'class-1', 'user-1', 'programme-a', '2026-01-15T00:00:00.000Z', 'office', 'synced')`);
  children = createChildrenRepository({ database: db });
  classes = createClassesRepository({ database: db });
  mastery = createMasteryRepository({ database: db });
  await children.saveChildRecord({ id: 'control', first_name: 'Control', last_name: 'Child',
    class_id: 'class-1', created_by: 'office', sync_status: 'synced' });
  await children.saveChildClassMembership({ id: 'membership-control', child_id: 'control',
    class_id: 'class-1', academic_year_id: 'year-2026', enrolled_at: '2026-01-15T00:00:00.000Z',
    created_by: 'office', sync_status: 'synced' });
});
afterEach(async () => { jest.restoreAllMocks(); await db.closeAsync(); });

test('archiveChild refuses a class-only child without changing any domain or outbox row', async () => {
  const before = await snapshot();
  await expect(children.archiveChild('control', { actorUserId: 'user-1' }))
    .rejects.toMatchObject({ code: 'NOT_DELIVERY_CHILD' });
  expect(await snapshot()).toEqual(before);
});

test.each([
  ['updateChild', () => children.updateChild('control', { first_name: 'Changed', created_by: 'user-1' })],
  ['deleteIfNoHistory', () => children.deleteIfNoHistory('control')],
])('%s refuses a control child before touching domain or outbox rows', async (_name, write) => {
  const before = await snapshot();
  await expect(write()).rejects.toMatchObject({ code: 'NOT_DELIVERY_CHILD' });
  expect(await snapshot()).toEqual(before);
});

test('archiveClass cascades only delivery-or-creator children and preserves control rows and queued payloads byte-for-byte', async () => {
  await children.save({ id: 'delivery', first_name: 'Delivery', last_name: 'Child', class_id: 'class-1',
    created_by: 'office', synced: true }, { actorUserId: 'user-1' });
  await children.saveChildRecord({ id: 'creator', first_name: 'Created', last_name: 'Child', class_id: 'class-1',
    created_by: 'user-1', synced: true });
  await children.saveChildClassMembership({ id: 'membership-creator', child_id: 'creator', class_id: 'class-1',
    academic_year_id: 'year-2026', created_by: 'user-1', synced: true });
  await assign('other-ea');
  await assign('user-1', '2026-09-01');
  await db.runAsync(`insert into sync_outbox (id, table_name, record_id, operation, payload, owner_user_id)
    values ('control-pending', 'children', 'control', 'update', '{"id":"control","first_name":"Still queued"}', 'user-1')`);
  const control = await db.getFirstAsync("select * from children where id = 'control'");
  const membership = await db.getFirstAsync("select * from child_class_memberships where child_id = 'control'");
  const controlOutbox = await db.getAllAsync("select * from sync_outbox where record_id in ('control', 'membership-control') order by id");
  await classes.archiveClass('class-1', { actorUserId: 'other-ea', archivedAt: '2099-01-01T00:00:00.000Z' });
  expect(await db.getFirstAsync("select * from children where id = 'control'")).toEqual(control);
  expect(await db.getFirstAsync("select * from child_class_memberships where child_id = 'control'")).toEqual(membership);
  expect(await db.getAllAsync("select * from sync_outbox where record_id in ('control', 'membership-control') order by id")).toEqual(controlOutbox);
  expect(await db.getAllAsync("select id, class_id from children where id <> 'control' order by id"))
    .toEqual([{ id: 'creator', class_id: null }, { id: 'delivery', class_id: null }]);
  expect(await db.getAllAsync("select exited_at from child_class_memberships where child_id <> 'control'"))
    .toEqual([ { exited_at: '2099-01-01T00:00:00.000Z' }, { exited_at: '2099-01-01T00:00:00.000Z' } ]);
});

test.each(['class-only', 'creator-only', 'other-ea', 'ended-assignment'])(
  'mastery refuses %s without altering domain or outbox rows', async scope => {
    if (scope === 'creator-only') await db.runAsync("update children set created_by = 'user-1' where id = 'control'");
    if (scope === 'other-ea') await assign('other-ea');
    if (scope === 'ended-assignment') await assign('user-1', '2026-09-01');
    const before = await snapshot();
    await expect(mastery.setLetterMastery({ childId: 'control', letter: 'a', language: 'en', confirmed: true }))
      .rejects.toMatchObject({ code: 'NOT_DELIVERY_CHILD' });
    expect(await snapshot()).toEqual(before);
  }
);

const childWrites = {
  archiveChild: options => children.archiveChild('control', options),
  deleteIfNoHistory: options => children.deleteIfNoHistory('control', options),
  updateChild: options => children.updateChild('control', { first_name: 'Changed' }, options),
};

test.each(Object.keys(childWrites))('%s rejects another EA and an ended own assignment even with a spoofed actor option', async name => {
  await assign('other-ea');
  await assign('user-1', '2026-09-01');
  const before = await snapshot();
  await expect(childWrites[name]({ actorUserId: 'other-ea' })).rejects.toMatchObject({ code: 'NOT_DELIVERY_CHILD' });
  expect(await snapshot()).toEqual(before);
});

test.each(Object.keys(childWrites).flatMap(name => ['delivery', 'creator'].map(scope => [name, scope])))(
  '%s allows the signed-in %s through a caller transaction', async (name, scope) => {
    if (scope === 'delivery') await assign();
    else await db.runAsync("update children set created_by = 'user-1' where id = 'control'");
    await db.withExclusiveTransactionAsync(async transaction => {
      expect(await childWrites[name]({ transaction, actorUserId: 'unrelated-ea' })).toBe(true);
    });
    if (name === 'deleteIfNoHistory') {
      expect(await db.getFirstAsync("select * from children where id = 'control'")).toBeNull();
      expect(await db.getFirstAsync("select operation from sync_outbox where record_id = 'control'"))
        .toEqual({ operation: 'hard_delete' });
    } else {
      expect(await db.getFirstAsync("select sync_status from children where id = 'control'"))
        .toEqual({ sync_status: 'pending' });
      expect(await db.getFirstAsync("select operation from sync_outbox where record_id = 'control'"))
        .toEqual({ operation: name === 'archiveChild' ? 'archive' : 'update' });
    }
  }
);

test('write authority follows the bound actor rather than the supplied actorUserId', async () => {
  await db.runAsync("update children set created_by = 'user-1' where id = 'control'");
  await assign();
  bindTestActor(db, 'other-ea');
  const before = await snapshot();
  await expect(children.updateChild('control', { first_name: 'Changed' }, { actorUserId: 'user-1' }))
    .rejects.toMatchObject({ code: 'NOT_DELIVERY_CHILD' });
  expect(await snapshot()).toEqual(before);
});

test('the guard reads delivery authority inside the write transaction and a refusal rolls that transaction back', async () => {
  await assign();
  const before = await snapshot();
  await expect(db.withExclusiveTransactionAsync(async transaction => {
    await transaction.runAsync("update child_ea_assignments set unassigned_at = '2026-10-23' where user_id = 'user-1'");
    await children.archiveChild('control', { transaction });
  })).rejects.toMatchObject({ code: 'NOT_DELIVERY_CHILD' });
  expect(await snapshot()).toEqual(before);
});

test('an active pending assignment permits mastery and stamps the signed-in actor', async () => {
  await assign();
  await db.runAsync("update child_ea_assignments set sync_status = 'pending'");
  expect(await mastery.setLetterMastery({ childId: 'control', letter: 'a', language: 'en', confirmed: true }))
    .toMatchObject({ child_id: 'control', changed_by: 'user-1', confirmed: true });
  expect(await db.getFirstAsync("select owner_user_id from sync_outbox where table_name = 'letter_mastery'"))
    .toEqual({ owner_user_id: 'user-1' });
});

test('an unauthorised correction cannot replace an existing mastery row or its queued payload', async () => {
  await assign();
  await mastery.setLetterMastery({ childId: 'control', letter: 'a', language: 'en', confirmed: true });
  await db.runAsync("update child_ea_assignments set unassigned_at = '2026-10-23'");
  const before = await snapshot();
  await expect(mastery.setLetterMastery({ childId: 'control', letter: 'a', language: 'en', confirmed: false }))
    .rejects.toMatchObject({ code: 'NOT_DELIVERY_CHILD' });
  expect(await snapshot()).toEqual(before);
});

test('deleteChild returns the repository error code for a real class-only child without changing storage', async () => {
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  const history = () => ({ start: async () => {}, store: { reset: () => {} } });
  const signedIn = { handle: { userId: 'user-1', isCurrent: () => true }, repositories: {
    children, classes, groups: createGroupsRepository({ database: db }),
  }, services: { sessionHistory: history(), assessmentHistory: history() } };
  const wrapper = ({ children: content }) => <SignedInEAContext.Provider value={signedIn}>
    <ChildrenProvider>{content}</ChildrenProvider>
  </SignedInEAContext.Provider>;
  const { result, unmount } = renderHook(() => useChildren(), { wrapper });
  try {
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = await snapshot();
    let outcome;
    await act(async () => { outcome = await result.current.deleteChild('control'); });
    expect(outcome).toMatchObject({ success: false, error: { code: 'NOT_DELIVERY_CHILD' } });
    expect(await snapshot()).toEqual(before);
    expect(errorLog).toHaveBeenCalledWith('Error hiding child:', outcome.error);
  } finally { unmount(); }
});

test('a cascade outbox failure rolls back class, assignments, child and membership together', async () => {
  await assign();
  const before = await snapshot();
  await db.execAsync(`create trigger reject_cascade_outbox before insert on sync_outbox
    when new.table_name = 'children' begin select raise(abort, 'cascade outbox failed'); end;`);
  await expect(classes.archiveClass('class-1', { actorUserId: 'user-1' })).rejects.toMatchObject({
    code: 'SQLITE_CONSTRAINT_TRIGGER', message: 'cascade outbox failed',
  });
  expect(await snapshot()).toEqual(before);
});
