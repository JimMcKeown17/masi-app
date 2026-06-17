import { supabase } from './supabaseClient';
import { enqueueSupabaseRequest } from './supabaseRequestQueue';
import { storage } from '../utils/storage';
import { resolveDatabase, runRepositoryTransaction } from '../db/repositories/repositoryRuntime';
import {
  chunkArray,
  quoteIdentifier,
  timestamp,
} from '../db/repositories/sqliteRepositoryUtils';
import {
  createSyncOutboxRepository,
  syncOutboxRepository,
} from '../db/repositories/syncOutboxRepository';
import {
  createSyncStateRepository,
  syncStateRepository,
} from '../db/repositories/syncStateRepository';
import { repairGroupOwnershipForSync } from '../db/repositories/groupsRepository';
import {
  academicYearsRepository,
  assessmentWindowsRepository,
  jobTitlesRepository,
  programmesRepository,
  schoolsRepository,
  staffProgrammeAssignmentsRepository,
  teachersRepository,
} from '../db/repositories/referenceDataRepository';
import {
  assessmentItemDomainId,
  ensureServerUuid,
  LEGACY_PROGRAMME_ID,
  letterMasteryDomainId,
  sessionAttendeeDomainId,
} from '../db/repositories/domainRepositoryUtils';

const BASE_RETRY_DELAY = 5000;

const LOCAL_ONLY_KEYS_TO_STRIP = [
  'synced',
  '_deleted',
  '_pendingJobTitleResolve',
  'pendingSessionTypeCode',
  'pendingSessionTypeName',
  'sync_status',
  'last_sync_error',
  'server_updated_at',
  'tableName',
  'recordId',
];

const LEGACY_KEYS_TO_STRIP = {
  children: ['class', 'school', 'teacher'],
  users: ['assigned_school', 'job_title'],
  sessions: ['session_type'],
};

// Real server columns deliberately withheld from push (reserved strictly for that — NOT a
// catch-all). sessions.group_id/state are server-RLS-guarded out until the state-machine slice
// (supabase/migrations/20260529214500_masi_sessions_forward_prep_columns.sql).
const INTENTIONALLY_UNSYNCED = {
  sessions: {
    group_id: 'Forward-prep; server RLS pins group_id NULL until the state-machine slice (migration 20260529214500).',
    state: 'Forward-prep; server RLS pins state=completed until the state-machine slice (migration 20260529214500).',
  },
};

// Local-only bookkeeping columns the engine strips before push — never sent to the server.
const LOCAL_ONLY_COLUMNS = ['synced', 'sync_status', 'last_sync_error', 'server_updated_at'];

const SERVER_COLUMNS = {
  time_entries: [
    'id', 'user_id', 'sign_in_time', 'sign_in_lat', 'sign_in_lon', 'sign_out_time',
    'sign_out_lat', 'sign_out_lon', 'auto_clocked_out', 'created_at', 'updated_at',
  ],
  classes: [
    'id', 'school_id', 'name', 'grade', 'teacher', 'teacher_id', 'home_language',
    'academic_year', 'academic_year_id', 'archived_at', 'archived_by_user_id',
    'archive_reason', 'created_by', 'created_at', 'updated_at',
  ],
  children: [
    'id', 'first_name', 'last_name', 'preferred_name', 'date_of_birth', 'age',
    'gender', 'class_id', 'hidden_at', 'archived_at', 'archived_by_user_id',
    'archive_reason', 'created_by', 'created_at', 'updated_at',
  ],
  child_ea_assignments: [
    'id', 'user_id', 'child_id', 'assigned_at', 'unassigned_at', 'created_by',
    'created_at', 'updated_at',
  ],
  child_programme_enrollments: [
    'id', 'child_id', 'programme_id', 'enrolled_at', 'ended_at', 'created_by',
    'created_at', 'updated_at',
  ],
  child_class_memberships: [
    'id', 'child_id', 'class_id', 'academic_year_id', 'enrolled_at', 'exited_at',
    'created_by', 'created_at', 'updated_at',
  ],
  class_ea_assignments: [
    'id', 'class_id', 'ea_user_id', 'programme_id', 'assigned_at', 'unassigned_at',
    'handover_reason', 'created_by', 'created_at', 'updated_at',
  ],
  grouping_versions: [
    'id', 'class_id', 'academic_year_id', 'version_number', 'status',
    'accepted_at', 'accepted_by_user_id', 'archived_at', 'archived_by_user_id',
    'archive_reason', 'created_by', 'created_at', 'updated_at',
  ],
  class_grouping_state: [
    'id', 'class_id', 'academic_year_id', 'class_list_status',
    'class_list_completed_at', 'class_list_completed_by_user_id',
    'class_list_reopened_at', 'class_list_reopened_by_user_id',
    'active_grouping_version_id', 'created_at', 'updated_at',
  ],
  groups: [
    'id', 'name', 'programme_id', 'class_id', 'grouping_version_id',
    'display_number', 'archived_at', 'archived_by_user_id', 'archive_reason',
    'created_by', 'created_at', 'updated_at',
  ],
  group_ea_assignments: [
    'id', 'group_id', 'ea_user_id', 'programme_id', 'assigned_at', 'unassigned_at',
    'handover_reason', 'created_by', 'created_at', 'updated_at',
  ],
  child_group_memberships: [
    'id', 'child_id', 'group_id', 'grouping_version_id', 'joined_at', 'removed_at',
    'created_by', 'created_at', 'updated_at',
  ],
  sessions: [
    'id', 'user_id', 'programme_id', 'class_id', 'session_date', 'started_at',
    'ended_at', 'activities', 'notes', 'created_at', 'updated_at',
  ],
  session_attendees: [
    'id', 'session_id', 'child_id', 'group_id', 'attendance_status',
    'grade_snapshot', 'notes', 'created_at', 'updated_at',
  ],
  assessments: [
    'id', 'user_id', 'child_id', 'programme_id', 'assessment_tool_id',
    'assessment_window_id', 'assessment_purpose', 'grade_snapshot',
    'teacher_name_snapshot', 'assessment_type', 'assessment_date', 'score',
    'total_items', 'items_tested', 'notes', 'created_at', 'updated_at',
  ],
  assessment_items: [
    'id', 'assessment_id', 'item_key', 'prompt', 'response', 'is_correct',
    'position', 'metadata', 'created_at', 'updated_at',
  ],
  letter_mastery: [
    'id', 'user_id', 'child_id', 'programme_id', 'letter', 'language', 'source',
    'mastered_at', 'deleted_at', 'created_at', 'updated_at',
  ],
};

