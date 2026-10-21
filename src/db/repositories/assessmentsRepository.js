import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import {
  assessmentItemDomainId,
  enqueueDomainOutbox,
  getActiveAcademicYear,
  getActiveProgrammeId,
  mapDomainRow,
  resolveProgrammeId,
  upsertDomainRecord,
} from './domainRepositoryUtils';
import { chunkArray, sqlPlaceholders } from './sqliteRepositoryUtils';
import { validateResult } from '../../assessment-questions/contractTest/validateResult';
import { assertSubmitShape } from '../../services/assessmentFamilyPayload';
import { LETTER_EVIDENCE_CODES } from '../../utils/assessmentRegistry';
import { toLocalDateString } from '../../utils/localDate';
import { SERVER_COLUMNS } from '../../services/syncServerColumns';
import { createSyncStateRepository } from './syncStateRepository';
import { resolveHistoryPullState } from './historyCoverage';
import {
  assertPulledRunShape, ensureHistoryReferenceChildren, insertOrIgnoreRows,
  mergePulledRunHeaders, selectRowsByIds,
} from './historyPageApply';

const ITEM_COLUMNS = [
  'id',
  'assessment_id',
  'item_key',
  'prompt',
  'response',
  'is_correct',
  'position',
  'metadata',
  'created_at',
  'updated_at',
  'sync_status',
  'last_sync_error',
  'server_updated_at',
];

// Question results and their items are persisted as one family.
const QUESTION_RESULT_COLUMNS = [
  'id', 'user_id', 'child_id', 'programme_id', 'assessment_type', 'assessment_date',
  'assessment_purpose', 'assessment_window_id', 'capture_mode', 'score', 'total_items',
  'question_code', 'question_version', 'item_set_id', 'language', 'stopped_reason',
  'duration_ms', 'derived', 'battery_run_id', 'created_at', 'updated_at', 'sync_status',
];

const hydrateQuestionResults = async (db, rows) => {
  const itemsByAssessment = new Map();
  for (const batch of chunkArray(rows)) {
    const items = await db.getAllAsync(`
      select * from assessment_items
      where assessment_id in (${sqlPlaceholders(batch.length)})
      order by position asc
    `, ...batch.map(row => row.id));
    for (const row of items) {
      if (!itemsByAssessment.has(row.assessment_id)) itemsByAssessment.set(row.assessment_id, []);
      itemsByAssessment.get(row.assessment_id).push(mapDomainRow(row, {
        booleanColumns: ['is_correct'], jsonColumns: ['metadata'],
      }));
    }
  }
  return rows.map(row => ({
    ...mapDomainRow(row, { jsonColumns: ['derived'] }),
    items: itemsByAssessment.get(row.id) || [],
  }));
};

