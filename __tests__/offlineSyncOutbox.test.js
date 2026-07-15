jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  supabase: {},
}));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import {
  AUTHENTICATED_DENIAL_MARKER,
  createOutboxSyncEngine,
  ensureReferenceData,
  pullReferenceData,
  _testComputeEvidencePending,
} from '../src/services/offlineSync';
import {
  childEaAssignmentDomainId,
  childProgrammeEnrollmentDomainId,
  classEaAssignmentDomainId,
  deterministicDomainId,
  getActiveProgrammeId,
  groupEaAssignmentDomainId,
} from '../src/db/repositories/domainRepositoryUtils';
import {
  createMigratedDatabase,
  seedCoreData,
} from '../test-support/sqliteRepositoryTestUtils';
import {
  createSchoolsRepository,
  createReferenceDataRepository,
} from '../src/db/repositories/referenceDataRepository';
import { createSessionsRepository } from '../src/db/repositories/sessionsRepository';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { createTimeEntriesRepository } from '../src/db/repositories/timeEntriesRepository';
import { repairGroupOwnershipForSync } from '../src/db/repositories/groupsRepository';

const createSupabaseMock = ({ upsertResults = {}, rpcResults = {} } = {}) => {
  const calls = [];
  const supabaseClient = {
    from: jest.fn((tableName) => ({
      upsert: jest.fn(async (payload, options) => {
        calls.push({ type: 'upsert', tableName, payload, options });
        const resultKey = Array.isArray(payload)
          ? `${tableName}:batch`
          : `${tableName}:${payload.id}`;
        const result = upsertResults[resultKey] || upsertResults[tableName];
        if (typeof result === 'function') {
          return result({ tableName, payload, options, calls });
        }
        return result || { error: null };
      }),
      delete: jest.fn(() => ({
        eq: jest.fn(async (column, value) => {
          calls.push({ type: 'delete', tableName, column, value });
          return { error: null };
        }),
      })),
    })),
    rpc: jest.fn(async (functionName, args) => {
      calls.push({ type: 'rpc', functionName, args });
      return rpcResults[functionName] || { data: true, error: null };
    }),
  };

  return { supabaseClient, calls };
};

const seedReferences = async (db) => {
  await db.runAsync("insert into schools (id, name, sync_status) values ('school-1', 'Masi Primary', 'synced')");
  await db.runAsync("insert into programmes (id, code, name, sync_status) values ('programme-1', 'lit', 'Literacy', 'synced')");
};

const liveTestSession = async () => ({
  data: { session: { user: { id: 'user-1' } } },
});

const enqueue = async (db, tableName, recordId, operation, payload) => {
  const outbox = createSyncOutboxRepository({ database: db });
  await outbox.enqueue({ tableName, recordId, operation, payload });
};

const seedAssessmentItems = async (db, itemIds = [
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000103',
]) => {
  await db.runAsync(`
    insert into children (id, first_name, last_name, sync_status)
    values ('child-assessment-1', 'Amahle', 'Dlamini', 'synced')
  `);
  await db.runAsync(`
    insert into assessments (
      id,
      user_id,
      child_id,
      programme_id,
      assessment_type,
      assessment_date,
      sync_status
    )
    values (
      'assessment-batch-1',
      'user-1',
      'child-assessment-1',
      'programme-1',
      'letter_sounds',
      '2026-05-25',
      'synced'
    )
  `);

  for (const [index, itemId] of itemIds.entries()) {
    const item = {
      id: itemId,
      assessment_id: 'assessment-batch-1',
      item_key: `letter-${index + 1}`,
      prompt: String.fromCharCode(97 + index),
      response: String.fromCharCode(97 + index),
      is_correct: 1,
      position: index,
      metadata: '{}',
    };
    await db.runAsync(`
      insert into assessment_items (
        id,
        assessment_id,
        item_key,
        prompt,
        response,
        is_correct,
        position,
        metadata,
        sync_status
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `, item.id, item.assessment_id, item.item_key, item.prompt, item.response, item.is_correct, item.position, item.metadata);
    await enqueue(db, 'assessment_items', item.id, 'insert', item);
  }

  return itemIds;
};

const seedChildArchiveGraph = async (db) => {
  await db.runAsync(`
    insert into academic_years (id, label, starts_on, ends_on, is_active, sync_status)
    values ('year-2026', '2026', '2026-01-15', '2026-12-15', 1, 'synced')
  `);
  await db.runAsync(`
    insert into classes (id, school_id, name, grade, academic_year_id, sync_status)
    values ('class-archive', 'school-1', 'Grade 1A', '1', 'year-2026', 'synced')
  `);
  await db.runAsync(`
    insert into children (id, first_name, last_name, class_id, created_by, sync_status)
    values ('child-archive', 'Amahle', 'Dlamini', 'class-archive', 'user-1', 'synced')
  `);
  await db.runAsync(`
    insert into child_ea_assignments (
      id, user_id, child_id, assigned_at, created_by, sync_status
    )
    values (
      'assignment-archive', 'user-1', 'child-archive',
      '2026-05-01T00:00:00.000Z', 'user-1', 'pending'
    )
  `);
  await db.runAsync(`
    insert into child_programme_enrollments (
      id, child_id, programme_id, enrolled_at, created_by, sync_status
    )
    values (
      'enrollment-archive', 'child-archive', 'programme-1',
      '2026-05-01T00:00:00.000Z', 'user-1', 'pending'
    )
  `);
  await db.runAsync(`
    insert into child_class_memberships (
      id, child_id, class_id, academic_year_id, enrolled_at, created_by, sync_status
    )
    values (
      'class-membership-archive', 'child-archive', 'class-archive', 'year-2026',
      '2026-05-01T00:00:00.000Z', 'user-1', 'pending'
    )
  `);
  await db.runAsync(`
    insert into groups (id, name, programme_id, class_id, created_by, sync_status)
    values ('group-archive', 'Group 1', 'programme-1', 'class-archive', 'user-1', 'synced')
  `);
  await db.runAsync(`
    insert into group_ea_assignments (
      id, group_id, ea_user_id, programme_id, assigned_at, created_by, sync_status
    )
    values (
      'group-assignment-archive', 'group-archive', 'user-1', 'programme-1',
      '2026-05-01T00:00:00.000Z', 'user-1', 'pending'
    )
  `);
  await db.runAsync(`
    insert into child_group_memberships (
      id, child_id, group_id, joined_at, created_by, sync_status
    )
    values (
      'group-membership-archive', 'child-archive', 'group-archive',
      '2026-05-01T00:00:00.000Z', 'user-1', 'pending'
    )
  `);

  return {
    archivedAt: '2026-05-25T12:00:00.000Z',
    childId: 'child-archive',
    groupId: 'group-archive',
    assignmentId: 'assignment-archive',
    groupAssignmentId: 'group-assignment-archive',
    enrollmentId: 'enrollment-archive',
    classMembershipId: 'class-membership-archive',
    groupMembershipId: 'group-membership-archive',
  };
};