export const PUSH_ORDER = [
  'time_entries',
  'classes',
  'children',
  'child_ea_assignments',
  'child_programme_enrollments',
  'child_class_memberships',
  'class_ea_assignments',
  'grouping_versions',
  'class_grouping_state',
  'groups',
  'group_ea_assignments',
  'child_group_memberships',
  'sessions',
  'session_attendees',
  'assessments',
  'assessment_items',
  'letter_mastery',
];

const TABLE_DEPENDENCIES = {
  children: ['classes'],
  child_ea_assignments: ['children'],
  child_programme_enrollments: ['children'],
  child_class_memberships: ['children', 'classes'],
  class_ea_assignments: ['classes'],
  grouping_versions: ['classes'],
  class_grouping_state: ['classes', 'grouping_versions'],
  groups: ['classes'],
  group_ea_assignments: ['groups'],
  child_group_memberships: ['children', 'groups'],
  sessions: ['classes'],
  session_attendees: ['sessions', 'children', 'groups'],
  assessments: ['children'],
  assessment_items: ['assessments'],
  letter_mastery: ['children'],
};

const ARCHIVE_TABLE_DEPENDENCIES = {
  child_ea_assignments: [
    'child_programme_enrollments',
    'child_class_memberships',
    'child_group_memberships',
  ],
  class_ea_assignments: ['children', 'child_class_memberships'],
  group_ea_assignments: ['child_group_memberships'],
};

const ARCHIVE_PUSH_ORDER = {
  time_entries: 0,
  classes: 1,
  groups: 1,
  children: 2,
  child_programme_enrollments: 3,
  child_class_memberships: 4,
  child_group_memberships: 5,
  class_ea_assignments: 6,
  group_ea_assignments: 6,
  child_ea_assignments: 7,
};

const BATCHABLE_UPSERT_TABLES = new Set([
  'assessment_items',
  'letter_mastery',
  'session_attendees',
  'time_entries',
]);
const IMMUTABLE_ASSIGNMENT_TABLES = new Set([
  'child_ea_assignments',
  'class_ea_assignments',
  'group_ea_assignments',
]);

const dependenciesForRecord = (outboxRecord) => {
  const dependencies = new Set(TABLE_DEPENDENCIES[outboxRecord.table_name] || []);
  if (outboxRecord.operation === 'archive') {
    for (const dependency of ARCHIVE_TABLE_DEPENDENCIES[outboxRecord.table_name] || []) {
      dependencies.add(dependency);
    }
  }
  const payload = outboxRecord.payload || {};

  if (outboxRecord.table_name === 'children' && !payload.class_id) {
    dependencies.delete('classes');
    return [...dependencies];
  }
  if ((outboxRecord.table_name === 'groups' || outboxRecord.table_name === 'sessions') && !payload.class_id) {
    dependencies.delete('classes');
    return [...dependencies];
  }
  if (outboxRecord.table_name === 'session_attendees' && !payload.group_id) {
    dependencies.delete('groups');
    return [...dependencies];
  }

  return [...dependencies];
};

