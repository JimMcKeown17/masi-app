import { supabase } from './supabaseClient';
import { storage } from '../utils/storage';
import { resolveDatabase, runRepositoryTransaction } from '../db/repositories/repositoryRuntime';
import {
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
import {
  academicYearsRepository,
  assessmentWindowsRepository,
  teachersRepository,
} from '../db/repositories/referenceDataRepository';
import { LEGACY_PROGRAMME_ID } from '../db/repositories/domainRepositoryUtils';

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

const dependenciesForRecord = (outboxRecord) => {
  const dependencies = [...(TABLE_DEPENDENCIES[outboxRecord.table_name] || [])];
  const payload = outboxRecord.payload || {};

  if (outboxRecord.table_name === 'children' && !payload.class_id) {
    return dependencies.filter((dependency) => dependency !== 'classes');
  }
  if ((outboxRecord.table_name === 'groups' || outboxRecord.table_name === 'sessions') && !payload.class_id) {
    return dependencies.filter((dependency) => dependency !== 'classes');
  }
  if (outboxRecord.table_name === 'session_attendees' && !payload.group_id) {
    return dependencies.filter((dependency) => dependency !== 'groups');
  }

  return dependencies;
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

const getRetryDelay = (retryCountBeforeFailure) => (
  BASE_RETRY_DELAY * Math.pow(3, Math.max(0, retryCountBeforeFailure))
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

const sortByPushOrder = (records) => records
  .slice()
  .sort((a, b) => {
    const left = TABLE_CONFIGS[a.table_name]?.order ?? Number.MAX_SAFE_INTEGER;
    const right = TABLE_CONFIGS[b.table_name]?.order ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  });

export const createOutboxSyncEngine = ({
  database,
  supabaseClient = supabase,
  outboxRepository = createSyncOutboxRepository({ database }),
  stateRepository = createSyncStateRepository({ database }),
  tableConfigs = TABLE_CONFIGS,
  safeDuplicateSuccessTables = [],
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
    const inFlightRecord = await outboxRepository.getById(outboxRecord.id);
    if (!inFlightRecord) {
      const reason = `Outbox record disappeared before sync: ${outboxRecord.id}`;
      return { success: false, terminal: false, failedRecord: makeFailedRecord(outboxRecord, reason) };
    }

    const serverResult = await runServerOperation(supabaseClient, config, inFlightRecord);

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
  };

  const syncAll = async ({ tableName = null } = {}) => {
    const startedAt = Date.now();
    await resolveDatabase(database);
    if (typeof outboxRepository.resetInFlight === 'function') {
      await outboxRepository.resetInFlight();
    }
    const readyRecords = sortByPushOrder(await outboxRepository.getReadyRecords({ limit: 1000 }));
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

    for (const outboxRecord of filteredRecords) {
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
        continue;
      }

      const tableKey = config?.tableName || outboxRecord.table_name;
      if (!result.tableResults[tableKey]) {
        result.tableResults[tableKey] = { success: true, synced: 0, failed: 0 };
      }

      const recordResult = await processRecord(outboxRecord);
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
    }

    result.durationMs = Date.now() - startedAt;
    const now = new Date().toISOString();
    await stateRepository.updateSyncMeta({
      lastSyncTime: now,
      ...(result.success ? { lastSuccessfulSyncTime: now } : {}),
    });

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
    const db = await resolveDatabase(database);
    const tableName = normalizeTableName(table);
    await runRepositoryTransaction(db, async (txn) => {
      await txn.runAsync(`
        update sync_outbox
        set status = 'pending',
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

export const pullReferenceData = async ({
  supabaseClient = supabase,
  repositories = {
    academic_years: academicYearsRepository,
    assessment_windows: assessmentWindowsRepository,
    teachers: teachersRepository,
  },
} = {}) => {
  const results = {};
  for (const tableName of ['academic_years', 'assessment_windows', 'teachers']) {
    const { data, error } = await supabaseClient
      .from(tableName)
      .select('*');
    if (error) throw error;
    await repositories[tableName].replaceFromServer(data || []);
    results[tableName] = (data || []).length;
  }
  return results;
};

/**
 * Fetch schools from Supabase and cache locally.
 * Schools are admin-managed reference data, not an outbox push table.
 */
export const fetchAndCacheSchools = async () => {
  const { data, error } = await supabase
    .from('schools')
    .select('*')
    .order('name');

  if (error) throw error;
  await storage.setSchools(data || []);
  return data || [];
};
