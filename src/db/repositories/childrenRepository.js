import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import {
  enqueueDomainOutbox,
  getActiveAcademicYear,
  mapDomainRow,
  normalizeSyncFields,
  resolveProgrammeId,
  upsertDomainRecord,
} from './domainRepositoryUtils';

const CHILD_COLUMNS = [
  'id',
  'first_name',
  'last_name',
  'preferred_name',
  'date_of_birth',
  'age',
  'gender',
  'class_id',
  'hidden_at',
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

const RELATIONSHIP_COLUMNS = {
  childEa: [
    'id',
    'user_id',
    'child_id',
    'assigned_at',
    'unassigned_at',
    'created_by',
    'created_at',
    'updated_at',
    'sync_status',
    'last_sync_error',
    'server_updated_at',
  ],
  programmeEnrollment: [
    'id',
    'child_id',
    'programme_id',
    'enrolled_at',
    'ended_at',
    'created_by',
    'created_at',
    'updated_at',
    'sync_status',
    'last_sync_error',
    'server_updated_at',
  ],
  classMembership: [
    'id',
    'child_id',
    'class_id',
    'academic_year_id',
    'enrolled_at',
    'exited_at',
    'created_by',
    'created_at',
    'updated_at',
    'sync_status',
    'last_sync_error',
    'server_updated_at',
  ],
};

const mapChild = (row) => mapDomainRow(row);

export const createChildrenRepository = ({ database } = {}) => {
  const runWrite = (transaction, task) => (
    transaction ? task(transaction) : runRepositoryTransaction(database, task)
  );

  const getChildren = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync('select * from children order by first_name, last_name');
    return rows.map(mapChild);
  };

  const save = async (child, { actorUserId = child.created_by || child.user_id, transaction } = {}) => (
    runWrite(transaction, async (txn) => {
      const programmeId = await resolveProgrammeId(txn, {
        programmeId: child.programme_id,
        userId: actorUserId,
      });
      const now = child.created_at || new Date().toISOString();
      const childRecord = normalizeSyncFields({
        ...child,
        created_by: child.created_by || actorUserId,
        created_at: now,
        updated_at: child.updated_at || now,
        sync_status: child.sync_status || 'pending',
      });

      await upsertDomainRecord(txn, {
        tableName: 'children',
        columns: CHILD_COLUMNS,
      }, childRecord);
      await enqueueDomainOutbox(txn, 'children', child.id, 'insert', childRecord);

      const assignment = normalizeSyncFields({
        id: `${child.id}:${actorUserId}`,
        user_id: actorUserId,
        child_id: child.id,
        assigned_at: now,
        created_by: actorUserId,
        sync_status: 'pending',
      });
      await upsertDomainRecord(txn, {
        tableName: 'child_ea_assignments',
        columns: RELATIONSHIP_COLUMNS.childEa,
      }, assignment);
      await enqueueDomainOutbox(txn, 'child_ea_assignments', assignment.id, 'insert', assignment);

      const enrollment = normalizeSyncFields({
        id: `${child.id}:${programmeId}`,
        child_id: child.id,
        programme_id: programmeId,
        enrolled_at: now,
        created_by: actorUserId,
        sync_status: 'pending',
      });
      await upsertDomainRecord(txn, {
        tableName: 'child_programme_enrollments',
        columns: RELATIONSHIP_COLUMNS.programmeEnrollment,
      }, enrollment);
      await enqueueDomainOutbox(txn, 'child_programme_enrollments', enrollment.id, 'insert', enrollment);

      if (child.class_id) {
        const activeYear = await getActiveAcademicYear(txn);
        if (!activeYear?.id) {
          throw new Error('Cannot create child class membership without an active academic year');
        }

        const membership = normalizeSyncFields({
          id: `${child.id}:${child.class_id}:${activeYear.id}`,
          child_id: child.id,
          class_id: child.class_id,
          academic_year_id: activeYear.id,
          enrolled_at: now,
          created_by: actorUserId,
          sync_status: 'pending',
        });
        await upsertDomainRecord(txn, {
          tableName: 'child_class_memberships',
          columns: RELATIONSHIP_COLUMNS.classMembership,
        }, membership);
        await enqueueDomainOutbox(txn, 'child_class_memberships', membership.id, 'insert', membership);
      }

      return true;
    })
  );

  const updateChild = async (id, updates, { transaction } = {}) => runWrite(transaction, async (txn) => {
    const existing = await txn.getFirstAsync('select * from children where id = ?', id);
    if (!existing) return false;

    const next = normalizeSyncFields({
      ...mapChild(existing),
      ...updates,
      id,
      updated_at: updates.updated_at || new Date().toISOString(),
      sync_status: updates.sync_status || (updates.synced === true ? 'synced' : 'pending'),
    });

    await upsertDomainRecord(txn, {
      tableName: 'children',
      columns: CHILD_COLUMNS,
    }, next);
    await enqueueDomainOutbox(txn, 'children', id, 'update', next);
    return true;
  });

  const saveChildRecord = async (child, { transaction } = {}) => runWrite(transaction, async (txn) => {
    const record = normalizeSyncFields({
      ...child,
      sync_status: child.sync_status || (child.synced === true ? 'synced' : 'pending'),
    });
    await upsertDomainRecord(txn, {
      tableName: 'children',
      columns: CHILD_COLUMNS,
    }, record);
    await enqueueDomainOutbox(txn, 'children', child.id, 'insert', record);
    return true;
  });

  const getUnsyncedChildren = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync("select * from children where sync_status <> 'synced' order by created_at");
    return rows.map(mapChild);
  };

  const getStaffChildren = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync('select * from child_ea_assignments order by assigned_at');
    return rows.map((row) => ({
      ...mapDomainRow(row),
      staff_id: row.user_id,
    }));
  };

  const saveStaffChild = async (assignment, { transaction } = {}) => runWrite(transaction, async (txn) => {
    const record = normalizeSyncFields({
      id: assignment.id || `${assignment.child_id}:${assignment.staff_id || assignment.user_id}`,
      user_id: assignment.user_id || assignment.staff_id,
      child_id: assignment.child_id,
      assigned_at: assignment.assigned_at || assignment.created_at || new Date().toISOString(),
      unassigned_at: assignment.unassigned_at || null,
      created_by: assignment.created_by || assignment.staff_id || assignment.user_id,
      sync_status: assignment.sync_status || (assignment.synced === true ? 'synced' : 'pending'),
    });
    await upsertDomainRecord(txn, {
      tableName: 'child_ea_assignments',
      columns: RELATIONSHIP_COLUMNS.childEa,
    }, record);
    await enqueueDomainOutbox(txn, 'child_ea_assignments', record.id, record.unassigned_at ? 'archive' : 'insert', record);
    return true;
  });

  const deleteStaffChild = async (staffId, childId, { transaction } = {}) => runWrite(transaction, async (txn) => {
    const endedAt = new Date().toISOString();
    const rows = await txn.getAllAsync(`
      select id
      from child_ea_assignments
      where user_id = ?
        and child_id = ?
        and unassigned_at is null
    `, staffId, childId);
    await txn.runAsync(`
      update child_ea_assignments
      set unassigned_at = ?,
          sync_status = 'pending',
          updated_at = ?
      where user_id = ?
        and child_id = ?
        and unassigned_at is null
    `, endedAt, endedAt, staffId, childId);
    for (const row of rows) {
      await enqueueDomainOutbox(txn, 'child_ea_assignments', row.id, 'archive', { id: row.id, unassigned_at: endedAt });
    }
    return true;
  });

  const getUnsyncedStaffChildren = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync("select * from child_ea_assignments where sync_status <> 'synced' order by created_at");
    return rows.map((row) => ({
      ...mapDomainRow(row),
      staff_id: row.user_id,
    }));
  };

  const getMyChildren = async (userId) => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync(`
      select distinct children.*
      from children
      join child_ea_assignments cea
        on cea.child_id = children.id
       and cea.user_id = ?
       and cea.unassigned_at is null
      join staff_programme_assignments spa
        on spa.user_id = ?
       and spa.ended_at is null
      join child_programme_enrollments cpe
        on cpe.child_id = children.id
       and cpe.programme_id = spa.programme_id
       and cpe.ended_at is null
      join child_class_memberships ccm
        on ccm.child_id = children.id
       and ccm.exited_at is null
      where children.archived_at is null
      order by children.first_name, children.last_name
    `, userId, userId);

    return rows.map(mapChild);
  };

  const archiveChild = async (childId, {
    actorUserId,
    archivedAt = new Date().toISOString(),
    archiveReason = null,
    transaction,
  } = {}) => runWrite(transaction, async (txn) => {
    await txn.runAsync(`
      update children
      set archived_at = ?,
          archived_by_user_id = ?,
          archive_reason = ?,
          sync_status = 'pending',
          updated_at = ?
      where id = ?
    `, archivedAt, actorUserId || null, archiveReason, archivedAt, childId);
    await enqueueDomainOutbox(txn, 'children', childId, 'archive', { id: childId, archived_at: archivedAt });

    const relationshipUpdates = [
      ['child_ea_assignments', 'unassigned_at', 'child_id'],
      ['child_programme_enrollments', 'ended_at', 'child_id'],
      ['child_class_memberships', 'exited_at', 'child_id'],
    ];

    for (const [tableName, endColumn, childColumn] of relationshipUpdates) {
      const rows = await txn.getAllAsync(
        `select id from ${tableName} where ${childColumn} = ? and ${endColumn} is null`,
        childId
      );
      await txn.runAsync(`
        update ${tableName}
        set ${endColumn} = ?,
            sync_status = 'pending',
            updated_at = ?
        where ${childColumn} = ?
          and ${endColumn} is null
      `, archivedAt, archivedAt, childId);

      for (const row of rows) {
        await enqueueDomainOutbox(txn, tableName, row.id, 'archive', { id: row.id, [endColumn]: archivedAt });
      }
    }

    return true;
  });

  const deleteIfNoHistory = async (childId, { transaction } = {}) => runWrite(transaction, async (txn) => {
    const checks = [
      "select 1 from session_attendees where child_id = ? limit 1",
      "select 1 from assessments where child_id = ? limit 1",
      "select 1 from letter_mastery where child_id = ? limit 1",
      "select 1 from child_group_memberships where child_id = ? limit 1",
      "select 1 from child_ea_assignments where child_id = ? and unassigned_at is not null limit 1",
      "select 1 from child_programme_enrollments where child_id = ? and ended_at is not null limit 1",
      "select 1 from child_class_memberships where child_id = ? and exited_at is not null limit 1",
    ];

    for (const sql of checks) {
      if (await txn.getFirstAsync(sql, childId)) {
        return false;
      }
    }

    const child = await txn.getFirstAsync('select sync_status from children where id = ?', childId);
    if (!child) return false;

    await txn.runAsync('delete from child_class_memberships where child_id = ?', childId);
    await txn.runAsync('delete from child_programme_enrollments where child_id = ?', childId);
    await txn.runAsync('delete from child_ea_assignments where child_id = ?', childId);
    await txn.runAsync('delete from children where id = ?', childId);

    if (child.sync_status === 'synced') {
      await enqueueDomainOutbox(txn, 'children', childId, 'hard_delete', { id: childId });
    }

    return true;
  });

  return {
    getChildren,
    getMyChildren,
    save,
    saveChild: save,
    saveChildRecord,
    updateChild,
    getUnsyncedChildren,
    getStaffChildren,
    saveStaffChild,
    deleteStaffChild,
    getUnsyncedStaffChildren,
    archiveChild,
    deleteIfNoHistory,
  };
};

export const childrenRepository = createChildrenRepository();