const TABLE_CONFIGS = Object.fromEntries(PUSH_ORDER.map((tableName, index) => [
  tableName,
  {
    tableName,
    order: index,
    onConflict: 'id',
    duplicateIsSuccess: false,
  },
]));

const normalizeTableName = (tableName) => tableName?.toLowerCase();

const MAX_RETRY_DELAY = 15 * 60 * 1000; // cap exponential backoff at 15 minutes
const getRetryDelay = (retryCountBeforeFailure) => (
  Math.min(BASE_RETRY_DELAY * Math.pow(3, Math.max(0, retryCountBeforeFailure)), MAX_RETRY_DELAY)
);

const nextRetryTimestamp = (retryCountBeforeFailure) => (
  new Date(Date.now() + getRetryDelay(retryCountBeforeFailure)).toISOString()
);

const classifyError = (error, { duplicateIsSuccess = false } = {}) => {
  const code = error?.code;

  if (code === '23505') {
    return { terminal: true, markAsSynced: duplicateIsSuccess };
  }

  if (
    code === '23503'
    || code === '42501'
    || code === 'ARCHIVE_REQUIRED'
    || code === 'LOCAL_ONLY_REFERENCE'
    || code === 'MISSING_OUTBOX_PAYLOAD'
  ) {
    return { terminal: true, markAsSynced: false };
  }

  return { terminal: false, markAsSynced: false };
};

const buildSyncPayload = (tableName, record) => {
  const tableLegacyKeys = LEGACY_KEYS_TO_STRIP[tableName] || [];
  const keysToStrip = new Set([...LOCAL_ONLY_KEYS_TO_STRIP, ...tableLegacyKeys]);
  const allowlist = SERVER_COLUMNS[tableName] ? new Set(SERVER_COLUMNS[tableName]) : null;

  const payload = {};
  for (const [key, value] of Object.entries(record || {})) {
    if (keysToStrip.has(key) || value === undefined) continue;
    if (allowlist && !allowlist.has(key)) continue;
    payload[key] = value;
  }
  if (tableName === 'session_attendees' && payload.id) {
    payload.id = ensureServerUuid(payload.id, sessionAttendeeDomainId(payload.session_id, payload.child_id));
  }
  if (tableName === 'assessment_items' && payload.id) {
    payload.id = ensureServerUuid(
      payload.id,
      assessmentItemDomainId({
        assessmentId: payload.assessment_id,
        itemKey: payload.item_key,
        position: payload.position,
        isCorrect: payload.is_correct,
      })
    );
  }
  // letter_mastery's identity is its logical key. Force the deterministic id on every push so a
  // pre-fix random local id (OTA-updated device) still lands on the canonical server row, and
  // every device/install agrees on the id — making insert-by-id idempotent (no 23505 to repair).
  // Unlike ensureServerUuid (which passes a valid random uuid through), this always derives it.
  if (tableName === 'letter_mastery' && payload.id) {
    payload.id = letterMasteryDomainId({
      userId: payload.user_id,
      childId: payload.child_id,
      programmeId: payload.programme_id,
      letter: payload.letter,
      language: payload.language,
      source: payload.source || 'taught',
    });
  }
  return payload;
};

const errorMessage = (error) => (
  error?.message || error?.code || String(error || 'Unknown sync error')
);

const makeFailedRecord = (outboxRecord, reason) => ({
  id: outboxRecord.record_id,
  table: outboxRecord.table_name,
  operation: outboxRecord.operation,
  reason,
});

const runServerOperation = async (supabaseClient, config, outboxRecord) => {
  if (outboxRecord.operation !== 'hard_delete' && outboxRecord.payload == null) {
    return {
      success: false,
      error: {
        code: 'MISSING_OUTBOX_PAYLOAD',
        message: `Missing outbox payload for ${config.tableName}:${outboxRecord.record_id} ${outboxRecord.operation}`,
      },
    };
  }

  const payloadSource = outboxRecord.operation === 'hard_delete'
    ? (outboxRecord.payload || { id: outboxRecord.record_id })
    : outboxRecord.payload;
  const payload = buildSyncPayload(config.tableName, payloadSource);

  if (payload.programme_id === LEGACY_PROGRAMME_ID) {
    return {
      success: false,
      error: {
        code: 'LOCAL_ONLY_REFERENCE',
        message: 'Record is missing an active programme assignment and cannot be synced',
      },
    };
  }

  if (outboxRecord.operation === 'hard_delete') {
    if (config.tableName === 'children') {
      const { data, error } = await supabaseClient.rpc('delete_child_if_no_history', {
        p_child_id: outboxRecord.record_id,
      });
      if (error) return { success: false, error };
      if (data !== true) {
        return {
          success: false,
          error: {
            code: 'ARCHIVE_REQUIRED',
            message: 'Child has history and must be archived instead of hard-deleted',
          },
        };
      }
      return { success: true };
    }

    const { error } = await supabaseClient
      .from(config.tableName)
      .delete()
      .eq('id', outboxRecord.record_id);
    return error ? { success: false, error } : { success: true };
  }

  const { error } = await supabaseClient
    .from(config.tableName)
    .upsert(payload, {
      onConflict: config.onConflict || 'id',
      ignoreDuplicates:
        outboxRecord.operation === 'insert'
        && IMMUTABLE_ASSIGNMENT_TABLES.has(config.tableName),
    });

  return error ? { success: false, error } : { success: true };
};

