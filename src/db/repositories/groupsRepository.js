import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import {
  enqueueDomainOutbox,
  getActiveProgrammeId,
  mapDomainRow,
  normalizeSyncFields,
  resolveProgrammeId,
  shouldEnqueueOutbox,
  upsertDomainRecord,
} from './domainRepositoryUtils';
import { syncStatusFromSynced } from './sqliteRepositoryUtils';

const GROUP_COLUMNS = [
  'id',
  'name',
  'programme_id',
  'class_id',
  'grouping_version_id',
  'display_number',
  'archived_at',
  'archived_by_user_id',
  'archive_reason',
  'created_by',
  'created_at',
  'updated_at',
  'sync_status',
  'last_sync_error',
  'server_updated_at',
];

const MEMBERSHIP_COLUMNS = [
  'id',
  'child_id',
  'group_id',
  'grouping_version_id',
  'joined_at',
  'removed_at',
  'created_by',
  'created_at',
  'updated_at',
  'sync_status',
  'last_sync_error',
  'server_updated_at',
];

export const createGroupsRepository = ({ database } = {}) => {
  const runWrite = (transaction, task) => (
    transaction ? task(transaction) : runRepositoryTransaction(database, task)
  );

  const getGroups = async ({ userId, programmeId } = {}) => {
    const db = await resolveDatabase(database);
    const activeProgrammeId = programmeId || (userId ? await getActiveProgrammeId(db, userId) : null);
    if (userId && !activeProgrammeId) return [];
    const rows = activeProgrammeId
      ? await db.getAllAsync(
        'select * from groups where archived_at is null and programme_id = ? order by name',
        activeProgrammeId
      )
      : await db.getAllAsync('select * from groups where archived_at is null order by name');
    return rows.map(mapDomainRow);
  };

  const getChildrenGroups = async ({ includeRemoved = false } = {}) => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync(`
      select *
      from child_group_memberships
      ${includeRemoved ? '' : 'where removed_at is null'}
      order by joined_at
    `);
    return rows.map(mapDomainRow);
  };

  const saveGroup = async (group, { transaction } = {}) => runWrite(transaction, async (txn) => {
    const programmeId = await resolveProgrammeId(txn, {
      programmeId: group.programme_id,
      userId: group.staff_id || group.created_by,
    });
    const record = normalizeSyncFields({
      ...group,
      programme_id: programmeId,
      sync_status: group.sync_status || syncStatusFromSynced(group.synced),
    });
    await upsertDomainRecord(txn, {
      tableName: 'groups',
      columns: GROUP_COLUMNS,
    }, record);
    if (shouldEnqueueOutbox(record)) {
      await enqueueDomainOutbox(txn, 'groups', group.id, 'insert', record);
    }
    return true;
  });

  const updateGroup = async (id, updates, { transaction } = {}) => runWrite(transaction, async (txn) => {
    const existing = await txn.getFirstAsync('select * from groups where id = ?', id);
    if (!existing) return false;
    const record = normalizeSyncFields({
      ...mapDomainRow(existing),
      ...updates,
      id,
      sync_status: updates.sync_status || syncStatusFromSynced(updates.synced),
    });
    await upsertDomainRecord(txn, {
      tableName: 'groups',
      columns: GROUP_COLUMNS,
    }, record);
    if (shouldEnqueueOutbox(record)) {
      await enqueueDomainOutbox(txn, 'groups', id, 'update', record);
    }
    return true;
  });

  const addChildToGroup = async (membership, { transaction } = {}) => runWrite(transaction, async (txn) => {
    const record = normalizeSyncFields({
      id: membership.id || `${membership.child_id}:${membership.group_id}`,
      joined_at: membership.joined_at || membership.created_at || new Date().toISOString(),
      ...membership,
      sync_status: membership.sync_status || syncStatusFromSynced(membership.synced),
    });
    await upsertDomainRecord(txn, {
      tableName: 'child_group_memberships',
      columns: MEMBERSHIP_COLUMNS,
    }, record);
    if (shouldEnqueueOutbox(record)) {
      await enqueueDomainOutbox(txn, 'child_group_memberships', record.id, 'insert', record);
    }
    return true;
  });

  const removeChildFromGroup = async (childId, groupId, {
    removedAt = new Date().toISOString(),
    transaction,
  } = {}) => runWrite(transaction, async (txn) => {
    const rows = await txn.getAllAsync(`
      select id
      from child_group_memberships
      where child_id = ?
        and group_id = ?
        and removed_at is null
    `, childId, groupId);
    await txn.runAsync(`
      update child_group_memberships
      set removed_at = ?,
          sync_status = 'pending',
          updated_at = ?
      where child_id = ?
        and group_id = ?
        and removed_at is null
    `, removedAt, removedAt, childId, groupId);
    for (const row of rows) {
      await enqueueDomainOutbox(txn, 'child_group_memberships', row.id, 'archive', { id: row.id, removed_at: removedAt });
    }
    return true;
  });

  const getUnsyncedGroups = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync("select * from groups where sync_status <> 'synced' order by created_at");
    return rows.map(mapDomainRow);
  };

  const getUnsyncedChildrenGroups = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync("select * from child_group_memberships where sync_status <> 'synced' order by created_at");
    return rows.map(mapDomainRow);
  };

  const archiveGroup = async (groupId, {
    actorUserId,
    archivedAt = new Date().toISOString(),
    archiveReason = null,
    transaction,
  } = {}) => runWrite(transaction, async (txn) => {
    await txn.runAsync(`
      update groups
      set archived_at = ?,
          archived_by_user_id = ?,
          archive_reason = ?,
          sync_status = 'pending',
          updated_at = ?
      where id = ?
    `, archivedAt, actorUserId || null, archiveReason, archivedAt, groupId);
    await enqueueDomainOutbox(txn, 'groups', groupId, 'archive', { id: groupId, archived_at: archivedAt });

    const assignmentRows = await txn.getAllAsync(
      'select id from group_ea_assignments where group_id = ? and unassigned_at is null',
      groupId
    );
    await txn.runAsync(`
      update group_ea_assignments
      set unassigned_at = ?,
          sync_status = 'pending',
          updated_at = ?
      where group_id = ?
        and unassigned_at is null
    `, archivedAt, archivedAt, groupId);
    for (const row of assignmentRows) {
      await enqueueDomainOutbox(txn, 'group_ea_assignments', row.id, 'archive', { id: row.id, unassigned_at: archivedAt });
    }

    const membershipRows = await txn.getAllAsync(
      'select id from child_group_memberships where group_id = ? and removed_at is null',
      groupId
    );
    await txn.runAsync(`
      update child_group_memberships
      set removed_at = ?,
          sync_status = 'pending',
          updated_at = ?
      where group_id = ?
        and removed_at is null
    `, archivedAt, archivedAt, groupId);
    for (const row of membershipRows) {
      await enqueueDomainOutbox(txn, 'child_group_memberships', row.id, 'archive', { id: row.id, removed_at: archivedAt });
    }

    return true;
  });

  const deleteGroup = async (id, options = {}) => archiveGroup(id, options);

  return {
    getGroups,
    saveGroup,
    updateGroup,
    deleteGroup,
    getUnsyncedGroups,
    getChildrenGroups,
    addChildToGroup,
    saveChildrenGroup: addChildToGroup,
    removeChildFromGroup,
    deleteChildrenGroup: removeChildFromGroup,
    getUnsyncedChildrenGroups,
    archiveGroup,
  };
};

export const groupsRepository = createGroupsRepository();
