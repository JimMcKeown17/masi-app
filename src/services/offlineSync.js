import { supabase } from './supabaseClient';
import { enqueueSupabaseRequest } from './supabaseRequestQueue';
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
import { resolveRecordOwners } from '../db/repositories/outboxOwnership';
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
  childEaAssignmentDomainId,
  childProgrammeEnrollmentDomainId,
  classEaAssignmentDomainId,
  classGroupingStateDomainId,
  ensureServerUuid,
  groupEaAssignmentDomainId,
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

export const SERVER_COLUMNS = {
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
    'teacher_name_snapshot', 'assessment_type', 'capture_mode',
    'assessment_date', 'score', 'total_items', 'items_tested', 'notes',
    'created_at', 'updated_at',
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

// The payload/domain column holding each FK-parent's id, per child table. Covers 23503
// and the "<parent>.created_by" half of 42501 write-grants. Explicit (not name-derived)
// because class_grouping_state references grouping_versions via active_grouping_version_id.
// A superset of TABLE_DEPENDENCIES (extra grouping-version edges); the drift test asserts
// coverage, not equality.
const PARENT_FK_COLUMNS = {
  children: { classes: 'class_id' },
  child_ea_assignments: { children: 'child_id' },
  child_programme_enrollments: { children: 'child_id' },
  child_class_memberships: { children: 'child_id', classes: 'class_id' },
  class_ea_assignments: { classes: 'class_id' },
  grouping_versions: { classes: 'class_id' },
  class_grouping_state: { classes: 'class_id', grouping_versions: 'active_grouping_version_id' },
  groups: { classes: 'class_id', grouping_versions: 'grouping_version_id' },
  group_ea_assignments: { groups: 'group_id' },
  child_group_memberships: { children: 'child_id', groups: 'group_id', grouping_versions: 'grouping_version_id' },
  sessions: { classes: 'class_id' },
  session_attendees: { sessions: 'session_id', children: 'child_id', groups: 'group_id' },
  assessments: { children: 'child_id' },
  assessment_items: { assessments: 'assessment_id' },
  letter_mastery: { children: 'child_id' },
};

// The DIRECT active-assignment grant(s) each write needs, per RLS
// private.current_user_can_write_for_* (migration 20260521144901 lines 368-517). Only the
// assignment half is here; the created_by half is covered by PARENT_FK_COLUMNS.
// staff_programme_assignments is excluded (reference data, never pushed, so a 42501 from it is a
// genuine terminal denial). Used for 42501 only. LIMITATION: write_for_child also grants via two
// membership-mediated paths (class_ea via child_class_memberships, group_ea via
// child_group_memberships) that this single-hop map cannot express; a child write whose ONLY
// grant is a pending class/group assignment would false-terminal. Not reachable in the current
// direct-child-assignment field model; extend this before group-centric (whole-class) access
// ships. See rls-sync-contract-map.md "Error Classification (Item 10)".
const GRANT_SUBJECTS = {
  child_class_memberships: [
    { grantTable: 'child_ea_assignments', subjectColumn: 'child_id' },
    { grantTable: 'class_ea_assignments', subjectColumn: 'class_id' },
  ],
  child_programme_enrollments: [{ grantTable: 'child_ea_assignments', subjectColumn: 'child_id' }],
  child_group_memberships: [
    { grantTable: 'child_ea_assignments', subjectColumn: 'child_id' },
    { grantTable: 'group_ea_assignments', subjectColumn: 'group_id' },
  ],
  session_attendees: [{ grantTable: 'child_ea_assignments', subjectColumn: 'child_id' }],
  assessments: [{ grantTable: 'child_ea_assignments', subjectColumn: 'child_id' }],
  letter_mastery: [{ grantTable: 'child_ea_assignments', subjectColumn: 'child_id' }],
  grouping_versions: [{ grantTable: 'class_ea_assignments', subjectColumn: 'class_id' }],
  class_grouping_state: [{ grantTable: 'class_ea_assignments', subjectColumn: 'class_id' }],
};

export const _testEvidenceMaps = { TABLE_DEPENDENCIES, PARENT_FK_COLUMNS, GRANT_SUBJECTS };

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

// Resolve an FK/subject value from the outbox payload first, then the record's own local
// domain row (archive/update payloads carry only id + a timestamp). Local state only; the
// domain row is fetched at most once, lazily.
const makeFieldResolver = (database, outboxRecord) => {
  const payload = outboxRecord?.payload || {};
  let domainRow;
  let fetched = false;
  return async (column) => {
    if (payload[column] != null) return payload[column];
    if (!fetched) {
      fetched = true;
      try {
        domainRow = await database.getFirstAsync(
          `select * from ${quoteIdentifier(outboxRecord.table_name)} where id = ?`,
          outboxRecord.record_id,
        );
      } catch (_) { domainRow = null; }
    }
    return domainRow?.[column] ?? null;
  };
};

const hasPendingActiveAssignment = async (database, grantTable, subjectColumn, subjectValue) => {
  const row = await database.getFirstAsync(
    `select 1 as present from ${quoteIdentifier(grantTable)}
       where ${quoteIdentifier(subjectColumn)} = ?
         and unassigned_at is null
         and sync_status in ('pending', 'failed', 'in_flight')
       limit 1`,
    subjectValue,
  );
  return !!row;
};

// True when the record still has locally-pending evidence it legitimately needs: its FK
// parent (for 23503 and the created_by half of 42501 grants) or, when includeGrant is set
// (42501 only), an active assignment grant that has not synced. No server calls.
const computeEvidencePending = async ({ database, outboxRepository, outboxRecord, includeGrant }) => {
  const table = normalizeTableName(outboxRecord?.table_name);
  const getField = makeFieldResolver(database, outboxRecord);

  const fkColumns = PARENT_FK_COLUMNS[table] || {};
  for (const [parentTable, column] of Object.entries(fkColumns)) {
    const recordId = await getField(column);
    if (recordId && await outboxRepository.hasPendingRecord({ tableName: parentTable, recordId })) {
      return true;
    }
  }

  if (includeGrant) {
    const grants = GRANT_SUBJECTS[table] || [];
    for (const { grantTable, subjectColumn } of grants) {
      const subjectValue = await getField(subjectColumn);
      if (subjectValue && await hasPendingActiveAssignment(database, grantTable, subjectColumn, subjectValue)) {
        return true;
      }
    }
  }

  return false;
};

export const _testComputeEvidencePending = computeEvidencePending;

const MAX_RETRY_DELAY = 15 * 60 * 1000; // cap exponential backoff at 15 minutes
const getRetryDelay = (retryCountBeforeFailure) => (
  Math.min(BASE_RETRY_DELAY * Math.pow(3, Math.max(0, retryCountBeforeFailure)), MAX_RETRY_DELAY)
);

const nextRetryTimestamp = (retryCountBeforeFailure) => (
  new Date(Date.now() + getRetryDelay(retryCountBeforeFailure)).toISOString()
);

const DETERMINISTIC_ERROR_CODES = ['PGRST204', '42703', '22P02', '23502', '23514'];

const classifyError = (
  error,
  { duplicateIsSuccess = false, tableName } = {},
  { parentEvidencePending = false } = {},
) => {
  const code = error?.code;

  // Identity-immutability triggers on assignment tables raise 23514 when an
  // update-capable re-push carries drifted identity fields; native CHECK
  // constraints on the same tables (e.g. unassigned_at >= assigned_at) also
  // raise 23514. Neither can be satisfied by re-pushing the same payload, so
  // retrying on backoff would loop forever. Both are terminal on these tables.
  if (code === '23514' && IMMUTABLE_ASSIGNMENT_TABLES.has(normalizeTableName(tableName))) {
    return {
      terminal: true,
      markAsSynced: false,
      reason: 'Immutable identity or check constraint rejected the update (23514)',
    };
  }

  if (code === '23505') {
    return { terminal: true, markAsSynced: duplicateIsSuccess };
  }

  if (code === '23503' || code === '42501') {
    // A FK/RLS denial while required local evidence is still pending is a
    // cross-pass race. Without pending evidence, it is a genuine rejection.
    return { terminal: !parentEvidencePending, markAsSynced: false };
  }

  if (
    code === 'ARCHIVE_REQUIRED'
    || code === 'LOCAL_ONLY_REFERENCE'
    || code === 'MISSING_OUTBOX_PAYLOAD'
  ) {
    return { terminal: true, markAsSynced: false };
  }

  return { terminal: false, markAsSynced: false };
};

// Stamped onto last_error when a 42501 is quarantined WITH a live session.
// Post-gate, that means a genuine RLS denial; the auth-restore heal
// (offlineSync.requeueTerminalRlsFailures) must never touch marked rows.
export const AUTHENTICATED_DENIAL_MARKER = '42501-authenticated:';

const RLS_ERROR_SIGNATURE = /row-level security|42501/i;

const isHealableRlsError = (record) => {
  const err = record?.last_error;
  if (typeof err !== 'string') return false;
  if (err.startsWith(AUTHENTICATED_DENIAL_MARKER)) return false;
  return RLS_ERROR_SIGNATURE.test(err);
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
  // Active-pair identity is the server partial-unique key. Only full insert payloads carry every
  // key column; bare archive payloads must keep their original row id.
  if (tableName === 'child_ea_assignments' && payload.id && payload.user_id && payload.child_id) {
    payload.id = childEaAssignmentDomainId({
      userId: payload.user_id,
      childId: payload.child_id,
    });
  }
  if (
    tableName === 'child_programme_enrollments'
    && payload.id
    && payload.child_id
    && payload.programme_id
  ) {
    payload.id = childProgrammeEnrollmentDomainId({
      childId: payload.child_id,
      programmeId: payload.programme_id,
    });
  }
  if (
    tableName === 'class_ea_assignments'
    && payload.id
    && payload.class_id
    && payload.ea_user_id
    && payload.programme_id
  ) {
    payload.id = classEaAssignmentDomainId({
      classId: payload.class_id,
      eaUserId: payload.ea_user_id,
      programmeId: payload.programme_id,
    });
  }
  if (tableName === 'group_ea_assignments' && payload.id && payload.group_id) {
    payload.id = groupEaAssignmentDomainId({ groupId: payload.group_id });
  }
  if (
    tableName === 'class_grouping_state'
    && payload.id
    && payload.class_id
    && payload.academic_year_id
  ) {
    payload.id = classGroupingStateDomainId({
      classId: payload.class_id,
      academicYearId: payload.academic_year_id,
    });
  }
  return payload;
};

const errorMessage = (error) => (
  error?.message || error?.code || String(error || 'Unknown sync error')
);

// child_class_memberships recurs (class moves) and needs its distinct archived rows for audit
// history, so it cannot use a deterministic-pair id. Before an insert, reconcile against the
// server's active (child_id, academic_year_id) row: if a DIFFERENT membership already holds the
// pair (a seed/head-office row the device never archived), archive it first so the insert does
// not 23505 on the partial-unique index. Device-move-wins, audit-preserving. Local state is not
// enough here -- this is the one place a pre-push SERVER read is warranted. Conservative: any
// error falls through to the normal upsert (then #48 classifies the outcome).
const reconcileChildClassMembership = async (supabaseClient, payload) => {
  if (!payload?.child_id || !payload?.academic_year_id) return;
  try {
    const { data, error } = await supabaseClient
      .from('child_class_memberships')
      .select('id')
      .eq('child_id', payload.child_id)
      .eq('academic_year_id', payload.academic_year_id)
      .is('exited_at', null)
      .limit(1);
    if (error) return; // conservative fallback
    const serverRow = Array.isArray(data) ? data[0] : data;
    if (!serverRow || serverRow.id === payload.id) return;
    await supabaseClient
      .from('child_class_memberships')
      .update({ exited_at: new Date().toISOString() })
      .eq('id', serverRow.id);
  } catch (_) { /* conservative fallback: proceed to the normal upsert */ }
};

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

  if (config.tableName === 'child_class_memberships' && outboxRecord.operation === 'insert') {
    await reconcileChildClassMembership(supabaseClient, payload);
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
  retryCount = null,
}) => runRepositoryTransaction(database, async (txn) => {
  const failureResult = await txn.runAsync(`
    update sync_outbox
    set status = 'terminal',
        retry_count = coalesce(?, retry_count),
        last_error = ?,
        next_retry_at = null,
        updated_at = ?
    where id = ?
      and updated_at = ?
      and status = 'in_flight'
  `, retryCount, reason, timestamp(), outboxRecord.id, outboxRecord.updated_at);

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
  getAuthSession = () => supabase.auth.getSession(),
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

  const getMatchingPassSession = async (passUserId) => {
    try {
      const { data: { session: currentSession } = {} } = await getAuthSession();
      return currentSession?.user?.id === passUserId ? currentSession : null;
    } catch (_) {
      return null;
    }
  };

  const processRecord = async (outboxRecord, passUserId) => {
    const config = getConfig(outboxRecord.table_name);
    if (!config) {
      if (!await getMatchingPassSession(passUserId)) {
        return { success: false, abortedUserSwitch: true };
      }
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

      if (!await getMatchingPassSession(passUserId)) {
        await outboxRepository.markReady(outboxRecord.id);
        return { success: false, abortedUserSwitch: true };
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

      const failureCode = serverResult.error?.code;
      const parentEvidencePending = (failureCode === '23503' || failureCode === '42501')
        ? await computeEvidencePending({
            database,
            outboxRepository,
            outboxRecord: inFlightRecord,
            includeGrant: failureCode === '42501',
          })
        : false;
      const classification = classifyError(serverResult.error, config, { parentEvidencePending });
      let reason = errorMessage(serverResult.error);
      if (classification.reason) {
        reason = `${classification.reason}: ${reason}`;
      }
      if (parentEvidencePending) {
        // Observability: make support logs distinguish evidence races from genuine denials.
        console.log(`Sync retry deferred: ${config.tableName}:${inFlightRecord.record_id} awaiting pending local evidence (${failureCode})`);
      }

      if (serverResult.error?.code === '42501' && classification.terminal) {
        let liveSession = null;
        try {
          ({ data: { session: liveSession } = {} } = await getAuthSession());
        } catch (_) { /* treat as no session and downgrade below */ }
        if (!liveSession) {
          // A permission denial without a live session is not trustworthy
          // evidence; retry after auth restore instead of quarantining.
          classification.terminal = false;
        } else {
          reason = `${AUTHENTICATED_DENIAL_MARKER} ${reason}`;
        }
      }

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

      const attemptNumber = (inFlightRecord.retry_count || 0) + 1;
      if (DETERMINISTIC_ERROR_CODES.includes(failureCode) && attemptNumber >= 8) {
        const deterministicReason = `deterministic: ${reason}`;
        await finalizeTerminalFailure({
          database,
          outboxRecord: inFlightRecord,
          tableName: config.tableName,
          outboxRepository,
          reason: deterministicReason,
          retryCount: attemptNumber,
        });
        return {
          success: false,
          terminal: true,
          failedRecord: makeFailedRecord(outboxRecord, deterministicReason),
        };
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
  const processBatchFallback = async (outboxRecords, passUserId) => {
    const settled = await Promise.allSettled(
      outboxRecords.map((record) => processRecord(record, passUserId))
    );
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

  const processBatch = async (outboxRecords, config, passUserId) => {
    const ids = outboxRecords.map((record) => record.id);
    await outboxRepository.markInFlight(ids);
    let inFlightRecords = null;
    try {
      inFlightRecords = (await Promise.all(
        ids.map((id) => outboxRepository.getById(id))
      )).filter(Boolean);

      if (inFlightRecords.length !== outboxRecords.length) {
        return await processBatchFallback(outboxRecords, passUserId);
      }

      if (!await getMatchingPassSession(passUserId)) {
        await Promise.all(ids.map((id) => outboxRepository.markReady(id)));
        return outboxRecords.map(() => ({ success: false, abortedUserSwitch: true }));
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
        return await processBatchFallback(outboxRecords, passUserId);
      }

      if (!serverResult.success) {
        return await processBatchFallback(outboxRecords, passUserId);
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
    // Auth gate: with no live session an upload pass would run anonymously and
    // RLS-quarantine the whole outbox as terminal (ZZ 2026-06-09 field incident).
    // getSession() can also return null while the refresh endpoint is merely
    // unreachable offline, so a null here means "skip this pass", never "sign out".
    let session = null;
    try {
      ({ data: { session } = {} } = await getAuthSession());
    } catch (error) {
      console.warn('syncAll: session check failed, skipping pass:', errorMessage(error));
    }
    if (!session) {
      console.log('Sync skipped: no auth session');
      return {
        success: true,
        skippedNoSession: true,
        totalSynced: 0,
        totalFailed: 0,
        totalTerminal: 0,
        totalRetriable: 0,
        failedRecords: [],
        tableResults: {},
        preflightErrors: [],
        durationMs: 0,
      };
    }
    const passUserId = session.user?.id;

    const startedAt = Date.now();
    const result = {
      success: true,
      totalSynced: 0,
      totalFailed: 0,
      totalTerminal: 0,
      totalRetriable: 0,
      failedRecords: [],
      tableResults: {},
      preflightErrors: [],
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
        // Trust semantics (Finding 6): only a terminal record makes the pass unsuccessful.
        // A retriable/backed-off record is safe on the device and will retry; it must not
        // read like a broken sync (it used to hold "Last Synced" at Never indefinitely).
        if (recordResult.terminal) {
          result.success = false;
          result.totalTerminal += 1;
        } else {
          result.totalRetriable += 1;
        }
        result.totalFailed += 1;
        result.tableResults[tableKey].success = false;
        result.tableResults[tableKey].failed += 1;
        result.failedRecords.push(recordResult.failedRecord);
        failedTables.add(tableKey);
      }
    };

    try {
      await resolveDatabase(database);

      // Recover rows left in_flight by a prior interrupted pass FIRST and best-effort, so a later
      // preflight failure (e.g. repairGroupOwnershipForSync throwing) can't keep them stranded.
      if (typeof outboxRepository.resetInFlight === 'function') {
        try {
          await outboxRepository.resetInFlight({ ownerUserId: passUserId });
        } catch (resetError) {
          console.error('syncAll: resetInFlight failed (continuing):', resetError);
          result.success = false;
          result.preflightErrors.push({ step: 'resetInFlight', error: errorMessage(resetError) });
        }
      }

      // Group-ownership repair is best-effort: its failure must NOT block unrelated tables from
      // syncing, and must NOT reject the pass before resetInFlight/updateSyncMeta have run.
      try {
        await repairGroupOwnershipForSync({ database });
      } catch (repairError) {
        console.error('syncAll: repairGroupOwnershipForSync failed (continuing):', repairError);
        result.success = false;
        result.preflightErrors.push({ step: 'repairGroupOwnership', error: errorMessage(repairError) });
      }

      const readyRecords = sortByPushOrder(
        await outboxRepository.getReadyRecords({
          limit: 1000,
          includeBackedOff: force,
          includeTerminal: force,
          ownerUserId: passUserId,
        })
      );
      const filteredRecords = tableName
        ? readyRecords.filter((record) => record.table_name === normalizeTableName(tableName))
        : readyRecords;

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
          // Skipped rows stay pending for the next pass. Whether this pass "succeeded" is
          // decided by the blocking failure itself: terminal already flipped success in
          // applyRecordResult; a retriable block leaves the pass successful.
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
              const batchResults = await processBatch(batchRecords, config, passUserId);
              if (batchResults.some((batchResult) => batchResult.abortedUserSwitch)) {
                break;
              }
              batchResults.forEach((batchResult, batchResultIndex) => {
                applyRecordResult(batchRecords[batchResultIndex], config, batchResult);
              });
              index += batchRecords.length - 1;
              continue;
            }
          }

          const recordResult = await processRecord(outboxRecord, passUserId);
          if (recordResult.abortedUserSwitch) {
            break;
          }
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
    } catch (error) {
      // Unexpected preflight failure (resolveDatabase / getReadyRecords). Don't reject the pass —
      // mark it failed; the finally still records the attempt so meta is never skipped, and
      // resetInFlight (run first, best-effort) has already recovered any prior-stranded rows.
      console.error('syncAll: preflight error (continuing to record attempt):', error);
      result.success = false;
      result.preflightErrors.push({ step: 'preflight', error: errorMessage(error) });
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

  const getSyncStatus = async (options = {}) => {
    const [status, meta] = await Promise.all([
      outboxRepository.getSyncStatus(options),
      stateRepository.getSyncMeta(),
    ]);
    return {
      ...status,
      lastSyncTime: meta.lastSyncTime,
      lastSuccessfulSyncTime: meta.lastSuccessfulSyncTime || null,
    };
  };

  /**
   * Auth-restore heal for RLS-quarantined rows (#44, port of ZZ OTA 1.1.0+4).
   * Unmarked RLS terminals are auth-loss collateral; marked ones
   * (AUTHENTICATED_DENIAL_MARKER, written post-gate with a live session) are
   * genuine denials and are never healed. The outbox requeue and the domain
   * sync_status reset share one transaction so the pending-local-wins pull
   * guard protects the row immediately (terminal rows are outside that guard).
   */
  const requeueTerminalRlsFailures = async (userId) => {
    if (!userId) return 0;
    const db = await resolveDatabase(database);
    const candidates = (await outboxRepository.getTerminalRecords()).filter(isHealableRlsError);
    if (candidates.length === 0) return 0;

    const heals = [];
    for (const record of candidates) {
      const row = await db.getFirstAsync(
        `select * from ${quoteIdentifier(record.table_name)} where id = ?`,
        record.record_id
      ).catch(() => null);
      const owners = await resolveRecordOwners({
        db,
        tableName: record.table_name,
        row,
        payload: record.payload,
      });
      if (owners.length === 0) {
        console.warn(`syncRescue: skipping ${record.table_name} ${record.record_id} (no owner field)`);
        continue;
      }
      if (!owners.includes(userId)) {
        console.warn(`syncRescue: skipping ${record.table_name} ${record.record_id} (owner mismatch)`);
        continue;
      }
      heals.push(record);
    }
    if (heals.length === 0) return 0;

    let count = 0;
    await runRepositoryTransaction(database, async (txn) => {
      count = await outboxRepository.requeueTerminalRows(heals.map((record) => record.id), { transaction: txn });
      for (const record of heals) {
        if (record.operation === 'hard_delete') continue;
        const config = getConfig(record.table_name);
        if (config) {
          await setDomainSyncResult(txn, config.tableName, record.record_id, {
            syncStatus: 'pending',
            lastSyncError: null,
          });
        }
      }
    });
    console.log(`syncRescue: requeued ${count} RLS-quarantined outbox rows for ${userId}`);
    return count;
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
    requeueTerminalRlsFailures,
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
export const getSyncStatus = (options) => defaultEngine.getSyncStatus(options);
export const requeueTerminalRlsFailures = (userId) => defaultEngine.requeueTerminalRlsFailures(userId);
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
  await schoolsRepository.replaceFromServer(data || []);
  return data || [];
};
