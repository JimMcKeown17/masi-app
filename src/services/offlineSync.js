import { truncateUtf8 } from './incidentPayloads';
import { buildSyncPayload } from './syncPayload';
import { normalizeErrorCode } from '../utils/normalizeErrorCode';
import { SERVER_COLUMNS } from './syncServerColumns';
import { parseSetLetterMasteryResult } from './letterMasteryCorrection';
import { parseSetSkillMasteryResult } from './skillMasteryCorrection';
import { applyCorrectionAcknowledgement } from '../db/repositories/masteryRepository';
import { applyCorrectionAcknowledgement as applySkillCorrectionAcknowledgement } from '../db/repositories/skillMasteryRepository';
export { SERVER_COLUMNS } from './syncServerColumns';
import { isStaleActorError, StaleActorError } from '../session/staleActor';
import { buildIncidentEnvelope, drainSupportIncidents } from './supportIncidents';
import { readDeliveredReceipt } from './deliveredReceipt';
import { DELIVERED_RECEIPT_PREFIX, deliveredReceiptKey } from '../db/repositories/supportIncidentRepository';
import { getConnectionActor } from '../session/signedInHandle';
import { resolveDatabase, runRepositoryTransaction } from '../db/repositories/repositoryRuntime';
import { VERSIONED_TABLES, IMMUTABLE_ASSIGNMENT_TABLES, isStampedOperation } from '../db/repositories/rowVersion';
import {
  chunkArray,
  quoteIdentifier,
  timestamp,
} from '../db/repositories/sqliteRepositoryUtils';
import {
  CHILD_RELATIONSHIP_TABLES,
  createSyncOutboxRepository,
  isRemovedChildRelationshipInsert,
  isResendableRefusal,
  outboxRecordId,
  readRemovedChildIds,
  RESENDABLE_REFUSAL_SQL,
} from '../db/repositories/syncOutboxRepository';
import {
  createSyncStateRepository,
} from '../db/repositories/syncStateRepository';
import { LEGACY_PROGRAMME_ID } from '../db/repositories/domainRepositoryUtils';

const BASE_RETRY_DELAY = 5000;

// Real server columns deliberately withheld from push (reserved strictly for that — NOT a
// catch-all). B2 activates sessions.group_id; state stays completed until the state-machine slice.
const INTENTIONALLY_UNSYNCED = {
  classes: {
    letter_order_edition: 'Server-owned: the classes trigger sets it (migration 20261027120000); pulls take the server value.',
  },
  sessions: {
    state: 'Forward-prep; server RLS keeps state = completed (migration 20261021140000_session_group_authorization).',
  },
  assessments: {
    items_tested: 'Legacy summary field; Question families send assessment_items through submit_assessment.',
  },
};

// Local-only bookkeeping columns the engine strips before push — never sent to the server.
const LOCAL_ONLY_COLUMNS = ['synced', 'sync_status', 'last_sync_error', 'server_updated_at', 'history_reference', 'started_here', 'server_changed_at', 'server_correction_id'];

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
  'battery_runs',
  'assessments',
  'letter_mastery',
  'skill_mastery',
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
  sessions: ['classes', 'groups'],
  session_attendees: ['sessions', 'children', 'groups'],
  battery_runs: ['children'],
  assessments: ['children', 'battery_runs'],
  letter_mastery: ['children'],
  skill_mastery: ['children'],
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

// Archive ordering uses inverse edges: an access-granting assignment must wait only for
// cleanup rows about the same child/class/group, not every failed row in the dependency table.
const ARCHIVE_DEPENDENCY_SUBJECT_COLUMNS = {
  child_ea_assignments: {
    child_programme_enrollments: 'child_id',
    child_class_memberships: 'child_id',
    child_group_memberships: 'child_id',
  },
  class_ea_assignments: {
    children: 'class_id',
    child_class_memberships: 'class_id',
  },
  group_ea_assignments: {
    child_group_memberships: 'group_id',
  },
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
  sessions: { classes: 'class_id', groups: 'group_id' },
  session_attendees: { sessions: 'session_id', children: 'child_id', groups: 'group_id' },
  battery_runs: { children: 'child_id' },
  assessments: { children: 'child_id', battery_runs: 'battery_run_id' },
  letter_mastery: { children: 'child_id' },
  skill_mastery: { children: 'child_id' },
};

// The grant(s) each write needs, matching private.current_user_can_write_for_child/class/group
// (migration 20260521144901 lines 368-517) and B2's held-group check.
// The created_by half is covered by PARENT_FK_COLUMNS.
// Entry shapes:
//   { grantTable, subjectColumn, valueColumn? }: a direct active assignment whose subjectColumn
//     equals this record's valueColumn (default subjectColumn). valueColumn 'id' means the
//     record's own id is the subject (classes, groups, children).
//   { membershipMediatedChild: column }: the child in `column` is reachable through an active
//     class or group membership joined to an active class or group assignment. The server needs
//     both rows, so evidence is pending when either half is unacknowledged and not terminal.
//   { heldGroupAssignment: column }: an owed insert of this EA's assignment to the group in
//     `column`, even when the local assignment has ended (C19). Only sessions and attendees.
// staff_programme_assignments is excluded (reference data, never pushed). Used for 42501 and
// UPDATE_NOT_APPLIED.
const GRANT_SUBJECTS = {
  classes: [{ grantTable: 'class_ea_assignments', subjectColumn: 'class_id', valueColumn: 'id' }],
  groups: [{ grantTable: 'group_ea_assignments', subjectColumn: 'group_id', valueColumn: 'id' }],
  children: [
    { grantTable: 'child_ea_assignments', subjectColumn: 'child_id', valueColumn: 'id' },
    { membershipMediatedChild: 'id' },
  ],
  child_class_memberships: [
    { grantTable: 'child_ea_assignments', subjectColumn: 'child_id' },
    { grantTable: 'class_ea_assignments', subjectColumn: 'class_id' },
    { membershipMediatedChild: 'child_id' },
  ],
  child_programme_enrollments: [
    { grantTable: 'child_ea_assignments', subjectColumn: 'child_id' },
    { membershipMediatedChild: 'child_id' },
  ],
  child_group_memberships: [
    { grantTable: 'child_ea_assignments', subjectColumn: 'child_id' },
    { grantTable: 'group_ea_assignments', subjectColumn: 'group_id' },
    { membershipMediatedChild: 'child_id' },
  ],
  sessions: [{ heldGroupAssignment: 'group_id' }],
  session_attendees: [
    { grantTable: 'child_ea_assignments', subjectColumn: 'child_id' },
    { membershipMediatedChild: 'child_id' },
    { heldGroupAssignment: 'group_id' },
  ],
  assessments: [
    { grantTable: 'child_ea_assignments', subjectColumn: 'child_id' },
    { membershipMediatedChild: 'child_id' },
  ],
  battery_runs: [
    { grantTable: 'child_ea_assignments', subjectColumn: 'child_id' },
    { membershipMediatedChild: 'child_id' },
  ],
  letter_mastery: [{ grantTable: 'child_ea_assignments', subjectColumn: 'child_id' }],
  skill_mastery: [{ grantTable: 'child_ea_assignments', subjectColumn: 'child_id' }],
  grouping_versions: [{ grantTable: 'class_ea_assignments', subjectColumn: 'class_id' }],
  class_grouping_state: [{ grantTable: 'class_ea_assignments', subjectColumn: 'class_id' }],
};

export const _testEvidenceMaps = {
  TABLE_DEPENDENCIES,
  ARCHIVE_TABLE_DEPENDENCIES,
  ARCHIVE_DEPENDENCY_SUBJECT_COLUMNS,
  PARENT_FK_COLUMNS,
  GRANT_SUBJECTS,
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
  'child_ea_assignments',
  'child_programme_enrollments',
  'children',
  'class_ea_assignments',
  'group_ea_assignments',
  'session_attendees',
  'time_entries',
]);

// Assignment identity triggers forbid update-capable insert retries. A session's UPDATE policy
// needs a landed attendee, so its insert retry must never take the UPDATE path either.
const INSERT_OR_IGNORE_TABLES = new Set([...IMMUTABLE_ASSIGNMENT_TABLES, 'sessions']);

export const SYNC_BATCH_LIMITS = Object.freeze({
  maxBatchRecords: 100,
  maxFallbackRecordsPerPass: 25,
  maxFallbackConcurrency: 5,
});

// Edits change a row the server already has. PostgreSQL checks INSERT WITH CHECK on every upsert
// row, even one that conflicts, so sending an edit as an upsert asks for insert permission that an
// EA editing a Head Office-created row does not have. These tables send `update` as UPDATE by id
// with an exact acknowledgement (actor lifecycle spec §6.5). class_grouping_state stays an upsert:
// its `update` means create-or-update and its INSERT policy is authorization-based.
// Provenance and identity never change through an edit.
const UPDATE_PATCH_EXCLUDED_COLUMNS = new Set(['id', 'created_by', 'created_at', 'user_id', 'archived_by_user_id']);

// Archive is a lifecycle transition, never a row creation or identity rewrite.
// Older outbox rows can contain a full domain snapshot, so narrow every archive
// to the lifecycle columns the operation is allowed to change before issuing
// UPDATE. This avoids INSERT-policy checks and immutable-identity triggers.
const ARCHIVE_SERVER_COLUMNS = {
  classes: ['archived_at', 'archived_by_user_id', 'archive_reason'],
  children: ['archived_at', 'archived_by_user_id', 'archive_reason'],
  child_ea_assignments: ['unassigned_at'],
  child_programme_enrollments: ['ended_at'],
  child_class_memberships: ['exited_at'],
  class_ea_assignments: ['unassigned_at', 'handover_reason'],
  grouping_versions: ['status', 'archived_at', 'archived_by_user_id', 'archive_reason'],
  groups: ['archived_at', 'archived_by_user_id', 'archive_reason'],
  group_ea_assignments: ['unassigned_at', 'handover_reason'],
  child_group_memberships: ['removed_at'],
};

