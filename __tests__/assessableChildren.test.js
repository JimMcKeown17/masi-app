jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createMigratedDatabase, seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

let db;
let repository;
const child = async (id, fields = {}) => {
  await db.runAsync(`insert into children
    (id, first_name, last_name, preferred_name, reading_level, class_id, history_reference, archived_at, hidden_at, sync_status)
    values (?, ?, 'Surname', 'Preferred', 'Word Reading', ?, ?, ?, ?, 'synced')`,
  id, fields.first_name || id, fields.class_id ?? 'class-1', fields.history_reference || 0,
  fields.archived_at || null, fields.hidden_at || null);
};
const grant = async (classId = 'class-1', { userId = 'user-1', programmeId = 'programme-a', endedAt = null } = {}) => {
  await db.runAsync(`insert into class_ea_assignments
    (id, class_id, ea_user_id, programme_id, assigned_at, unassigned_at)
    values (?, ?, ?, ?, '2026-01-15T00:00:00Z', ?)`,
  `${classId}-${userId}-${programmeId}`, classId, userId, programmeId, endedAt);
};
const membership = async (childId, { id = `membership-${childId}`, classId = 'class-1',
  year = 'year-2026', enrolledAt = '2026-02-01T00:00:00Z', exitedAt = null } = {}) => {
  await db.runAsync(`insert into child_class_memberships
    (id, child_id, class_id, academic_year_id, enrolled_at, exited_at) values (?, ?, ?, ?, ?, ?)`,
  id, childId, classId, year, enrolledAt, exitedAt);
};
const delivery = async (childId, { endedAt = null, programmeId = 'programme-a' } = {}) => {
  await db.runAsync(`insert into child_ea_assignments (id, child_id, user_id, unassigned_at)
    values (?, ?, 'user-1', ?)`, `delivery-${childId}`, childId, endedAt);
  await db.runAsync(`insert into child_programme_enrollments (id, child_id, programme_id)
    values (?, ?, ?)`, `enrollment-${childId}`, childId, programmeId);
};

beforeEach(async () => {
  db = await createMigratedDatabase(runMigrations);
  await seedCoreData(db);
  repository = createChildrenRepository({ database: db });
  await db.runAsync("update classes set home_language = 'en' where id = 'class-1'");
  await db.runAsync(`insert into academic_years (id, label, starts_on, ends_on)
    values ('year-2025', '2025', '2025-01-01', '2025-12-31'),
           ('year-2024', '2024', '2024-01-01', '2024-12-31')`);
  await db.runAsync(`insert into classes (id, school_id, name, grade, home_language, academic_year_id)
    values ('class-2', 'school-1', 'Other class', 'R', 'xh', 'year-2025')`);
});
afterEach(async () => { await db.closeAsync(); });

it('unions the exact delivery population and class-only children with no duplicates or writes', async () => {
  await grant();
  for (const id of ['both', 'control', 'delivery-only']) {
    await child(id);
    await membership(id, { classId: id === 'delivery-only' ? 'class-2' : 'class-1' });
  }
  await delivery('both');
  await delivery('delivery-only');
  const originalDelivery = await repository.getMyChildren('user-1');
  expect(originalDelivery.map(({ id }) => id).sort()).toEqual(['both', 'delivery-only']);
  const rows = await repository.getAssessableChildren('user-1');
  expect(rows).toHaveLength(3);
  expect(rows.filter(row => row.is_delivery).map(row => row.id).sort())
    .toEqual(originalDelivery.map(row => row.id).sort());
  expect(rows.find(row => row.id === 'control')).toEqual(expect.objectContaining({
    is_delivery: false, preferred_name: 'Preferred', reading_level: 'Word Reading',
    last_name: 'Surname', sync_status: 'synced', synced: true,
    class_id: 'class-1', grade: '1', home_language: 'en', membership_id: 'membership-control',
  }));
  expect(rows.find(row => row.id === 'both').is_delivery).toBe(true);
  expect(await repository.getMyChildren('user-1')).toEqual(originalDelivery);
  expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
});

it('excludes archived classes and children, history references, and closed memberships', async () => {
  await grant();
  await grant('class-2');
  await db.runAsync("update classes set archived_at = '2026-06-01' where id = 'class-2'");
  for (const id of ['valid', 'archived-class', 'archived-child', 'reference', 'exited']) {
    await child(id, { archived_at: id === 'archived-child' ? '2026-06-01' : null,
      history_reference: id === 'reference' ? 1 : 0 });
    await membership(id, { classId: id === 'archived-class' ? 'class-2' : 'class-1',
      exitedAt: id === 'exited' ? '2026-06-01' : null });
  }
  expect((await repository.getAssessableChildren('user-1')).map(row => row.id)).toEqual(['valid']);
});

