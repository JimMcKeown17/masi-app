import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import {
  assertRlsRequiredFields,
  assessmentItemDomainId,
  enqueueDomainOutbox,
  getActiveProgrammeId,
  mapDomainRow,
  normalizeSyncFields,
  resolveProgrammeId,
  shouldEnqueueOutbox,
  upsertDomainRecord,
} from './domainRepositoryUtils';
import { chunkArray, decodeJson, sqlPlaceholders, syncStatusFromSynced } from './sqliteRepositoryUtils';
import { validateResult } from '../../assessment-questions/contractTest/validateResult';
import { assertSubmitShape } from '../../services/assessmentFamilyPayload';
import { LETTER_EVIDENCE_CODES } from '../../utils/assessmentRegistry';
import { toLocalDateString } from '../../utils/localDate';

const ASSESSMENT_COLUMNS = [
  'id',
  'user_id',
  'child_id',
  'programme_id',
  'assessment_tool_id',
  'assessment_window_id',
  'assessment_purpose',
  'grade_snapshot',
  'teacher_name_snapshot',
  'assessment_type',
  'capture_mode',
  'assessment_date',
  'score',
  'total_items',
  'items_tested',
  'notes',
  'created_at',
  'updated_at',
  'sync_status',
  'last_sync_error',
  'server_updated_at',
];

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

// Question families have their own storage shape; the legacy summary writer stays unchanged.
const QUESTION_RESULT_COLUMNS = [
  'id', 'user_id', 'child_id', 'programme_id', 'assessment_type', 'assessment_date',
  'assessment_purpose', 'assessment_window_id', 'capture_mode', 'score', 'total_items',
  'question_code', 'question_version', 'item_set_id', 'language', 'stopped_reason',
  'duration_ms', 'derived', 'battery_run_id', 'created_at', 'updated_at', 'sync_status',
];

const SUMMARY_ITEM_KEY = '__summary__';

const buildSummary = (assessment) => ({
  attempt_number: assessment.attempt_number,
  correction_count: assessment.correction_count ?? 0,
  letter_set_id: assessment.letter_set_id,
  letter_language: assessment.letter_language,
  completion_time: assessment.completion_time,
  letters_attempted: assessment.letters_attempted,
  correct_responses: assessment.correct_responses,
  accuracy: assessment.accuracy,
  correct_letters: assessment.correct_letters || [],
  incorrect_letters: assessment.incorrect_letters || [],
  last_letter_attempted: assessment.last_letter_attempted || null,
  date_assessed: assessment.date_assessed || assessment.assessment_date,
  device_info: assessment.device_info || {},
});

const mapAssessment = (row, summary = {}) => {
  if (!row) return null;
  const mapped = mapDomainRow(row, { jsonColumns: ['items_tested'] });

  return {
    ...mapped,
    ...summary,
    date_assessed: summary.date_assessed || mapped.assessment_date,
  };
};

