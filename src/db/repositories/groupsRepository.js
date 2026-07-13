import {
  resolveDatabase,
  runBatchWithPerRowFallback,
  runReconcileWithMassEndBreaker,
  runRepositoryTransaction,
} from './repositoryRuntime';
import {
  enqueueDomainOutbox,
  getActiveProgrammeAssignment,
  getActiveProgrammeId,
  groupEaAssignmentDomainId,
  mapDomainRow,
  normalizeSyncFields,
  resolveProgrammeId,
  serverPullWouldClobberPendingLocal,
  shouldEnqueueOutbox,
  upsertDomainRecord,
} from './domainRepositoryUtils';
import { decodeJson, syncStatusFromSynced, timestamp } from './sqliteRepositoryUtils';

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

const GROUP_EA_ASSIGNMENT_COLUMNS = [
  'id',
  'group_id',
  'ea_user_id',
  'programme_id',
  'assigned_at',
  'unassigned_at',
  'handover_reason',
  'created_by',
  'created_at',
  'updated_at',
  'sync_status',
  'last_sync_error',
  'server_updated_at',
];

const writeOutboxPayload = async (txn, outboxIdValue, payload) => {
  await txn.runAsync(`
    update sync_outbox
    set payload = ?,
        status = 'pending',
        last_error = null,
        next_retry_at = null,
        updated_at = ?
    where id = ?
  `, JSON.stringify(payload), timestamp(), outboxIdValue);
};

const createMissingGroupAssignment = async (txn, {
  groupId,
  ownerUserId,
  programmeId,
  assignedAt,
  syncStatus = 'pending',
}) => {
  const activeProgrammeAssignment = ownerUserId
    ? await getActiveProgrammeAssignment(txn, ownerUserId)
    : null;
  if (activeProgrammeAssignment?.programme_id !== programmeId) return null;

  const existingAssignment = await txn.getFirstAsync(`
    select *
    from group_ea_assignments
    where group_id = ?
      and unassigned_at is null
    limit 1
  `, groupId);
  if (existingAssignment) return mapDomainRow(existingAssignment);

  const assignmentId = groupEaAssignmentDomainId({ groupId });
  const archivedAssignment = await txn.getFirstAsync(`
    select *
    from group_ea_assignments
    where group_id = ?
    order by case when id = ? then 0 else 1 end
    limit 1
  `, groupId, assignmentId);
  if (archivedAssignment?.id === assignmentId) {
    const updatedAt = timestamp();
    // Assignment identity fields are immutable server-side. Reactivation only
    // clears lifecycle archive fields on the existing deterministic row.
    await txn.runAsync(`
      update group_ea_assignments
      set unassigned_at = null,
          handover_reason = null,
          sync_status = ?,
          last_sync_error = null,
          updated_at = ?
      where id = ?
    `, syncStatus, updatedAt, assignmentId);
    const reactivatedAssignment = await txn.getFirstAsync(
      'select * from group_ea_assignments where id = ?',
      assignmentId
    );
    const assignment = mapDomainRow(reactivatedAssignment);
    await enqueueDomainOutbox(txn, 'group_ea_assignments', assignment.id, 'insert', assignment);
    return assignment;
  }

  const assignment = normalizeSyncFields({
    id: assignmentId,
    group_id: groupId,
    ea_user_id: ownerUserId,
    programme_id: programmeId,
    assigned_at: assignedAt || new Date().toISOString(),
    created_by: ownerUserId,
    sync_status: syncStatus,
  });
  await upsertDomainRecord(txn, {
    tableName: 'group_ea_assignments',
    columns: GROUP_EA_ASSIGNMENT_COLUMNS,
  }, assignment);
  await enqueueDomainOutbox(txn, 'group_ea_assignments', assignment.id, 'insert', assignment);
  return assignment;
};

