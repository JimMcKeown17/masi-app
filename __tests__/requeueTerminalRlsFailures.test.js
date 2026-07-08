jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));
jest.mock('../src/services/supabaseClient', () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));

import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';
import { runMigrations } from '../src/db/migrations';
import {
  AUTHENTICATED_DENIAL_MARKER,
  createOutboxSyncEngine,
} from '../src/services/offlineSync';
import { createAssessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createClassesRepository } from '../src/db/repositories/classesRepository';
import { createClassGroupingStateRepository } from '../src/db/repositories/classGroupingStateRepository';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { createSyncStateRepository } from '../src/db/repositories/syncStateRepository';
import { seedCoreData } from '../test-support/sqliteRepositoryTestUtils';

const RLS_ERROR = 'new row violates row-level security policy for table "children"';

const liveTestSession = async () => ({
  data: { session: { user: { id: 'user-1' } } },
});

describe('requeueTerminalRlsFailures', () => {
  let db;
  let outboxRepository;
  let engine;
  let childrenRepository;
  let classesRepository;
  let assessmentsRepository;
  let classGroupingStateRepository;

  beforeEach(async () => {
    db = createBetterSqliteTestDatabase();
    await runMigrations(db);
    await seedCoreData(db);
    outboxRepository = createSyncOutboxRepository({ database: db });
    engine = createOutboxSyncEngine({
      database: db,
      outboxRepository,
      stateRepository: createSyncStateRepository({ database: db }),
      getAuthSession: liveTestSession,
    });
    childrenRepository = createChildrenRepository({ database: db });
    classesRepository = createClassesRepository({ database: db });
    assessmentsRepository = createAssessmentsRepository({ database: db });
    classGroupingStateRepository = createClassGroupingStateRepository({ database: db });
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  const clearOutbox = async () => {
    await db.runAsync('delete from sync_outbox');
  };

  const enqueueTerminal = async ({
    tableName,
    recordId,
    operation = 'insert',
    payload,
    errorMessage = RLS_ERROR,
    retryCount = 3,
    nextRetryAt = '2026-07-07T12:00:00.000Z',
  }) => {
    const id = `${tableName}:${recordId}:${operation}`;
    await outboxRepository.enqueue({ tableName, recordId, operation, payload, id });
    await outboxRepository.markTerminalFailure(id, { errorMessage });
    await db.runAsync(`
      update sync_outbox
      set retry_count = ?,
          next_retry_at = ?
      where id = ?
    `, retryCount, nextRetryAt, id);
    return id;
  };

  const seedChild = async ({
    id,
    createdBy = 'user-1',
    syncStatus = 'pending',
  }) => {
    await childrenRepository.save({
      id,
      first_name: 'Amahle',
      last_name: 'Dlamini',
      class_id: 'class-1',
      programme_id: 'programme-a',
      created_by: createdBy,
      sync_status: syncStatus,
    }, { actorUserId: createdBy });
  };

  const markDomainTerminal = async (tableName, id, errorMessage = RLS_ERROR) => {
    await db.runAsync(`
      update ${tableName}
      set sync_status = 'terminal',
          last_sync_error = ?
      where id = ?
    `, errorMessage, id);
  };

  test('heals an unmarked RLS-terminal row owned by the user', async () => {
    await seedChild({ id: 'child-owned' });
    await clearOutbox();
    await markDomainTerminal('children', 'child-owned');
    const outboxId = await enqueueTerminal({
      tableName: 'children',
      recordId: 'child-owned',
      payload: {
        id: 'child-owned',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        class_id: 'class-1',
        created_by: 'user-1',
      },
    });

    const count = await engine.requeueTerminalRlsFailures('user-1');

    expect(count).toBe(1);
    expect(await outboxRepository.getById(outboxId)).toEqual(expect.objectContaining({
      status: 'pending',
      retry_count: 0,
      next_retry_at: null,
      last_error: null,
    }));
    expect(await db.getFirstAsync(`
      select sync_status, last_sync_error
      from children
      where id = 'child-owned'
    `)).toEqual({ sync_status: 'pending', last_sync_error: null });
  });

  test('never heals a marked genuine denial', async () => {
    await seedChild({ id: 'child-marked' });
    await clearOutbox();
    await markDomainTerminal('children', 'child-marked');
    const outboxId = await enqueueTerminal({
      tableName: 'children',
      recordId: 'child-marked',
      payload: {
        id: 'child-marked',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        created_by: 'user-1',
      },
      errorMessage: `${AUTHENTICATED_DENIAL_MARKER} ${RLS_ERROR}`,
    });

    await expect(engine.requeueTerminalRlsFailures('user-1')).resolves.toBe(0);
    expect(await outboxRepository.getById(outboxId)).toEqual(expect.objectContaining({
      status: 'terminal',
      last_error: `${AUTHENTICATED_DENIAL_MARKER} ${RLS_ERROR}`,
    }));
    expect(await db.getFirstAsync(`
      select sync_status, last_sync_error
      from children
      where id = 'child-marked'
    `)).toEqual({ sync_status: 'terminal', last_sync_error: RLS_ERROR });
  });

  test("never heals another user's records", async () => {
    await seedChild({ id: 'child-other-user', createdBy: 'user-2' });
    await clearOutbox();
    await markDomainTerminal('children', 'child-other-user');
    const outboxId = await enqueueTerminal({
      tableName: 'children',
      recordId: 'child-other-user',
      payload: {
        id: 'child-other-user',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        created_by: 'user-2',
      },
    });

    await expect(engine.requeueTerminalRlsFailures('user-1')).resolves.toBe(0);
    expect(await outboxRepository.getById(outboxId)).toEqual(expect.objectContaining({
      status: 'terminal',
    }));
  });

  test('heals assessment items through the parent assessment owner and skips orphan items', async () => {
    await seedChild({ id: 'child-assessed', syncStatus: 'synced' });
    await assessmentsRepository.saveAssessment({
      id: 'assessment-owned',
      user_id: 'user-1',
      child_id: 'child-assessed',
      programme_id: 'programme-a',
      assessment_type: 'letter_sounds',
      assessment_date: '2026-07-07',
      correct_responses: 1,
      letters_attempted: 1,
      correct_letters: [{ letter: 'a', index: 0 }],
      sync_status: 'pending',
    });
    const ownedItem = await db.getFirstAsync(`
      select *
      from assessment_items
      where assessment_id = 'assessment-owned'
        and item_key = 'a'
    `);
    await clearOutbox();
    await markDomainTerminal('assessment_items', ownedItem.id);
    const ownedOutboxId = await enqueueTerminal({
      tableName: 'assessment_items',
      recordId: ownedItem.id,
      payload: ownedItem,
      errorMessage: 'new row violates row-level security policy for table "assessment_items"',
    });
    const orphanOutboxId = await enqueueTerminal({
      tableName: 'assessment_items',
      recordId: 'item-orphan',
      payload: {
        id: 'item-orphan',
        assessment_id: 'assessment-missing',
        item_key: 'z',
        metadata: '{}',
      },
      errorMessage: 'new row violates row-level security policy for table "assessment_items"',
    });

    await expect(engine.requeueTerminalRlsFailures('user-1')).resolves.toBe(1);
    expect(await outboxRepository.getById(ownedOutboxId)).toEqual(expect.objectContaining({
      status: 'pending',
      last_error: null,
    }));
    expect(await outboxRepository.getById(orphanOutboxId)).toEqual(expect.objectContaining({
      status: 'terminal',
    }));
  });

  test('heals hard-delete rows from payload owner fallback without a domain reset', async () => {
    await classesRepository.saveClass({
      id: 'class-hard-delete',
      school_id: 'school-1',
      name: 'Grade 2A',
      grade: '2',
      academic_year_id: 'year-2026',
      created_by: 'user-1',
      sync_status: 'pending',
    });
    await clearOutbox();
    await db.runAsync("delete from classes where id = 'class-hard-delete'");
    const outboxId = await enqueueTerminal({
      tableName: 'classes',
      recordId: 'class-hard-delete',
      operation: 'hard_delete',
      payload: {
        id: 'class-hard-delete',
        created_by: 'user-1',
      },
      errorMessage: 'new row violates row-level security policy for table "classes"',
    });

    await expect(engine.requeueTerminalRlsFailures('user-1')).resolves.toBe(1);
    expect(await outboxRepository.getById(outboxId)).toEqual(expect.objectContaining({
      status: 'pending',
      last_error: null,
    }));
    expect(await db.getFirstAsync("select id from classes where id = 'class-hard-delete'"))
      .toBeNull();
  });

  test('never heals non-RLS terminal rows', async () => {
    await seedChild({ id: 'child-fk-failure' });
    await clearOutbox();
    const outboxId = await enqueueTerminal({
      tableName: 'children',
      recordId: 'child-fk-failure',
      payload: {
        id: 'child-fk-failure',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        created_by: 'user-1',
      },
      errorMessage: 'insert or update on table "children" violates foreign key constraint',
    });

    await expect(engine.requeueTerminalRlsFailures('user-1')).resolves.toBe(0);
    expect(await outboxRepository.getById(outboxId)).toEqual(expect.objectContaining({
      status: 'terminal',
    }));
  });

  test('is idempotent after the first heal', async () => {
    await seedChild({ id: 'child-idempotent' });
    await clearOutbox();
    await markDomainTerminal('children', 'child-idempotent');
    await enqueueTerminal({
      tableName: 'children',
      recordId: 'child-idempotent',
      payload: {
        id: 'child-idempotent',
        first_name: 'Amahle',
        last_name: 'Dlamini',
        created_by: 'user-1',
      },
    });

    await expect(engine.requeueTerminalRlsFailures('user-1')).resolves.toBe(1);
    await expect(engine.requeueTerminalRlsFailures('user-1')).resolves.toBe(0);
  });

  test('heals class_grouping_state through its parent class owner', async () => {
    await classGroupingStateRepository.save({
      id: 'grouping-state-1',
      class_id: 'class-1',
      academic_year_id: 'year-2026',
      class_list_status: 'building',
      class_list_completed_by_user_id: null,
      class_list_reopened_by_user_id: null,
      sync_status: 'pending',
    });
    await clearOutbox();
    await markDomainTerminal('class_grouping_state', 'grouping-state-1');
    const outboxId = await enqueueTerminal({
      tableName: 'class_grouping_state',
      recordId: 'grouping-state-1',
      operation: 'update',
      payload: {
        id: 'grouping-state-1',
        class_id: 'class-1',
        academic_year_id: 'year-2026',
        class_list_status: 'building',
      },
      errorMessage: 'new row violates row-level security policy for table "class_grouping_state"',
    });

    await expect(engine.requeueTerminalRlsFailures('user-1')).resolves.toBe(1);
    expect(await outboxRepository.getById(outboxId)).toEqual(expect.objectContaining({
      status: 'pending',
      last_error: null,
    }));
  });
});
