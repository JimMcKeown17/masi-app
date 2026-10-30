import { SERVER_COLUMNS } from './syncServerColumns';
import { toSubmitArgs } from './assessmentFamilyPayload';
import { toSetLetterMasteryArgs } from './letterMasteryCorrection';
import { isStampedOperation } from '../db/repositories/rowVersion';
import {
  assessmentItemDomainId,
  childEaAssignmentDomainId,
  childProgrammeEnrollmentDomainId,
  classEaAssignmentDomainId,
  classGroupingStateDomainId,
  ensureServerUuid,
  groupEaAssignmentDomainId,
  sessionAttendeeDomainId,
} from '../db/repositories/domainRepositoryUtils';

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

export const buildSyncPayload = (tableName, record, operation) => {
  if (tableName === 'assessments') return toSubmitArgs(record);
  if (tableName === 'letter_mastery') return toSetLetterMasteryArgs(record);
  const tableLegacyKeys = LEGACY_KEYS_TO_STRIP[tableName] || [];
  const keysToStrip = new Set([...LOCAL_ONLY_KEYS_TO_STRIP, ...tableLegacyKeys]);
  if (tableName === 'battery_runs') keysToStrip.add('updated_at');
  if (!isStampedOperation(tableName, operation)) keysToStrip.add('row_version');
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
