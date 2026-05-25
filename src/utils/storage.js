import { classEaAssignmentsRepository } from '../db/repositories/classEaAssignmentsRepository';
import { classesRepository } from '../db/repositories/classesRepository';
import { childrenRepository } from '../db/repositories/childrenRepository';
import { groupsRepository } from '../db/repositories/groupsRepository';
import { sessionsRepository } from '../db/repositories/sessionsRepository';
import { assessmentsRepository } from '../db/repositories/assessmentsRepository';
import { masteryRepository } from '../db/repositories/masteryRepository';
import { timeEntriesRepository } from '../db/repositories/timeEntriesRepository';
import {
  jobTitlesRepository,
  schoolsRepository,
} from '../db/repositories/referenceDataRepository';
import { localStateRepository } from '../db/repositories/localStateRepository';
import { resolveDatabase } from '../db/repositories/repositoryRuntime';
import {
  setRecordLastSyncError,
  setRecordSyncStatus,
  upsertRecord,
} from '../db/repositories/sqliteRepositoryUtils';

const DEFAULT_SYNC_META = {
  lastSyncTime: null,
  retryAttempts: {},
  failedItems: [],
  lastErrors: {},
};

const TABLE_BY_SYNC_KEY = {
  TIME_ENTRIES: 'time_entries',
  SESSIONS: 'sessions',
  CLASSES: 'classes',
  CHILDREN: 'children',
  STAFF_CHILDREN: 'child_ea_assignments',
  GROUPS: 'groups',
  CHILDREN_GROUPS: 'child_group_memberships',
  ASSESSMENTS: 'assessments',
  LETTER_MASTERY: 'letter_mastery',
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const ensureSchoolExists = async (schoolId = 'local-school') => {
  const db = await resolveDatabase();
  await upsertRecord(db, {
    tableName: 'schools',
    columns: ['id', 'name', 'is_active', 'sync_status'],
    record: {
      id: schoolId,
      name: schoolId === 'local-school' ? 'Local School' : `School ${schoolId}`,
      is_active: 1,
      sync_status: 'synced',
    },
  });
  return schoolId;
};

const ensureClassExists = async (classId) => {
  if (!classId) return null;
  const db = await resolveDatabase();
  const existing = await db.getFirstAsync('select id from classes where id = ?', classId);
  if (existing) return classId;

  const schoolId = await ensureSchoolExists();
  await upsertRecord(db, {
    tableName: 'classes',
    columns: ['id', 'school_id', 'name', 'grade', 'sync_status'],
    record: {
      id: classId,
      school_id: schoolId,
      name: `Class ${classId}`,
      grade: 'Unknown',
      sync_status: 'synced',
    },
  });
  return classId;
};

const normalizeClassForLegacyFacade = async (classData) => {
  const schoolId = await ensureSchoolExists(classData.school_id || 'local-school');
  return {
    ...classData,
    school_id: schoolId,
    grade: classData.grade || 'Unknown',
  };
};

const normalizeChildForLegacyFacade = async (child) => {
  if (child.class_id) {
    await ensureClassExists(child.class_id);
  }
  return child;
};

const ensureChildExists = async (childId) => {
  if (!childId) return null;
  const db = await resolveDatabase();
  const existing = await db.getFirstAsync('select id from children where id = ?', childId);
  if (existing) return childId;

  await childrenRepository.saveChildRecord({
    id: childId,
    first_name: 'Unknown',
    last_name: 'Child',
    synced: true,
  });
  return childId;
};

const getSyncMetaKey = (table, id) => `${table}_${id}`;
const payloadKey = (scope, id = 'list') => `storage_payload:${scope}:${id}`;
const USER_PROFILE_KEY = 'user_profile';

const savePayload = async (scope, id, payload) => {
  if (!id) return;
  await localStateRepository.set(payloadKey(scope, id), payload);
};

const getPayload = async (scope, id) => (
  id ? localStateRepository.get(payloadKey(scope, id), null) : null
);

const cleanRepositoryRecord = (record) => {
  const cleaned = {};
  for (const [key, value] of Object.entries(record || {})) {
    if (['sync_status', 'last_sync_error', 'server_updated_at'].includes(key)) continue;
    if (value === null || value === undefined) continue;
    cleaned[key] = value;
  }
  return cleaned;
};

const mergeFacadeRecord = async (scope, record) => {
  const payload = await getPayload(scope, record?.id);
  const cleaned = cleanRepositoryRecord(record);
  if (!payload) {
    return cleaned;
  }

  return {
    ...payload,
    synced: cleaned.synced,
  };
};

const mergeFacadeList = async (scope, records) => {
  const merged = [];
  for (const record of records) {
    merged.push(await mergeFacadeRecord(scope, record));
  }
  return merged;
};

export const storage = {
  async clear() {
    try {
      await this.clearDomainData();
      await localStateRepository.clear();
      return true;
    } catch (error) {
      console.error('Error clearing storage:', error);
      return false;
    }
  },

  async getTimeEntries() {
    return await mergeFacadeList('time_entries', await timeEntriesRepository.getTimeEntries());
  },

  async saveTimeEntry(entry) {
    await savePayload('time_entries', entry.id, entry);
    return await timeEntriesRepository.saveTimeEntry(entry);
  },

  async updateTimeEntry(id, updates) {
    const existing = await getPayload('time_entries', id);
    if (existing) {
      await savePayload('time_entries', id, { ...existing, ...updates });
    }
    return await timeEntriesRepository.updateTimeEntry(id, updates);
  },

  async getSessions(options = {}) {
    return await mergeFacadeList('sessions', await sessionsRepository.getSessions(options));
  },

  async saveSession(session) {
    const normalized = {
      user_id: session.user_id || 'local-user',
      session_date: session.session_date || session.date_assessed || new Date().toISOString().slice(0, 10),
      ...session,
    };
    await savePayload('sessions', normalized.id, normalized);
    return await sessionsRepository.saveSession(normalized);
  },

  async updateSession(id, updates, keysToRemove = []) {
    const existing = await getPayload('sessions', id);
    if (existing) {
      const next = { ...existing, ...updates };
      keysToRemove.forEach((key) => {
        delete next[key];
      });
      await savePayload('sessions', id, next);
    }
    return await sessionsRepository.updateSession(id, updates, keysToRemove);
  },

  async getChildren() {
    return await mergeFacadeList('children', await childrenRepository.getChildren());
  },

  async getMyChildren(userId) {
    return await mergeFacadeList('children', await childrenRepository.getMyChildren(userId));
  },

  async saveChild(child) {
    const normalized = {
      last_name: child.last_name || '',
      ...child,
    };
    await savePayload('children', normalized.id, normalized);
    return await childrenRepository.saveChildRecord(await normalizeChildForLegacyFacade(normalized));
  },

  async createChild(child, options = {}) {
    const normalized = {
      last_name: child.last_name || '',
      ...child,
    };
    await savePayload('children', normalized.id, normalized);
    return await childrenRepository.save(await normalizeChildForLegacyFacade(normalized), options);
  },

  async updateChild(id, updates) {
    const existing = await getPayload('children', id);
    if (existing) {
      await savePayload('children', id, { ...existing, ...updates });
    }
    return await childrenRepository.updateChild(id, updates);
  },

  async archiveChild(id, options = {}) {
    const existing = (await childrenRepository.getChildren()).find(child => child.id === id);
    if (!existing) return false;
    await localStateRepository.remove(payloadKey('children', id));
    return await childrenRepository.archiveChild(id, options);
  },

  async deleteChild(id, options = {}) {
    const existing = (await childrenRepository.getChildren()).find(child => child.id === id);
    if (!existing) return false;

    const deleted = await childrenRepository.deleteIfNoHistory(id, options);
    await localStateRepository.remove(payloadKey('children', id));
    if (deleted) {
      return { deleted: true, archived: false };
    }

    await childrenRepository.archiveChild(id, options);
    return { deleted: false, archived: true };
  },

  async getUnsyncedChildren() {
    return await childrenRepository.getUnsyncedChildren();
  },

  async getStaffChildren() {
    return await mergeFacadeList('staff_children', await childrenRepository.getStaffChildren());
  },

  async saveStaffChild(assignment) {
    await savePayload('staff_children', assignment.id, assignment);
    return await childrenRepository.saveStaffChild(assignment);
  },

  async saveChildProgrammeEnrollment(enrollment) {
    return await childrenRepository.saveChildProgrammeEnrollment(enrollment);
  },

  async saveChildClassMembership(membership) {
    return await childrenRepository.saveChildClassMembership(membership);
  },

  async deleteStaffChild(staffId, childId) {
    return await childrenRepository.deleteStaffChild(staffId, childId);
  },

  async getUnsyncedStaffChildren() {
    return await childrenRepository.getUnsyncedStaffChildren();
  },

  async getGroups(options = {}) {
    return await mergeFacadeList('groups', await groupsRepository.getGroups(options));
  },

  async saveGroup(group) {
    await savePayload('groups', group.id, group);
    return await groupsRepository.saveGroup(group);
  },

  async updateGroup(id, updates) {
    const existing = await getPayload('groups', id);
    if (existing) {
      await savePayload('groups', id, { ...existing, ...updates });
    }
    return await groupsRepository.updateGroup(id, updates);
  },

  async deleteGroup(id) {
    return await groupsRepository.deleteGroup(id);
  },

  async getUnsyncedGroups() {
    return await groupsRepository.getUnsyncedGroups();
  },

  async getChildrenGroups() {
    return await mergeFacadeList('children_groups', await groupsRepository.getChildrenGroups());
  },

  async saveChildrenGroup(membership) {
    await savePayload('children_groups', membership.id, membership);
    return await groupsRepository.saveChildrenGroup(membership);
  },

  async deleteChildrenGroup(childId, groupId) {
    return await groupsRepository.deleteChildrenGroup(childId, groupId);
  },

  async getUnsyncedChildrenGroups() {
    return await groupsRepository.getUnsyncedChildrenGroups();
  },

  async getSchools() {
    const exactList = await localStateRepository.get(payloadKey('schools'), null);
    if (exactList) return exactList;
    return await schoolsRepository.getAll();
  },

  async setSchools(list) {
    await localStateRepository.set(payloadKey('schools'), list);
    return await schoolsRepository.replaceFromServer(list);
  },

  async getJobTitles() {
    return await jobTitlesRepository.getAll();
  },

  async saveJobTitles(list) {
    return await jobTitlesRepository.replaceFromServer(list);
  },

  async getClasses(options = {}) {
    const records = await classesRepository.getClasses(options);
    const merged = await mergeFacadeList('classes', records);
    return merged.map((record) => ({
      ...(record.created_by && !record.staff_id ? { staff_id: record.created_by } : {}),
      ...record,
    }));
  },

  async saveClass(classData) {
    await savePayload('classes', classData.id, classData);
    return await classesRepository.saveClass(await normalizeClassForLegacyFacade(classData));
  },

  async saveClassEaAssignment(assignment) {
    return await classEaAssignmentsRepository.save(assignment);
  },

  async updateClass(id, updates) {
    const existing = await getPayload('classes', id);
    if (existing) {
      await savePayload('classes', id, { ...existing, ...updates });
    }
    return await classesRepository.updateClass(id, updates);
  },

  async deleteClass(id) {
    return await classesRepository.deleteClass(id);
  },

  async getUnsyncedClasses() {
    return await classesRepository.getUnsyncedClasses();
  },

  async getAssessments(options = {}) {
    return await mergeFacadeList('assessments', await assessmentsRepository.getAssessments(options));
  },

  async saveAssessment(assessment) {
    if (assessment.child_id) {
      await ensureChildExists(assessment.child_id);
    }
    const normalized = {
      user_id: assessment.user_id || 'local-user',
      assessment_type: assessment.assessment_type || 'letter_egra',
      date_assessed: assessment.date_assessed || assessment.assessment_date || new Date().toISOString().slice(0, 10),
      ...assessment,
    };
    await savePayload('assessments', normalized.id, normalized);
    return await assessmentsRepository.saveAssessment(normalized);
  },

  async getUnsyncedAssessments() {
    return await assessmentsRepository.getUnsyncedRecords();
  },

  async getLetterMastery(options = {}) {
    return await mergeFacadeList('letter_mastery', await masteryRepository.getLetterMastery(options));
  },

  async saveLetterMasteryRecord(record) {
    if (record.child_id) {
      await ensureChildExists(record.child_id);
    }
    const normalized = {
      user_id: record.user_id || 'local-user',
      ...record,
    };
    await savePayload('letter_mastery', normalized.id, normalized);
    return await masteryRepository.saveLetterMasteryRecord(normalized);
  },

  async updateLetterMasteryRecord(id, updates) {
    const existing = await getPayload('letter_mastery', id);
    if (existing) {
      await savePayload('letter_mastery', id, { ...existing, ...updates });
    }
    return await masteryRepository.updateLetterMasteryRecord(id, updates);
  },

  async removeLetterMasteryRecord(id) {
    return await masteryRepository.removeLetterMasteryRecord(id);
  },

  async getUnsyncedLetterMastery() {
    return await masteryRepository.getUnsyncedRecords();
  },

  async getUnsyncedRecords(table) {
    switch (table.toUpperCase()) {
      case 'TIME_ENTRIES':
        return timeEntriesRepository.getUnsyncedRecords();
      case 'SESSIONS':
        return sessionsRepository.getUnsyncedRecords();
      case 'CLASSES':
        return classesRepository.getUnsyncedClasses();
      case 'CHILDREN':
        return childrenRepository.getUnsyncedChildren();
      case 'STAFF_CHILDREN':
      case 'CHILD_EA_ASSIGNMENTS':
        return childrenRepository.getUnsyncedStaffChildren();
      case 'GROUPS':
        return groupsRepository.getUnsyncedGroups();
      case 'CHILDREN_GROUPS':
      case 'CHILD_GROUP_MEMBERSHIPS':
        return groupsRepository.getUnsyncedChildrenGroups();
      case 'ASSESSMENTS':
        return assessmentsRepository.getUnsyncedRecords();
      case 'LETTER_MASTERY':
        return masteryRepository.getUnsyncedRecords();
      default:
        return [];
    }
  },

  async markAsSynced(table, id) {
    const tableName = TABLE_BY_SYNC_KEY[table.toUpperCase()];
    if (!tableName) return false;
    const db = await resolveDatabase();
    await setRecordSyncStatus(db, tableName, id, 'synced');
    for (const scope of ['time_entries', 'sessions', 'classes', 'children', 'staff_children', 'groups', 'children_groups', 'assessments', 'letter_mastery']) {
      const payload = await getPayload(scope, id);
      if (payload) {
        await savePayload(scope, id, { ...payload, synced: true });
      }
    }
    return true;
  },

  async markAsUnsynced(table, id) {
    const tableName = TABLE_BY_SYNC_KEY[table.toUpperCase()];
    if (!tableName) return false;
    const db = await resolveDatabase();
    await setRecordSyncStatus(db, tableName, id, 'pending');
    for (const scope of ['time_entries', 'sessions', 'classes', 'children', 'staff_children', 'groups', 'children_groups', 'assessments', 'letter_mastery']) {
      const payload = await getPayload(scope, id);
      if (payload) {
        await savePayload(scope, id, { ...payload, synced: false });
      }
    }
    return true;
  },

  async getAllUnsyncedCount() {
    const tables = ['TIME_ENTRIES', 'SESSIONS', 'CLASSES', 'CHILDREN', 'STAFF_CHILDREN', 'GROUPS', 'CHILDREN_GROUPS', 'ASSESSMENTS', 'LETTER_MASTERY'];
    let totalCount = 0;

    for (const table of tables) {
      const unsynced = await this.getUnsyncedRecords(table);
      totalCount += unsynced.length;
    }

    return totalCount;
  },

  async getSyncQueue() {
    return await localStateRepository.get('sync_queue', []);
  },

  async addToSyncQueue(item) {
    const queue = await this.getSyncQueue();
    queue.push(item);
    return await localStateRepository.set('sync_queue', queue);
  },

  async removeFromSyncQueue(id) {
    const queue = await this.getSyncQueue();
    return await localStateRepository.set('sync_queue', queue.filter(item => item.id !== id));
  },

  async clearSyncQueue() {
    return await localStateRepository.set('sync_queue', []);
  },

  async clearDomainData() {
    try {
      const db = await resolveDatabase();
      await db.runAsync('delete from assessment_items');
      await db.runAsync('delete from assessments');
      await db.runAsync('delete from session_attendees');
      await db.runAsync('delete from sessions');
      await db.runAsync('delete from letter_mastery');
      await db.runAsync('delete from child_group_memberships');
      await db.runAsync('delete from group_ea_assignments');
      await db.runAsync('delete from groups');
      await db.runAsync('delete from child_class_memberships');
      await db.runAsync('delete from class_grouping_state');
      await db.runAsync('delete from grouping_versions');
      await db.runAsync('delete from class_ea_assignments');
      await db.runAsync('delete from child_programme_enrollments');
      await db.runAsync('delete from child_ea_assignments');
      await db.runAsync('delete from children');
      await db.runAsync('delete from classes');
      await db.runAsync('delete from time_entries');
      await db.runAsync('delete from sync_outbox');
      await localStateRepository.remove('sync_meta');
      await localStateRepository.remove('sync_queue');
      return true;
    } catch (error) {
      console.error('Error clearing domain data:', error);
      return false;
    }
  },

  async getUserProfile() {
    return await localStateRepository.get(USER_PROFILE_KEY, null);
  },

  async saveUserProfile(profile) {
    return await localStateRepository.set(USER_PROFILE_KEY, profile);
  },

  async clearUserProfile() {
    return await localStateRepository.remove(USER_PROFILE_KEY);
  },

  async getSyncMeta() {
    return {
      ...clone(DEFAULT_SYNC_META),
      ...await localStateRepository.get('sync_meta', clone(DEFAULT_SYNC_META)),
    };
  },

  async updateSyncMeta(updates) {
    const currentMeta = await this.getSyncMeta();
    return await localStateRepository.set('sync_meta', { ...currentMeta, ...updates });
  },

  async recordRetryAttempt(table, id) {
    const meta = await this.getSyncMeta();
    const key = getSyncMetaKey(table, id);
    meta.retryAttempts[key] = (meta.retryAttempts[key] || 0) + 1;
    return await localStateRepository.set('sync_meta', meta);
  },

  async getRetryAttempts(table, id) {
    const meta = await this.getSyncMeta();
    return meta.retryAttempts[getSyncMetaKey(table, id)] || 0;
  },

  async clearRetryAttempts(table, id) {
    const meta = await this.getSyncMeta();
    delete meta.retryAttempts[getSyncMetaKey(table, id)];
    return await localStateRepository.set('sync_meta', meta);
  },

  async setLastSyncError(table, id, errorMsg) {
    const meta = await this.getSyncMeta();
    if (!meta.lastErrors) meta.lastErrors = {};
    meta.lastErrors[getSyncMetaKey(table, id)] = errorMsg;
    const tableName = TABLE_BY_SYNC_KEY[table.toUpperCase()];
    if (tableName) {
      const db = await resolveDatabase();
      await setRecordLastSyncError(db, tableName, id, errorMsg);
    }
    return await localStateRepository.set('sync_meta', meta);
  },

  async getLastSyncError(table, id) {
    const meta = await this.getSyncMeta();
    return meta.lastErrors?.[getSyncMetaKey(table, id)] || null;
  },

  async clearLastSyncError(table, id) {
    const meta = await this.getSyncMeta();
    if (meta.lastErrors) {
      delete meta.lastErrors[getSyncMetaKey(table, id)];
    }
    return await localStateRepository.set('sync_meta', meta);
  },

  async addFailedItem(table, id, reason) {
    const meta = await this.getSyncMeta();
    const existingIndex = meta.failedItems.findIndex(
      item => item.table === table && item.id === id
    );
    const entry = { table, id, reason, failedAt: new Date().toISOString() };

    if (existingIndex !== -1) {
      meta.failedItems[existingIndex] = entry;
    } else {
      meta.failedItems.push(entry);
    }

    return await localStateRepository.set('sync_meta', meta);
  },

  async removeFailedItem(table, id) {
    const meta = await this.getSyncMeta();
    meta.failedItems = meta.failedItems.filter(
      item => !(item.table === table && item.id === id)
    );
    delete meta.retryAttempts[getSyncMetaKey(table, id)];
    return await localStateRepository.set('sync_meta', meta);
  },
};