it('requires the caller and active programme for class grants; an ended grant still permits delivery', async () => {
  await grant('class-1', { endedAt: '2026-06-01' });
  await grant('class-2', { userId: 'other-ea' });
  await grant('class-2', { programmeId: 'programme-b' });
  for (const id of ['ended-control', 'ended-delivery', 'other-grants']) {
    await child(id);
    await membership(id, { classId: id === 'other-grants' ? 'class-2' : 'class-1' });
  }
  await delivery('ended-delivery');
  expect(await repository.getAssessableChildren('user-1')).toEqual([
    expect.objectContaining({ id: 'ended-delivery', is_delivery: true, membership_id: null }),
  ]);
});

it('prefers the active-year assigned membership over a more recently enrolled prior-year membership', async () => {
  await grant();
  await grant('class-2');
  await child('two-years', { class_id: 'class-2' });
  await membership('two-years', { id: 'current', enrolledAt: '2026-02-01T00:00:00Z' });
  await membership('two-years', { id: 'prior', classId: 'class-2', year: 'year-2025', enrolledAt: '2026-06-01T00:00:00Z' });
  expect(await repository.getAssessableChildren('user-1')).toEqual([
    expect.objectContaining({ id: 'two-years', class_id: 'class-1', grade: '1', home_language: 'en', membership_id: 'current' }),
  ]);
});

it('uses the latest enrollment when no assigned membership is in the active year', async () => {
  await grant();
  await grant('class-2');
  await child('prior-only');
  await membership('prior-only', { id: 'older', year: 'year-2024', enrolledAt: '2025-01-01T00:00:00Z' });
  await membership('prior-only', { id: 'newer', classId: 'class-2', year: 'year-2025', enrolledAt: '2025-03-01T00:00:00Z' });
  expect(await repository.getAssessableChildren('user-1')).toEqual([
    expect.objectContaining({ class_id: 'class-2', grade: 'R', home_language: 'xh', membership_id: 'newer' }),
  ]);
});

it('breaks equal enrollment ties by ascending membership id, regardless of insertion order', async () => {
  await grant();
  await grant('class-2');
  await child('tie');
  await membership('tie', { id: 'z-membership', year: 'year-2024' });
  await membership('tie', { id: 'a-membership', classId: 'class-2', year: 'year-2025' });
  expect(await repository.getAssessableChildren('user-1')).toEqual([
    expect.objectContaining({ class_id: 'class-2', membership_id: 'a-membership' }),
  ]);
});

it('ignores unassigned active-year membership when selecting class metadata', async () => {
  await grant('class-2');
  await child('assigned-prior');
  await membership('assigned-prior', { id: 'unassigned-current' });
  await membership('assigned-prior', { id: 'assigned-prior', classId: 'class-2', year: 'year-2025' });
  expect(await repository.getAssessableChildren('user-1')).toEqual([
    expect.objectContaining({ class_id: 'class-2', membership_id: 'assigned-prior' }),
  ]);
});

it('falls back to the child class for delivery metadata and preserves null language on a chosen membership', async () => {
  await child('fallback', { class_id: 'class-2' });
  await membership('fallback');
  await delivery('fallback');
  expect(await repository.getAssessableChildren('user-1')).toEqual([
    expect.objectContaining({ id: 'fallback', is_delivery: true, class_id: 'class-2', grade: 'R', home_language: 'xh', membership_id: null }),
  ]);
  await grant();
  await db.runAsync("update classes set home_language = null where id = 'class-1'");
  expect(await repository.getAssessableChildren('user-1')).toEqual([
    expect.objectContaining({ class_id: 'class-1', grade: '1', home_language: null, membership_id: 'membership-fallback' }),
  ]);
});

it('keeps delivery scope literal, including hidden children and excluding unenrolled direct assignees', async () => {
  await child('hidden', { hidden_at: '2026-06-01' });
  await membership('hidden');
  await delivery('hidden');
  await child('direct-without-enrollment');
  await membership('direct-without-enrollment');
  await db.runAsync(`insert into child_ea_assignments (id, user_id, child_id)
    values ('direct-only', 'user-1', 'direct-without-enrollment')`);
  const expected = await repository.getMyChildren('user-1');
  expect(expected.map(row => row.id)).toEqual(['hidden']);
  expect((await repository.getAssessableChildren('user-1')).map(row => row.id)).toEqual(expected.map(row => row.id));
});

it('returns no class children without an open programme, and uses enrollment recency when no year is active', async () => {
  await grant();
  await child('control');
  await membership('control');
  await db.runAsync('update academic_years set is_active = 0');
  expect(await repository.getAssessableChildren('user-1')).toEqual([
    expect.objectContaining({ id: 'control', is_delivery: false, membership_id: 'membership-control' }),
  ]);
  await db.runAsync("update staff_programme_assignments set ended_at = '2026-06-01'");
  expect(await repository.getAssessableChildren('user-1')).toEqual([]);
});