const hydrateAssessments = async (db, rows) => {
  if (rows.length === 0) return [];
  const placeholders = rows.map(() => '?').join(', ');
  const summaryRows = await db.getAllAsync(`
    select assessment_id, metadata
    from assessment_items
    where item_key = ?
      and assessment_id in (${placeholders})
  `, SUMMARY_ITEM_KEY, ...rows.map(row => row.id));
  const summaries = new Map(summaryRows.map(row => [
    row.assessment_id,
    decodeJson(row.metadata, {}),
  ]));
  return rows.map(row => mapAssessment(row, summaries.get(row.id) || {}));
};

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

  const getAssessments = async ({
    userId,
    programmeId,
    childId,
    recordedByUserId,
    sinceDate,
    order = 'asc',
  } = {}) => {
    const db = await resolveDatabase(database);
    const activeProgrammeId = await resolveActiveProgrammeId(db, { userId, programmeId });
    if (userId && !activeProgrammeId) return [];
    const clauses = [];
    const params = [];
    if (activeProgrammeId) {
      clauses.push('programme_id = ?');
      params.push(activeProgrammeId);
    }
    if (childId) {
      clauses.push('child_id = ?');
      params.push(childId);
    }
    if (recordedByUserId) {
      clauses.push('user_id = ?');
      params.push(recordedByUserId);
    }
    if (sinceDate) {
      clauses.push('assessment_date >= ?');
      params.push(sinceDate);
    }
    const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
    const direction = order === 'desc' ? 'desc' : 'asc';
    const rows = await db.getAllAsync(
      `select * from assessments ${where} order by assessment_date ${direction}, created_at ${direction}`,
      ...params
    );
    return hydrateAssessments(db, rows);
  };

  const getAssessmentCountsSince = async ({ userId, programmeId, sinceDate } = {}) => {
    const db = await resolveDatabase(database);
    const activeProgrammeId = await resolveActiveProgrammeId(db, { userId, programmeId });
    if (userId && !activeProgrammeId) return [];
    const clauses = [];
    const params = [];
    if (activeProgrammeId) {
      clauses.push('programme_id = ?');
      params.push(activeProgrammeId);
    }
    if (sinceDate) {
      clauses.push('assessment_date >= ?');
      params.push(sinceDate);
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

  const countAssessments = async ({ userId, childId, assessmentType = 'letter_egra' } = {}) => {
    const db = await resolveDatabase(database);
    const activeProgrammeId = await resolveActiveProgrammeId(db, { userId });
    if (!activeProgrammeId) return 0;
    const row = await db.getFirstAsync(`
      select count(*) as count
      from assessments
      where programme_id = ?
        and child_id = ?
        and coalesce(assessment_type, 'letter_egra') = ?
    `, activeProgrammeId, childId, assessmentType);
    return Number(row?.count || 0);
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
    userId, programmeId, childId, childIds, questionCodes, language, sinceDate,
    recordedByUserId, includeSkipped = false, order = 'asc',
  } = {}) => {
    if (childIds?.length === 0 || questionCodes?.length === 0) return [];
    const db = await resolveDatabase(database);
    const activeProgrammeId = await resolveActiveProgrammeId(db, { userId, programmeId });
    if (userId && !activeProgrammeId) return [];
    const clauses = ['question_code is not null'];
    const params = [];
    for (const [column, value] of [
      ['programme_id', activeProgrammeId], ['child_id', childId],
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

  const saveAssessment = async (assessment, { transaction } = {}) => runWrite(transaction, async (txn) => {
    assertRlsRequiredFields('assessments', assessment, ['user_id']);
    const programmeId = await resolveProgrammeId(txn, {
      programmeId: assessment.programme_id,
      userId: assessment.user_id,
    });
    const summary = buildSummary(assessment);
    const record = normalizeSyncFields({
      ...assessment,
      programme_id: programmeId,
      assessment_date: assessment.assessment_date || assessment.date_assessed,
      score: assessment.score ?? assessment.correct_responses ?? null,
      total_items: assessment.total_items ?? assessment.letters_attempted ?? null,
      assessment_purpose: assessment.assessment_purpose || 'progress_check',
      items_tested: assessment.items_tested || [],
      sync_status: assessment.sync_status || syncStatusFromSynced(assessment.synced),
    });

    await upsertDomainRecord(txn, {
      tableName: 'assessments',
      columns: ASSESSMENT_COLUMNS,
      jsonColumns: ['items_tested'],
    }, record);
    if (shouldEnqueueOutbox(record)) {
      await enqueueDomainOutbox(txn, 'assessments', assessment.id, 'insert', record);
    }

    const itemRows = [
      {
        id: assessmentItemDomainId({
          assessmentId: assessment.id,
          itemKey: SUMMARY_ITEM_KEY,
        }),
        assessment_id: assessment.id,
        item_key: SUMMARY_ITEM_KEY,
        metadata: summary,
      },
      ...(assessment.correct_letters || []).map((item) => ({
        id: assessmentItemDomainId({
          assessmentId: assessment.id,
          itemKey: item.letter,
          position: item.index,
          isCorrect: true,
        }),
        assessment_id: assessment.id,
        item_key: item.letter,
        prompt: item.letter,
        is_correct: true,
        position: item.index,
        metadata: item,
      })),
      ...(assessment.incorrect_letters || []).map((item) => ({
        id: assessmentItemDomainId({
          assessmentId: assessment.id,
          itemKey: item.letter,
          position: item.index,
          isCorrect: false,
        }),
        assessment_id: assessment.id,
        item_key: item.letter,
        prompt: item.letter,
        is_correct: false,
        position: item.index,
        metadata: item,
      })),
    ];

    for (const item of itemRows) {
      const itemRecord = normalizeSyncFields({
        ...item,
        sync_status: assessment.sync_status || syncStatusFromSynced(assessment.synced),
      });
      await upsertDomainRecord(txn, {
        tableName: 'assessment_items',
        columns: ITEM_COLUMNS,
        booleanColumns: ['is_correct'],
        jsonColumns: ['metadata'],
      }, itemRecord);
      if (shouldEnqueueOutbox(itemRecord)) {
        await enqueueDomainOutbox(txn, 'assessment_items', item.id, 'insert', itemRecord);
      }
    }

    return true;
  });

  const getUnsyncedRecords = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync("select * from assessments where sync_status <> 'synced' order by created_at");
    return hydrateAssessments(db, rows);
  };

  return {
    getAssessments,
    getAssessmentCountsSince,
    countAssessments,
    saveAssessment,
    getUnsyncedRecords,
    saveQuestionResult,
    getQuestionResults,
    getLetterResults,
    latestLetterResult,
    countResults,
  };
};

export const assessmentsRepository = createAssessmentsRepository();