// Lifecycle-bearing edits must also avoid single/batched upsert: full snapshots
// replay old lifecycle values, and omitting columns from an upsert can still
// apply INSERT defaults on conflict. UPDATE preserves every omitted column.
const UPDATE_BY_ID_TABLES = new Set(['time_entries', ...Object.keys(ARCHIVE_SERVER_COLUMNS)]);
export const _testUpdateByIdTables = UPDATE_BY_ID_TABLES;

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
  if (outboxRecord.table_name === 'groups' && !payload.class_id) {
    dependencies.delete('classes');
    return [...dependencies];
  }
  if (outboxRecord.table_name === 'sessions') {
    if (!payload.class_id) dependencies.delete('classes');
    if (!payload.group_id) dependencies.delete('groups');
  }
  if (outboxRecord.table_name === 'session_attendees' && !payload.group_id) {
    dependencies.delete('groups');
    return [...dependencies];
  }
  if (outboxRecord.table_name === 'assessments' && !payload.battery_run_id) {
    dependencies.delete('battery_runs');
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
      } catch (error) {
        if (isStaleActorError(error)) throw error;
        domainRow = null;
      }
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

const hasOwedHeldGroupAssignmentInsert = async (database, groupId, eaUserId) => {
  if (!groupId || !eaUserId) return false;
  const row = await database.getFirstAsync(`
    select 1 as present
    from sync_outbox o
    join group_ea_assignments gea on gea.id = o.record_id
    where o.table_name = 'group_ea_assignments' and o.operation = 'insert'
      and o.status in ('pending', 'failed', 'in_flight')
      and gea.group_id = ? and gea.ea_user_id = ?
    limit 1
  `, groupId, eaUserId);
  return !!row;
};

const UNACKNOWLEDGED_STATUSES = "('pending', 'failed', 'in_flight')";

// A child write granted through a class or group needs BOTH an active membership and an active
// assignment on the server. Evidence is pending when a local pair exists and either half has not
// been acknowledged. A terminal half contributes nothing.
const hasPendingMembershipMediatedGrant = async (
  database,
  childId,
  { tableName, recordId } = {},
) => {
  const currentTable = normalizeTableName(tableName);
  const excludedClassMembershipId = currentTable === 'child_class_memberships' ? recordId : '';
  const excludedGroupMembershipId = currentTable === 'child_group_memberships' ? recordId : '';
  const row = await database.getFirstAsync(`
    select 1 as present
    from child_class_memberships ccm
    join class_ea_assignments cea
      on cea.class_id = ccm.class_id and cea.unassigned_at is null
    where ccm.child_id = ?
      and ccm.id != ?
      and ccm.exited_at is null
      and (ccm.sync_status in ${UNACKNOWLEDGED_STATUSES} or cea.sync_status in ${UNACKNOWLEDGED_STATUSES})
      and ccm.sync_status != 'terminal'
      and cea.sync_status != 'terminal'
    union all
    select 1 as present
    from child_group_memberships cgm
    join group_ea_assignments gea
      on gea.group_id = cgm.group_id and gea.unassigned_at is null
    where cgm.child_id = ?
      and cgm.id != ?
      and cgm.removed_at is null
      and (cgm.sync_status in ${UNACKNOWLEDGED_STATUSES} or gea.sync_status in ${UNACKNOWLEDGED_STATUSES})
      and cgm.sync_status != 'terminal'
      and gea.sync_status != 'terminal'
    limit 1
  `, childId, excludedClassMembershipId, childId, excludedGroupMembershipId);
  return !!row;
};