describe('SQLite outbox offline sync', () => {
  let db;

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase();
    await runMigrations(db);
    await seedReferences(db);
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  test('Sync Now (force) resurrects terminal rows; auto-sync leaves them terminal', async () => {
    await db.runAsync(`
      insert into classes (id, school_id, name, grade, sync_status)
      values ('class-term', 'school-1', 'Grade 1A', '1', 'terminal')
    `);
    await enqueue(db, 'classes', 'class-term', 'insert', { id: 'class-term', school_id: 'school-1', name: 'Grade 1A', grade: '1' });
    const outbox = createSyncOutboxRepository({ database: db });
    await outbox.markTerminalFailure('classes:class-term:insert', { errorMessage: 'RLS denied' });

    // Auto-sync (non-force): the terminal row is NOT retried and stays terminal.
    const auto = createSupabaseMock();
    await createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient: auto.supabaseClient }).syncAll();
    expect(auto.calls.filter((c) => c.tableName === 'classes')).toEqual([]);
    expect((await outbox.getById('classes:class-term:insert')).status).toBe('terminal');

    // Sync Now (force): the terminal row is resurrected, uploaded, and finalized synced.
    const forced = createSupabaseMock();
    await createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient: forced.supabaseClient }).syncAll({ force: true });
    expect(forced.calls.map((c) => `${c.type}:${c.tableName}`)).toEqual(['upsert:classes']);
    expect(await db.getFirstAsync('select sync_status from classes where id = ?', 'class-term'))
      .toEqual({ sync_status: 'synced' });
  });

  test('processes parents before children and finalizes success locally', async () => {
    await db.runAsync(`
      insert into classes (id, school_id, name, grade, sync_status)
      values ('class-1', 'school-1', 'Grade 1A', '1', 'pending')
    `);
    await db.runAsync(`
      insert into children (id, first_name, last_name, class_id, sync_status)
      values ('child-1', 'Amahle', 'Dlamini', 'class-1', 'pending')
    `);
    await db.runAsync(`
      insert into child_ea_assignments (id, user_id, child_id, sync_status)
      values ('assignment-1', 'user-1', 'child-1', 'pending')
    `);

    await enqueue(db, 'child_ea_assignments', 'assignment-1', 'insert', { id: 'assignment-1', user_id: 'user-1', child_id: 'child-1' });
    await enqueue(db, 'children', 'child-1', 'insert', { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1' });
    await enqueue(db, 'classes', 'class-1', 'insert', { id: 'class-1', school_id: 'school-1', name: 'Grade 1A', grade: '1' });

    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(true);
    expect(calls.map(call => `${call.type}:${call.tableName}`)).toEqual([
      'upsert:classes',
      'upsert:children',
      'upsert:child_ea_assignments',
    ]);
    expect(await db.getFirstAsync('select sync_status, last_sync_error from classes where id = ?', 'class-1'))
      .toEqual({ sync_status: 'synced', last_sync_error: null });
    expect(await db.getFirstAsync('select sync_status, last_sync_error from children where id = ?', 'child-1'))
      .toEqual({ sync_status: 'synced', last_sync_error: null });
    expect(await db.getFirstAsync('select sync_status, last_sync_error from child_ea_assignments where id = ?', 'assignment-1'))
      .toEqual({ sync_status: 'synced', last_sync_error: null });
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
  });

  test.each([
    {
      tableName: 'child_ea_assignments',
      recordId: 'random-child-ea-assignment',
      seed: async () => {
        await db.runAsync(`
          insert into children (id, first_name, last_name, created_by, sync_status)
          values ('child-remap-1', 'Amahle', 'Dlamini', 'user-1', 'synced')
        `);
        await db.runAsync(`
          insert into child_ea_assignments (id, user_id, child_id, created_by, sync_status)
          values ('random-child-ea-assignment', 'user-1', 'child-remap-1', 'user-1', 'pending')
        `);
      },
      payload: {
        id: 'random-child-ea-assignment',
        user_id: 'user-1',
        child_id: 'child-remap-1',
        created_by: 'user-1',
      },
      expectedId: () => childEaAssignmentDomainId({ userId: 'user-1', childId: 'child-remap-1' }),
    },
    {
      tableName: 'child_programme_enrollments',
      recordId: 'random-child-programme-enrollment',
      seed: async () => {
        await db.runAsync(`
          insert into children (id, first_name, last_name, created_by, sync_status)
          values ('child-remap-2', 'Amahle', 'Dlamini', 'user-1', 'synced')
        `);
        await db.runAsync(`
          insert into child_programme_enrollments (id, child_id, programme_id, created_by, sync_status)
          values ('random-child-programme-enrollment', 'child-remap-2', 'programme-1', 'user-1', 'pending')
        `);
      },
      payload: {
        id: 'random-child-programme-enrollment',
        child_id: 'child-remap-2',
        programme_id: 'programme-1',
        created_by: 'user-1',
      },
      expectedId: () => childProgrammeEnrollmentDomainId({ childId: 'child-remap-2', programmeId: 'programme-1' }),
    },
    {
      tableName: 'class_ea_assignments',
      recordId: 'random-class-ea-assignment',
      seed: async () => {
        await db.runAsync(`
          insert into classes (id, school_id, name, grade, sync_status)
          values ('class-remap-1', 'school-1', 'Grade 1A', '1', 'synced')
        `);
        await db.runAsync(`
          insert into class_ea_assignments (
            id,
            class_id,
            ea_user_id,
            programme_id,
            created_by,
            sync_status
          )
          values (
            'random-class-ea-assignment',
            'class-remap-1',
            'user-1',
            'programme-1',
            'user-1',
            'pending'
          )
        `);
      },
      payload: {
        id: 'random-class-ea-assignment',
        class_id: 'class-remap-1',
        ea_user_id: 'user-1',
        programme_id: 'programme-1',
        created_by: 'user-1',
      },
      expectedId: () => classEaAssignmentDomainId({
        classId: 'class-remap-1',
        eaUserId: 'user-1',
        programmeId: 'programme-1',
      }),
    },
    {
      tableName: 'group_ea_assignments',
      recordId: 'random-group-ea-assignment',
      seed: async () => {
        await db.runAsync(`
          insert into groups (id, name, programme_id, created_by, sync_status)
          values ('group-remap-1', 'Group 1', 'programme-1', 'user-1', 'synced')
        `);
        await db.runAsync(`
          insert into group_ea_assignments (
            id,
            group_id,
            ea_user_id,
            programme_id,
            created_by,
            sync_status
          )
          values (
            'random-group-ea-assignment',
            'group-remap-1',
            'user-1',
            'programme-1',
            'user-1',
            'pending'
          )
        `);
      },
      payload: {
        id: 'random-group-ea-assignment',
        group_id: 'group-remap-1',
        ea_user_id: 'user-1',
        programme_id: 'programme-1',
        created_by: 'user-1',
      },
      expectedId: () => groupEaAssignmentDomainId({ groupId: 'group-remap-1' }),
    },
  ])('push remaps $tableName insert payload id to its deterministic id (#47)', async ({
    tableName,
    recordId,
    seed,
    payload,
    expectedId,
  }) => {
    await seed();
    await enqueue(db, tableName, recordId, 'insert', payload);

    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll({ tableName });

    expect(result.success).toBe(true);
    const upserts = calls.filter(call => call.type === 'upsert' && call.tableName === tableName);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].payload.id).toBe(expectedId());
    expect(upserts[0].payload.id).not.toBe(recordId);
  });

  test('bare child_ea_assignments archive keeps its real id, not a bogus deterministic id (#47)', async () => {
    const archivedAt = '2026-07-09T10:00:00.000Z';
    await db.runAsync(`
      insert into children (id, first_name, last_name, created_by, sync_status)
      values ('child-archive-remap', 'Amahle', 'Dlamini', 'user-1', 'synced')
    `);
    await db.runAsync(`
      insert into child_ea_assignments (
        id,
        user_id,
        child_id,
        created_by,
        assigned_at,
        unassigned_at,
        sync_status
      )
      values (
        'random-1',
        'user-1',
        'child-archive-remap',
        'user-1',
        '2026-07-01T10:00:00.000Z',
        ?,
        'pending'
      )
    `, archivedAt);
    await enqueue(db, 'child_ea_assignments', 'random-1', 'archive', {
      id: 'random-1',
      unassigned_at: archivedAt,
    });

    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll({ tableName: 'child_ea_assignments' });

    expect(result.success).toBe(true);
    const upserts = calls.filter(call => (
      call.type === 'upsert' && call.tableName === 'child_ea_assignments'
    ));
    expect(upserts).toHaveLength(1);
    expect(upserts[0].payload).toEqual({
      id: 'random-1',
      unassigned_at: archivedAt,
    });
    expect(upserts[0].payload.id).not.toBe(deterministicDomainId('child_ea_assignments', undefined));
    expect(upserts[0].payload.id).not.toBe(childEaAssignmentDomainId({
      userId: undefined,
      childId: undefined,
    }));
  });

  test('syncs stale group ownership payloads after the versioned startup repair', async () => {
    await db.runAsync(`
      insert into staff_programme_assignments (
        id,
        user_id,
        programme_id,
        school_id,
        assigned_at,
        sync_status
      )
      values (
        'spa-user-1',
        'user-1',
        'programme-1',
        'school-1',
        '2026-05-21T08:00:00.000Z',
        'synced'
      )
    `);
    await db.runAsync(`
      insert into children (
        id,
        first_name,
        last_name,
        created_by,
        sync_status
      )
      values (
        'child-stale-group',
        'Amahle',
        'Dlamini',
        'user-1',
        'synced'
      )
    `);
    await db.runAsync(`
      insert into child_ea_assignments (
        id,
        user_id,
        child_id,
        created_by,
        sync_status
      )
      values (
        'assignment-stale-group',
        'user-1',
        'child-stale-group',
        'user-1',
        'synced'
      )
    `);
    await db.runAsync(`
      insert into groups (
        id,
        name,
        programme_id,
        created_by,
        created_at,
        sync_status,
        last_sync_error
      )
      values (
        'group-stale-owner',
        'Group 1',
        'programme-1',
        null,
        '2026-05-25T18:39:00.000Z',
        'failed',
        'new row violates row-level security policy for table "groups"'
      )
    `);
    await db.runAsync(`
      insert into child_group_memberships (
        id,
        child_id,
        group_id,
        joined_at,
        created_by,
        sync_status,
        last_sync_error
      )
      values (
        'membership-stale-owner',
        'child-stale-group',
        'group-stale-owner',
        '2026-05-25T18:39:00.000Z',
        null,
        'failed',
        'new row violates row-level security policy for table "child_group_memberships"'
      )
    `);
    await enqueue(db, 'groups', 'group-stale-owner', 'insert', {
      id: 'group-stale-owner',
      name: 'Group 1',
      programme_id: 'programme-1',
      staff_id: 'user-1',
      created_at: '2026-05-25T18:39:00.000Z',
    });
    await enqueue(db, 'child_group_memberships', 'membership-stale-owner', 'insert', {
      id: 'membership-stale-owner',
      child_id: 'child-stale-group',
      group_id: 'group-stale-owner',
      joined_at: '2026-05-25T18:39:00.000Z',
    });
    await db.runAsync(`
      update sync_outbox
      set status = 'failed',
          last_error = 'new row violates row-level security policy',
          next_retry_at = null
    `);

    const { supabaseClient, calls } = createSupabaseMock({
      upsertResults: {
        groups: ({ payload }) => (
          payload.created_by
            ? { error: null }
            : { error: { message: 'new row violates row-level security policy for table "groups"' } }
        ),
        child_group_memberships: ({ payload }) => (
          payload.created_by
            ? { error: null }
            : { error: { message: 'new row violates row-level security policy for table "child_group_memberships"' } }
        ),
      },
    });
    await repairGroupOwnershipForSync({ database: db });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(true);
    expect(calls.map(call => call.tableName)).toEqual([
      'groups',
      'group_ea_assignments',
      'child_group_memberships',
    ]);
    expect(calls.find(call => call.tableName === 'groups').payload)
      .toEqual(expect.objectContaining({ created_by: 'user-1' }));
    expect(calls.find(call => call.tableName === 'group_ea_assignments').payload)
      .toEqual(expect.objectContaining({
        group_id: 'group-stale-owner',
        ea_user_id: 'user-1',
        programme_id: 'programme-1',
        created_by: 'user-1',
      }));
    expect(calls.find(call => call.tableName === 'child_group_memberships').payload)
      .toEqual(expect.objectContaining({ created_by: 'user-1' }));
    expect(await db.getFirstAsync('select created_by, sync_status, last_sync_error from groups where id = ?', 'group-stale-owner'))
      .toEqual({ created_by: 'user-1', sync_status: 'synced', last_sync_error: null });
    expect(await db.getFirstAsync('select created_by, sync_status, last_sync_error from child_group_memberships where id = ?', 'membership-stale-owner'))
      .toEqual({ created_by: 'user-1', sync_status: 'synced', last_sync_error: null });
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
  });

  test('syncs a stale membership after the versioned startup repair creates its assignment', async () => {
    await db.runAsync(`
      insert into staff_programme_assignments (
        id,
        user_id,
        programme_id,
        school_id,
        assigned_at,
        sync_status
      )
      values (
        'spa-user-1',
        'user-1',
        'programme-1',
        'school-1',
        '2026-05-21T08:00:00.000Z',
        'synced'
      )
    `);
    await db.runAsync(`
      insert into children (
        id,
        first_name,
        last_name,
        created_by,
        sync_status
      )
      values (
        'child-membership-only',
        'Amahle',
        'Dlamini',
        'user-1',
        'synced'
      )
    `);
    await db.runAsync(`
      insert into child_ea_assignments (
        id,
        user_id,
        child_id,
        created_by,
        sync_status
      )
      values (
        'assignment-membership-only',
        'user-1',
        'child-membership-only',
        'user-1',
        'synced'
      )
    `);
    await db.runAsync(`
      insert into groups (
        id,
        name,
        programme_id,
        created_by,
        created_at,
        sync_status
      )
      values (
        'group-membership-only',
        'Group 1',
        'programme-1',
        'user-1',
        '2026-05-25T18:39:00.000Z',
        'synced'
      )
    `);
    await db.runAsync(`
      insert into child_group_memberships (
        id,
        child_id,
        group_id,
        joined_at,
        created_by,
        sync_status,
        last_sync_error
      )
      values (
        'membership-only-stale-owner',
        'child-membership-only',
        'group-membership-only',
        '2026-05-25T18:39:00.000Z',
        null,
        'failed',
        'new row violates row-level security policy for table "child_group_memberships"'
      )
    `);
    await enqueue(db, 'child_group_memberships', 'membership-only-stale-owner', 'insert', {
      id: 'membership-only-stale-owner',
      child_id: 'child-membership-only',
      group_id: 'group-membership-only',
      joined_at: '2026-05-25T18:39:00.000Z',
    });
    await db.runAsync(`
      update sync_outbox
      set status = 'failed',
          last_error = 'new row violates row-level security policy',
          next_retry_at = null
    `);

    const { supabaseClient, calls } = createSupabaseMock();
    await repairGroupOwnershipForSync({ database: db });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(true);
    expect(calls.map(call => call.tableName)).toEqual([
      'group_ea_assignments',
      'child_group_memberships',
    ]);
    expect(calls.find(call => call.tableName === 'group_ea_assignments').payload)
      .toEqual(expect.objectContaining({
        group_id: 'group-membership-only',
        ea_user_id: 'user-1',
        programme_id: 'programme-1',
        created_by: 'user-1',
      }));
    expect(await db.getFirstAsync(`
      select created_by, sync_status, last_sync_error
      from child_group_memberships
      where id = 'membership-only-stale-owner'
    `)).toEqual({ created_by: 'user-1', sync_status: 'synced', last_sync_error: null });
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
  });

  test('assignment insert retries do not attempt identity-changing updates', async () => {
    await db.runAsync(`
      insert into groups (id, name, programme_id, created_by, sync_status)
      values ('group-existing-assignment', 'Group 1', 'programme-1', 'user-1', 'synced')
    `);
    await db.runAsync(`
      insert into group_ea_assignments (
        id,
        group_id,
        ea_user_id,
        programme_id,
        assigned_at,
        created_by,
        sync_status
      )
      values (
        'group-assignment-existing',
        'group-existing-assignment',
        'user-1',
        'programme-1',
        '2026-05-25T23:01:45.910Z',
        'user-1',
        'pending'
      )
    `);
    await enqueue(db, 'group_ea_assignments', 'group-assignment-existing', 'insert', {
      id: 'group-assignment-existing',
      group_id: 'group-existing-assignment',
      ea_user_id: 'user-1',
      programme_id: 'programme-1',
      assigned_at: '2026-05-26T15:01:30.000Z',
      created_by: 'user-1',
    });

    const { supabaseClient, calls } = createSupabaseMock({
      upsertResults: {
        group_ea_assignments: ({ options }) => (
          options.ignoreDuplicates === true
            ? { error: null }
            : {
              error: {
                code: '23514',
                message: 'group_ea_assignments identity columns cannot be changed after insert',
              },
            }
        ),
      },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(true);
    expect(calls).toEqual([
      expect.objectContaining({
        type: 'upsert',
        tableName: 'group_ea_assignments',
        options: expect.objectContaining({
          onConflict: 'id',
          ignoreDuplicates: true,
        }),
      }),
    ]);
    expect(await db.getFirstAsync(`
      select sync_status, last_sync_error
      from group_ea_assignments
      where id = 'group-assignment-existing'
    `)).toEqual({ sync_status: 'synced', last_sync_error: null });
  });

  test('a 23514 identity-trigger rejection on an archive re-push is terminal, not infinite retry (#48)', async () => {
    await db.runAsync(`
      insert into groups (id, name, programme_id, created_by, sync_status)
      values ('g-1', 'G', 'programme-1', 'user-1', 'synced')
    `);
    await enqueue(db, 'group_ea_assignments', 'gea-1', 'archive', {
      id: 'gea-1',
      group_id: 'g-1',
      ea_user_id: 'user-1',
      programme_id: 'programme-1',
      created_by: 'user-1',
      unassigned_at: '2026-07-08T00:00:00.000Z',
    });

    const { supabaseClient } = createSupabaseMock({
      upsertResults: {
        group_ea_assignments: ({ options }) => (
          options.ignoreDuplicates === true
            ? { error: null }
            : {
              error: {
                code: '23514',
                message: 'group_ea_assignments identity columns cannot be changed after insert',
              },
            }
        ),
      },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll();

    const outboxRow = await db.getFirstAsync(`
      select status, last_error
      from sync_outbox
      where table_name = 'group_ea_assignments'
        and record_id = 'gea-1'
    `);
    expect(outboxRow.status).toBe('terminal');
    expect(outboxRow.last_error).toMatch(/identity/i);
  });

  describe('computeEvidencePending (#48)', () => {
    test('FK-parent evidence: true when the parent has a pending outbox row', async () => {
      await db.runAsync(`
        insert into children (id, first_name, last_name, sync_status)
        values ('child-1', 'Amahle', 'Dlamini', 'synced')
      `);
      await db.runAsync(`
        insert into assessments (
          id,
          child_id,
          user_id,
          programme_id,
          assessment_type,
          assessment_date,
          sync_status
        )
        values (
          'asmt-1',
          'child-1',
          'user-1',
          'programme-1',
          'egra',
          '2026-07-08',
          'pending'
        )
      `);
      await enqueue(db, 'assessments', 'asmt-1', 'insert', {
        id: 'asmt-1',
        child_id: 'child-1',
      });
      const outboxRepository = createSyncOutboxRepository({ database: db });

      const pending = await _testComputeEvidencePending({
        database: db,
        outboxRepository,
        outboxRecord: {
          table_name: 'assessment_items',
          record_id: 'ai-1',
          payload: { id: 'ai-1', assessment_id: 'asmt-1' },
        },
        includeGrant: false,
      });

      expect(pending).toBe(true);
    });

    test('grant evidence: true when the granting child_ea_assignment is unsynced (42501 only)', async () => {
      await db.runAsync(`
        insert into children (id, first_name, last_name, sync_status)
        values ('child-1', 'Amahle', 'Dlamini', 'synced')
      `);
      await db.runAsync(`
        insert into child_ea_assignments (
          id,
          child_id,
          user_id,
          created_by,
          sync_status
        )
        values (
          'cea-1',
          'child-1',
          'user-1',
          'user-1',
          'pending'
        )
      `);
      const outboxRepository = createSyncOutboxRepository({ database: db });
      const record = {
        table_name: 'session_attendees',
        record_id: 'sa-1',
        payload: { id: 'sa-1', child_id: 'child-1', session_id: 's-1' },
      };

      expect(await _testComputeEvidencePending({
        database: db,
        outboxRepository,
        outboxRecord: record,
        includeGrant: true,
      })).toBe(true);
      expect(await _testComputeEvidencePending({
        database: db,
        outboxRepository,
        outboxRecord: record,
        includeGrant: false,
      })).toBe(false);
    });

    test('domain-row fallback: an archive payload with only id still yields evidence', async () => {
      await db.runAsync(`
        insert into children (id, first_name, last_name, sync_status)
        values ('child-2', 'Amahle', 'Dlamini', 'synced')
      `);
      await db.runAsync(`
        insert into groups (id, name, programme_id, created_by, sync_status)
        values ('g-1', 'G', 'programme-1', 'user-1', 'synced')
      `);
      await db.runAsync(`
        insert into child_ea_assignments (
          id,
          child_id,
          user_id,
          created_by,
          sync_status
        )
        values (
          'cea-2',
          'child-2',
          'user-1',
          'user-1',
          'pending'
        )
      `);
      await db.runAsync(`
        insert into child_group_memberships (
          id,
          child_id,
          group_id,
          sync_status
        )
        values (
          'cgm-1',
          'child-2',
          'g-1',
          'pending'
        )
      `);
      const outboxRepository = createSyncOutboxRepository({ database: db });
      const record = {
        table_name: 'child_group_memberships',
        record_id: 'cgm-1',
        payload: { id: 'cgm-1', removed_at: '2026-07-08T00:00:00Z' },
      };

      expect(await _testComputeEvidencePending({
        database: db,
        outboxRepository,
        outboxRecord: record,
        includeGrant: true,
      })).toBe(true);
    });

    test('false when no parent and no grant is pending (genuine denial)', async () => {
      await db.runAsync(`
        insert into children (id, first_name, last_name, sync_status)
        values ('child-3', 'Amahle', 'Dlamini', 'synced')
      `);
      await db.runAsync(`
        insert into child_ea_assignments (
          id,
          child_id,
          user_id,
          created_by,
          sync_status
        )
        values (
          'cea-3',
          'child-3',
          'user-1',
          'user-1',
          'synced'
        )
      `);
      const outboxRepository = createSyncOutboxRepository({ database: db });
      const record = {
        table_name: 'session_attendees',
        record_id: 'sa-9',
        payload: { id: 'sa-9', child_id: 'child-3', session_id: 's-9' },
      };

      expect(await _testComputeEvidencePending({
        database: db,
        outboxRepository,
        outboxRecord: record,
        includeGrant: true,
      })).toBe(false);
    });
  });

  test('AC2: a 42501 stays retriable while its FK parent is pending, then succeeds after the parent syncs (#48)', async () => {
    await db.runAsync(`
      insert into children (id, first_name, last_name, sync_status)
      values ('child-1', 'Amahle', 'Dlamini', 'synced')
    `);
    await db.runAsync(`
      insert into assessments (
        id,
        child_id,
        user_id,
        programme_id,
        assessment_type,
        assessment_date,
        sync_status
      )
      values (
        'asmt-1',
        'child-1',
        'user-1',
        'programme-1',
        'egra',
        '2026-07-08',
        'pending'
      )
    `);
    await enqueue(db, 'assessments', 'asmt-1', 'insert', {
      id: 'asmt-1',
      child_id: 'child-1',
      user_id: 'user-1',
      programme_id: 'programme-1',
      assessment_type: 'egra',
      assessment_date: '2026-07-08',
    });
    await db.runAsync(`
      insert into assessment_items (id, assessment_id, item_key, sync_status)
      values ('ai-1', 'asmt-1', 'letter-a', 'pending')
    `);
    await enqueue(db, 'assessment_items', 'ai-1', 'insert', {
      id: 'ai-1',
      assessment_id: 'asmt-1',
      item_key: 'letter-a',
    });

    let denyItem = true;
    const { supabaseClient } = createSupabaseMock({
      upsertResults: {
        assessment_items: () => (
          denyItem
            ? { error: { code: '42501', message: 'row-level security' } }
            : { error: null }
        ),
        assessments: { error: null },
      },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll({ tableName: 'assessment_items' });
    let item = await db.getFirstAsync(`
      select status, last_error
      from sync_outbox
      where record_id = 'ai-1'
    `);
    expect(item.status).toBe('failed');
    expect(item.last_error || '').not.toContain(AUTHENTICATED_DENIAL_MARKER);

    denyItem = false;
    await engine.syncAll({ force: true });
    item = await db.getFirstAsync(`
      select id
      from sync_outbox
      where record_id = 'ai-1'
    `);
    expect(item).toBeFalsy();
  });

  test('a 42501 with a live session and no pending evidence is terminal and marked (#48)', async () => {
    await db.runAsync(`
      insert into children (id, first_name, last_name, sync_status)
      values ('child-2', 'Amahle', 'Dlamini', 'synced')
    `);
    await db.runAsync(`
      insert into assessments (
        id,
        child_id,
        user_id,
        programme_id,
        assessment_type,
        assessment_date,
        sync_status
      )
      values (
        'asmt-2',
        'child-2',
        'user-1',
        'programme-1',
        'egra',
        '2026-07-08',
        'synced'
      )
    `);
    await db.runAsync(`
      insert into child_ea_assignments (id, child_id, user_id, created_by, sync_status)
      values ('cea-2', 'child-2', 'user-1', 'user-1', 'synced')
    `);
    await db.runAsync(`
      insert into assessment_items (id, assessment_id, item_key, sync_status)
      values ('ai-2', 'asmt-2', 'letter-b', 'pending')
    `);
    await enqueue(db, 'assessment_items', 'ai-2', 'insert', {
      id: 'ai-2',
      assessment_id: 'asmt-2',
      item_key: 'letter-b',
    });

    const { supabaseClient } = createSupabaseMock({
      upsertResults: {
        assessment_items: { error: { code: '42501', message: 'row-level security' } },
      },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll({ tableName: 'assessment_items' });

    const item = await db.getFirstAsync(`
      select status, last_error
      from sync_outbox
      where record_id = 'ai-2'
    `);
    expect(item.status).toBe('terminal');
    expect(item.last_error).toContain(AUTHENTICATED_DENIAL_MARKER);
  });

  test('a 42501 stays retriable while the granting child_ea_assignment is unsynced (#48)', async () => {
    await db.runAsync(`
      insert into children (id, first_name, last_name, sync_status)
      values ('child-3', 'Amahle', 'Dlamini', 'synced')
    `);
    await db.runAsync(`
      insert into sessions (
        id,
        user_id,
        programme_id,
        session_date,
        sync_status
      )
      values (
        's-3',
        'user-1',
        'programme-1',
        '2026-07-08',
        'synced'
      )
    `);
    await db.runAsync(`
      insert into child_ea_assignments (id, child_id, user_id, created_by, sync_status)
      values ('cea-3', 'child-3', 'user-1', 'user-1', 'pending')
    `);
    await db.runAsync(`
      insert into session_attendees (id, session_id, child_id, sync_status)
      values ('sa-3', 's-3', 'child-3', 'pending')
    `);
    await enqueue(db, 'session_attendees', 'sa-3', 'insert', {
      id: 'sa-3',
      session_id: 's-3',
      child_id: 'child-3',
    });

    const { supabaseClient } = createSupabaseMock({
      upsertResults: {
        session_attendees: { error: { code: '42501', message: 'row-level security' } },
      },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    await engine.syncAll({ tableName: 'session_attendees' });

    const attendee = await db.getFirstAsync(`
      select status, last_error
      from sync_outbox
      where record_id = 'sa-3'
    `);
    expect(attendee.status).toBe('failed');
    expect(attendee.last_error || '').not.toContain(AUTHENTICATED_DENIAL_MARKER);
  });

  test('time entry repository writes are consumed by the sync engine', async () => {
    const repository = createTimeEntriesRepository({ database: db });
    await repository.saveTimeEntry({
      id: 'time-1',
      user_id: 'user-1',
      sign_in_time: '2026-05-21T08:00:00.000Z',
      sign_in_lat: -34.1,
      sign_in_lon: 18.4,
      synced: false,
      created_at: '2026-05-21T08:00:00.000Z',
      updated_at: '2026-05-21T08:00:00.000Z',
    });

    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(true);
    expect(calls).toEqual([
      expect.objectContaining({
        type: 'upsert',
        tableName: 'time_entries',
        payload: expect.objectContaining({
          id: 'time-1',
          user_id: 'user-1',
          sign_in_time: '2026-05-21T08:00:00.000Z',
        }),
      }),
    ]);
    expect(await db.getFirstAsync('select sync_status, last_sync_error from time_entries where id = ?', 'time-1'))
      .toEqual({ sync_status: 'synced', last_sync_error: null });
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
  });

  test('routes sync server writes through the Supabase request queue boundary', async () => {
    await db.runAsync(`
      insert into classes (id, school_id, name, grade, sync_status)
      values ('class-queued', 'school-1', 'Grade 1Q', '1', 'pending')
    `);
    await enqueue(db, 'classes', 'class-queued', 'insert', {
      id: 'class-queued',
      school_id: 'school-1',
      name: 'Grade 1Q',
      grade: '1',
    });
    const events = [];
    const supabaseClient = {
      from: jest.fn((tableName) => ({
        upsert: jest.fn(async () => {
          events.push(`server:${tableName}`);
          return { error: null };
        }),
      })),
    };
    const enqueueRequest = jest.fn(async (task) => {
      events.push('queue:start');
      const result = await task();
      events.push('queue:end');
      return result;
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient, enqueueRequest });

    const result = await engine.syncAll();

    expect(result.success).toBe(true);
    expect(enqueueRequest).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['queue:start', 'server:classes', 'queue:end']);
  });

  test('routes reference preload pulls through the Supabase request queue boundary', async () => {
    const events = [];
    const repositories = {
      schools: { replaceFromServer: jest.fn() },
      job_titles: { replaceFromServer: jest.fn() },
      programmes: { replaceFromServer: jest.fn() },
      academic_years: { replaceFromServer: jest.fn() },
      assessment_windows: { replaceFromServer: jest.fn() },
      teachers: { replaceFromServer: jest.fn() },
      staff_programme_assignments: { replaceFromServer: jest.fn() },
    };
    const enqueueRequest = jest.fn(async (task) => {
      events.push('queue:start');
      const result = await task();
      events.push('queue:end');
      return result;
    });
    const supabaseClient = {
      from: jest.fn((tableName) => ({
        select: jest.fn(async () => {
          events.push(`pull:${tableName}`);
          return { data: [{ id: `${tableName}-1` }], error: null };
        }),
      })),
    };

    await pullReferenceData({ supabaseClient, repositories, enqueueRequest });

    expect(enqueueRequest).toHaveBeenCalledTimes(7);
    expect(events.slice(0, 6)).toEqual([
      'queue:start',
      'pull:schools',
      'queue:end',
      'queue:start',
      'pull:job_titles',
      'queue:end',
    ]);
  });

  test('batches ready child inserts and updates into one upsert', async () => {
    const children = [
      { id: 'child-batch-1', first_name: 'Amahle', last_name: 'Dlamini', reading_level: 'letters' },
      { id: 'child-batch-2', first_name: 'Lebo', last_name: 'Mokoena', reading_level: 'words' },
      { id: 'child-batch-3', first_name: 'Zola', last_name: 'Ndlovu', reading_level: 'sentences' },
    ];

    for (const [index, child] of children.entries()) {
      await db.runAsync(`
        insert into children (
          id, first_name, last_name, reading_level, created_by, sync_status
        )
        values (?, ?, ?, ?, 'user-1', 'pending')
      `, child.id, child.first_name, child.last_name, child.reading_level);
      await enqueue(db, 'children', child.id, index === 0 ? 'insert' : 'update', {
        ...child,
        created_by: 'user-1',
      });
    }

    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    const childCalls = calls.filter(call => call.tableName === 'children');
    expect(childCalls).toHaveLength(1);
    expect(childCalls[0]).toEqual(expect.objectContaining({
      type: 'upsert',
      tableName: 'children',
      payload: expect.arrayContaining(children.map(child => expect.objectContaining(child))),
      options: expect.objectContaining({ onConflict: 'id', ignoreDuplicates: false }),
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      totalSynced: children.length,
      totalFailed: 0,
    }));
    expect(await db.getFirstAsync(`
      select count(*) as count
      from children
      where sync_status = 'synced'
    `)).toEqual({ count: children.length });
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
  });

  test('batches programme enrollments while preserving deterministic active-pair ids', async () => {
    const enrollments = [];
    for (let index = 1; index <= 3; index += 1) {
      const childId = `child-enrollment-batch-${index}`;
      const localId = `local-enrollment-batch-${index}`;
      await db.runAsync(`
        insert into children (id, first_name, last_name, created_by, sync_status)
        values (?, ?, 'Dlamini', 'user-1', 'synced')
      `, childId, `Child ${index}`);
      await db.runAsync(`
        insert into child_programme_enrollments (
          id, child_id, programme_id, enrolled_at, created_by, sync_status
        )
        values (?, ?, 'programme-1', '2026-07-14T10:00:00.000Z', 'user-1', 'pending')
      `, localId, childId);
      const enrollment = {
        id: localId,
        child_id: childId,
        programme_id: 'programme-1',
        enrolled_at: '2026-07-14T10:00:00.000Z',
        created_by: 'user-1',
      };
      enrollments.push(enrollment);
      await enqueue(db, 'child_programme_enrollments', localId, 'insert', enrollment);
    }

    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    const enrollmentCalls = calls.filter(call => call.tableName === 'child_programme_enrollments');
    expect(enrollmentCalls).toHaveLength(1);
    expect(enrollmentCalls[0]).toEqual(expect.objectContaining({
      type: 'upsert',
      tableName: 'child_programme_enrollments',
      payload: enrollments.map(enrollment => expect.objectContaining({
        ...enrollment,
        id: childProgrammeEnrollmentDomainId({
          childId: enrollment.child_id,
          programmeId: enrollment.programme_id,
        }),
      })),
      options: expect.objectContaining({ onConflict: 'id', ignoreDuplicates: false }),
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      totalSynced: enrollments.length,
      totalFailed: 0,
    }));
    expect(await db.getFirstAsync(`
      select count(*) as count
      from child_programme_enrollments
      where sync_status = 'synced'
    `)).toEqual({ count: enrollments.length });
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
  });

  test('batches ready assessment item upserts and finalizes each local item', async () => {
    const itemIds = await seedAssessmentItems(db);
    const { supabaseClient, calls } = createSupabaseMock();
    const outboxRepository = createSyncOutboxRepository({ database: db });
    const markInFlightAndGetSpy = jest.spyOn(outboxRepository, 'markInFlightAndGet');
    const getByIdSpy = jest.spyOn(outboxRepository, 'getById');
    const engine = createOutboxSyncEngine({
      getAuthSession: liveTestSession,
      database: db,
      supabaseClient,
      outboxRepository,
    });

    const result = await engine.syncAll();

    const assessmentItemCalls = calls.filter(call => call.tableName === 'assessment_items');
    expect(assessmentItemCalls).toHaveLength(1);
    expect(assessmentItemCalls[0]).toEqual(expect.objectContaining({
      type: 'upsert',
      tableName: 'assessment_items',
      payload: expect.arrayContaining([
        expect.objectContaining({ item_key: 'letter-1' }),
        expect.objectContaining({ item_key: 'letter-2' }),
        expect.objectContaining({ item_key: 'letter-3' }),
      ]),
      options: expect.objectContaining({ onConflict: 'id' }),
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      totalSynced: itemIds.length,
      totalFailed: 0,
    }));
    expect(await db.getFirstAsync(`
      select count(*) as count
      from assessment_items
      where sync_status = 'synced'
    `)).toEqual({ count: itemIds.length });
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
    expect(markInFlightAndGetSpy).toHaveBeenCalledTimes(1);
    expect(markInFlightAndGetSpy).toHaveBeenCalledWith(itemIds.map(
      (itemId) => `assessment_items:${itemId}:insert`
    ));
    expect(getByIdSpy).not.toHaveBeenCalled();
  });

  test('falls back to per-record assessment item sync when the batch upsert fails', async () => {
    await seedAssessmentItems(db);
    const { supabaseClient, calls } = createSupabaseMock({
      upsertResults: {
        'assessment_items:batch': {
          error: { code: '500', message: 'Batch request failed' },
        },
        assessment_items: ({ payload }) => (
          payload.item_key === 'letter-2'
            ? { error: { code: '23503', message: 'Missing assessment parent' } }
            : { error: null }
        ),
      },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    const assessmentItemCalls = calls.filter(call => call.tableName === 'assessment_items');
    expect(assessmentItemCalls).toHaveLength(4);
    expect(Array.isArray(assessmentItemCalls[0].payload)).toBe(true);
    expect(assessmentItemCalls.slice(1).map(call => call.payload.item_key)).toEqual([
      'letter-1',
      'letter-2',
      'letter-3',
    ]);
    expect(result).toEqual(expect.objectContaining({
      success: false,
      totalSynced: 2,
      totalFailed: 1,
      failedRecords: [
        expect.objectContaining({
          table: 'assessment_items',
          reason: 'Missing assessment parent',
        }),
      ],
    }));
    expect(await db.getFirstAsync(`
      select sync_status, last_sync_error
      from assessment_items
      where item_key = 'letter-2'
    `)).toEqual({
      sync_status: 'terminal',
      last_sync_error: 'Missing assessment parent',
    });
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 1 });
  });

  test('batches letter_mastery upserts into a single call', async () => {
    // Seed a child that FK-satisfies letter_mastery rows (programme-1 is seeded by seedReferences).
    await db.runAsync(`
      insert into children (id, first_name, last_name, sync_status)
      values ('child-mastery-batch', 'Amahle', 'Dlamini', 'synced')
    `);

    const letters = ['a', 'b', 'c'];
    for (const letter of letters) {
      const id = `mastery-batch-${letter}`;
      await db.runAsync(`
        insert into letter_mastery (
          id, user_id, child_id, programme_id, letter, language, source, sync_status
        )
        values (?, 'user-1', 'child-mastery-batch', 'programme-1', ?, 'isiXhosa', 'taught', 'pending')
      `, id, letter);
      await enqueue(db, 'letter_mastery', id, 'insert', {
        id,
        user_id: 'user-1',
        child_id: 'child-mastery-batch',
        programme_id: 'programme-1',
        letter,
        language: 'isiXhosa',
        source: 'taught',
      });
    }

    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    const masteryBatchCalls = calls.filter(call => call.tableName === 'letter_mastery');
    expect(masteryBatchCalls).toHaveLength(1);
    expect(masteryBatchCalls[0]).toEqual(expect.objectContaining({
      type: 'upsert',
      tableName: 'letter_mastery',
      payload: expect.arrayContaining([
        expect.objectContaining({ letter: 'a', language: 'isiXhosa', source: 'taught' }),
        expect.objectContaining({ letter: 'b', language: 'isiXhosa', source: 'taught' }),
        expect.objectContaining({ letter: 'c', language: 'isiXhosa', source: 'taught' }),
      ]),
      options: expect.objectContaining({ onConflict: 'id' }),
    }));
    expect(result).toEqual(expect.objectContaining({
      success: true,
      totalSynced: letters.length,
      totalFailed: 0,
    }));
    expect(await db.getFirstAsync(`
      select count(*) as count
      from letter_mastery
      where sync_status = 'synced'
    `)).toEqual({ count: letters.length });
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
  });

  test('syncAll recovers in-flight rows left by an interrupted process', async () => {
    await db.runAsync(`
      insert into classes (id, school_id, name, grade, sync_status)
      values ('class-1', 'school-1', 'Grade 1A', '1', 'pending')
    `);
    await enqueue(db, 'classes', 'class-1', 'insert', {
      id: 'class-1',
      school_id: 'school-1',
      name: 'Grade 1A',
      grade: '1',
    });
    await createSyncOutboxRepository({ database: db }).markInFlight(['classes:class-1:insert']);

    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(true);
    expect(calls.map(call => `${call.type}:${call.tableName}`)).toEqual(['upsert:classes']);
    expect(await db.getFirstAsync('select sync_status, last_sync_error from classes where id = ?', 'class-1'))
      .toEqual({ sync_status: 'synced', last_sync_error: null });
    expect(await db.getFirstAsync('select id from sync_outbox where id = ?', 'classes:class-1:insert'))
      .toBeNull();
  });

  test('successful sync finalization does not delete a newer local write made while the row was in flight', async () => {
    await db.runAsync(`
      insert into children (id, first_name, last_name, sync_status)
      values ('child-1', 'Old', 'Dlamini', 'pending')
    `);
    await enqueue(db, 'children', 'child-1', 'insert', {
      id: 'child-1',
      first_name: 'Old',
      last_name: 'Dlamini',
    });

    const { supabaseClient, calls } = createSupabaseMock({
      upsertResults: {
        children: async () => {
          await db.runAsync(`
            update children
            set first_name = 'New',
                sync_status = 'pending',
                updated_at = '2026-05-21T10:00:00.000Z'
            where id = 'child-1'
          `);
          await enqueue(db, 'children', 'child-1', 'insert', {
            id: 'child-1',
            first_name: 'New',
            last_name: 'Dlamini',
          });
          return { error: null };
        },
      },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(true);
    expect(calls).toEqual([
      expect.objectContaining({
        type: 'upsert',
        tableName: 'children',
        payload: expect.objectContaining({
          id: 'child-1',
          first_name: 'Old',
        }),
      }),
    ]);
    expect(await db.getFirstAsync('select first_name, sync_status, last_sync_error from children where id = ?', 'child-1'))
      .toEqual({ first_name: 'New', sync_status: 'pending', last_sync_error: null });
    const outboxRow = await db.getFirstAsync(
      'select status, payload from sync_outbox where id = ?',
      'children:child-1:insert'
    );
    expect(outboxRow).toEqual(expect.objectContaining({ status: 'pending' }));
    expect(JSON.parse(outboxRow.payload)).toEqual(expect.objectContaining({
      id: 'child-1',
      first_name: 'New',
    }));
  });

  test('non-delete outbox records with missing payload fail terminal without sending an empty upsert', async () => {
    await db.runAsync(`
      insert into classes (id, school_id, name, grade, sync_status)
      values ('class-1', 'school-1', 'Grade 1A', '1', 'pending')
    `);
    await createSyncOutboxRepository({ database: db }).enqueue({
      tableName: 'classes',
      recordId: 'class-1',
      operation: 'insert',
    });

    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(false);
    expect(calls).toEqual([]);
    expect(await db.getFirstAsync('select sync_status, last_sync_error from classes where id = ?', 'class-1'))
      .toEqual({
        sync_status: 'terminal',
        last_sync_error: 'Missing outbox payload for classes:class-1 insert',
      });
    expect(await db.getFirstAsync('select status, last_error from sync_outbox where id = ?', 'classes:class-1:insert'))
      .toEqual({
        status: 'terminal',
        last_error: 'Missing outbox payload for classes:class-1 insert',
      });
  });

  test('unknown outbox tables become visible terminal failures without touching a domain table', async () => {
    await createSyncOutboxRepository({ database: db }).enqueue({
      tableName: 'future_table',
      recordId: 'future-1',
      operation: 'insert',
      payload: { id: 'future-1' },
    });

    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(false);
    expect(calls).toEqual([]);
    expect(result.failedRecords).toEqual([
      {
        id: 'future-1',
        table: 'future_table',
        operation: 'insert',
        reason: 'Unknown sync table: future_table',
      },
    ]);
    expect(await db.getFirstAsync('select status, last_error from sync_outbox where id = ?', 'future_table:future-1:insert'))
      .toEqual({
        status: 'terminal',
        last_error: 'Unknown sync table: future_table',
      });
  });

  test('archive and restore operations upsert their normalized payloads', async () => {
    await db.runAsync(`
      insert into classes (id, school_id, name, grade, archived_at, sync_status)
      values ('class-1', 'school-1', 'Grade 1A', '1', '2026-05-21T09:00:00.000Z', 'pending')
    `);
    await db.runAsync(`
      insert into children (id, first_name, last_name, archived_at, sync_status)
      values ('child-1', 'Amahle', 'Dlamini', null, 'pending')
    `);
    await enqueue(db, 'classes', 'class-1', 'archive', {
      id: 'class-1',
      school_id: 'school-1',
      name: 'Grade 1A',
      grade: '1',
      archived_at: '2026-05-21T09:00:00.000Z',
    });
    await enqueue(db, 'children', 'child-1', 'restore', {
      id: 'child-1',
      first_name: 'Amahle',
      last_name: 'Dlamini',
      archived_at: null,
    });

    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(true);
    expect(calls).toEqual([
      expect.objectContaining({
        type: 'upsert',
        tableName: 'classes',
        payload: expect.objectContaining({
          id: 'class-1',
          archived_at: '2026-05-21T09:00:00.000Z',
        }),
      }),
      expect.objectContaining({
        type: 'upsert',
        tableName: 'children',
        payload: expect.objectContaining({
          id: 'child-1',
          archived_at: null,
        }),
      }),
    ]);
    expect(await db.getFirstAsync('select sync_status from classes where id = ?', 'class-1'))
      .toEqual({ sync_status: 'synced' });
    expect(await db.getFirstAsync('select sync_status from children where id = ?', 'child-1'))
      .toEqual({ sync_status: 'synced' });
    expect(await db.getFirstAsync('select count(*) as count from sync_outbox')).toEqual({ count: 0 });
  });

  test('orders child archive relationship cleanup before ending EA access', async () => {
    const ids = await seedChildArchiveGraph(db);
    await enqueue(db, 'child_ea_assignments', ids.assignmentId, 'archive', {
      id: ids.assignmentId,
      unassigned_at: ids.archivedAt,
    });
    await enqueue(db, 'child_group_memberships', ids.groupMembershipId, 'archive', {
      id: ids.groupMembershipId,
      removed_at: ids.archivedAt,
    });
    await enqueue(db, 'child_class_memberships', ids.classMembershipId, 'archive', {
      id: ids.classMembershipId,
      exited_at: ids.archivedAt,
    });
    await enqueue(db, 'child_programme_enrollments', ids.enrollmentId, 'archive', {
      id: ids.enrollmentId,
      ended_at: ids.archivedAt,
    });
    await enqueue(db, 'children', ids.childId, 'archive', {
      id: ids.childId,
      archived_at: ids.archivedAt,
    });

    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(true);
    expect(calls.map(call => `${call.type}:${call.tableName}`)).toEqual([
      'upsert:children',
      'upsert:child_programme_enrollments',
      'upsert:child_class_memberships',
      'upsert:child_group_memberships',
      'upsert:child_ea_assignments',
    ]);
  });

  test('keeps child EA archive pending when relationship cleanup fails', async () => {
    const ids = await seedChildArchiveGraph(db);
    await enqueue(db, 'children', ids.childId, 'archive', {
      id: ids.childId,
      archived_at: ids.archivedAt,
    });
    await enqueue(db, 'child_programme_enrollments', ids.enrollmentId, 'archive', {
      id: ids.enrollmentId,
      ended_at: ids.archivedAt,
    });
    await enqueue(db, 'child_class_memberships', ids.classMembershipId, 'archive', {
      id: ids.classMembershipId,
      exited_at: ids.archivedAt,
    });
    await enqueue(db, 'child_group_memberships', ids.groupMembershipId, 'archive', {
      id: ids.groupMembershipId,
      removed_at: ids.archivedAt,
    });
    await enqueue(db, 'child_ea_assignments', ids.assignmentId, 'archive', {
      id: ids.assignmentId,
      unassigned_at: ids.archivedAt,
    });

    const { supabaseClient, calls } = createSupabaseMock({
      upsertResults: {
        child_group_memberships: {
          error: {
            code: '42501',
            message: 'RLS denied membership archive',
          },
        },
      },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    // Finding 6 semantics: this RLS denial is downgraded to retriable (its grant evidence
    // is still pending locally), so the pass itself is successful.
    expect(result.success).toBe(true);
    expect(result.totalRetriable).toBe(1);
    expect(result.totalTerminal).toBe(0);
    expect(calls.map(call => `${call.type}:${call.tableName}`)).toEqual([
      'upsert:children',
      'upsert:child_programme_enrollments',
      'upsert:child_class_memberships',
      'upsert:child_group_memberships',
    ]);
    expect(result.tableResults.child_ea_assignments).toEqual(expect.objectContaining({
      skipped: true,
      skippedDependency: 'child_group_memberships',
    }));
    expect(await db.getFirstAsync(
      'select status from sync_outbox where table_name = ? and record_id = ?',
      'child_ea_assignments',
      ids.assignmentId
    )).toEqual({ status: 'pending' });
  });

  test('pushes sessions before session_attendees so first-sync hits INSERT (not UPDATE) policy', async () => {
    // Locks Finding E2 invariant: sessions_update_active_assignment_after_attendee
    // requires the session to already have a writable attendee server-side. If
    // PUSH_ORDER ever flips sessions after session_attendees, a fresh-sync session
    // upsert would conflict on the attendee FK and the session UPDATE policy would
    // fail RLS. The sessions INSERT policy has no attendee precondition, so we
    // MUST push the session first.
    await db.runAsync(`
      insert into classes (id, school_id, name, grade, sync_status)
      values ('class-session', 'school-1', 'Grade 1A', '1', 'synced')
    `);
    await db.runAsync(`
      insert into children (id, first_name, last_name, class_id, created_by, sync_status)
      values ('child-session', 'Amahle', 'Dlamini', 'class-session', 'user-1', 'synced')
    `);
    await db.runAsync(`
      insert into sessions (
        id, user_id, programme_id, session_date, sync_status
      )
      values (
        'session-1', 'user-1', 'programme-1', '2026-05-25', 'pending'
      )
    `);
    await db.runAsync(`
      insert into session_attendees (
        id, session_id, child_id, attendance_status, sync_status
      )
      values (
        '00000000-0000-0000-0000-000000000a01',
        'session-1', 'child-session', 'present', 'pending'
      )
    `);
    await enqueue(db, 'session_attendees', '00000000-0000-0000-0000-000000000a01', 'insert', {
      id: '00000000-0000-0000-0000-000000000a01',
      session_id: 'session-1',
      child_id: 'child-session',
      attendance_status: 'present',
    });
    await enqueue(db, 'sessions', 'session-1', 'insert', {
      id: 'session-1',
      user_id: 'user-1',
      programme_id: 'programme-1',
      session_date: '2026-05-25',
    });

    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(true);
    const sessionIndex = calls.findIndex(call => call.tableName === 'sessions');
    const attendeeIndex = calls.findIndex(call => call.tableName === 'session_attendees');
    expect(sessionIndex).toBeGreaterThanOrEqual(0);
    expect(attendeeIndex).toBeGreaterThanOrEqual(0);
    expect(sessionIndex).toBeLessThan(attendeeIndex);
  });

  test('orders group archive membership cleanup before ending group EA access', async () => {
    const ids = await seedChildArchiveGraph(db);
    await enqueue(db, 'group_ea_assignments', ids.groupAssignmentId, 'archive', {
      id: ids.groupAssignmentId,
      unassigned_at: ids.archivedAt,
    });
    await enqueue(db, 'child_group_memberships', ids.groupMembershipId, 'archive', {
      id: ids.groupMembershipId,
      removed_at: ids.archivedAt,
    });
    await enqueue(db, 'groups', ids.groupId, 'archive', {
      id: ids.groupId,
      archived_at: ids.archivedAt,
    });

    const { supabaseClient, calls } = createSupabaseMock();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(true);
    expect(calls.map(call => `${call.type}:${call.tableName}`)).toEqual([
      'upsert:groups',
      'upsert:child_group_memberships',
      'upsert:group_ea_assignments',
    ]);
  });

  test('skips dependent rows when a parent table fails in the same sync cycle', async () => {
    await db.runAsync(`
      insert into classes (id, school_id, name, grade, sync_status)
      values ('class-1', 'school-1', 'Grade 1A', '1', 'pending')
    `);
    await db.runAsync(`
      insert into children (id, first_name, last_name, class_id, sync_status)
      values ('child-1', 'Amahle', 'Dlamini', 'class-1', 'pending')
    `);
    await db.runAsync(`
      insert into child_ea_assignments (id, user_id, child_id, sync_status)
      values ('assignment-1', 'user-1', 'child-1', 'pending')
    `);

    await enqueue(db, 'classes', 'class-1', 'insert', { id: 'class-1', school_id: 'school-1', name: 'Grade 1A', grade: '1' });
    await enqueue(db, 'children', 'child-1', 'insert', { id: 'child-1', first_name: 'Amahle', last_name: 'Dlamini', class_id: 'class-1' });
    await enqueue(db, 'child_ea_assignments', 'assignment-1', 'insert', { id: 'assignment-1', user_id: 'user-1', child_id: 'child-1' });

    const { supabaseClient, calls } = createSupabaseMock({
      upsertResults: {
        children: { error: { message: 'network down' } },
      },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    // Finding 6 semantics: a retriable parent failure with skipped dependents is still a
    // successful pass (nothing terminal, nothing preflight); the work simply waits.
    expect(result.success).toBe(true);
    expect(result.totalRetriable).toBe(1);
    expect(result.totalTerminal).toBe(0);
    expect(calls.map(call => `${call.type}:${call.tableName}`)).toEqual([
      'upsert:classes',
      'upsert:children',
    ]);
    expect(result.tableResults.child_ea_assignments).toEqual(expect.objectContaining({
      skipped: true,
      skippedDependency: 'children',
    }));
    expect(await db.getFirstAsync('select sync_status from child_ea_assignments where id = ?', 'assignment-1'))
      .toEqual({ sync_status: 'pending' });
    expect(await db.getFirstAsync('select status from sync_outbox where table_name = ?', 'child_ea_assignments'))
      .toEqual({ status: 'pending' });
  });

  test('a failed parent blocks only dependents that reference that exact record', async () => {
    for (const suffix of ['1', '2']) {
      await db.runAsync(`
        insert into children (id, first_name, last_name, sync_status)
        values (?, ?, 'Dlamini', 'pending')
      `, `child-${suffix}`, `Child ${suffix}`);
      await db.runAsync(`
        insert into child_ea_assignments (id, user_id, child_id, sync_status)
        values (?, 'user-1', ?, 'pending')
      `, `assignment-${suffix}`, `child-${suffix}`);
      await enqueue(db, 'children', `child-${suffix}`, 'insert', {
        id: `child-${suffix}`,
        first_name: `Child ${suffix}`,
        last_name: 'Dlamini',
      });
      await enqueue(db, 'child_ea_assignments', `assignment-${suffix}`, 'insert', {
        id: `assignment-${suffix}`,
        user_id: 'user-1',
        child_id: `child-${suffix}`,
      });
    }

    const { supabaseClient, calls } = createSupabaseMock({
      upsertResults: {
        'children:batch': { error: { message: 'child batch rejected' } },
        'children:child-1': { error: { message: 'child 1 network failure' } },
      },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(calls.map((call) => (
      Array.isArray(call.payload)
        ? `${call.type}:${call.tableName}:batch(${call.payload.map(row => row.id).join(',')})`
        : `${call.type}:${call.tableName}:${call.payload?.id || ''}`
    ))).toEqual([
      'upsert:children:batch(child-1,child-2)',
      'upsert:children:child-1',
      'upsert:children:child-2',
      `upsert:child_ea_assignments:${childEaAssignmentDomainId({
        userId: 'user-1',
        childId: 'child-2',
      })}`,
    ]);
    expect(result.tableResults.child_ea_assignments).toEqual(expect.objectContaining({
      synced: 1,
      skipped: true,
      skippedDependency: 'children',
      skippedDependencyRecordId: 'child-1',
    }));
    expect(await db.getFirstAsync(
      'select status from sync_outbox where table_name = ? and record_id = ?',
      'child_ea_assignments',
      'assignment-1'
    )).toEqual({ status: 'pending' });
    expect(await db.getFirstAsync(
      'select status from sync_outbox where table_name = ? and record_id = ?',
      'child_ea_assignments',
      'assignment-2'
    )).toBeNull();
  });

  test('a failed archive cleanup blocks only the access-ending row for the same subject', async () => {
    const ids = await seedChildArchiveGraph(db);
    await db.runAsync(`
      insert into children (id, first_name, last_name, created_by, sync_status)
      values ('child-other', 'Other', 'Child', 'user-1', 'synced')
    `);
    await db.runAsync(`
      insert into child_ea_assignments (
        id, user_id, child_id, assigned_at, unassigned_at, created_by, sync_status
      ) values (
        'assignment-other', 'user-1', 'child-other',
        '2026-05-01T00:00:00.000Z', ?, 'user-1', 'pending'
      )
    `, ids.archivedAt);
    await db.runAsync(`
      update child_programme_enrollments
      set ended_at = ?, sync_status = 'pending'
      where id = ?
    `, ids.archivedAt, ids.enrollmentId);
    await enqueue(db, 'child_programme_enrollments', ids.enrollmentId, 'archive', {
      id: ids.enrollmentId,
      ended_at: ids.archivedAt,
    });
    await enqueue(db, 'child_ea_assignments', 'assignment-other', 'archive', {
      id: 'assignment-other',
      unassigned_at: ids.archivedAt,
    });

    const { supabaseClient, calls } = createSupabaseMock({
      upsertResults: {
        child_programme_enrollments: { error: { message: 'cleanup network failure' } },
      },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(calls.map((call) => `${call.type}:${call.tableName}:${call.payload?.id || ''}`)).toEqual([
      `upsert:child_programme_enrollments:${ids.enrollmentId}`,
      'upsert:child_ea_assignments:assignment-other',
    ]);
    expect(result.tableResults.child_ea_assignments.synced).toBe(1);
    expect(await db.getFirstAsync(
      'select status from sync_outbox where table_name = ? and record_id = ?',
      'child_ea_assignments',
      'assignment-other'
    )).toBeNull();
  });

  test('keeps foreign-key and RLS failures visible as terminal failed items', async () => {
    await db.runAsync(`
      insert into children (id, first_name, last_name, sync_status)
      values ('child-1', 'Amahle', 'Dlamini', 'synced')
    `);
    await db.runAsync(`
      insert into assessments (
        id, user_id, child_id, programme_id, assessment_type, assessment_date, sync_status
      )
      values (
        'assessment-1', 'user-1', 'child-1', 'programme-1', 'letter_egra', '2026-05-21', 'pending'
      )
    `);
    await db.runAsync(`
      insert into letter_mastery (
        id, user_id, child_id, programme_id, letter, language, source, sync_status
      )
      values (
        'mastery-1', 'user-1', 'child-1', 'programme-1', 'a', 'en', 'taught', 'pending'
      )
    `);
    await enqueue(db, 'assessments', 'assessment-1', 'insert', {
      id: 'assessment-1',
      user_id: 'user-1',
      child_id: 'child-1',
      programme_id: 'programme-1',
      assessment_type: 'letter_egra',
      assessment_date: '2026-05-21',
    });
    await enqueue(db, 'letter_mastery', 'mastery-1', 'insert', {
      id: 'mastery-1',
      user_id: 'user-1',
      child_id: 'child-1',
      programme_id: 'programme-1',
      letter: 'a',
      language: 'en',
      source: 'taught',
    });

    const { supabaseClient } = createSupabaseMock({
      upsertResults: {
        assessments: { error: { code: '23503', message: 'missing parent' } },
        letter_mastery: { error: { code: '42501', message: 'RLS denied' } },
      },
    });
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();
    const status = await engine.getSyncStatus();
    const authenticatedRlsDenied = `${AUTHENTICATED_DENIAL_MARKER} RLS denied`;

    expect(result.success).toBe(false);
    expect(await db.getFirstAsync('select sync_status, last_sync_error from assessments where id = ?', 'assessment-1'))
      .toEqual({ sync_status: 'terminal', last_sync_error: 'missing parent' });
    expect(await db.getFirstAsync('select sync_status, last_sync_error from letter_mastery where id = ?', 'mastery-1'))
      .toEqual({ sync_status: 'terminal', last_sync_error: authenticatedRlsDenied });
    expect(status.failedItems).toEqual([
      expect.objectContaining({
        table: 'assessments',
        id: 'assessment-1',
        terminal: true,
        reason: 'missing parent',
      }),
      expect.objectContaining({
        table: 'letter_mastery',
        id: 'mastery-1',
        terminal: true,
        reason: authenticatedRlsDenied,
      }),
    ]);
  });

  test('treats duplicate-key success only for explicitly configured tables', async () => {
    await db.runAsync(`
      insert into time_entries (
        id, user_id, sign_in_time, sign_in_lat, sign_in_lon, sync_status
      )
      values (
        'time-1', 'user-1', '2026-05-21T08:00:00.000Z', -34.1, 18.4, 'pending'
      )
    `);
    await db.runAsync(`
      insert into classes (id, school_id, name, grade, sync_status)
      values ('class-1', 'school-1', 'Grade 1A', '1', 'pending')
    `);
    await enqueue(db, 'time_entries', 'time-1', 'insert', {
      id: 'time-1',
      user_id: 'user-1',
      sign_in_time: '2026-05-21T08:00:00.000Z',
      sign_in_lat: -34.1,
      sign_in_lon: 18.4,
    });
    await enqueue(db, 'classes', 'class-1', 'insert', {
      id: 'class-1',
      school_id: 'school-1',
      name: 'Grade 1A',
      grade: '1',
    });

    const duplicateError = { code: '23505', message: 'duplicate key' };
    const { supabaseClient } = createSupabaseMock({
      upsertResults: {
        time_entries: { error: duplicateError },
        classes: { error: duplicateError },
      },
    });
    const engine = createOutboxSyncEngine({
      getAuthSession: liveTestSession,
      database: db,
      supabaseClient,
      safeDuplicateSuccessTables: ['time_entries'],
    });

    const result = await engine.syncAll();

    expect(result.success).toBe(false);
    expect(await db.getFirstAsync('select sync_status from time_entries where id = ?', 'time-1'))
      .toEqual({ sync_status: 'synced' });
    expect(await db.getFirstAsync('select id from sync_outbox where table_name = ?', 'time_entries'))
      .toBeNull();
    expect(await db.getFirstAsync('select sync_status, last_sync_error from classes where id = ?', 'class-1'))
      .toEqual({ sync_status: 'terminal', last_sync_error: 'duplicate key' });
    expect(await db.getFirstAsync('select status from sync_outbox where table_name = ?', 'classes'))
      .toEqual({ status: 'terminal' });
  });

  test('network errors schedule retry metadata without sleeping the sync loop', async () => {
    await db.runAsync(`
      insert into classes (id, school_id, name, grade, sync_status)
      values ('class-1', 'school-1', 'Grade 1A', '1', 'pending')
    `);
    await enqueue(db, 'classes', 'class-1', 'insert', {
      id: 'class-1',
      school_id: 'school-1',
      name: 'Grade 1A',
      grade: '1',
    });

    const { supabaseClient } = createSupabaseMock({
      upsertResults: {
        classes: { error: { message: 'network down' } },
      },
    });
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const beforeSync = new Date().toISOString();
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    try {
      const result = await engine.syncAll();

      // Finding 6 semantics: a backed-off retriable failure no longer flips the pass.
      expect(result.success).toBe(true);
      expect(result.totalRetriable).toBe(1);
      expect(setTimeoutSpy).not.toHaveBeenCalled();
      expect(await db.getFirstAsync('select sync_status, last_sync_error from classes where id = ?', 'class-1'))
        .toEqual({ sync_status: 'failed', last_sync_error: 'network down' });

      const outboxRow = await db.getFirstAsync(
        'select status, retry_count, last_error, next_retry_at from sync_outbox where table_name = ?',
        'classes'
      );
      expect(outboxRow).toEqual(expect.objectContaining({
        status: 'failed',
        retry_count: 1,
        last_error: 'network down',
      }));
      expect(outboxRow.next_retry_at > beforeSync).toBe(true);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  test('child hard deletes use delete_child_if_no_history and terminal-fail when history exists', async () => {
    await enqueue(db, 'children', 'child-clean', 'hard_delete', { id: 'child-clean' });
    await enqueue(db, 'children', 'child-history', 'hard_delete', { id: 'child-history' });

    const { calls } = createSupabaseMock();
    const supabaseClient = {
      from: jest.fn(() => {
        throw new Error('children hard delete must not use direct table delete');
      }),
      rpc: jest.fn(async (functionName, args) => {
        calls.push({ type: 'rpc', functionName, args });
        return { data: args.p_child_id === 'child-clean', error: null };
      }),
    };
    const engine = createOutboxSyncEngine({ getAuthSession: liveTestSession, database: db, supabaseClient });

    const result = await engine.syncAll();

    expect(result.success).toBe(false);
    expect(calls).toEqual([
      {
        type: 'rpc',
        functionName: 'delete_child_if_no_history',
        args: { p_child_id: 'child-clean' },
      },
      {
        type: 'rpc',
        functionName: 'delete_child_if_no_history',
        args: { p_child_id: 'child-history' },
      },
    ]);
    expect(await db.getFirstAsync('select id from sync_outbox where record_id = ?', 'child-clean'))
      .toBeNull();
    expect(await db.getFirstAsync('select status, last_error from sync_outbox where record_id = ?', 'child-history'))
      .toEqual({
        status: 'terminal',
        last_error: 'Child has history and must be archived instead of hard-deleted',
      });
  });

  test('pullReferenceData refreshes Plan 4 reference caches in dependency order', async () => {
    const calls = [];
    const supabaseClient = {
      from: jest.fn((tableName) => ({
        select: jest.fn(async () => {
          calls.push(tableName);
          return { data: [{ id: `${tableName}-1` }], error: null };
        }),
      })),
    };
    const repositories = {
      schools: { replaceFromServer: jest.fn() },
      job_titles: { replaceFromServer: jest.fn() },
      programmes: { replaceFromServer: jest.fn() },
      academic_years: { replaceFromServer: jest.fn() },
      assessment_windows: { replaceFromServer: jest.fn() },
      teachers: { replaceFromServer: jest.fn() },
      staff_programme_assignments: { replaceFromServer: jest.fn() },
    };

    const result = await pullReferenceData({ supabaseClient, repositories });

    expect(calls).toEqual([
      'schools',
      'job_titles',
      'programmes',
      'academic_years',
      'assessment_windows',
      'teachers',
      'staff_programme_assignments',
    ]);
    expect(repositories.schools.replaceFromServer)
      .toHaveBeenCalledWith([{ id: 'schools-1' }], {});
    expect(repositories.job_titles.replaceFromServer)
      .toHaveBeenCalledWith([{ id: 'job_titles-1' }], {});
    expect(repositories.programmes.replaceFromServer)
      .toHaveBeenCalledWith([{ id: 'programmes-1' }], {});
    expect(repositories.academic_years.replaceFromServer)
      .toHaveBeenCalledWith([{ id: 'academic_years-1' }], {});
    expect(repositories.assessment_windows.replaceFromServer)
      .toHaveBeenCalledWith([{ id: 'assessment_windows-1' }], {});
    expect(repositories.teachers.replaceFromServer)
      .toHaveBeenCalledWith([{ id: 'teachers-1' }], {});
    expect(repositories.staff_programme_assignments.replaceFromServer)
      .toHaveBeenCalledWith([{ id: 'staff_programme_assignments-1' }], {});
    expect(result).toEqual({
      schools: 1,
      job_titles: 1,
      programmes: 1,
      academic_years: 1,
      assessment_windows: 1,
      teachers: 1,
      staff_programme_assignments: 1,
    });
  });

  test('ensureReferenceData runs one reference pull for concurrent callers on an empty cache', async () => {
    const rowsByTable = {
      schools: [{ id: 'school-1', name: 'Masi Primary' }],
      job_titles: [],
      programmes: [{ id: 'programme-1', code: 'literacy', name: 'Literacy' }],
      academic_years: [{
        id: 'year-2026',
        label: '2026',
        starts_on: '2026-01-01',
        ends_on: '2026-12-31',
      }],
      assessment_windows: [],
      teachers: [],
      staff_programme_assignments: [],
    };
    const supabaseClient = {
      from: jest.fn((tableName) => {
        const query = {
          select: jest.fn(() => query),
          eq: jest.fn(() => query),
          then: (resolve) => resolve({ data: rowsByTable[tableName], error: null }),
        };
        return query;
      }),
    };
    const repositories = Object.fromEntries(Object.keys(rowsByTable).map((tableName) => [
      tableName,
      {
        getAll: jest.fn(async () => []),
        replaceFromServer: jest.fn(async () => true),
      },
    ]));

    await Promise.all([
      ensureReferenceData({ supabaseClient, repositories, userId: 'user-1' }),
      ensureReferenceData({ supabaseClient, repositories, userId: 'user-1' }),
    ]);

    expect(supabaseClient.from).toHaveBeenCalledTimes(7);
    expect(repositories.schools.replaceFromServer).toHaveBeenCalledTimes(1);
    expect(repositories.programmes.replaceFromServer).toHaveBeenCalledTimes(1);
    expect(repositories.academic_years.replaceFromServer).toHaveBeenCalledTimes(1);
  });

  test('pullReferenceData seeds the local active programme assignment used by offline writes', async () => {
    const db = await createMigratedDatabase(runMigrations);

    const rowsByTable = {
      schools: [{
        id: 'school-server',
        name: 'Server Primary',
      }],
      job_titles: [{
        id: 'job-title-1',
        code: 'ea',
        name: 'Education Assistant',
        sort_order: 1,
        is_active: true,
      }],
      programmes: [{
        id: 'programme-server',
        code: 'literacy',
        name: 'Literacy',
        sort_order: 1,
        is_active: true,
      }],
      academic_years: [{
        id: 'year-server',
        label: '2026',
        starts_on: '2026-01-15',
        ends_on: '2026-12-15',
        is_active: true,
      }],
      assessment_windows: [{
        id: 'window-server',
        academic_year_id: 'year-server',
        label: '2026 Baseline',
        window_type: 'baseline',
        starts_on: '2026-01-15',
        ends_on: '2026-03-15',
        is_required: true,
      }],
      teachers: [{
        id: 'teacher-server',
        first_name: 'Nandi',
        last_name: 'Teacher',
        display_name: 'Nandi Teacher',
        school_id: 'school-server',
      }],
      staff_programme_assignments: [{
        id: 'spa-server',
        user_id: 'user-1',
        programme_id: 'programme-server',
        school_id: 'school-server',
        assigned_at: '2026-01-15T00:00:00.000Z',
        ended_at: null,
      }, {
        id: 'spa-other-user',
        user_id: 'user-2',
        programme_id: 'programme-server',
        school_id: 'school-server',
        assigned_at: '2026-01-15T00:00:00.000Z',
        ended_at: null,
      }],
    };
    const eqCalls = [];
    const supabaseClient = {
      from: jest.fn((tableName) => {
        const builder = {
          select: jest.fn(() => builder),
          eq: jest.fn((column, value) => {
            eqCalls.push({ tableName, column, value });
            builder.filterColumn = column;
            builder.filterValue = value;
            return builder;
          }),
          then: (resolve) => {
            const rows = rowsByTable[tableName] || [];
            const filteredRows = builder.filterColumn
              ? rows.filter(row => row[builder.filterColumn] === builder.filterValue)
              : rows;
            return Promise.resolve({ data: filteredRows, error: null }).then(resolve);
          },
        };
        return builder;
      }),
    };

    try {
      const repositories = {
        schools: createSchoolsRepository({ database: db }),
        job_titles: createReferenceDataRepository({ database: db, tableName: 'job_titles' }),
        programmes: createReferenceDataRepository({ database: db, tableName: 'programmes' }),
        academic_years: createReferenceDataRepository({ database: db, tableName: 'academic_years' }),
        assessment_windows: createReferenceDataRepository({ database: db, tableName: 'assessment_windows' }),
        teachers: createReferenceDataRepository({ database: db, tableName: 'teachers' }),
        staff_programme_assignments: createReferenceDataRepository({
          database: db,
          tableName: 'staff_programme_assignments',
        }),
      };

      await pullReferenceData({ supabaseClient, repositories, userId: 'user-1' });

      expect(eqCalls).toContainEqual({
        tableName: 'staff_programme_assignments',
        column: 'user_id',
        value: 'user-1',
      });
      await expect(getActiveProgrammeId(db, 'user-1')).resolves.toBe('programme-server');
      expect(await db.getFirstAsync(
        'select count(*) as count from staff_programme_assignments'
      )).toEqual({ count: 1 });
    } finally {
      await db.closeAsync();
    }
  });

  test('session save fails before the startup assignment pull and succeeds after it', async () => {
    const db = await createMigratedDatabase(runMigrations);

    try {
      await seedCoreData(db, { includeStaffProgrammeAssignment: false });
      const repository = createSessionsRepository({ database: db });

      const session = {
        id: 'session-after-pull',
        user_id: 'user-1',
        session_date: '2026-05-21',
        children_ids: [],
        activities: { letters_focused: ['a'] },
        synced: false,
      };

      await expect(repository.saveSession(session)).rejects.toThrow(/No active programme assignment/i);

      const rowsByTable = {
        schools: [{ id: 'school-1', name: 'Masi Primary' }],
        job_titles: [],
        programmes: [{ id: 'programme-a', code: 'literacy', name: 'Literacy' }],
        academic_years: [{
          id: 'year-2026',
          label: '2026',
          starts_on: '2026-01-15',
          ends_on: '2026-12-15',
          is_active: true,
        }],
        assessment_windows: [],
        teachers: [],
        staff_programme_assignments: [{
          id: 'spa-after-pull',
          user_id: 'user-1',
          programme_id: 'programme-a',
          school_id: 'school-1',
          assigned_at: '2026-01-15T00:00:00.000Z',
          ended_at: null,
        }],
      };
      const supabaseClient = {
        from: jest.fn((tableName) => {
          const builder = {
            select: jest.fn(() => builder),
            eq: jest.fn((column, value) => {
              builder.filterColumn = column;
              builder.filterValue = value;
              return builder;
            }),
            then: (resolve) => {
              const rows = rowsByTable[tableName] || [];
              const filteredRows = builder.filterColumn
                ? rows.filter(row => row[builder.filterColumn] === builder.filterValue)
                : rows;
              return Promise.resolve({ data: filteredRows, error: null }).then(resolve);
            },
          };
          return builder;
        }),
      };
      const repositories = {
        schools: createSchoolsRepository({ database: db }),
        job_titles: createReferenceDataRepository({ database: db, tableName: 'job_titles' }),
        programmes: createReferenceDataRepository({ database: db, tableName: 'programmes' }),
        academic_years: createReferenceDataRepository({ database: db, tableName: 'academic_years' }),
        assessment_windows: createReferenceDataRepository({ database: db, tableName: 'assessment_windows' }),
        teachers: createReferenceDataRepository({ database: db, tableName: 'teachers' }),
        staff_programme_assignments: createReferenceDataRepository({
          database: db,
          tableName: 'staff_programme_assignments',
        }),
      };

      await pullReferenceData({ supabaseClient, repositories, userId: 'user-1' });

      await repository.saveSession(session);

      expect(await db.getFirstAsync(
        'select id, programme_id from sessions where id = ?',
        'session-after-pull'
      )).toEqual({
        id: 'session-after-pull',
        programme_id: 'programme-a',
      });
      expect(await db.getFirstAsync(
        "select count(*) as count from sync_outbox where table_name = 'sessions' and record_id = ?",
        'session-after-pull'
      )).toEqual({ count: 1 });
    } finally {
      await db.closeAsync();
    }
  });
});
