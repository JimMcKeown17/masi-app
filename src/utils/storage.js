import { classEaAssignmentsRepository } from '../db/repositories/classEaAssignmentsRepository';
import { classesRepository } from '../db/repositories/classesRepository';
import { childrenRepository } from '../db/repositories/childrenRepository';
import { groupsRepository } from '../db/repositories/groupsRepository';
import {
  jobTitlesRepository,
  schoolsRepository,
} from '../db/repositories/referenceDataRepository';
import { localStateRepository } from '../db/repositories/localStateRepository';
import { syncOutboxRepository } from '../db/repositories/syncOutboxRepository';
import { resolveDatabase, runRepositoryTransaction } from '../db/repositories/repositoryRuntime';
import { upsertRecord } from '../db/repositories/sqliteRepositoryUtils';

const ensureSchoolExists = async (schoolId = 'local-school') => {
  await runRepositoryTransaction(undefined, async (txn) => {
    await upsertRecord(txn, {
      tableName: 'schools',
      columns: ['id', 'name', 'is_active', 'sync_status'],
      record: {
        id: schoolId,
        name: schoolId === 'local-school' ? 'Local School' : `School ${schoolId}`,
        is_active: 1,
        sync_status: 'synced',
      },
    });
  });
  return schoolId;
};

const ensureClassExists = async (classId) => {
  if (!classId) return null;
  const db = await resolveDatabase();
  const existing = await db.getFirstAsync('select id from classes where id = ?', classId);
  if (existing) return classId;

  const schoolId = await ensureSchoolExists();
  await runRepositoryTransaction(undefined, async (txn) => {
    await upsertRecord(txn, {
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

const payloadKey = (scope, id = 'list') => `storage_payload:${scope}:${id}`;

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

  // Sync state comes from the repository row, never the payload: update paths
  // merge edits into the stored payload, which can preserve a stale pull-time
  // sync_status ('synced') under a row that is actually pending again.
  return {
    ...payload,
    synced: cleaned.synced,
    sync_status: record.sync_status,
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
  async getMyChildren(userId) {
    return await mergeFacadeList('children', await childrenRepository.getMyChildren(userId));
  },

  async saveChild(child) {
    const normalized = {
      last_name: child.last_name || '',
      ...child,
    };
    // Repository first: when the pull guard skips a server row (pending local
    // edit), the facade payload must not be clobbered either — it wins on reads.
    const applied = await childrenRepository.saveChildRecord(await normalizeChildForLegacyFacade(normalized));
    if (applied !== false) {
      await savePayload('children', normalized.id, normalized);
    }
    return applied;
  },

  async createChild(child, options = {}) {
    const normalized = {
      last_name: child.last_name || '',
      ...child,
    };
    await savePayload('children', normalized.id, normalized);
    return await childrenRepository.save(await normalizeChildForLegacyFacade(normalized), options);
  },

  async updateChild(id, updates, options = {}) {
    const existing = await getPayload('children', id);
    if (existing) {
      await savePayload('children', id, { ...existing, ...updates });
    }
    return await childrenRepository.updateChild(id, updates, options);
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

  async getPendingHardDeleteIds(options) {
    return await syncOutboxRepository.getPendingHardDeleteIds(options);
  },

  async saveStaffChild(assignment) {
    const applied = await childrenRepository.saveStaffChild(assignment);
    if (applied !== false) {
      await savePayload('staff_children', assignment.id, assignment);
    }
    return applied;
  },

  async saveChildProgrammeEnrollment(enrollment) {
    return await childrenRepository.saveChildProgrammeEnrollment(enrollment);
  },

  async saveChildClassMembership(membership) {
    return await childrenRepository.saveChildClassMembership(membership);
  },

  async getGroups(options = {}) {
    return await mergeFacadeList('groups', await groupsRepository.getGroups(options));
  },

  async saveGroup(group) {
    const applied = await groupsRepository.saveGroup(group);
    if (applied !== false) {
      await savePayload('groups', group.id, group);
    }
    return applied;
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
    const applied = await groupsRepository.saveChildrenGroup(membership);
    if (applied !== false) {
      await savePayload('children_groups', membership.id, membership);
    }
    return applied;
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
    const applied = await classesRepository.saveClass(await normalizeClassForLegacyFacade(classData));
    if (applied !== false) {
      await savePayload('classes', classData.id, classData);
    }
    return applied;
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

};