const runBatchServerOperation = async (supabaseClient, config, outboxRecords) => {
  const payloads = outboxRecords.map((outboxRecord) => (
    buildSyncPayload(config.tableName, outboxRecord.payload)
  ));

  const { error } = await supabaseClient
    .from(config.tableName)
    .upsert(payloads, {
      onConflict: config.onConflict || 'id',
      ignoreDuplicates: false,
    });

  return error ? { success: false, error } : { success: true };
};

const setDomainSyncResult = async (txn, tableName, recordId, {
  syncStatus,
  lastSyncError = null,
}) => {
  await txn.runAsync(`
    update ${quoteIdentifier(tableName)}
    set sync_status = ?,
        last_sync_error = ?,
        updated_at = ?
    where id = ?
  `, syncStatus, lastSyncError, timestamp(), recordId);
};

const restorePendingAfterStaleFinalize = async (txn, outboxRecord, tableName) => {
  const existing = await txn.getFirstAsync('select id from sync_outbox where id = ?', outboxRecord.id);
  if (!existing) return false;

  await txn.runAsync(`
    update sync_outbox
    set status = 'pending',
        next_retry_at = null,
        updated_at = ?
    where id = ?
  `, timestamp(), outboxRecord.id);

  if (outboxRecord.operation !== 'hard_delete') {
    await setDomainSyncResult(txn, tableName, outboxRecord.record_id, {
      syncStatus: 'pending',
      lastSyncError: null,
    });
  }

  return true;
};

const finalizeSuccess = async ({
  database,
  outboxRecord,
  tableName,
}) => runRepositoryTransaction(database, async (txn) => {
  const deleteResult = await txn.runAsync(`
    delete from sync_outbox
    where id = ?
      and updated_at = ?
      and status = 'in_flight'
  `, outboxRecord.id, outboxRecord.updated_at);

  if ((deleteResult?.changes || 0) === 0) {
    return restorePendingAfterStaleFinalize(txn, outboxRecord, tableName);
  }

  if (outboxRecord.operation !== 'hard_delete') {
    const hasRemainingOutbox = await txn.getFirstAsync(`
      select id
      from sync_outbox
      where table_name = ?
        and record_id = ?
      limit 1
    `, tableName, outboxRecord.record_id);
    await setDomainSyncResult(txn, tableName, outboxRecord.record_id, {
      syncStatus: hasRemainingOutbox ? 'pending' : 'synced',
      lastSyncError: null,
    });
  }
  return true;
});

const finalizeRetriableFailure = async ({
  database,
  outboxRecord,
  tableName,
  reason,
}) => runRepositoryTransaction(database, async (txn) => {
  const failureResult = await txn.runAsync(`
    update sync_outbox
    set status = 'failed',
        retry_count = retry_count + 1,
        last_error = ?,
        next_retry_at = ?,
        updated_at = ?
    where id = ?
      and updated_at = ?
      and status = 'in_flight'
  `, reason, nextRetryTimestamp(outboxRecord.retry_count || 0), timestamp(), outboxRecord.id, outboxRecord.updated_at);

  if ((failureResult?.changes || 0) === 0) {
    return restorePendingAfterStaleFinalize(txn, outboxRecord, tableName);
  }

  await setDomainSyncResult(txn, tableName, outboxRecord.record_id, {
    syncStatus: 'failed',
    lastSyncError: reason,
  });
  return true;
});

const finalizeTerminalFailure = async ({
  database,
  outboxRecord,
  tableName,
  reason,
}) => runRepositoryTransaction(database, async (txn) => {
  const failureResult = await txn.runAsync(`
    update sync_outbox
    set status = 'terminal',
        last_error = ?,
        next_retry_at = null,
        updated_at = ?
    where id = ?
      and updated_at = ?
      and status = 'in_flight'
  `, reason, timestamp(), outboxRecord.id, outboxRecord.updated_at);

  if ((failureResult?.changes || 0) === 0) {
    return restorePendingAfterStaleFinalize(txn, outboxRecord, tableName);
  }

  await setDomainSyncResult(txn, tableName, outboxRecord.record_id, {
    syncStatus: 'terminal',
    lastSyncError: reason,
  });
  return true;
});