const computeEvidencePending = async ({
  database,
  outboxRepository,
  outboxRecord,
  includeGrant,
  includeOwnInsert = false,
}) => {
  const db = await resolveDatabase(database);
  const table = normalizeTableName(outboxRecord?.table_name);
  const getField = makeFieldResolver(db, outboxRecord);

  if (includeOwnInsert && await outboxRepository.hasPendingOperation({
    tableName: table,
    recordId: outboxRecord.record_id,
    operation: 'insert',
  })) {
    return true;
  }

  const fkColumns = PARENT_FK_COLUMNS[table] || {};
  for (const [parentTable, column] of Object.entries(fkColumns)) {
    const recordId = await getField(column);
    if (recordId && await outboxRepository.hasPendingRecord({ tableName: parentTable, recordId })) {
      return true;
    }
  }

  if (includeGrant) {
    for (const grant of GRANT_SUBJECTS[table] || []) {
      if (grant.heldGroupAssignment) {
        const groupId = await getField(grant.heldGroupAssignment);
        if (groupId && await hasOwedHeldGroupAssignmentInsert(db, groupId, outboxRecord.owner_user_id)) {
          return true;
        }
        continue;
      }
      if (grant.membershipMediatedChild) {
        const childId = await getField(grant.membershipMediatedChild);
        if (childId && await hasPendingMembershipMediatedGrant(db, childId, {
          tableName: table,
          recordId: outboxRecord.record_id,
        })) return true;
        continue;
      }
      const subjectValue = await getField(grant.valueColumn || grant.subjectColumn);
      if (subjectValue && await hasPendingActiveAssignment(db, grant.grantTable, grant.subjectColumn, subjectValue)) {
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

  if (code === '28000') return { terminal: false, markAsSynced: false };

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
    const requiresRpcAcknowledgement = ['assessments', 'battery_runs', 'letter_mastery', 'skill_mastery'].includes(normalizeTableName(tableName));
    return { terminal: true, markAsSynced: duplicateIsSuccess && !requiresRpcAcknowledgement };
  }

  if (code === '23503' || code === '42501' || code === 'UPDATE_NOT_APPLIED') {
    // A FK/RLS denial, or an UPDATE that matched no visible row, while required local evidence is
    // still pending is a cross-pass race. Without pending evidence, it is a genuine rejection.
    return { terminal: !parentEvidencePending, markAsSynced: false };
  }

  if (
    code === 'ARCHIVE_REQUIRED'
    || code === 'ARCHIVE_NOT_APPLIED'
    || code === 'RESTORE_NOT_APPLIED'
    || code === 'LOCAL_ONLY_REFERENCE'
    || code === 'MISSING_OUTBOX_PAYLOAD'
    || code === 'MA001'
    || code === 'MA002'
    || code === '22023'
    || code === 'UNEXPECTED_RPC_RESULT'
  ) {
    return { terminal: true, markAsSynced: false };
  }

  if (code === 'MV001') {
    return {
      terminal: true,
      markAsSynced: false,
      reason: 'Server has a newer version of this record (stale_version)',
    };
  }

  return { terminal: false, markAsSynced: false };
};

// Record the decision already taken by the upload policy; this does not choose retries.
export const dispositionFor = (error, {
  terminal = false, parentEvidencePending = false, sessionDowngraded = false, transport = false,
} = {}) => {
  const errorCode = normalizeErrorCode(error?.code ?? (transport ? 'TRANSPORT' : null));
  const errorClass = terminal ? 'terminal'
    : errorCode === '28000' || sessionDowngraded ? 'needs_reauth'
    : parentEvidencePending && ['23503', '42501', 'UPDATE_NOT_APPLIED'].includes(errorCode) ? 'needs_parent'
    : 'retryable';
  return { errorClass, errorCode };
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
  if (record.error_code && record.error_code !== 'OTHER') return record.error_code === '42501';
  return RLS_ERROR_SIGNATURE.test(err);
};

// Lifecycle safety O1: how a refused row leaves the phone, once the office holds the delivered
// receipt of its exact current revision (services/deliveredReceipt.js). A refused archive,
// restore or edit resolves to server truth by itself (D6): the receipt keeps the EA's intent and
// the next pull converges the row. Refused history, and any other refusal, waits for the EA's
// "The office has a copy — remove from this phone" (D8). A foreign-owner quarantine never leaves.
const SELF_CLEARING_REFUSAL_CODES = Object.freeze([
  'ARCHIVE_NOT_APPLIED', 'RESTORE_NOT_APPLIED', 'MV001', 'UPDATE_NOT_APPLIED', '42501',
]);
// No retry entry point re-sends a refused archive, restore or edit (the auth-restore heal included),
// so an unmarked 42501 on one clears like a marked one. A refused relationship INSERT of a child
// this EA removed is never sent again either, and clears the same way whatever its code.
// `removedChildIds` comes from readRemovedChildIds.
export const isResendableRefusalHere = (row, removedChildIds = new Set()) => (
  isResendableRefusal(row) && !isRemovedChildRelationshipInsert(row, removedChildIds)
);
export const refusalExit = (row, removedChildIds = new Set()) => {
  if (row?.status !== 'terminal' || row.error_code === 'FOREIGN_OWNER') return null;
  if (isRemovedChildRelationshipInsert(row, removedChildIds)) return 'clears_itself';
  if (!isResendableRefusal(row) && SELF_CLEARING_REFUSAL_CODES.includes(row.error_code)) return 'clears_itself';
  return 'ea_removes';
};

const errorMessage = (error) => (
  error?.message || error?.code || String(error || 'Unknown sync error')
);

// Match the existing diagnostic string budget; leave console/preflight messages concise.
const recordedFailure = error => truncateUtf8([
  errorMessage(error),
  ...['details', 'hint'].flatMap(key => typeof error?.[key] === 'string' && error[key].trim()
    ? [key + ': ' + error[key]] : []),
].join(' | '), 2048);

// child_class_memberships recurs (class moves) and needs its distinct archived rows for audit
// history, so it cannot use a deterministic-pair id. Before an active insert, reconcile against the
// server's active (child_id, academic_year_id) row: if a DIFFERENT membership already holds the
// pair (a seed/head-office row the device never archived), archive it first so the insert does
// not 23505 on the partial-unique index. Device-move-wins, audit-preserving. Local state is not
// enough here -- this is the one place a pre-push SERVER read is warranted. Conservative: any
// error falls through to the normal upsert (then #48 classifies the outcome).
const reconcileChildClassMembership = async (supabaseClient, payload) => {
  if (payload?.exited_at) return;
  if (!payload?.child_id || !payload?.academic_year_id) return;
  try {
    const { data, error } = await supabaseClient
      .from('child_class_memberships')
      .select('id')
      .eq('child_id', payload.child_id)
      .eq('academic_year_id', payload.academic_year_id)
      .is('exited_at', null)
      .limit(1);
    if (isStaleActorError(error)) throw error;
    if (error) return; // conservative fallback
    const serverRow = Array.isArray(data) ? data[0] : data;
    if (!serverRow || serverRow.id === payload.id) return;
    await supabaseClient
      .from('child_class_memberships')
      .update({ exited_at: new Date().toISOString() })
      .eq('id', serverRow.id);
  } catch (error) {
    if (isStaleActorError(error)) throw error;
    // Ordinary failures conservatively proceed to the normal upsert.
  }
};

const makeFailedRecord = (outboxRecord, reason) => ({
  id: outboxRecord.record_id,
  table: outboxRecord.table_name,
  operation: outboxRecord.operation,
  reason,
});

const buildOperationPatch = (tableName, operation, payload) => {
  if (operation === 'archive' || operation === 'restore') {
    const archiveColumns = ARCHIVE_SERVER_COLUMNS[tableName] || [];
    const patch = Object.fromEntries(
      archiveColumns
        .filter((column) => Object.prototype.hasOwnProperty.call(payload, column))
        .map((column) => [column, payload[column]])
    );
    if (VERSIONED_TABLES.has(tableName) && Object.prototype.hasOwnProperty.call(payload, 'row_version')) {
      patch.row_version = payload.row_version;
    }
    return patch;
  }
  if (operation === 'update' && UPDATE_BY_ID_TABLES.has(tableName)) {
    // Full stored snapshots may predate an archive/restore. Ordinary edits must
    // not replay that lifecycle state.
    const lifecycleColumns = ARCHIVE_SERVER_COLUMNS[tableName] || [];
    return Object.fromEntries(
      Object.entries(payload).filter(([column]) => (
        !UPDATE_PATCH_EXCLUDED_COLUMNS.has(column) && !lifecycleColumns.includes(column)
      ))
    );
  }
  return payload;
};

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
  // Check the flat envelope before UUID validation or splitting RPC arguments. Fields the
  // table allowlist would discard must not change the existing generic-row guard behavior.
  const serverColumns = SERVER_COLUMNS[config.tableName];
  if ((!serverColumns || serverColumns.includes('programme_id'))
    && payloadSource.programme_id === LEGACY_PROGRAMME_ID) {
    return {
      success: false,
      error: {
        code: 'LOCAL_ONLY_REFERENCE',
        message: 'Record is missing an active programme assignment and cannot be synced',
      },
    };
  }

  let payload;
  try {
    payload = buildSyncPayload(config.tableName, payloadSource, outboxRecord.operation);
  } catch (error) {
    if (!['assessments', 'letter_mastery', 'skill_mastery'].includes(config.tableName) || !(error instanceof TypeError)) throw error;
    return { success: false, error: { code: '22023', message: error.message } };
  }

  if (config.tableName === 'assessments' && outboxRecord.operation === 'insert') {
    const { data, error } = await supabaseClient.rpc('submit_assessment', payload);
    if (error) return { success: false, error };
    if (data === 'inserted' || data === 'already_present') return { success: true };
    return {
      success: false,
      error: {
        code: 'UNEXPECTED_RPC_RESULT',
        message: `submit_assessment returned an unexpected result: ${String(data)}`,
      },
    };
  }

  if (config.tableName === 'battery_runs' && ['insert', 'update'].includes(outboxRecord.operation)) {
    const { data, error } = await supabaseClient.rpc('save_battery_run', { p_run: payload });
    if (error) return { success: false, error };
    if (['inserted', 'updated', 'unchanged'].includes(data)) return { success: true };
    return {
      success: false,
      error: {
        code: 'UNEXPECTED_RPC_RESULT',
        message: `save_battery_run returned an unexpected result: ${String(data)}`,
      },
    };
  }

  if (config.tableName === 'letter_mastery') {
    const { data, error } = await supabaseClient.rpc('set_letter_mastery', payload);
    if (error) return { success: false, error };
    const acknowledgement = parseSetLetterMasteryResult(data);
    if (!acknowledgement) {
      return {
        success: false,
        error: {
          code: 'UNEXPECTED_RPC_RESULT',
          message: `set_letter_mastery returned an unexpected result: ${String(data)}`,
        },
      };
    }
    return { success: true, acknowledgement, sentCorrectionId: payload.p_correction_id };
  }

  if (config.tableName === 'skill_mastery') {
    const { data, error } = await supabaseClient.rpc('set_skill_mastery', payload);
    if (error) return { success: false, error };
    const acknowledgement = parseSetSkillMasteryResult(data);
    if (!acknowledgement) {
      return {
        success: false,
        error: {
          code: 'UNEXPECTED_RPC_RESULT',
          message: `set_skill_mastery returned an unexpected result: ${String(data)}`,
        },
      };
    }
    return { success: true, acknowledgement, sentCorrectionId: payload.p_correction_id };
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

  if (outboxRecord.operation === 'archive' || outboxRecord.operation === 'restore') {
    const archivePatch = buildOperationPatch(config.tableName, outboxRecord.operation, payload);
    const { data, error } = await supabaseClient
      .from(config.tableName)
      .update(archivePatch)
      .eq('id', outboxRecord.record_id)
      .select('id');
    if (error) return { success: false, error };
    if (!Array.isArray(data) || data.length !== 1 || data[0]?.id !== outboxRecord.record_id) {
      const notApplied = outboxRecord.operation === 'restore' ? 'RESTORE_NOT_APPLIED' : 'ARCHIVE_NOT_APPLIED';
      return {
        success: false,
        error: {
          code: notApplied,
          message: `${config.tableName} ${outboxRecord.operation} did not acknowledge exactly one updated row`,
        },
      };
    }
    return { success: true };
  }

  if (outboxRecord.operation === 'update' && UPDATE_BY_ID_TABLES.has(config.tableName)) {
    const serverId = payload.id || outboxRecord.record_id;
    const patch = buildOperationPatch(config.tableName, outboxRecord.operation, payload);
    const { data, error } = await supabaseClient
      .from(config.tableName)
      .update(patch)
      .eq('id', serverId)
      .select('id');
    if (error) return { success: false, error };
    if (!Array.isArray(data) || data.length !== 1 || data[0]?.id !== serverId) {
      return {
        success: false,
        error: {
          code: 'UPDATE_NOT_APPLIED',
          message: `${config.tableName} update did not acknowledge exactly one updated row`,
        },
      };
    }
    return { success: true };
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
        && INSERT_OR_IGNORE_TABLES.has(config.tableName),
    });

  return error ? { success: false, error } : { success: true };
};

const runBatchServerOperation = async (supabaseClient, config, outboxRecords) => {
  const payloads = outboxRecords.map((outboxRecord) => (
    buildSyncPayload(config.tableName, outboxRecord.payload, outboxRecord.operation)
  ));

  const { error } = await supabaseClient
    .from(config.tableName)
    .upsert(payloads, {
      onConflict: config.onConflict || 'id',
      ignoreDuplicates:
        INSERT_OR_IGNORE_TABLES.has(config.tableName)
        && outboxRecords.every((record) => record.operation === 'insert'),
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
  const existing = await txn.getFirstAsync('select id, status from sync_outbox where id = ?', outboxRecord.id);
  if (!existing) return false;
  // A stale finalize never turns a refused row into waiting work (MA-BUG-20261104-021).
  if (existing.status === 'terminal') return false;

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

// When a record's insert lands, its edit or lifecycle row that was refused only because the row did
// not exist yet (a phone that sent it ahead of the insert, before the combined-OTA fix) is sent
// again: the cause of its refusal is gone. It then keeps the insert's acknowledgement from
// overwriting the newer local content (hasRemainingOutbox below).
const NOT_APPLIED_CODES = "('UPDATE_NOT_APPLIED', 'ARCHIVE_NOT_APPLIED', 'RESTORE_NOT_APPLIED')";
const releaseRefusalsAfterOwnInsert = async (txn, outboxRecord, tableName) => {
  if (outboxRecord.operation !== 'insert') return;
  await txn.runAsync(`
    update sync_outbox
    set status = 'pending', retry_count = 0, next_retry_at = null, last_error = null, updated_at = ?
    where table_name = ? and record_id = ? and status = 'terminal'
      and operation in ('update', 'archive', 'restore') and error_code in ${NOT_APPLIED_CODES}
  `, timestamp(), tableName, outboxRecord.record_id);
};

const finalizeSuccess = async ({
  database,
  outboxRecord,
  tableName,
  applyAcknowledgedPayload,
  serverResult,
}) => runRepositoryTransaction(database, async (txn) => {
  const correction = tableName === 'letter_mastery' ? {
    recordId: outboxRecord.record_id,
    sentCorrectionId: serverResult.sentCorrectionId,
    result: serverResult.acknowledgement,
  } : null;
  const skillCorrection = tableName === 'skill_mastery' ? {
    recordId: outboxRecord.record_id,
    sentCorrectionId: serverResult.sentCorrectionId,
    result: serverResult.acknowledgement,
  } : null;
  const deleteResult = await txn.runAsync(`
    delete from sync_outbox
    where id = ?
      and updated_at = ?
      and status = 'in_flight'
  `, outboxRecord.id, outboxRecord.updated_at);

  if ((deleteResult?.changes || 0) === 0) {
    if (correction) await applyCorrectionAcknowledgement(txn, { ...correction, outboxDeleted: false });
    if (skillCorrection) await applySkillCorrectionAcknowledgement(txn, { ...skillCorrection, outboxDeleted: false });
    return restorePendingAfterStaleFinalize(txn, outboxRecord, tableName);
  }

  if (outboxRecord.operation !== 'hard_delete') {
    await releaseRefusalsAfterOwnInsert(txn, outboxRecord, tableName);
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
    if (correction) {
      await applyCorrectionAcknowledgement(txn, { ...correction, outboxDeleted: true });
    } else if (skillCorrection) {
      await applySkillCorrectionAcknowledgement(txn, { ...skillCorrection, outboxDeleted: true });
    } else if (!hasRemainingOutbox && applyAcknowledgedPayload) {
      await applyAcknowledgedPayload(txn, tableName, outboxRecord.record_id, outboxRecord.operation, outboxRecord.payload);
    }
  }
  return true;
});

const finalizeRetriableFailure = async ({
  database,
  outboxRecord,
  tableName,
  reason,
  errorClass = 'retryable',
  errorCode = 'OTHER',
}) => runRepositoryTransaction(database, async (txn) => {
  const failureResult = await txn.runAsync(`
    update sync_outbox
    set status = 'failed',
        error_class = ?,
        error_code = ?,
        retry_count = retry_count + 1,
        last_error = ?,
        next_retry_at = ?,
        updated_at = ?
    where id = ?
      and updated_at = ?
      and status = 'in_flight'
  `, errorClass, errorCode, truncateUtf8(reason, 2048), nextRetryTimestamp(outboxRecord.retry_count || 0), timestamp(), outboxRecord.id, outboxRecord.updated_at);

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
  errorCode = 'OTHER',
  retryCount = null,
}) => runRepositoryTransaction(database, async (txn) => {
  const failureResult = await txn.runAsync(`
    update sync_outbox
    set status = 'terminal',
        error_class = 'terminal',
        error_code = ?,
        retry_count = coalesce(?, retry_count),
        last_error = ?,
        next_retry_at = null,
        updated_at = ?
    where id = ?
      and updated_at = ?
      and status = 'in_flight'
  `, errorCode, retryCount, truncateUtf8(reason, 2048), timestamp(), outboxRecord.id, outboxRecord.updated_at);

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
  const result = await txn.runAsync(`
    update sync_outbox
    set status = 'terminal',
        error_class = 'terminal',
        error_code = 'UNKNOWN_TABLE',
        last_error = ?,
        next_retry_at = null,
        updated_at = ?
    where id = ? and updated_at = ? and status = ?
  `, truncateUtf8(reason, 2048), timestamp(), outboxRecord.id, outboxRecord.updated_at, outboxRecord.status);
  return (result?.changes || 0) > 0;
});

const finalizeManySuccess = async ({ database, records, tableName, applyAcknowledgedPayload }) => {
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
          await releaseRefusalsAfterOwnInsert(txn, outboxRecord, tableName);
          const hasRemainingOutbox = await txn.getFirstAsync(`
            select id from sync_outbox where table_name = ? and record_id = ? limit 1
          `, tableName, outboxRecord.record_id);
          await setDomainSyncResult(txn, tableName, outboxRecord.record_id, {
            syncStatus: hasRemainingOutbox ? 'pending' : 'synced',
            lastSyncError: null,
          });
          if (!hasRemainingOutbox) {
            await applyAcknowledgedPayload(txn, tableName, outboxRecord.record_id, outboxRecord.operation, outboxRecord.payload);
          }
        }
      }
    });
  }
};

