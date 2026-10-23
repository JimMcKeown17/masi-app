import { v4 as uuid } from 'uuid';
import { createMigratedDatabase } from './sqliteRepositoryTestUtils';
import { bindTestActor } from './actorTestUtils';
import { runMigrations } from '../src/db/migrations';
import { createAssessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { createBatteryRunsRepository } from '../src/db/repositories/batteryRunsRepository';
import { createSyncOutboxRepository } from '../src/db/repositories/syncOutboxRepository';
import { createOutboxSyncEngine } from '../src/services/offlineSync';

export const questionResult = (count = 3, overrides = {}) => ({
  question_code: 'letter_sounds', question_version: '2026.1',
  item_set_id: 'letter_sounds@2026.1.en', language: 'en',
  duration_ms: 1000, stopped_reason: 'completed',
  items: Array.from({ length: count }, (_, position) => ({
    position, item_key: `letter-${position}`, prompt: 'a',
    is_correct: position % 2 === 0, metadata: { reached: true },
  })),
  derived: {
    total_correct: Math.ceil(count / 2), total_attempted: count,
    percent: count ? Math.ceil(count / 2) / count * 100 : 0, last_attempted_position: count ? count - 1 : null,
  },
  ...overrides,
});

export const createFamilySyncFixture = async ({ withDelivery = false } = {}) => {
  const db = await createMigratedDatabase(runMigrations);
  const userId = uuid(), childId = uuid(), programmeId = uuid();
  bindTestActor(db, userId);
  await db.runAsync('insert into programmes (id, code, name) values (?, ?, ?)', programmeId, 'literacy', 'Literacy');
  await db.runAsync(`insert into staff_programme_assignments (id, user_id, programme_id, assigned_at)
    values (?, ?, ?, '2026-01-15T00:00:00.000Z')`, uuid(), userId, programmeId);
  await db.runAsync('insert into children (id, first_name, last_name, created_by) values (?, ?, ?, ?)',
    childId, 'Test', 'Child', userId);
  if (withDelivery) await db.runAsync(`insert into child_ea_assignments (id, child_id, user_id, created_by, sync_status)
    values (?, ?, ?, ?, 'synced')`, uuid(), childId, userId, userId);
  const assessments = createAssessmentsRepository({ database: db });
  const runs = createBatteryRunsRepository({ database: db });
  const outbox = createSyncOutboxRepository({ database: db });
  return {
    db, userId, childId, programmeId, assessments, runs, outbox,
    save: (count = 3, args = {}) => assessments.saveQuestionResult({
      assessmentId: uuid(), userId, childId, result: questionResult(count), ...args,
    }),
    start: (args = {}) => runs.startRun({
      id: uuid(), userId, childId, batteryCode: 'wela_plus', batteryVersion: '2026.1', language: 'en', ...args,
    }),
    engine: (supabaseClient, options = {}) => createOutboxSyncEngine({
      database: db, supabaseClient, outboxRepository: outbox,
      enqueueRequest: task => task(),
      getAuthSession: async () => ({ data: { session: { user: { id: userId } } } }),
      ...options,
    }),
    read: id => db.getFirstAsync('select * from assessments where id = ?', id),
    items: id => db.getAllAsync('select * from assessment_items where assessment_id = ? order by position', id),
  };
};