const finalizeOutboxOnlyTerminalFailure = async ({
  database,
  outboxRecord,
  reason,
}) => runRepositoryTransaction(database, async (txn) => {
  await txn.runAsync(`
    update sync_outbox
    set status = 'terminal',
        last_error = ?,
        next_retry_at = null,
        updated_at = ?
    where id = ?
  `, reason, timestamp(), outboxRecord.id);
  return true;
});

const finalizeManySuccess = async ({ database, records, tableName }) => {
  for (const chunk of chunkArray(records, 200)) {
    await runRepositoryTransaction(database, async (txn) => {
      for (const outboxRecord of chunk) {
        const deleteResult = await txn.runAsync(`
          delete from sync_outbox
          where id = ? and updated_at = ? and status = 'in_flight'
        `, outboxRecord.id, outboxRecord.updated_at);

        if ((deleteResult?.changes || 0) === 0) {
          await restorePendingAfterStaleFinalize(txn, outboxRecord, tableName);
          continue;
        }

        if (outboxRecord.operation !== 'hard_delete') {
          const hasRemainingOutbox = await txn.getFirstAsync(`
            select id from sync_outbox where table_name = ? and record_id = ? limit 1
          `, tableName, outboxRecord.record_id);
          await setDomainSyncResult(txn, tableName, outboxRecord.record_id, {
            syncStatus: hasRemainingOutbox ? 'pending' : 'synced',
            lastSyncError: null,
          });
        }
      }
    });
  }
};

const finalizeManyRetriableFailure = async ({ database, records, tableName, reason }) => {
  for (const chunk of chunkArray(records, 200)) {
    await runRepositoryTransaction(database, async (txn) => {
      for (const outboxRecord of chunk) {
        const failureResult = await txn.runAsync(`
          update sync_outbox
          set status = 'failed',
              retry_count = retry_count + 1,
              last_error = ?,
              next_retry_at = ?,
              updated_at = ?
          where id = ? and updated_at = ? and status = 'in_flight'
        `, reason, nextRetryTimestamp(outboxRecord.retry_count || 0), timestamp(), outboxRecord.id, outboxRecord.updated_at);

        if ((failureResult?.changes || 0) === 0) {
          await restorePendingAfterStaleFinalize(txn, outboxRecord, tableName);
          continue;
        }

        await setDomainSyncResult(txn, tableName, outboxRecord.record_id, {
          syncStatus: 'failed',
          lastSyncError: reason,
        });
      }
    });
  }
};

const pushOrderForRecord = (record) => {
  if (record.operation === 'archive' && ARCHIVE_PUSH_ORDER[record.table_name] != null) {
    return ARCHIVE_PUSH_ORDER[record.table_name];
  }
  return TABLE_CONFIGS[record.table_name]?.order ?? Number.MAX_SAFE_INTEGER;
};

const sortByPushOrder = (records) => records
  .slice()
  .sort((a, b) => {
    const left = pushOrderForRecord(a);
    const right = pushOrderForRecord(b);
    if (left !== right) return left - right;
    return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  });

const canBatchRecord = (record, config) => (
  Boolean(config)
  && BATCHABLE_UPSERT_TABLES.has(config.tableName)
  && (record.operation === 'insert' || record.operation === 'update')
  && record.payload != null
);

