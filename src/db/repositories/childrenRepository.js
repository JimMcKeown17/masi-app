import { v4 as uuidv4 } from 'uuid';
import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import {
  assertRlsRequiredFields,
  enqueueDomainOutbox,
  getActiveAcademicYear,
  mapDomainRow,
  normalizeSyncFields,
  resolveProgrammeId,
  shouldEnqueueOutbox,
  upsertDomainRecord,
} from './domainRepositoryUtils';
import { syncStatusFromSynced } from './sqliteRepositoryUtils';
import { normalizeGender } from '../../constants/options';

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

const normalizeChildRecord = (child) => ({
  ...child,
  gender: normalizeGender(child.gender),
});

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
        ...normalizeChildRecord(child),
        created_by: child.created_by || actorUserId,
        created_at: now,
        updated_at: child.updated_at || now,
        sync_status: child.sync_status || 'pending',
      });
      assertRlsRequiredFields('children', childRecord, ['created_by']);

      await upsertDomainRecord(txn, {
        tableName: 'children',
        columns: CHILD_COLUMNS,
      }, childRecord);
      await enqueueDomainOutbox(txn, 'children', child.id, 'insert', childRecord);

      const activeAssignment = await txn.getFirstAsync(`
        select id
        from child_ea_assignments
        where user_id = ?
          and child_id = ?
          and unassigned_at is null
      `, actorUserId, child.id);
      if (!activeAssignment) {
        const assignment = normalizeSyncFields({
          id: uuidv4(),
          user_id: actorUserId,
          child_id: child.id,
          assigned_at: now,
          created_by: actorUserId,
          sync_status: 'pending',
        });
        assertRlsRequiredFields('child_ea_assignments', assignment, ['user_id', 'child_id', 'created_by']);
        await upsertDomainRecord(txn, {
          tableName: 'child_ea_assignments',
          columns: RELATIONSHIP_COLUMNS.childEa,
        }, assignment);
        await enqueueDomainOutbox(txn, 'child_ea_assignments', assignment.id, 'insert', assignment);
      }

      const activeEnrollment = await txn.getFirstAsync(`
        select id
        from child_programme_enrollments
        where child_id = ?
          and programme_id = ?
          and ended_at is null
      `, child.id, programmeId);
      if (!activeEnrollment) {
        const enrollment = normalizeSyncFields({
          id: uuidv4(),
          child_id: child.id,
          programme_id: programmeId,
          enrolled_at: now,
          created_by: actorUserId,
          sync_status: 'pending',
        });
        assertRlsRequiredFields('child_programme_enrollments', enrollment, ['child_id', 'programme_id', 'created_by']);
        await upsertDomainRecord(txn, {
          tableName: 'child_programme_enrollments',
          columns: RELATIONSHIP_COLUMNS.programmeEnrollment,
        }, enrollment);
        await enqueueDomainOutbox(txn, 'child_programme_enrollments', enrollment.id, 'insert', enrollment);
      }

      if (child.class_id) {
        const activeYear = await getActiveAcademicYear(txn);
        if (!activeYear?.id) {
          throw new Error('Cannot create child class membership without an active academic year');
        }

        const activeClassMembership = await txn.getFirstAsync(`
          select id, class_id
          from child_class_memberships
          where child_id = ?
            and academic_year_id = ?
            and exited_at is null
        `, child.id, activeYear.id);
        if (activeClassMembership && activeClassMembership.class_id !== child.class_id) {
          throw new Error('Child already has an active class membership for the active academic year');
        }
        if (!activeClassMembership) {
          const membership = normalizeSyncFields({
            id: uuidv4(),
            child_id: child.id,
            class_id: child.class_id,
            academic_year_id: activeYear.id,
            enrolled_at: now,
            created_by: actorUserId,
            sync_status: 'pending',
          });
          assertRlsRequiredFields('child_class_memberships', membership, ['child_id', 'class_id', 'academic_year_id', 'created_by']);
          await upsertDomainRecord(txn, {
            tableName: 'child_class_memberships',
            columns: RELATIONSHIP_COLUMNS.classMembership,
          }, membership);
          await enqueueDomainOutbox(txn, 'child_class_memberships', membership.id, 'insert', membership);
        }
      }

      return true;
    })
  );

  const updateChild = async (id, updates, { actorUserId, transaction } = {}) => runWrite(transaction, async (txn) => {
    const existing = await txn.getFirstAsync('select * from children where id = ?', id);
    if (!existing) return false;

    const next = normalizeSyncFields({
      ...normalizeChildRecord({
        ...mapChild(existing),
        ...updates,
      }),
      id,
      updated_at: updates.updated_at || new Date().toISOString(),
      sync_status: updates.sync_status || syncStatusFromSynced(updates.synced),
    });

    await upsertDomainRecord(txn, {
      tableName: 'children',
      columns: CHILD_COLUMNS,
    }, next);
    if (shouldEnqueueOutbox(next)) {
      await enqueueDomainOutbox(txn, 'children', id, 'update', next);
    }

    // Keep the active class membership in sync with children.class_id when the
    // class changes, so getChildrenInClass and the roster query (which join
    // child_class_memberships ON exited_at IS NULL) can never disagree (#35).
    // Memberships are append/archive-only: archive the old active one and insert
    // a new one rather than mutating identity columns.
    if (updates.class_id !== undefined && updates.class_id !== existing.class_id) {
      const now = next.updated_at;
      const activeYear = await getActiveAcademicYear(txn);
      if (!activeYear?.id) {
        throw new Error('Cannot reassign child class membership without an active academic year');
      }

      const activeMemberships = await txn.getAllAsync(`
        select id, class_id, child_id, academic_year_id, enrolled_at, created_by, created_at
        from child_class_memberships
        where child_id = ?
          and academic_year_id = ?
          and exited_at is null
      `, id, activeYear.id);

      let alreadyInTarget = false;
      for (const membership of activeMemberships) {
        if (membership.class_id === updates.class_id) {
          alreadyInTarget = true;
          continue;
        }
        await txn.runAsync(`
          update child_class_memberships
          set exited_at = ?, sync_status = 'pending', updated_at = ?
          where id = ?
        `, now, now, membership.id);

        // If the old membership's insert is still queued, it never reached the server
        // (a successful sync deletes the outbox row). Coalesce: rewrite that pending
        // insert to carry exited_at so it syncs once, already-exited — instead of
        // queuing a separate archive. A separate archive would fail remotely (nothing
        // to archive) and, because archives sort before inserts for this table, the
        // stale active insert would recreate the old membership active on sync (#35).
        const pendingInsert = await txn.getFirstAsync(`
          select id
          from sync_outbox
          where table_name = 'child_class_memberships'
            and record_id = ?
            and operation = 'insert'
        `, membership.id);

        if (pendingInsert) {
          await enqueueDomainOutbox(txn, 'child_class_memberships', membership.id, 'insert', {
            id: membership.id,
            child_id: membership.child_id,
            class_id: membership.class_id,
            academic_year_id: membership.academic_year_id,
            enrolled_at: membership.enrolled_at,
            exited_at: now,
            created_by: membership.created_by,
            created_at: membership.created_at,
            updated_at: now,
          });
        } else {
          await enqueueDomainOutbox(txn, 'child_class_memberships', membership.id, 'archive', {
            id: membership.id,
            exited_at: now,
          });
        }
      }

      // A non-null new class gets a fresh active membership (null class_id = unassign).
      if (updates.class_id && !alreadyInTarget) {
        const membership = normalizeSyncFields({
          id: uuidv4(),
          child_id: id,
          class_id: updates.class_id,
          academic_year_id: activeYear.id,
          enrolled_at: now,
          created_by: actorUserId || existing.created_by,
          sync_status: 'pending',
        });
        assertRlsRequiredFields('child_class_memberships', membership, ['child_id', 'class_id', 'academic_year_id', 'created_by']);
        await upsertDomainRecord(txn, {
          tableName: 'child_class_memberships',
          columns: RELATIONSHIP_COLUMNS.classMembership,
        }, membership);
        await enqueueDomainOutbox(txn, 'child_class_memberships', membership.id, 'insert', membership);
      }
    }

    return true;
  });

  const saveChildRecord = async (child, { transaction } = {}) => runWrite(transaction, async (txn) => {
    const record = normalizeSyncFields({
      ...normalizeChildRecord(child),
      sync_status: child.sync_status || syncStatusFromSynced(child.synced),
    });
    await upsertDomainRecord(txn, {
      tableName: 'children',
      columns: CHILD_COLUMNS,
    }, record);
    if (shouldEnqueueOutbox(record)) {
      await enqueueDomainOutbox(txn, 'children', child.id, 'insert', record);
    }
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
      sync_status: assignment.sync_status || syncStatusFromSynced(assignment.synced),
    });
    if (shouldEnqueueOutbox(record)) {
      assertRlsRequiredFields('child_ea_assignments', record, ['user_id', 'child_id', 'created_by']);
    }
    await upsertDomainRecord(txn, {
      tableName: 'child_ea_assignments',
      columns: RELATIONSHIP_COLUMNS.childEa,
    }, record);
    if (shouldEnqueueOutbox(record)) {
      await enqueueDomainOutbox(txn, 'child_ea_assignments', record.id, record.unassigned_at ? 'archive' : 'insert', record);
    }
    return true;
  });

  const saveChildProgrammeEnrollment = async (enrollment, { transaction } = {}) => runWrite(transaction, async (txn) => {
    const record = normalizeSyncFields({
      enrolled_at: enrollment.enrolled_at || enrollment.created_at || new Date().toISOString(),
      ...enrollment,
      sync_status: enrollment.sync_status || syncStatusFromSynced(enrollment.synced),
    });
    if (shouldEnqueueOutbox(record)) {
      assertRlsRequiredFields('child_programme_enrollments', record, ['child_id', 'programme_id', 'created_by']);
    }
    await upsertDomainRecord(txn, {
      tableName: 'child_programme_enrollments',
      columns: RELATIONSHIP_COLUMNS.programmeEnrollment,
    }, record);
    if (shouldEnqueueOutbox(record)) {
      await enqueueDomainOutbox(txn, 'child_programme_enrollments', record.id, record.ended_at ? 'archive' : 'insert', record);
    }
    return true;
  });

  const saveChildClassMembership = async (membership, { transaction } = {}) => runWrite(transaction, async (txn) => {
    const record = normalizeSyncFields({
      enrolled_at: membership.enrolled_at || membership.created_at || new Date().toISOString(),
      ...membership,
      sync_status: membership.sync_status || syncStatusFromSynced(membership.synced),
    });
    if (shouldEnqueueOutbox(record)) {
      assertRlsRequiredFields('child_class_memberships', record, ['child_id', 'class_id', 'created_by']);
    }
    await upsertDomainRecord(txn, {
      tableName: 'child_class_memberships',
      columns: RELATIONSHIP_COLUMNS.classMembership,
    }, record);
    if (shouldEnqueueOutbox(record)) {
      await enqueueDomainOutbox(txn, 'child_class_memberships', record.id, record.exited_at ? 'archive' : 'insert', record);
    }
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
      join classes
        on classes.id = ccm.class_id
       and classes.archived_at is null
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
      ['child_group_memberships', 'removed_at', 'child_id'],
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
    saveChildProgrammeEnrollment,
    saveChildClassMembership,
    deleteStaffChild,
    getUnsyncedStaffChildren,
    archiveChild,
    deleteIfNoHistory,
  };
};

export const childrenRepository = createChildrenRepository();
