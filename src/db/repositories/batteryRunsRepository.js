import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import { createAssessmentsRepository } from './assessmentsRepository';
import {
  enqueueDomainOutbox, getActiveProgrammeId, mapDomainRow, resolveProgrammeId, upsertDomainRecord,
} from './domainRepositoryUtils';

const HEADER_COLUMNS = [
  'id', 'user_id', 'child_id', 'programme_id', 'class_id', 'battery_code', 'battery_version',
  'assessment_purpose', 'assessment_window_id', 'language', 'started_at', 'completed_at',
  'status', 'notes', 'created_at',
];
const RUN_COLUMNS = [...HEADER_COLUMNS, 'started_here', 'updated_at', 'sync_status', 'last_sync_error'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const assertUuid = (value, field) => {
  if (typeof value !== 'string' || !UUID.test(value)) throw new TypeError(`${field}: must be a UUID`);
};
const headerPayload = run => Object.fromEntries(HEADER_COLUMNS.map(field => [field, run[field] ?? null]));

export const createBatteryRunsRepository = ({ database } = {}) => {
  const assessments = createAssessmentsRepository({ database });

  const startRun = async ({ id, userId, childId, classId = null, batteryCode, batteryVersion, language }) => {
    for (const [field, value] of [['id', id], ['user_id', userId], ['child_id', childId]]) {
      assertUuid(value, field);
    }
    if (classId != null) assertUuid(classId, 'class_id');
    for (const [field, value] of [['battery_code', batteryCode], ['battery_version', batteryVersion]]) {
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new TypeError(`${field}: must be a nonempty string`);
      }
    }
    if (typeof language !== 'string' || !/^[a-z]{2}$/.test(language)) {
      throw new TypeError('language: must be two lowercase letters');
    }
    return runRepositoryTransaction(database, async (txn) => {
      const programmeId = await resolveProgrammeId(txn, { userId });
      assertUuid(programmeId, 'programme_id');
      if (await txn.getFirstAsync('select id from battery_runs where id = ?', id)) {
        throw new Error('Battery Run already exists');
      }
      const now = new Date().toISOString();
      const run = {
        id, user_id: userId, child_id: childId, programme_id: programmeId, class_id: classId,
        battery_code: batteryCode, battery_version: batteryVersion, language,
        assessment_purpose: 'progress_check', assessment_window_id: null,
        status: 'in_progress', started_at: now, completed_at: null, notes: null,
        created_at: now, updated_at: now, started_here: 1, sync_status: 'pending',
      };
      await upsertDomainRecord(txn, { tableName: 'battery_runs', columns: RUN_COLUMNS }, run);
      await enqueueDomainOutbox(txn, 'battery_runs', id, 'insert', headerPayload(run));
      return { id };
    });
  };

  const finishRun = (id, status) => runRepositoryTransaction(database, async (txn) => {
    const existing = await txn.getFirstAsync('select * from battery_runs where id = ?', id);
    if (!existing) throw new Error('Battery Run not found');
    if (existing.started_here !== 1) throw new Error('Battery Run was not started on this installation');
    if (existing.status !== 'in_progress') throw new Error('Battery Run must be in_progress');
    const now = new Date().toISOString();
    const run = {
      ...existing, status, completed_at: status === 'completed' ? now : null,
      updated_at: now, sync_status: 'pending', last_sync_error: null,
    };
    await upsertDomainRecord(txn, { tableName: 'battery_runs', columns: RUN_COLUMNS }, run);
    // Presence, not delivery status, decides whether the original insert still owns this slot.
    const insert = await txn.getFirstAsync('select id from sync_outbox where id = ?', `battery_runs:${id}:insert`);
    await enqueueDomainOutbox(txn, 'battery_runs', id, insert ? 'insert' : 'update', headerPayload(run));
    return { id };
  });

  const getUnfinishedRunsForUser = async (userId) => {
    const db = await resolveDatabase(database);
    const programmeId = await getActiveProgrammeId(db, userId);
    if (!programmeId) return [];
    const rows = await db.getAllAsync(`
      select * from battery_runs
      where user_id = ? and programme_id = ? and status = 'in_progress' and started_here = 1
      order by started_at desc, created_at desc
    `, userId, programmeId);
    return rows.map(row => mapDomainRow(row));
  };

  const getUnfinishedRunForChild = async ({ userId, childId }) => {
    const runs = await getUnfinishedRunsForUser(userId);
    return runs.find(run => run.child_id === childId) || null;
  };

  const getRunWithResults = async (id) => {
    const db = await resolveDatabase(database);
    const run = await db.getFirstAsync('select * from battery_runs where id = ?', id);
    if (!run) return null;
    const results = await assessments.getQuestionResults({
      programmeId: run.programme_id, childId: run.child_id, includeSkipped: true,
    });
    return { ...mapDomainRow(run), results: results.filter(result => result.battery_run_id === id) };
  };

  return {
    startRun,
    finalizeRun: id => finishRun(id, 'completed'),
    abandonRun: id => finishRun(id, 'abandoned'),
    getUnfinishedRunsForUser,
    getUnfinishedRunForChild,
    getRunWithResults,
  };
};

export const batteryRunsRepository = createBatteryRunsRepository();
export default batteryRunsRepository;