export const createOutboxSyncEngine = ({
  database,
  supabaseClient = supabase,
  outboxRepository = createSyncOutboxRepository({ database }),
  stateRepository = createSyncStateRepository({ database }),
  tableConfigs = TABLE_CONFIGS,
  safeDuplicateSuccessTables = [],
  enqueueRequest = enqueueSupabaseRequest,
} = {}) => {
  const safeDuplicateTables = new Set(safeDuplicateSuccessTables.map(normalizeTableName));
  const getConfig = (tableName) => {
    const normalized = normalizeTableName(tableName);
    const baseConfig = tableConfigs[normalized];
    if (!baseConfig) return null;
    return {
      ...baseConfig,
      duplicateIsSuccess: baseConfig.duplicateIsSuccess || safeDuplicateTables.has(normalized),
    };
  };

  const processRecord = async (outboxRecord) => {
    const config = getConfig(outboxRecord.table_name);
    if (!config) {
      const reason = `Unknown sync table: ${outboxRecord.table_name}`;
      await finalizeOutboxOnlyTerminalFailure({
        database,
        outboxRecord,
        reason,
      });
      return { success: false, terminal: true, failedRecord: makeFailedRecord(outboxRecord, reason) };
    }

    await outboxRepository.markInFlight([outboxRecord.id]);
    let inFlightRecord = null;
    try {
      inFlightRecord = await outboxRepository.getById(outboxRecord.id);
      if (!inFlightRecord) {
        const reason = `Outbox record disappeared before sync: ${outboxRecord.id}`;
        return { success: false, terminal: false, failedRecord: makeFailedRecord(outboxRecord, reason) };
      }

      const serverResult = await enqueueRequest(() => (
        runServerOperation(supabaseClient, config, inFlightRecord)
      ));

      if (serverResult.success) {
        await finalizeSuccess({
          database,
          outboxRecord: inFlightRecord,
          tableName: config.tableName,
          outboxRepository,
        });
        return { success: true };
      }

      const classification = classifyError(serverResult.error, config);
      const reason = errorMessage(serverResult.error);

      if (classification.markAsSynced) {
        await finalizeSuccess({
          database,
          outboxRecord: inFlightRecord,
          tableName: config.tableName,
          outboxRepository,
        });
        return { success: true };
      }

      if (classification.terminal) {
        await finalizeTerminalFailure({
          database,
          outboxRecord: inFlightRecord,
          tableName: config.tableName,
          outboxRepository,
          reason,
        });
        return { success: false, terminal: true, failedRecord: makeFailedRecord(outboxRecord, reason) };
      }

      await finalizeRetriableFailure({
        database,
        outboxRecord: inFlightRecord,
        tableName: config.tableName,
        outboxRepository,
        reason,
      });
      return { success: false, terminal: false, failedRecord: makeFailedRecord(outboxRecord, reason) };
    } catch (error) {
      // Any post-markInFlight throw (server request, getById, or a finalize) must not strand the
      // row in_flight. finalize-retriable with inFlightRecord when we have it (its updated_at makes
      // the CAS HIT → row marked failed+backoff, correct for a real attempt); else the original
      // record (CAS MISSES on the changed updated_at → restorePendingAfterStaleFinalize → pending).
      const reason = errorMessage(error) || 'Sync record processing threw';
      try {
        await finalizeRetriableFailure({
          database,
          outboxRecord: inFlightRecord || outboxRecord,
          tableName: config.tableName,
          outboxRepository,
          reason,
        });
      } catch (_) {
        // Full finalize (CAS + domain update) failed; last-resort plain outbox status reset so the
        // row isn't left in_flight within THIS pass (markReady only touches sync_outbox, so it can
        // succeed even when the domain write can't). resetInFlight is the cross-pass backstop.
        try { await outboxRepository.markReady(outboxRecord.id); } catch (_2) { /* truly broken; resetInFlight recovers */ }
      }
      return { success: false, terminal: false, failedRecord: makeFailedRecord(outboxRecord, reason) };
    }
  };

  // Per-record fallback for a batch (used when the batch can't/ didn't upsert as a unit). Each
  // processRecord self-cleans its own row; we wait for ALL to settle (Promise.allSettled, NOT
  // fail-fast Promise.all) so one rejecting record can't trigger a whole-batch finalize that
  // reverts a sibling whose upload already succeeded. A rejected fallback (e.g. markInFlight threw
  // before processRecord's own try) gets a plain per-id markReady — siblings are left untouched.
  const processBatchFallback = async (outboxRecords) => {
    const settled = await Promise.allSettled(outboxRecords.map(processRecord));
    const results = [];
    for (let index = 0; index < settled.length; index += 1) {
      const outcome = settled[index];
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value);
        continue;
      }
      const record = outboxRecords[index];
      const reason = errorMessage(outcome.reason) || 'Fallback record processing threw';
      try { await outboxRepository.markReady(record.id); } catch (_) { /* resetInFlight recovers next pass */ }
      results.push({ success: false, terminal: false, failedRecord: makeFailedRecord(record, reason) });
    }
    return results;
  };

  const processBatch = async (outboxRecords, config) => {
    const ids = outboxRecords.map((record) => record.id);
    await outboxRepository.markInFlight(ids);
    let inFlightRecords = null;
    try {
      inFlightRecords = (await Promise.all(
        ids.map((id) => outboxRepository.getById(id))
      )).filter(Boolean);

      if (inFlightRecords.length !== outboxRecords.length) {
        return await processBatchFallback(outboxRecords);
      }

      let serverResult;
      try {
        serverResult = await enqueueRequest(() => (
          runBatchServerOperation(supabaseClient, config, inFlightRecords)
        ));
      } catch (batchError) {
        // A THROWN batch request (timeout / abort / oversized payload) — degrade to per-record so a
        // deterministic batch-level failure isolates per row (smaller payloads make progress) instead
        // of re-forming the same failing batch forever. processBatchFallback is allSettled-safe.
        return await processBatchFallback(outboxRecords);
      }

      if (!serverResult.success) {
        return await processBatchFallback(outboxRecords);
      }

      await finalizeManySuccess({ database, records: inFlightRecords, tableName: config.tableName });

      return outboxRecords.map(() => ({ success: true }));
    } catch (error) {
      // Post-markInFlight throw (getById / batch request / finalizeManySuccess) — don't strand the
      // batch in_flight. finalizeManyRetriableFailure with inFlightRecords when we have them (CAS
      // hits → failed+backoff); else the originals (CAS misses → restore pending).
      const reason = errorMessage(error) || 'Batch processing threw';
      try {
        await finalizeManyRetriableFailure({
          database,
          records: inFlightRecords || outboxRecords,
          tableName: config.tableName,
          reason,
        });
      } catch (_) {
        // Last-resort per-id outbox status reset (see processRecord note).
        for (const id of ids) {
          try { await outboxRepository.markReady(id); } catch (_2) { /* resetInFlight recovers next pass */ }
        }
      }
      return outboxRecords.map((record) => (
        { success: false, terminal: false, failedRecord: makeFailedRecord(record, reason) }
      ));
    }
  };

  const syncAll = async ({ tableName = null, force = false } = {}) => {
    const startedAt = Date.now();
    await resolveDatabase(database);
    await repairGroupOwnershipForSync({ database });
    if (typeof outboxRepository.resetInFlight === 'function') {
      await outboxRepository.resetInFlight();
    }
    const readyRecords = sortByPushOrder(
      await outboxRepository.getReadyRecords({ limit: 1000, includeBackedOff: force })
    );
    const filteredRecords = tableName
      ? readyRecords.filter((record) => record.table_name === normalizeTableName(tableName))
      : readyRecords;

    const result = {
      success: true,
      totalSynced: 0,
      totalFailed: 0,
      failedRecords: [],
      tableResults: {},
      durationMs: 0,
    };
    const failedTables = new Set();

    const applyRecordResult = (outboxRecord, config, recordResult) => {
      const tableKey = config?.tableName || outboxRecord.table_name;
      if (!result.tableResults[tableKey]) {
        result.tableResults[tableKey] = { success: true, synced: 0, failed: 0 };
      }

      if (recordResult.success) {
        result.totalSynced += 1;
        result.tableResults[tableKey].synced += 1;
      } else {
        result.success = false;
        result.totalFailed += 1;
        result.tableResults[tableKey].success = false;
        result.tableResults[tableKey].failed += 1;
        result.failedRecords.push(recordResult.failedRecord);
        failedTables.add(tableKey);
      }
    };

    try {
      for (let index = 0; index < filteredRecords.length; index += 1) {
        const outboxRecord = filteredRecords[index];
        const config = getConfig(outboxRecord.table_name);
        const dependencies = dependenciesForRecord(outboxRecord);
        const skippedDependency = dependencies.find((dependency) => failedTables.has(dependency));
        if (skippedDependency) {
          const tableResult = result.tableResults[outboxRecord.table_name] || {
            success: false,
            synced: 0,
            failed: 0,
            skipped: true,
            skippedDependency,
          };
          tableResult.skipped = true;
          tableResult.skippedDependency = skippedDependency;
          result.tableResults[outboxRecord.table_name] = tableResult;
          result.success = false;
          failedTables.add(outboxRecord.table_name);
          continue;
        }

        // Backstop for throws OUTSIDE processRecord/processBatch (those are self-cleaning):
        // batch formation, dispatch, applyRecordResult. One thrown record fails only that record;
        // healthy records still sync. The `continue`/`index +=` control flow still advances the
        // for loop correctly from inside the try.
        try {
          const tableKey = config?.tableName || outboxRecord.table_name;
          if (!result.tableResults[tableKey]) {
            result.tableResults[tableKey] = { success: true, synced: 0, failed: 0 };
          }

          if (canBatchRecord(outboxRecord, config)) {
            const batchRecords = [outboxRecord];
            for (let batchIndex = index + 1; batchIndex < filteredRecords.length; batchIndex += 1) {
              const candidate = filteredRecords[batchIndex];
              const candidateConfig = getConfig(candidate.table_name);
              if (!canBatchRecord(candidate, candidateConfig) || candidateConfig.tableName !== config.tableName) {
                break;
              }
              const candidateDependencies = dependenciesForRecord(candidate);
              if (candidateDependencies.some((dependency) => failedTables.has(dependency))) {
                break;
              }
              batchRecords.push(candidate);
            }

            if (batchRecords.length > 1) {
              const batchResults = await processBatch(batchRecords, config);
              batchResults.forEach((batchResult, batchResultIndex) => {
                applyRecordResult(batchRecords[batchResultIndex], config, batchResult);
              });
              index += batchRecords.length - 1;
              continue;
            }
          }

          const recordResult = await processRecord(outboxRecord);
          applyRecordResult(outboxRecord, config, recordResult);
        } catch (error) {
          const reason = errorMessage(error) || 'Unhandled sync error';
          const tableNameForRow = getConfig(outboxRecord.table_name)?.tableName || outboxRecord.table_name;
          try {
            await finalizeRetriableFailure({ database, outboxRecord, tableName: tableNameForRow, outboxRepository, reason });
          } catch (_) { /* best-effort */ }
          applyRecordResult(outboxRecord, getConfig(outboxRecord.table_name), { success: false, terminal: false, failedRecord: makeFailedRecord(outboxRecord, reason) });
        }
      }
    } finally {
      result.durationMs = Date.now() - startedAt;
      const now = new Date().toISOString();
      await stateRepository.updateSyncMeta({
        lastSyncTime: now,
        ...(result.success ? { lastSuccessfulSyncTime: now } : {}),
      });
    }

    return result;
  };

  const syncTableByName = async (name) => syncAll({ tableName: name });

  const getSyncStatus = async () => {
    const [status, meta] = await Promise.all([
      outboxRepository.getSyncStatus(),
      stateRepository.getSyncMeta(),
    ]);
    return {
      ...status,
      lastSyncTime: meta.lastSyncTime,
      lastSuccessfulSyncTime: meta.lastSuccessfulSyncTime || null,
    };
  };

  const retryFailedItem = async (table, id) => {
    const tableName = normalizeTableName(table);
    // Route through the engine's `database` closure (undefined in prod → writer), NOT a
    // resolved reader handle — resolving first and passing it would hit the query_only reader.
    await runRepositoryTransaction(database, async (txn) => {
      await txn.runAsync(`
        update sync_outbox
        set status = 'pending',
            retry_count = 0,
            next_retry_at = null,
            last_error = null,
            updated_at = ?
        where lower(table_name) = ?
          and record_id = ?
          and status in ('failed', 'terminal')
      `, timestamp(), tableName, id);
      const config = getConfig(tableName);
      if (config) {
        await setDomainSyncResult(txn, config.tableName, id, {
          syncStatus: 'pending',
          lastSyncError: null,
        });
      }
    });
  };

  return {
    syncAll,
    syncTableByName,
    getSyncStatus,
    retryFailedItem,
  };
};