export const createAssessmentsRepository = ({ database } = {}) => {
  const runWrite = (transaction, task) => (
    transaction ? task(transaction) : runRepositoryTransaction(database, task)
  );

  const resolveActiveProgrammeId = async (db, { userId, programmeId }) => (
    programmeId || (userId ? await getActiveProgrammeId(db, userId) : null)
  );

  const getAssessmentCountsSince = async ({ userId, programmeId } = {}) => {
    const db = await resolveDatabase(database);
    const activeProgrammeId = await resolveActiveProgrammeId(db, { userId, programmeId });
    if (userId && !activeProgrammeId) return [];
    const academicYear = await getActiveAcademicYear(db);
    if (!academicYear) return [];
    // Home receives already-qualified counts: any recorder, standalone or battery,
    // non-skipped letter Questions across the whole active academic year (inclusive).
    const clauses = [
      `question_code in (${sqlPlaceholders(LETTER_EVIDENCE_CODES.length)})`,
      "substr(coalesce(stopped_reason, ''), 1, 8) <> 'skipped_'",
      'assessment_date >= ?',
      'assessment_date <= ?',
    ];
    const params = [...LETTER_EVIDENCE_CODES, academicYear.starts_on, academicYear.ends_on];
    if (activeProgrammeId) {
      clauses.push('programme_id = ?');
      params.push(activeProgrammeId);
    }
    const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
    const rows = await db.getAllAsync(`
      select child_id, count(*) as count
      from assessments
      ${where}
      group by child_id
      order by child_id
    `, ...params);
    return rows.map(row => ({ ...row, count: Number(row.count) }));
  };

  const saveQuestionResult = async ({
    assessmentId, result, childId, userId, batteryRunId = null, captureMode = null, transaction,
  }) => {
    const verdict = validateResult(result);
    if (!verdict.valid) throw new TypeError(`Invalid Question result: ${verdict.errors.join('; ')}`);
    return runWrite(transaction, async (txn) => {
      const programmeId = await resolveProgrammeId(txn, { userId });
      const now = new Date();
      const createdAt = now.toISOString();
      const record = {
        id: assessmentId,
        user_id: userId,
        child_id: childId,
        programme_id: programmeId,
        assessment_type: result.question_code,
        assessment_date: toLocalDateString(now),
        assessment_purpose: 'progress_check',
        assessment_window_id: null,
        capture_mode: captureMode,
        score: result.derived.ea_rubric_total ?? result.derived.total_correct ?? 0,
        total_items: result.items.length,
        question_code: result.question_code,
        question_version: result.question_version,
        item_set_id: result.item_set_id,
        language: result.language,
        stopped_reason: result.stopped_reason,
        duration_ms: result.duration_ms,
        derived: result.derived,
        battery_run_id: batteryRunId,
        created_at: createdAt,
      };
      const items = result.items.map(item => ({
        id: assessmentItemDomainId({
          assessmentId, position: item.position, isCorrect: item.is_correct,
        }),
        assessment_id: assessmentId,
        position: item.position,
        item_key: item.item_key,
        prompt: item.prompt,
        response: item.response,
        is_correct: item.is_correct,
        metadata: item.metadata ?? {},
        created_at: createdAt,
      }));
      const payload = { ...record, items };
      assertSubmitShape(payload);
      // Keep both checks within the write transaction so two callbacks cannot overwrite a decision.
      if (await txn.getFirstAsync('select id from assessments where id = ?', assessmentId)) {
        const error = new Error('ASSESSMENT_ALREADY_SAVED: this assessment has already been saved');
        error.code = 'ASSESSMENT_ALREADY_SAVED';
        throw error;
      }
      if (batteryRunId && await txn.getFirstAsync(
        'select id from assessments where battery_run_id = ? and question_code = ?',
        batteryRunId, result.question_code
      )) {
        const error = new Error('QUESTION_ALREADY_DECIDED: this Run already has a decision for this Question');
        error.code = 'QUESTION_ALREADY_DECIDED';
        throw error;
      }
      await upsertDomainRecord(txn, {
        tableName: 'assessments', columns: QUESTION_RESULT_COLUMNS, jsonColumns: ['derived'],
      }, { ...record, updated_at: createdAt, sync_status: 'pending' });
      for (const item of items) {
        await upsertDomainRecord(txn, {
          tableName: 'assessment_items', columns: ITEM_COLUMNS,
          booleanColumns: ['is_correct'], jsonColumns: ['metadata'],
        }, { ...item, updated_at: createdAt, sync_status: 'pending' });
      }
      await enqueueDomainOutbox(txn, 'assessments', assessmentId, 'insert', payload);
      return { id: assessmentId };
    });
  };

  const getQuestionResults = async ({
    userId, programmeId, assessmentId, childId, childIds, questionCodes, language, sinceDate,
    recordedByUserId, includeSkipped = false, order = 'asc',
  } = {}) => {
    if (childIds?.length === 0 || questionCodes?.length === 0) return [];
    const db = await resolveDatabase(database);
    const activeProgrammeId = await resolveActiveProgrammeId(db, { userId, programmeId });
    if (userId && !activeProgrammeId) return [];
    const clauses = ['question_code is not null'];
    const params = [];
    for (const [column, value] of [
      ['programme_id', activeProgrammeId], ['id', assessmentId], ['child_id', childId],
      ['user_id', recordedByUserId], ['language', language],
    ]) {
      if (value) { clauses.push(`${column} = ?`); params.push(value); }
    }
    if (sinceDate) { clauses.push('assessment_date >= ?'); params.push(sinceDate); }
    if (!includeSkipped) clauses.push("substr(coalesce(stopped_reason, ''), 1, 8) <> 'skipped_'");
    const direction = order === 'desc' ? 'desc' : 'asc';
    // Bound both caller filters and item hydration, including large class-roster requests.
    const childBatches = childIds ? chunkArray([...new Set(childIds)]) : [null];
    const questionBatches = questionCodes ? chunkArray([...new Set(questionCodes)]) : [null];
    const rows = [];
    for (const children of childBatches) {
      for (const codes of questionBatches) {
        const batchClauses = [...clauses], batchParams = [...params];
        for (const [column, values] of [['child_id', children], ['question_code', codes]]) {
          if (values) {
            batchClauses.push(`${column} in (${sqlPlaceholders(values.length)})`);
            batchParams.push(...values);
          }
        }
        rows.push(...await db.getAllAsync(`
          select * from assessments where ${batchClauses.join(' and ')}
          order by assessment_date ${direction}, created_at ${direction}
        `, ...batchParams));
      }
    }
    if (childBatches.length * questionBatches.length > 1) {
      const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
      rows.sort((a, b) => (direction === 'desc' ? -1 : 1) * (
        compare(a.assessment_date, b.assessment_date) || compare(a.created_at, b.created_at)
      ));
    }
    return hydrateQuestionResults(db, rows);
  };

  const getLetterResults = (options = {}) => getQuestionResults({
    ...options, questionCodes: LETTER_EVIDENCE_CODES,
  });

  const latestLetterResult = async ({ userId, childId, language } = {}) => {
    const results = await getLetterResults({ userId, childId, language, order: 'desc' });
    return results.find(result => result.items.some(item => item.metadata?.reached !== false)) || null;
  };

  const countResults = async ({ userId, childId, questionCode } = {}) => {
    const db = await resolveDatabase(database);
    const programmeId = await resolveActiveProgrammeId(db, { userId });
    if (!programmeId) return 0;
    const row = await db.getFirstAsync(`
      select count(*) as count from assessments
      where programme_id = ? and child_id = ? and question_code = ?
        and substr(coalesce(stopped_reason, ''), 1, 8) <> 'skipped_'
    `, programmeId, childId, questionCode);
    return Number(row?.count || 0);
  };

  const saveHistoryPage = async (rows, { scope, pullState, admit }) => {
    // Validate the entire page before acquiring the writer. RPC items omit parent fields.
    let families;
    try {
      families = rows.map((row) => {
        const family = { ...row, items: row.items.map((item) => ({
          ...item, assessment_id: row.id, created_at: row.created_at,
        })) };
        assertSubmitShape(family);
        if (row.battery_run != null) assertPulledRunShape(row.battery_run);
        return family;
      });
    } catch (error) {
      if (error instanceof TypeError) error.kind = 'query';
      throw error;
    }
    return runRepositoryTransaction(database, async (txn) => {
      if (admit && !admit()) throw Object.assign(new Error('Assessment history run cancelled'), { kind: 'cancelled' });
      await ensureHistoryReferenceChildren(txn, families);
      const runs = families.map((family) => family.battery_run).filter(Boolean);
      const merged = await mergePulledRunHeaders(txn, runs);
      const existing = await selectRowsByIds(txn, 'assessments', families.map((family) => family.id), ['id']);
      const absent = families.filter((family) => !existing.has(family.id));
      await insertOrIgnoreRows(txn, {
        table: 'assessments', columns: [...SERVER_COLUMNS.assessments, 'sync_status', 'server_updated_at'],
        rows: absent.map((family) => ({ ...family, derived: JSON.stringify(family.derived),
          sync_status: 'synced', server_updated_at: family.updated_at })),
      });
      await insertOrIgnoreRows(txn, {
        table: 'assessment_items', columns: ITEM_COLUMNS,
        rows: absent.flatMap((family) => family.items.map((item) => ({
          ...item, is_correct: item.is_correct ? 1 : 0, metadata: JSON.stringify(item.metadata),
          updated_at: family.updated_at, server_updated_at: family.updated_at,
          sync_status: 'synced', last_sync_error: null,
        }))),
      });
      await createSyncStateRepository({ database }).setPullState(
        scope, await resolveHistoryPullState(txn, pullState), { transaction: txn }
      );
      if (admit && !admit()) throw Object.assign(new Error('Assessment history run cancelled'), { kind: 'cancelled' });
      return { inserted: absent.length, present: families.length - absent.length,
        runsInserted: merged.inserted, runsAdvanced: merged.advanced };
    });
  };

  return {
    getAssessmentCountsSince,
    saveQuestionResult,
    getQuestionResults,
    getLetterResults,
    latestLetterResult,
    countResults,
    saveHistoryPage,
  };
};

export const assessmentsRepository = createAssessmentsRepository();