const finalizeManyRetriableFailure = async ({ database, records, tableName, reason, errorClass = 'retryable', errorCode = 'OTHER' }) => {
  for (const chunk of chunkArray(records, 200)) {
    await runRepositoryTransaction(database, async (txn) => {
      for (const outboxRecord of chunk) {
        const failureResult = await txn.runAsync(`
          update sync_outbox
          set status = 'failed',
              error_class = ?,
              error_code = ?,
              retry_count = retry_count + 1,
              last_error = ?,
              next_retry_at = ?,
              updated_at = ?
          where id = ? and updated_at = ? and status = 'in_flight'
        `, errorClass, errorCode, truncateUtf8(reason, 2048), nextRetryTimestamp(outboxRecord.retry_count || 0), timestamp(), outboxRecord.id, outboxRecord.updated_at);

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
  const isLifecycle = record.operation === 'archive' || record.operation === 'restore';
  if (isLifecycle && ARCHIVE_PUSH_ORDER[record.table_name] != null) {
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
  && (
    record.operation === 'insert'
    || (record.operation === 'update' && !UPDATE_BY_ID_TABLES.has(config.tableName))
  )
  && (!IMMUTABLE_ASSIGNMENT_TABLES.has(config.tableName) || record.operation === 'insert')
  && record.payload != null
);

export const createOutboxSyncEngine = ({
  database,
  supabaseClient,
  outboxRepository = createSyncOutboxRepository({ database }),
  stateRepository = createSyncStateRepository({ database }),
  supportIncidentRepository = null,
  observeStandingConditions = null,
  tableConfigs = TABLE_CONFIGS,
  safeDuplicateSuccessTables = [],
  enqueueRequest,
  getAuthSession = () => supabaseClient.auth.getSession(),
} = {}) => {
  const localColumnsByTable = new Map();
  // A terminal pull may replace domain content while retaining the queued correction.
  // Apply the accepted patch after bookkeeping, since upserts can normalize the id.
  const applyAcknowledgedPayload = async (txn, tableName, recordId, operation, payload) => {
    if (tableName === 'assessments' && operation === 'insert') {
      await txn.runAsync(`
        update assessment_items set sync_status = 'synced', last_sync_error = null
        where assessment_id = ?
      `, recordId);
      return;
    }
    if (!isStampedOperation(tableName, operation)) return;
    if (!localColumnsByTable.has(tableName)) {
      const columns = await txn.getAllAsync('select name from pragma_table_info(?)', tableName);
      localColumnsByTable.set(tableName, new Set(columns.map(column => column.name)));
    }
    const localColumns = localColumnsByTable.get(tableName);
    const patch = buildOperationPatch(tableName, operation, buildSyncPayload(tableName, payload, operation));
    const entries = Object.entries(patch).filter(([column]) => (
      localColumns.has(column) && !LOCAL_ONLY_COLUMNS.includes(column)
    ));
    if (entries.length === 0) return;
    await txn.runAsync(`
      update ${quoteIdentifier(tableName)}
      set ${entries.map(([column]) => `${quoteIdentifier(column)} = ?`).join(', ')}
      where id = ?
    `, ...entries.map(([, value]) => value), recordId);
  };
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

  const assertActorOpen = () => {
    if (typeof database?.isOpen === 'function' && (!database.isOpen() || !database.isCurrent())) throw new StaleActorError();
  };
  const getMatchingPassSession = async (passUserId) => {
    assertActorOpen();
    try {
      const { data: { session: currentSession } = {} } = await getAuthSession();
      return currentSession?.user?.id === passUserId ? currentSession : null;
    } catch (error) {
      if (isStaleActorError(error)) throw error;
      return null;
    }
  };

  const wasRefused = (claimedRecord) => claimedRecord?.claimedFromStatus === 'terminal';

  // Hands claimed rows back without an attempt: a refused row returns to terminal, owed work to
  // pending (MA-BUG-20261104-021).
  const releaseClaims = async (claimedRecords) => {
    const records = claimedRecords.filter(Boolean);
    const refused = records.filter(wasRefused);
    const owedIds = records.filter((record) => !wasRefused(record)).map((record) => record.id);
    if (refused.length > 0) await outboxRepository.restoreRefusedClaims(refused);
    if (owedIds.length === 0) return;
    if (typeof outboxRepository.markReadyMany === 'function') {
      await outboxRepository.markReadyMany(owedIds);
    } else {
      for (const id of owedIds) await outboxRepository.markReady(id);
    }
  };

  // A claim that throws may have rolled back (nothing changed: a refused row is still terminal, a
  // backed-off row keeps its backoff) or committed before failing. Hand back only the rows it
  // left in_flight, as their status before the pass, so it neither changes nor strands anything.
  // Its own stamp is unknown, so a refused row gets its status back but keeps the stamped payload
  // and domain version, which stay equal.
  const settleThrownClaims = async (outboxRecords, batchClaims = new Map()) => {
    const leftInFlight = [];
    for (const record of outboxRecords) {
      const current = await outboxRepository.getById(record.id);
      if (current?.status !== 'in_flight') continue;
      const prior = batchClaims.get(record.id);
      const priorStatus = prior?.claimedFromStatus ?? record.status;
      leftInFlight.push({
        ...current,
        claimedFromStatus: priorStatus,
        claimedFromUpdatedAt: prior?.claimedFromUpdatedAt ?? record.updated_at,
        claimedDomainStatus: prior?.claimedDomainStatus ?? (priorStatus === 'terminal' ? 'terminal' : null),
      });
    }
    await releaseClaims(leftInFlight);
    return leftInFlight;
  };

  // `batchClaim` is this row's claim by processBatch, when the batch fell back to single rows:
  // the batch claim, not the re-claim, knows whether the row was refused before the pass.
  const processRecord = async (outboxRecord, passUserId, { batchClaim = null } = {}) => {
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

    let inFlightRecord = null;
    try {
      [inFlightRecord] = await outboxRepository.markInFlightAndGet([outboxRecord.id]);
    } catch (error) {
      if (isStaleActorError(error)) throw error;
      const reason = recordedFailure(error) || 'Sync claim threw';
      try {
        await settleThrownClaims([outboxRecord], batchClaim ? new Map([[outboxRecord.id, batchClaim]]) : undefined);
      } catch (settleError) {
        if (isStaleActorError(settleError)) throw settleError;
        // resetInFlight is the cross-pass backstop for a row this could not hand back.
      }
      const refused = (batchClaim?.claimedFromStatus ?? outboxRecord.status) === 'terminal';
      return { success: false, terminal: refused, failedRecord: makeFailedRecord(outboxRecord, reason) };
    }
    if (inFlightRecord && batchClaim) {
      // The row as it was before the pass; the version to revert from is this re-claim's stamp.
      for (const key of ['claimedFromStatus', 'claimedFromUpdatedAt', 'claimedFromPayload', 'claimedFromLastError',
        'claimedDomainStatus', 'claimedDomainVersion']) {
        inFlightRecord[key] = batchClaim[key];
      }
    }
    try {
      if (!inFlightRecord) {
        const reason = `Outbox record disappeared before sync: ${outboxRecord.id}`;
        return { success: false, terminal: false, failedRecord: makeFailedRecord(outboxRecord, reason) };
      }

      if (!await getMatchingPassSession(passUserId)) {
        await releaseClaims([inFlightRecord]);
        return { success: false, abortedUserSwitch: true };
      }

      const serverResult = await enqueueRequest(() => (
        runServerOperation(supabaseClient, config, inFlightRecord)
      ));

      if (isStaleActorError(serverResult.error)) throw serverResult.error;
      assertActorOpen();
      if (serverResult.success) {
        await finalizeSuccess({
          database,
          outboxRecord: inFlightRecord,
          tableName: config.tableName,
          applyAcknowledgedPayload,
          outboxRepository,
          serverResult,
        });
        return { success: true };
      }

      const failureCode = serverResult.error?.code;
      const parentEvidencePending = ['23503', '42501', 'UPDATE_NOT_APPLIED'].includes(failureCode)
        ? await computeEvidencePending({
            database,
            outboxRepository,
            outboxRecord: inFlightRecord,
            includeGrant: failureCode !== '23503',
            includeOwnInsert: failureCode === 'UPDATE_NOT_APPLIED',
          })
        : false;
      const classification = classifyError(serverResult.error, config, { parentEvidencePending });
      let reason = recordedFailure(serverResult.error);
      if (classification.reason) {
        reason = `${classification.reason}: ${reason}`;
      }
      if (parentEvidencePending) {
        // Observability: make support logs distinguish evidence races from genuine denials.
        console.log(`Sync retry deferred: ${config.tableName}:${inFlightRecord.record_id} awaiting pending local evidence (${failureCode})`);
      }

      let sessionDowngraded = false;
      if (serverResult.error?.code === '42501' && classification.terminal) {
        let liveSession = null;
        try {
          ({ data: { session: liveSession } = {} } = await getAuthSession());
        } catch (error) {
          if (isStaleActorError(error)) throw error;
          // Ordinary auth failures downgrade the denial below.
        }
        if (!liveSession) {
          // A permission denial without a live session is not trustworthy
          // evidence; retry after auth restore instead of quarantining.
          classification.terminal = false;
          sessionDowngraded = true;
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
          serverResult,
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
          ...dispositionFor(serverResult.error, { terminal: true }),
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
          ...dispositionFor(serverResult.error, { terminal: true }),
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
        ...dispositionFor(serverResult.error, { parentEvidencePending, sessionDowngraded }),
      });
      return { success: false, terminal: false, failedRecord: makeFailedRecord(outboxRecord, reason) };
    } catch (error) {
      if (isStaleActorError(error)) throw error;
      // Any post-claim throw (server request or a finalize) must not strand the
      // row in_flight. finalize-retriable with inFlightRecord when we have it (its updated_at makes
      // the CAS HIT → row marked failed+backoff, correct for a real attempt); else the original
      // record (CAS MISSES on the changed updated_at → restorePendingAfterStaleFinalize → pending).
      const reason = recordedFailure(error) || 'Sync record processing threw';
      const refused = wasRefused(inFlightRecord);
      try {
        if (refused) {
          // A throw is not a new server answer: the row stays refused (MA-BUG-20261104-021).
          await outboxRepository.restoreRefusedClaims([inFlightRecord]);
        } else {
          await finalizeRetriableFailure({
            database,
            outboxRecord: inFlightRecord || outboxRecord,
            tableName: config.tableName,
            outboxRepository,
            reason,
            ...dispositionFor(error, { transport: true }),
          });
        }
      } catch (finalizeError) {
        if (isStaleActorError(finalizeError)) throw finalizeError;
        // Full finalize (CAS + domain update) failed; last-resort plain outbox status reset so the
        // row isn't left in_flight within THIS pass (markReady only touches sync_outbox, so it can
        // succeed even when the domain write can't). resetInFlight is the cross-pass backstop.
        // A refused row is left for that backstop rather than made waiting here.
        if (!refused) {
          try { await outboxRepository.markReady(outboxRecord.id); } catch (resetError) { if (isStaleActorError(resetError)) throw resetError; }
        }
      }
      return { success: false, terminal: refused, failedRecord: makeFailedRecord(outboxRecord, reason) };
    }
  };

  // Per-record fallback for a batch (used when the batch can't/didn't upsert as a unit). The shared
  // budget bounds the whole pass, while small allSettled waves preserve sibling-safe cleanup.
  // `batchClaims` maps outbox id to the batch's claim; only rows the batch claimed are released.
  const processBatchFallback = async (outboxRecords, passUserId, fallbackBudget, batchClaims = new Map()) => {
    const attemptCount = Math.min(
      outboxRecords.length,
      Math.max(0, fallbackBudget.remaining)
    );
    fallbackBudget.remaining -= attemptCount;
    const attemptedRecords = outboxRecords.slice(0, attemptCount);
    const deferredRecords = outboxRecords.slice(attemptCount);
    const results = [];

    // Bound both total fallback work and concurrent requests. allSettled remains important inside
    // each wave: one record rejecting must not let batch cleanup overwrite a sibling that synced.
    for (const wave of chunkArray(attemptedRecords, SYNC_BATCH_LIMITS.maxFallbackConcurrency)) {
      const settled = await Promise.allSettled(
        wave.map((record) => processRecord(record, passUserId, { batchClaim: batchClaims.get(record.id) }))
      );
      const stale = settled.find((outcome) => outcome.status === 'rejected' && isStaleActorError(outcome.reason));
      if (stale) throw stale.reason;
      assertActorOpen();
      for (let index = 0; index < settled.length; index += 1) {
        const outcome = settled[index];
        if (outcome.status === 'fulfilled') {
          results.push(outcome.value);
          continue;
        }
        const record = wave[index];
        const reason = recordedFailure(outcome.reason) || 'Fallback record processing threw';
        const batchClaim = batchClaims.get(record.id);
        try {
          if (batchClaim) await releaseClaims([batchClaim]);
          else await outboxRepository.markReady(record.id);
        } catch (resetError) { if (isStaleActorError(resetError)) throw resetError; }
        results.push({ success: false, terminal: wasRefused(batchClaim), failedRecord: makeFailedRecord(record, reason) });
      }
    }

    if (deferredRecords.length > 0) {
      // A row the batch did not claim was not touched, so it needs no reset.
      const deferredClaims = deferredRecords.map((record) => batchClaims.get(record.id)).filter(Boolean);
      try {
        await releaseClaims(deferredClaims);
      } catch (resetError) {
        if (isStaleActorError(resetError)) throw resetError;
        // Keep sibling outcomes intact. Best-effort per-row cleanup may recover a partial bulk
        // reset; resetInFlight is the cross-pass backstop for any row that remains in_flight.
        for (const claim of deferredClaims) {
          try { await releaseClaims([claim]); } catch (retryError) { if (isStaleActorError(retryError)) throw retryError; }
        }
      }
      results.push(...deferredRecords.map(() => ({
        success: false,
        deferredBatchFallback: true,
      })));
    }
    return results;
  };

  const processBatch = async (outboxRecords, config, passUserId, fallbackBudget) => {
    const ids = outboxRecords.map((record) => record.id);
    let inFlightRecords = null;
    try {
      inFlightRecords = await outboxRepository.markInFlightAndGet(ids);
    } catch (error) {
      if (isStaleActorError(error)) throw error;
      // Report the rows as not attempted; dependents wait for the next pass. Only rows the claim
      // left in_flight are handed back (MA-BUG-20261104-021).
      console.warn('Sync batch claim failed:', errorMessage(error));
      try {
        await settleThrownClaims(outboxRecords);
      } catch (settleError) {
        if (isStaleActorError(settleError)) throw settleError;
      }
      return outboxRecords.map(() => ({ success: false, deferredBatchFallback: true }));
    }
    const batchClaims = new Map(inFlightRecords.map((record) => [record.id, record]));
    try {
      if (inFlightRecords.length !== outboxRecords.length) {
        return await processBatchFallback(outboxRecords, passUserId, fallbackBudget, batchClaims);
      }

      if (!await getMatchingPassSession(passUserId)) {
        await releaseClaims(inFlightRecords);
        return outboxRecords.map(() => ({ success: false, abortedUserSwitch: true }));
      }

      let serverResult;
      try {
        serverResult = await enqueueRequest(() => (
          runBatchServerOperation(supabaseClient, config, inFlightRecords)
        ));
      } catch (batchError) {
        if (isStaleActorError(batchError)) throw batchError;
        // A THROWN batch request (timeout / abort / oversized payload) — degrade to per-record so a
        // deterministic batch-level failure isolates per row (smaller payloads make progress) instead
        // of re-forming the same failing batch forever. processBatchFallback is allSettled-safe.
        return await processBatchFallback(outboxRecords, passUserId, fallbackBudget, batchClaims);
      }

      if (isStaleActorError(serverResult.error)) throw serverResult.error;
      assertActorOpen();
      if (!serverResult.success) {
        return await processBatchFallback(outboxRecords, passUserId, fallbackBudget, batchClaims);
      }

      await finalizeManySuccess({ database, records: inFlightRecords, tableName: config.tableName, applyAcknowledgedPayload });

      return outboxRecords.map(() => ({ success: true }));
    } catch (error) {
      if (isStaleActorError(error)) throw error;
      // Post-claim throw (batch request / fallback / finalizeManySuccess) — don't strand the batch
      // in_flight. Owed rows: finalizeManyRetriableFailure (CAS hits → failed+backoff). Refused rows
      // go back to terminal (MA-BUG-20261104-021).
      const reason = recordedFailure(error) || 'Batch processing threw';
      const refused = inFlightRecords.filter(wasRefused);
      const owed = inFlightRecords.filter((record) => !wasRefused(record));
      try {
        if (refused.length > 0) await outboxRepository.restoreRefusedClaims(refused);
        if (owed.length > 0) {
          await finalizeManyRetriableFailure({
            database,
            records: owed,
            tableName: config.tableName,
            reason,
            ...dispositionFor(error, { transport: true }),
          });
        }
      } catch (finalizeError) {
        if (isStaleActorError(finalizeError)) throw finalizeError;
        // Last-resort per-id outbox status reset (see processRecord note).
        for (const { id } of owed) {
          try { await outboxRepository.markReady(id); } catch (resetError) { if (isStaleActorError(resetError)) throw resetError; }
        }
      }
      return outboxRecords.map((record) => (
        { success: false, terminal: wasRefused(batchClaims.get(record.id)), failedRecord: makeFailedRecord(record, reason) }
      ));
    }
  };

  const emptyPassResult = () => ({
    success: true, totalSynced: 0, totalFailed: 0, totalTerminal: 0, totalRetriable: 0,
    totalDeferred: 0, failedRecords: [], tableResults: {}, preflightErrors: [], durationMs: 0,
  });
  const syncAll = async ({ tableName = null, force = false } = {}) => {
    try {
      assertActorOpen();
      // Scan even while auth is unavailable, before recovery or candidate reads.
      // Raw repository tests use their registered connection actor; production handles
      // have already checked the persisted file-owner marker at open.
      await runRepositoryTransaction(database, async (txn) => {
        const owner = await txn.getFirstAsync("select value from local_state where key = 'file_owner_user_id'");
        await outboxRepository.quarantineForeignOwners({
          fileUserId: owner?.value || getConnectionActor(txn), transaction: txn,
        });
      });
    } catch (error) {
      if (isStaleActorError(error)) return { ...emptyPassResult(), success: false, abortedStaleActor: true };
      console.error('syncAll: integrity scan failed:', error);
      return {
        ...emptyPassResult(), success: false,
        preflightErrors: [{ step: 'integrityScan', error: errorMessage(error) }],
      };
    }
    // Auth gate: with no live session an upload pass would run anonymously and
    // RLS-quarantine the whole outbox as terminal (ZZ 2026-06-09 field incident).
    // getSession() can also return null while the refresh endpoint is merely
    // unreachable offline, so a null here means "skip this pass", never "sign out".
    let session = null;
    try {
      ({ data: { session } = {} } = await getAuthSession());
    } catch (error) {
      if (isStaleActorError(error)) return { ...emptyPassResult(), success: false, abortedStaleActor: true };
      console.warn('syncAll: session check failed, skipping pass:', errorMessage(error));
    }
    if (typeof database?.isOpen === 'function' && (!database.isOpen() || !database.isCurrent())) {
      return { ...emptyPassResult(), success: false, abortedStaleActor: true };
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
        totalDeferred: 0,
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
      totalDeferred: 0,
      failedRecords: [],
      tableResults: {},
      preflightErrors: [],
      durationMs: 0,
    };
    const failedRecordsByTable = new Map();
    // Children this EA removed, read when the pass selects its rows (see refusalExit).
    let removedChildIds = new Set();
    const fieldResolversByOutboxId = new Map();
    const blockedSubjectIndexes = new Map();

    // Plan O2 item 2 ("a children hard_delete is never a parent", review rounds 3-4). A Delete
    // child waiting on its gate is a waiting destructive operation, not a missing or failed FK
    // parent. Registering it would skip every relationship INSERT and history row for the child,
    // forever, while it waits for exactly those rows. This one exclusion covers every entry point
    // (dependency skip, failure, batch deferral) and the archive subject index built from the map.
    const isChildHardDelete = (record) => (
      record.operation === 'hard_delete' && normalizeTableName(record.table_name) === 'children'
    );
    const rememberBlockedRecord = (record) => {
      if (isChildHardDelete(record)) return;
      const tableKey = normalizeTableName(record.table_name);
      if (!failedRecordsByTable.has(tableKey)) {
        failedRecordsByTable.set(tableKey, new Map());
      }
      failedRecordsByTable.get(tableKey).set(record.record_id, record);
    };

    const resolveRecordField = async (record, column) => {
      if (!fieldResolversByOutboxId.has(record.id)) {
        const resolvedDatabase = await resolveDatabase(database);
        fieldResolversByOutboxId.set(
          record.id,
          makeFieldResolver(resolvedDatabase, record)
        );
      }
      return fieldResolversByOutboxId.get(record.id)(column);
    };

    const findBlockedRecordBySubject = async (tableName, column, subjectId) => {
      const tableKey = normalizeTableName(tableName);
      const blockers = failedRecordsByTable.get(tableKey);
      if (!blockers || subjectId == null) return null;
      const indexKey = `${tableKey}:${column}`;
      let cachedIndex = blockedSubjectIndexes.get(indexKey);
      if (!cachedIndex || cachedIndex.blockerCount !== blockers.size) {
        const bySubjectId = new Map();
        for (const blocker of blockers.values()) {
          const blockerSubjectId = await resolveRecordField(blocker, column);
          if (blockerSubjectId != null && !bySubjectId.has(blockerSubjectId)) {
            bySubjectId.set(blockerSubjectId, blocker);
          }
        }
        cachedIndex = { blockerCount: blockers.size, bySubjectId };
        blockedSubjectIndexes.set(indexKey, cachedIndex);
      }
      return cachedIndex.bySubjectId.get(subjectId) || null;
    };

    const findBlockingDependency = async (record) => {
      const tableNameForRecord = normalizeTableName(record.table_name);
      const isLifecycle = record.operation === 'archive' || record.operation === 'restore';
      if (record.operation === 'hard_delete' && tableNameForRecord === 'children') {
        // Deletion retained a possibly-committed INSERT. Do not let deletion
        // finish before its retry, including a terminal insert retried manually.
        // Plan O2 item 2: the deletion also waits for the child's own owed relationship INSERTs,
        // so they land open with the authority the rest of the family and the queued history need,
        // and the server's actor-scoped removal then ends them. History never waits here. A
        // refused (terminal) relationship INSERT does not hold it (combined-OTA review): once the
        // child is being removed such an INSERT is never sent again (RESENDABLE_REFUSAL_SQL), so it
        // cannot land after the removal, and it clears through its receipt. Only this EA's rows
        // count. The waiting deletion is never a parent: see isChildHardDelete above.
        const resolvedDatabase = await resolveDatabase(database);
        const retainedInsert = await resolvedDatabase.getFirstAsync(`
          select id from sync_outbox
          where operation = 'insert' and owner_user_id = ?
            and (
              (table_name = 'children' and record_id = ?)
              or (table_name in (${CHILD_RELATIONSHIP_TABLES.map(() => '?').join(', ')})
                and json_extract(payload, '$.child_id') = ?
                and status in ('pending', 'failed', 'in_flight'))
            )
          limit 1
        `, passUserId, record.record_id, ...CHILD_RELATIONSHIP_TABLES, record.record_id);
        if (retainedInsert) return { tableName: tableNameForRecord, recordId: record.record_id };
      }
      // Same-record ordering: an acknowledged UPDATE-by-id edit or lifecycle UPDATE must not run
      // before its own insert has been acknowledged, or it cannot acknowledge a row that exists.
      // It waits while its own insert is queued in ANY status (combined-OTA review, 2026-11-05):
      // sent ahead of a refused insert it is refused as not applied and could clear, and the
      // insert could later land with the old content. Its release is the insert landing or
      // leaving through its exit. Waiting behind a refused insert it holds nothing else back
      // (`ownInsertRefused`), as the refused insert itself holds nothing in an ordinary pass.
      if (isLifecycle || (record.operation === 'update' && UPDATE_BY_ID_TABLES.has(tableNameForRecord))) {
        const ownInsert = await outboxRepository.getQueuedOperationStatus({
          tableName: tableNameForRecord,
          recordId: record.record_id,
          operation: 'insert',
        });
        if (ownInsert) {
          return { tableName: tableNameForRecord, recordId: record.record_id, ownInsertRefused: ownInsert === 'terminal' };
        }
      }
      if (
        isLifecycle
        && record.id === outboxRecordId(tableNameForRecord, record.record_id, 'lifecycle')
      ) {
        const resolvedDatabase = await resolveDatabase(database);
        const legacyLifecycle = await resolvedDatabase.getFirstAsync(`
          select id
          from sync_outbox
          where id in (?, ?)
            and status in ('pending', 'failed', 'in_flight')
          limit 1
        `,
        outboxRecordId(tableNameForRecord, record.record_id, 'archive'),
        outboxRecordId(tableNameForRecord, record.record_id, 'restore'));
        if (legacyLifecycle) {
          return { tableName: tableNameForRecord, recordId: record.record_id };
        }
      }
      for (const dependency of dependenciesForRecord(record)) {
        const blockers = failedRecordsByTable.get(normalizeTableName(dependency));
        if (!blockers || blockers.size === 0) continue;

        const parentColumn = PARENT_FK_COLUMNS[tableNameForRecord]?.[dependency];
        if (parentColumn) {
          const parentRecordId = await resolveRecordField(record, parentColumn);
          if (parentRecordId != null) {
            const exactParent = blockers.get(parentRecordId);
            if (exactParent) {
              return { tableName: dependency, recordId: exactParent.record_id };
            }
            continue;
          }
        }

        const archiveSubjectColumn = record.operation === 'archive'
          ? ARCHIVE_DEPENDENCY_SUBJECT_COLUMNS[tableNameForRecord]?.[dependency]
          : null;
        if (archiveSubjectColumn) {
          const subjectId = await resolveRecordField(record, archiveSubjectColumn);
          if (subjectId != null) {
            const exactSubject = await findBlockedRecordBySubject(
              dependency,
              archiveSubjectColumn,
              subjectId
            );
            if (exactSubject) {
              return { tableName: dependency, recordId: exactSubject.record_id };
            }
            continue;
          }
        }

        // A declared dependency without resolvable identity evidence is safer to block than to
        // send out of order. Every current edge has a mapping; this fallback protects schema drift.
        return {
          tableName: dependency,
          recordId: blockers.values().next().value.record_id,
        };
      }
      return null;
    };

    const applyRecordResult = (outboxRecord, config, recordResult) => {
      const tableKey = config?.tableName || outboxRecord.table_name;
      if (!result.tableResults[tableKey]) {
        result.tableResults[tableKey] = { success: true, synced: 0, failed: 0 };
      }

      if (recordResult.success) {
        result.totalSynced += 1;
        result.tableResults[tableKey].synced += 1;
      } else if (recordResult.deferredBatchFallback) {
        result.totalDeferred += 1;
        result.tableResults[tableKey].success = false;
        result.tableResults[tableKey].deferred = (result.tableResults[tableKey].deferred || 0) + 1;
        // Deferred means not attempted, not failed. Preserve ordering by preventing any exact
        // dependent from running later in this pass while leaving retry/failure counters untouched.
        rememberBlockedRecord(outboxRecord);
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
        // A refused archive, restore or edit says nothing about whether its row exists on the
        // server, and it is never sent again, so it must not hold back anything (O1). Nor does a
        // refused relationship INSERT of a child this EA removed.
        if (!(recordResult.terminal && !isResendableRefusalHere(outboxRecord, removedChildIds))) {
          rememberBlockedRecord(outboxRecord);
        }
      }
    };
    const fallbackBudget = {
      remaining: SYNC_BATCH_LIMITS.maxFallbackRecordsPerPass,
    };

    try {
      await resolveDatabase(database);

      // Recover this EA's rows left in_flight by a prior interrupted pass, best-effort.
      if (typeof outboxRepository.resetInFlight === 'function') {
        try {
          await outboxRepository.resetInFlight({ ownerUserId: passUserId });
        } catch (resetError) {
          if (isStaleActorError(resetError)) throw resetError;
          console.error('syncAll: resetInFlight failed (continuing):', resetError);
          result.success = false;
          result.preflightErrors.push({ step: 'resetInFlight', error: errorMessage(resetError) });
        }
      }

      removedChildIds = await readRemovedChildIds(await resolveDatabase(database));
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

      // Plan O2 item 2: a genuinely unacknowledged child INSERT keeps its blocker role while it
      // backs off. The blocker map is otherwise built only from rows this pass selects, and an
      // ordinary pass does not select a backed-off row, so its family would be sent ahead of the
      // child. Register every owed child INSERT this pass will not send. Its evidence role needs no
      // help: hasPendingRecord counts it in any unacknowledged status.
      const selectedIds = new Set(filteredRecords.map((record) => record.id));
      const owedChildInserts = await (await resolveDatabase(database)).getAllAsync(`
        select id, table_name, record_id, operation from sync_outbox
        where table_name = 'children' and operation = 'insert'
          and status in ('pending', 'failed', 'in_flight') and owner_user_id = ?
      `, passUserId);
      for (const owed of owedChildInserts) {
        if (!selectedIds.has(owed.id)) rememberBlockedRecord(owed);
      }

      for (let index = 0; index < filteredRecords.length; index += 1) {
        const outboxRecord = filteredRecords[index];
        const config = getConfig(outboxRecord.table_name);
        let skippedDependency;
        try {
          skippedDependency = await findBlockingDependency(outboxRecord);
        } catch (error) {
          if (isStaleActorError(error)) throw error;
          // A failed dependency read fails only this row, which was not claimed or changed.
          const reason = recordedFailure(error) || 'Dependency check threw';
          applyRecordResult(outboxRecord, config, { success: false, terminal: false, failedRecord: makeFailedRecord(outboxRecord, reason) });
          continue;
        }
        if (skippedDependency) {
          const tableResult = result.tableResults[outboxRecord.table_name] || {
            success: false,
            synced: 0,
            failed: 0,
            skipped: true,
            skippedDependency: skippedDependency.tableName,
            skippedDependencyRecordId: skippedDependency.recordId,
          };
          tableResult.success = false;
          tableResult.skipped = true;
          tableResult.skippedDependency = skippedDependency.tableName;
          tableResult.skippedDependencyRecordId = skippedDependency.recordId;
          result.tableResults[outboxRecord.table_name] = tableResult;
          // Skipped rows stay pending for the next pass. Whether this pass "succeeded" is
          // decided by the blocking failure itself: terminal already flipped success in
          // applyRecordResult; a retriable block leaves the pass successful. An edit waiting behind
          // its own refused insert blocks nothing: that would be a hold with no release.
          if (!skippedDependency.ownInsertRefused) rememberBlockedRecord(outboxRecord);
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
              if (await findBlockingDependency(candidate)) {
                break;
              }
              batchRecords.push(candidate);
              if (batchRecords.length >= SYNC_BATCH_LIMITS.maxBatchRecords) {
                break;
              }
            }

            if (batchRecords.length > 1) {
              const batchResults = await processBatch(
                batchRecords,
                config,
                passUserId,
                fallbackBudget
              );
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
          if (isStaleActorError(error)) throw error;
          const reason = recordedFailure(error) || 'Unhandled sync error';
          const tableNameForRow = getConfig(outboxRecord.table_name)?.tableName || outboxRecord.table_name;
          try {
            await finalizeRetriableFailure({ database, outboxRecord, tableName: tableNameForRow, outboxRepository, reason, ...dispositionFor(error, { transport: true }) });
          } catch (finalizeError) { if (isStaleActorError(finalizeError)) throw finalizeError; }
          applyRecordResult(outboxRecord, getConfig(outboxRecord.table_name), { success: false, terminal: false, failedRecord: makeFailedRecord(outboxRecord, reason) });
        }
      }

      if (!tableName && supportIncidentRepository) {
        try {
          result.incidents = await drainSupportIncidents({
            handle: database, repository: supportIncidentRepository, supabaseClient, enqueueRequest,
            envelope: await buildIncidentEnvelope(),
          });
        } catch (error) {
          if (isStaleActorError(error)) throw error;
          // Support reporting never changes whether the upload pass succeeded.
          console.warn('syncAll: support incident drain failed:', errorMessage(error));
        }
        try {
          result.refusalsCleared = await resolveDeliveredRefusals(passUserId);
        } catch (error) {
          if (isStaleActorError(error)) throw error;
          console.warn('syncAll: refused-row resolve failed:', errorMessage(error));
        }
      }
    } catch (error) {
      if (isStaleActorError(error)) {
        result.success = false;
        result.abortedStaleActor = true;
      } else {
        // Ordinary preflight failures still record the attempt. Stale cancellation above
        // skips both failure reporting and metadata; reopen recovers its in-flight claims.
        console.error('syncAll: preflight error (continuing to record attempt):', error);
        result.success = false;
        result.preflightErrors.push({ step: 'preflight', error: errorMessage(error) });
      }
    } finally {
      result.durationMs = Date.now() - startedAt;
      if (!result.abortedStaleActor) {
        try {
          assertActorOpen();
          const now = new Date().toISOString();
          await stateRepository.updateSyncMeta({
            lastSyncTime: now,
            ...(result.success ? { lastSuccessfulSyncTime: now } : {}),
          });
        } catch (error) {
          if (!isStaleActorError(error)) throw error;
          result.success = false;
          result.abortedStaleActor = true;
        }
      }
    }

    return result;
  };

  const syncTableByName = async (name) => syncAll({ tableName: name });

  // O1 item 2: after each pass's receipt drain, refused archives, restores and edits whose
  // exact current revision the office holds leave the phone. The check and the delete share one
  // transaction. Proof keys leave with their outbox row or receipt, whichever goes first.
  // A refused row's way out and whether its receipt proves delivery. A refused edit or lifecycle
  // row whose own insert is still queued is 'held': it never leaves while that insert could still
  // land with older content (combined-OTA review, 2026-11-05). It is sent again if the insert
  // lands (releaseRefusalsAfterOwnInsert), and resolves normally once the insert has left.
  const readRefusalExit = async (db, row, removedChildIds) => {
    const exit = refusalExit(row, removedChildIds ?? await readRemovedChildIds(db));
    if (!exit) return { exit: null, delivery: null, incidentId: null };
    if (row.operation !== 'insert') {
      const ownInsert = await db.getFirstAsync(`
        select id from sync_outbox where table_name = ? and record_id = ? and operation = 'insert' limit 1
      `, row.table_name, row.record_id);
      if (ownInsert) return { exit, delivery: 'held', incidentId: null };
    }
    return { exit, ...await readDeliveredReceipt(db, row) };
  };

  const resolveDeliveredRefusals = async (ownerUserId) => runRepositoryTransaction(database, async (txn) => {
    const refused = await txn.getAllAsync(
      "select * from sync_outbox where status = 'terminal' and owner_user_id = ?", ownerUserId);
    const removedChildIds = await readRemovedChildIds(txn);
    let cleared = 0;
    for (const row of refused) {
      const { exit, delivery, incidentId } = await readRefusalExit(txn, row, removedChildIds);
      if (exit !== 'clears_itself' || delivery !== 'delivered') continue;
      await outboxRepository.deleteRecord(row.id, { transaction: txn });
      await txn.runAsync('delete from local_state where key = ?', deliveredReceiptKey(incidentId));
      cleared += 1;
    }
    await txn.runAsync(`
      delete from local_state
      where key >= ? and key < ?
        and (substr(key, ?) not in (select id from support_incident_queue)
          or json_extract(value, '$.outboxId') is null
          or json_extract(value, '$.outboxId') not in (select id from sync_outbox))
    `, DELIVERED_RECEIPT_PREFIX, `${DELIVERED_RECEIPT_PREFIX.slice(0, -1)};`, DELIVERED_RECEIPT_PREFIX.length + 1);
    return cleared;
  });

  // D8: "The office has a copy — remove from this phone". Removes only the stuck upload (the
  // local record stays) and only while the rule holds, checked in the same transaction.
  const removeDeliveredItem = async (outboxId) => {
    let outcome = { removed: false, delivery: null };
    await runRepositoryTransaction(database, async (txn) => {
      const row = await txn.getFirstAsync('select * from sync_outbox where id = ?', outboxId);
      const { exit, delivery, incidentId } = await readRefusalExit(txn, row);
      if (!exit) return;
      if (delivery !== 'delivered') {
        outcome = { removed: false, delivery };
        return;
      }
      await outboxRepository.deleteRecord(row.id, { transaction: txn });
      await txn.runAsync('delete from local_state where key = ?', deliveredReceiptKey(incidentId));
      outcome = { removed: true };
    });
    return outcome;
  };

  // Adds each needs-attention item's way out. Support bookkeeping never breaks the status the EA
  // sees, so a failed read leaves the items without one.
  const describeRefusalExits = async (items) => {
    if (!items?.length) return items || [];
    try {
      const db = await resolveDatabase(database);
      const removedChildIds = await readRemovedChildIds(db);
      const described = [];
      for (const item of items) {
        const row = item.outboxId
          ? await db.getFirstAsync('select * from sync_outbox where id = ?', item.outboxId) : null;
        const { exit, delivery } = await readRefusalExit(db, row, removedChildIds);
        described.push({
          ...item,
          delivery,
          clearsItself: exit === 'clears_itself' && delivery !== 'held',
          canRemove: exit === 'ea_removes' && delivery === 'delivered',
          canRetry: exit !== null && isResendableRefusalHere(row, removedChildIds),
        });
      }
      return described;
    } catch (error) {
      if (isStaleActorError(error)) throw error;
      console.warn('Refused-row exits unavailable:', errorMessage(error));
      return items.map((item) => ({ ...item, delivery: null, clearsItself: false, canRemove: false, canRetry: false }));
    }
  };

  const getSyncStatus = async (options = {}) => {
    try { await observeStandingConditions?.(); } catch (error) {
      if (isStaleActorError(error)) throw error;
      console.warn('Support incident observer failed:', errorMessage(error));
    }
    const [status, meta, incidentReadyCount] = await Promise.all([
      outboxRepository.getSyncStatus(options),
      stateRepository.getSyncMeta(),
      supportIncidentRepository
        ? supportIncidentRepository.countDue().catch((error) => {
          if (isStaleActorError(error)) throw error;
          return 0; // support reporting never breaks the status the EA sees
        })
        : 0,
    ]);
    return {
      ...status,
      needsAttentionItems: await describeRefusalExits(status.needsAttentionItems),
      incidentReadyCount,
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
    // Lifecycle safety O1: a heal is a retry, so it keeps the no-replay rule. A refused archive,
    // restore or edit is never requeued; it leaves through its delivered receipt.
    const removedChildIds = await readRemovedChildIds(await resolveDatabase(database));
    const heals = (await outboxRepository.getTerminalRecords()).filter(record => (
      record.owner_user_id === userId
      && record.last_error !== 'foreign_owner'
      && isResendableRefusalHere(record, removedChildIds)
      && isHealableRlsError(record)
    ));
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
      // Retry is a forced pass for one item: a refused archive, restore or edit is never re-sent.
      const result = await txn.runAsync(`
        update sync_outbox
        set status = 'pending',
            retry_count = 0,
            next_retry_at = null,
            last_error = case when table_name = 'children' and operation = 'insert'
              then last_error else null end,
            updated_at = ?
        where lower(table_name) = ?
          and record_id = ?
          and (status = 'failed' or (status = 'terminal' and ${RESENDABLE_REFUSAL_SQL}))
      `, timestamp(), tableName, id);
      const config = getConfig(tableName);
      if (config && (result?.changes || 0) > 0) {
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
    removeDeliveredItem,
  };
};

export const _testBuildSyncPayload = buildSyncPayload;
export const _testClassifyError = classifyError;
export const __testables = { getRetryDelay };
export const __contract = { SERVER_COLUMNS, PUSH_ORDER, INTENTIONALLY_UNSYNCED, LOCAL_ONLY_COLUMNS };

const pullReferenceDataRows = async ({
  supabaseClient,
  repositories,
  localStateRepository,
  userId,
  enqueueRequest,
} = {}) => {
  const tableNames = [
    'schools',
    'job_titles',
    'programmes',
    'assessment_tools',
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
  // Persist completion only after every table write commits; failed refreshes keep prior evidence.
  await localStateRepository.set('reference_data_complete_at', timestamp());
  return results;
};

// The single-flight barrier belongs to the supplied handle.
const referenceFlight = (barrier, task, key = 'promise') => {
  if (barrier[key]) return barrier[key];
  const promise = Promise.resolve().then(task).then((result) => {
    barrier.ready = true;
    return result;
  }).finally(() => { if (barrier[key] === promise) barrier[key] = null; });
  barrier[key] = promise;
  return promise;
};

// Completion survives reopening the file, even when reference tables are legitimately empty.
// Partial rows cannot establish readiness; an earlier completed cache stays usable offline.
const checkReferenceCache = (barrier, localStateRepository) => {
  if (!barrier.cachePromise) {
    barrier.cachePromise = localStateRepository.get('reference_data_complete_at').then((completedAt) => {
      if (completedAt) barrier.ready = true;
    }).catch((error) => {
      barrier.cachePromise = null;
      throw error;
    });
  }
  return barrier.cachePromise;
};

export const pullReferenceData = ({ barrier, ...options } = {}) => (
  barrier ? referenceFlight(barrier, async () => {
    await checkReferenceCache(barrier, options.localStateRepository);
    return pullReferenceDataRows(options);
  }, 'refreshPromise') : pullReferenceDataRows(options)
);

export const ensureReferenceData = ({
  barrier,
  repositories,
  ...options
} = {}) => {
  if (barrier.promise) return barrier.promise;
  if (barrier.ready) return Promise.resolve();
  return referenceFlight(barrier, async () => {
    await checkReferenceCache(barrier, options.localStateRepository);
    if (barrier.ready) return;
    return pullReferenceData({ ...options, repositories, barrier });
  });
};

/**
 * Fetch schools from Supabase and cache locally.
 * Schools are admin-managed reference data, not an outbox push table.
 */
export const fetchAndCacheSchools = async ({
  supabaseClient, enqueueRequest,
  repositories,
} = {}) => {
  const { data, error } = await enqueueRequest(() => (
    supabaseClient
      .from('schools')
      .select('*')
      .order('name')
  ));

  if (error) throw error;
  await repositories.schools.replaceFromServer(data || []);
  return data || [];
};