export const createGroupsRepository = ({ database } = {}) => {
  const runWrite = (transaction, task) => (
    transaction ? task(transaction) : runRepositoryTransaction(database, task)
  );

  const buildMembershipReconcile = ({
    acknowledgedIds,
    acknowledgedGroupIds,
    pulledAt,
    bypassBreaker = false,
  } = {}) => {
    if (!Array.isArray(acknowledgedIds) || !Array.isArray(acknowledgedGroupIds) || !pulledAt) {
      throw new Error(
        'childrenGroups reconcile requires acknowledgedIds, acknowledgedGroupIds, and pulledAt'
      );
    }
    const acknowledgedIdsJson = JSON.stringify(acknowledgedIds);
    const acknowledgedGroupIdsJson = JSON.stringify(acknowledgedGroupIds);
    const activeScopeSql = `
      from child_group_memberships
      where group_id in (select value from json_each(?))
        and removed_at is null
        and sync_status = 'synced'
    `;
    const absentSql = `${activeScopeSql}
      and id not in (select value from json_each(?))
    `;
    return (transaction) => runReconcileWithMassEndBreaker({
      transaction,
      scope: 'childrenGroups',
      pulledAt,
      bypassBreaker,
      countCandidates: async (txn) => (
        await txn.getFirstAsync(
          `select count(*) as count ${activeScopeSql}`,
          acknowledgedGroupIdsJson
        )
      )?.count,
      countWouldEnd: async (txn) => (
        await txn.getFirstAsync(
          `select count(*) as count ${absentSql}`,
          acknowledgedGroupIdsJson,
          acknowledgedIdsJson
        )
      )?.count,
      apply: async (txn) => (
        await txn.runAsync(`
          update child_group_memberships
          set removed_at = ?,
              updated_at = ?
          where group_id in (select value from json_each(?))
            and removed_at is null
            and sync_status = 'synced'
            and id not in (select value from json_each(?))
        `, pulledAt, pulledAt, acknowledgedGroupIdsJson, acknowledgedIdsJson)
      ).changes,
    });
  };

  const getGroups = async ({ userId, programmeId } = {}) => {
    const db = await resolveDatabase(database);
    const activeProgrammeId = programmeId || (userId ? await getActiveProgrammeId(db, userId) : null);
    if (userId && !activeProgrammeId) return [];
    const rows = userId
      ? await db.getAllAsync(`
        select g.*
        from groups g
        join group_ea_assignments gea
          on gea.group_id = g.id
         and gea.ea_user_id = ?
         and gea.programme_id = ?
         and gea.unassigned_at is null
        where g.archived_at is null
          and g.programme_id = ?
        order by g.name
      `, userId, activeProgrammeId, activeProgrammeId)
      : activeProgrammeId
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

  const getVisibleChildrenGroups = async ({ userId, programmeId } = {}) => {
    if (!userId) return [];
    const db = await resolveDatabase(database);
    const activeProgrammeId = programmeId || await getActiveProgrammeId(db, userId);
    if (!activeProgrammeId) return [];
    const rows = await db.getAllAsync(`
      select cgm.*
      from child_group_memberships cgm
      join groups g
        on g.id = cgm.group_id
       and g.archived_at is null
       and g.programme_id = ?
      join group_ea_assignments gea
        on gea.group_id = g.id
       and gea.ea_user_id = ?
       and gea.programme_id = ?
       and gea.unassigned_at is null
      where cgm.removed_at is null
      order by cgm.joined_at
    `, activeProgrammeId, userId, activeProgrammeId);
    return rows.map(mapDomainRow);
  };

  const saveGroup = async (group, { transaction } = {}) => runWrite(transaction, async (txn) => {
    const actorUserId = group.staff_id || group.user_id || group.created_by;
    const programmeId = await resolveProgrammeId(txn, {
      programmeId: group.programme_id,
      userId: actorUserId,
    });
    const ownerUserId = group.created_by || actorUserId;
    const record = normalizeSyncFields({
      ...group,
      programme_id: programmeId,
      created_by: ownerUserId,
      sync_status: group.sync_status || syncStatusFromSynced(group.synced),
    });
    if (await serverPullWouldClobberPendingLocal(txn, 'groups', record)) {
      return false;
    }
    await upsertDomainRecord(txn, {
      tableName: 'groups',
      columns: GROUP_COLUMNS,
    }, record);
    if (shouldEnqueueOutbox(record)) {
      await enqueueDomainOutbox(txn, 'groups', group.id, 'insert', record);

      if (ownerUserId) {
        await createMissingGroupAssignment(txn, {
          groupId: group.id,
          ownerUserId,
          programmeId,
          assignedAt: record.created_at,
          syncStatus: record.sync_status,
        });
      }
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
    const group = await txn.getFirstAsync('select * from groups where id = ?', membership.group_id);
    const assignment = await txn.getFirstAsync(`
      select *
      from group_ea_assignments
      where group_id = ?
        and unassigned_at is null
      limit 1
    `, membership.group_id);
    const ownerUserId = membership.created_by
      || membership.staff_id
      || membership.user_id
      || assignment?.ea_user_id
      || group?.created_by;
    const record = normalizeSyncFields({
      id: membership.id || `${membership.child_id}:${membership.group_id}`,
      joined_at: membership.joined_at || membership.created_at || new Date().toISOString(),
      ...membership,
      grouping_version_id: membership.grouping_version_id || group?.grouping_version_id || null,
      created_by: membership.created_by || ownerUserId,
      sync_status: membership.sync_status || syncStatusFromSynced(membership.synced),
    });
    if (await serverPullWouldClobberPendingLocal(txn, 'child_group_memberships', record)) {
      return false;
    }
    await upsertDomainRecord(txn, {
      tableName: 'child_group_memberships',
      columns: MEMBERSHIP_COLUMNS,
    }, record);
    if (shouldEnqueueOutbox(record)) {
      await enqueueDomainOutbox(txn, 'child_group_memberships', record.id, 'insert', record);
    }
    return true;
  });

  const saveServerGroupRows = async (rows = []) => runBatchWithPerRowFallback({
    database,
    rows,
    saveRow: saveGroup,
    tableName: 'groups',
  });

  const saveServerChildrenGroupRows = async (rows = [], { reconcile } = {}) => runBatchWithPerRowFallback({
    database,
    rows,
    saveRow: addChildToGroup,
    tableName: 'child_group_memberships',
    reconcile: reconcile ? buildMembershipReconcile(reconcile) : undefined,
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
    saveServerGroupRows,
    updateGroup,
    deleteGroup,
    getUnsyncedGroups,
    getChildrenGroups,
    getVisibleChildrenGroups,
    addChildToGroup,
    saveChildrenGroup: addChildToGroup,
    saveServerChildrenGroupRows,
    removeChildFromGroup,
    deleteChildrenGroup: removeChildFromGroup,
    getUnsyncedChildrenGroups,
    archiveGroup,
  };
};

export const groupsRepository = createGroupsRepository();

export const repairGroupOwnershipForSync = async ({ database } = {}) => (
  runRepositoryTransaction(database, async (txn) => {
    const groupOutboxRows = await txn.getAllAsync(`
      select
        g.id,
        g.programme_id,
        g.created_by,
        g.created_at,
        so.status as outbox_status,
        so.id as outbox_id,
        so.payload as outbox_payload
      from groups g
      join sync_outbox so
        on so.table_name = 'groups'
       and so.record_id = g.id
       and so.operation = 'insert'
      where so.status in ('pending', 'failed', 'terminal')
    `);

    for (const row of groupOutboxRows) {
      const payload = decodeJson(row.outbox_payload, {});
      const ownerUserId = row.created_by || payload.created_by || payload.staff_id || payload.user_id;
      const programmeId = row.programme_id || payload.programme_id;
      if (!ownerUserId || !programmeId) continue;

      const rowNeedsRepair = row.created_by !== ownerUserId;
      const payloadNeedsRepair = payload.created_by !== ownerUserId || payload.programme_id !== programmeId;
      if (!rowNeedsRepair && !payloadNeedsRepair) continue;

      if (rowNeedsRepair) {
        await txn.runAsync(`
          update groups
          set created_by = ?,
              sync_status = 'pending',
              last_sync_error = null,
              updated_at = ?
          where id = ?
        `, ownerUserId, timestamp(), row.id);
      }

      if (payloadNeedsRepair || row.outbox_status !== 'pending') {
        await writeOutboxPayload(txn, row.outbox_id, {
          ...payload,
          id: row.id,
          programme_id: programmeId,
          created_by: ownerUserId,
        });
      }

      await createMissingGroupAssignment(txn, {
        groupId: row.id,
        ownerUserId,
        programmeId,
        assignedAt: row.created_at || payload.created_at,
      });
    }

    const membershipOutboxRows = await txn.getAllAsync(`
      select
        cgm.id,
        cgm.child_id,
        cgm.group_id,
        cgm.grouping_version_id,
        cgm.created_by,
        g.programme_id as group_programme_id,
        g.created_at as group_created_at,
        g.grouping_version_id as group_grouping_version_id,
        g.created_by as group_created_by,
        gea.ea_user_id as group_ea_user_id,
        so.status as outbox_status,
        so.id as outbox_id,
        so.payload as outbox_payload
      from child_group_memberships cgm
      join sync_outbox so
        on so.table_name = 'child_group_memberships'
       and so.record_id = cgm.id
       and so.operation = 'insert'
      left join groups g
        on g.id = cgm.group_id
      left join group_ea_assignments gea
        on gea.group_id = cgm.group_id
       and gea.unassigned_at is null
      where so.status in ('pending', 'failed', 'terminal')
    `);

    for (const row of membershipOutboxRows) {
      const payload = decodeJson(row.outbox_payload, {});
      const ownerUserId = row.created_by
        || payload.created_by
        || row.group_ea_user_id
        || row.group_created_by;
      const groupProgrammeId = row.group_programme_id || payload.programme_id;
      const groupingVersionId = row.grouping_version_id
        || payload.grouping_version_id
        || row.group_grouping_version_id
        || null;
      if (!ownerUserId) continue;

      const repairedAssignment = row.group_ea_user_id
        ? null
        : await createMissingGroupAssignment(txn, {
          groupId: row.group_id || payload.group_id,
          ownerUserId,
          programmeId: groupProgrammeId,
          assignedAt: row.group_created_at || payload.joined_at,
        });

      const rowNeedsRepair = row.created_by !== ownerUserId
        || row.grouping_version_id !== groupingVersionId;
      const payloadNeedsRepair = payload.created_by !== ownerUserId
        || (groupingVersionId && payload.grouping_version_id !== groupingVersionId);
      const needsRetryReset = row.outbox_status !== 'pending' || Boolean(repairedAssignment);
      if (!rowNeedsRepair && !payloadNeedsRepair && !needsRetryReset) continue;

      if (rowNeedsRepair || needsRetryReset) {
        await txn.runAsync(`
          update child_group_memberships
          set created_by = ?,
              grouping_version_id = ?,
              sync_status = 'pending',
              last_sync_error = null,
              updated_at = ?
          where id = ?
        `, ownerUserId, groupingVersionId, timestamp(), row.id);
      }

      if (payloadNeedsRepair || needsRetryReset) {
        await writeOutboxPayload(txn, row.outbox_id, {
          ...payload,
          id: row.id,
          child_id: row.child_id || payload.child_id,
          group_id: row.group_id || payload.group_id,
          ...(groupingVersionId ? { grouping_version_id: groupingVersionId } : {}),
          created_by: ownerUserId,
        });
      }
    }

    return true;
  })
);
