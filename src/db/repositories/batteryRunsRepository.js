import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import { getConnectionActor } from '../../session/signedInHandle';
import { createAssessmentsRepository } from './assessmentsRepository';
import { assertPulledRunShape, ensureHistoryReferenceChildren, mergePulledRunHeaders } from './historyPageApply';
import { createSyncStateRepository } from './syncStateRepository';
import { resolveHistoryPullState } from './historyCoverage';
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

  const startRun = async ({ id, userId, childId, classId = null, batteryCode, batteryVersion, language, abandonRunId = null }) => {
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
      if (abandonRunId) await finishRunInTransaction(txn, abandonRunId, 'abandoned', { childId });
      const unfinished = await txn.getFirstAsync(`
        select id from battery_runs
        where user_id = ? and child_id = ? and programme_id = ?
          and status = 'in_progress' and started_here = 1
      `, userId, childId, programmeId);
      if (unfinished) {
        const error = new Error('UNFINISHED_RUN_EXISTS: this child already has an unfinished Run');
        error.code = 'UNFINISHED_RUN_EXISTS';
        error.runId = unfinished.id;
        throw error;
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

  const finishRunInTransaction = async (txn, id, status, { childId, questionCodes } = {}) => {
    if (status === 'completed' && (!Array.isArray(questionCodes) || questionCodes.length === 0)) {
      throw new TypeError('questionCodes: must be a non-empty array');
    }
    const existing = await txn.getFirstAsync('select * from battery_runs where id = ?', id);
    if (!existing) throw new Error('Battery Run not found');
    if (existing.started_here !== 1) throw new Error('Battery Run was not started on this installation');
    if (existing.status !== 'in_progress') throw new Error('Battery Run must be in_progress');
    if (childId && existing.child_id !== childId) throw new Error('Battery Run belongs to another child');
    if (status === 'completed') {
      const decisions = await txn.getAllAsync('select question_code from assessments where battery_run_id = ?', id);
      const decided = new Set(decisions.map(row => row.question_code));
      if (!questionCodes.every(code => decided.has(code))) {
        const error = new Error('RUN_INCOMPLETE: every Question must have a saved decision');
        error.code = 'RUN_INCOMPLETE';
        throw error;
      }
    }
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
  };

  const finishRun = (id, status, options) => runRepositoryTransaction(database,
    txn => finishRunInTransaction(txn, id, status, options ?? {}));

  const getRunsForUser = async (userId) => {
    const db = await resolveDatabase(database);
    const programmeId = await getActiveProgrammeId(db, userId);
    if (!programmeId) return [];
    const rows = await db.getAllAsync(`
      select r.*, (select count(*) from assessments a where a.battery_run_id = r.id) as question_count
      from battery_runs r where r.user_id = ? and r.programme_id = ?
      order by r.started_at desc, r.created_at desc
    `, userId, programmeId);
    return rows.map(row => mapDomainRow(row));
  };

  const getUnfinishedRunsForUser = async (userId) => {
    const db = await resolveDatabase(database);
    const programmeId = await getActiveProgrammeId(db, userId);
    if (!programmeId) return [];
    const rows = await db.getAllAsync(`
      select r.*, (select count(*) from assessments a where a.battery_run_id = r.id) as question_count
      from battery_runs r
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
      userId: database?.userId ?? getConnectionActor(db),
      programmeId: run.programme_id, childId: run.child_id, includeSkipped: true,
    });
    return { ...mapDomainRow(run), results: results.filter(result => result.battery_run_id === id) };
  };

  const saveHistoryPage = async (rows, { scope, pullState, admit }) => {
    try {
      rows.forEach(assertPulledRunShape);
    } catch (error) {
      if (error instanceof TypeError) error.kind = 'query';
      throw error;
    }
    return runRepositoryTransaction(database, async (txn) => {
      if (admit && !admit()) throw Object.assign(new Error('Battery run history cancelled'), { kind: 'cancelled' });
      await ensureHistoryReferenceChildren(txn, rows);
      const result = await mergePulledRunHeaders(txn, rows);
      await createSyncStateRepository({ database }).setPullState(
        scope, await resolveHistoryPullState(txn, pullState), { transaction: txn }
      );
      if (admit && !admit()) throw Object.assign(new Error('Battery run history cancelled'), { kind: 'cancelled' });
      return result;
    });
  };

  return {
    startRun,
    finalizeRun: (id, options) => finishRun(id, 'completed', options),
    abandonRun: id => finishRun(id, 'abandoned'),
    getRunsForUser,
    getUnfinishedRunsForUser,
    getUnfinishedRunForChild,
    getRunWithResults,
    saveHistoryPage,
  };
};

export const batteryRunsRepository = createBatteryRunsRepository();
export default batteryRunsRepository;