const defaultEngine = createOutboxSyncEngine({
  // Production keeps duplicate-key failures terminal. With upsert on id,
  // 23505 usually means a different unique constraint needs review.
  outboxRepository: syncOutboxRepository,
  stateRepository: syncStateRepository,
});

export const syncAll = (options) => defaultEngine.syncAll(options);
export const syncTableByName = (tableName) => defaultEngine.syncTableByName(tableName);
export const getSyncStatus = () => defaultEngine.getSyncStatus();
export const retryFailedItem = (table, id) => defaultEngine.retryFailedItem(table, id);

export const _testBuildSyncPayload = buildSyncPayload;
export const _testClassifyError = classifyError;
export const __testables = { getRetryDelay };
export const __contract = { SERVER_COLUMNS, PUSH_ORDER, INTENTIONALLY_UNSYNCED, LOCAL_ONLY_COLUMNS };

export const pullReferenceData = async ({
  supabaseClient = supabase,
  repositories = {
    schools: schoolsRepository,
    job_titles: jobTitlesRepository,
    programmes: programmesRepository,
    academic_years: academicYearsRepository,
    assessment_windows: assessmentWindowsRepository,
    teachers: teachersRepository,
    staff_programme_assignments: staffProgrammeAssignmentsRepository,
  },
  userId,
  enqueueRequest = enqueueSupabaseRequest,
} = {}) => {
  const tableNames = [
    'schools',
    'job_titles',
    'programmes',
    'academic_years',
    'assessment_windows',
    'teachers',
    'staff_programme_assignments',
  ];
  const results = {};
  for (const tableName of tableNames) {
    const { data, error } = await enqueueRequest(() => {
      let query = supabaseClient
        .from(tableName)
        .select('*');
      if (tableName === 'staff_programme_assignments' && userId) {
        query = query.eq('user_id', userId);
      }
      return query;
    });
    if (error) throw error;
    await repositories[tableName].replaceFromServer(
      data || [],
      tableName === 'staff_programme_assignments' && userId
        ? { scope: { user_id: userId } }
        : {}
    );
    results[tableName] = (data || []).length;
  }
  return results;
};

/**
 * Fetch schools from Supabase and cache locally.
 * Schools are admin-managed reference data, not an outbox push table.
 */
export const fetchAndCacheSchools = async () => {
  const { data, error } = await enqueueSupabaseRequest(() => (
    supabase
      .from('schools')
      .select('*')
      .order('name')
  ));

  if (error) throw error;
  await storage.setSchools(data || []);
  return data || [];
};
