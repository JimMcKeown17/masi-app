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
import { decodeJson, syncStatusFromSynced } from './sqliteRepositoryUtils';

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
  };
};

export const assessmentsRepository = createAssessmentsRepository();
