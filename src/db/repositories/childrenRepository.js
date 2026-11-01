import { v4 as uuidv4 } from 'uuid';
import { getConnectionActor } from '../../session/signedInHandle';
import {
  resolveDatabase,
  runBatchWithPerRowFallback,
  runReconcileWithMassEndBreaker,
  runRepositoryTransaction,
} from './repositoryRuntime';
import {
  assertRlsRequiredFields,
  childEaAssignmentDomainId,
  childProgrammeEnrollmentDomainId,
  enqueueDomainOutbox,
  getActiveAcademicYear,
  getActiveProgrammeId,
  mapDomainRow,
  normalizeSyncFields,
  resolveProgrammeId,
  serverPullWouldClobberPendingLocal,
  shouldEnqueueOutbox,
  supersedeStaleActivePairRow,
  upsertDomainRecord,
} from './domainRepositoryUtils';
import { chunkArray, sqlPlaceholders, syncStatusFromSynced } from './sqliteRepositoryUtils';
import { normalizeGender } from '../../constants/options';
import { deleteUndeliveredLetterMastery } from './masteryRepository';

const CHILD_COLUMNS = [
  'id',
  'first_name',
  'last_name',
  'preferred_name',
  'date_of_birth',
  'age',
  'gender',
  'reading_level',
  'history_reference',
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
  'row_version',
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
    'row_version',
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
    'row_version',
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
    'row_version',
  ],
};

const mapChild = (row) => mapDomainRow(row);

const normalizeChildRecord = (child) => ({
  ...child,
  gender: normalizeGender(child.gender),
});

const assertNotHistoryReference = async (txn, childId) => {
  const row = await txn.getFirstAsync('select history_reference from children where id = ?', childId);
  if (row?.history_reference === 1) {
    throw new Error('History reference children are read-only');
  }
};

export const createChildrenRepository = ({ database } = {}) => {
  const runWrite = (transaction, task) => (
    transaction ? task(transaction) : runRepositoryTransaction(database, task)
  );
  const saveServerRows = async (rows, saveRow, tableName, { reconcile } = {}) => runBatchWithPerRowFallback({
    database,
    rows,
    saveRow,
    tableName,
    reconcile,
  });

  const buildChildEaReconcile = ({
    acknowledgedIds,
    pulledAt,
    userId,
    bypassBreaker = false,
  } = {}) => {
    if (!Array.isArray(acknowledgedIds) || !pulledAt || !userId) {
      throw new Error('childEaAssignments reconcile requires acknowledgedIds, pulledAt, and userId');
    }
    const acknowledgedIdsJson = JSON.stringify(acknowledgedIds);
    const activeScopeSql = `
      from child_ea_assignments
      where user_id = ?
        and unassigned_at is null
        and sync_status = 'synced'
    `;
    const absentSql = `${activeScopeSql}
      and id not in (select value from json_each(?))
    `;
    return (transaction) => runReconcileWithMassEndBreaker({
      transaction,
      scope: 'childEaAssignments',
      pulledAt,
      bypassBreaker,
      countCandidates: async (txn) => (
        await txn.getFirstAsync(`select count(*) as count ${activeScopeSql}`, userId)
      )?.count,
      countWouldEnd: async (txn) => (
        await txn.getFirstAsync(
          `select count(*) as count ${absentSql}`,
          userId,
          acknowledgedIdsJson
        )
      )?.count,
      apply: async (txn) => {
        const children = await txn.getAllAsync(`select distinct child_id ${absentSql}`, userId, acknowledgedIdsJson);
        const result = await txn.runAsync(`
          update child_ea_assignments
          set unassigned_at = ?,
              updated_at = ?
          where user_id = ?
            and unassigned_at is null
            and sync_status = 'synced'
            and id not in (select value from json_each(?))
        `, pulledAt, pulledAt, userId, acknowledgedIdsJson);
        await deleteUndeliveredLetterMastery(txn, { userId, childIds: children.map((row) => row.child_id) });
        return result.changes;
      },
    });
  };

  const buildProgrammeEnrollmentReconcile = ({
    acknowledgedIds,
    acknowledgedAssignedChildIds,
    programmeId,
    pulledAt,
    bypassBreaker = false,
  } = {}) => {
    if (
      !Array.isArray(acknowledgedIds)
      || !Array.isArray(acknowledgedAssignedChildIds)
      || !programmeId
      || !pulledAt
    ) {
      throw new Error(
        'childProgrammeEnrollments reconcile requires acknowledgedIds, acknowledgedAssignedChildIds, programmeId, and pulledAt'
      );
    }
    const acknowledgedIdsJson = JSON.stringify(acknowledgedIds);
    const acknowledgedChildIdsJson = JSON.stringify(acknowledgedAssignedChildIds);
    const activeScopeSql = `
      from child_programme_enrollments
      where programme_id = ?
        and child_id in (select value from json_each(?))
        and ended_at is null
        and sync_status = 'synced'
    `;
    const absentSql = `${activeScopeSql}
      and id not in (select value from json_each(?))
    `;
    return (transaction) => runReconcileWithMassEndBreaker({
      transaction,
      scope: 'childProgrammeEnrollments',
      pulledAt,
      bypassBreaker,
      countCandidates: async (txn) => (
        await txn.getFirstAsync(
          `select count(*) as count ${activeScopeSql}`,
          programmeId,
          acknowledgedChildIdsJson
        )
      )?.count,
      countWouldEnd: async (txn) => (
        await txn.getFirstAsync(
          `select count(*) as count ${absentSql}`,
          programmeId,
          acknowledgedChildIdsJson,
          acknowledgedIdsJson
        )
      )?.count,
      apply: async (txn) => (
        await txn.runAsync(`
          update child_programme_enrollments
          set ended_at = ?,
              updated_at = ?
          where programme_id = ?
            and child_id in (select value from json_each(?))
            and ended_at is null
            and sync_status = 'synced'
            and id not in (select value from json_each(?))
        `, pulledAt, pulledAt, programmeId, acknowledgedChildIdsJson, acknowledgedIdsJson)
      ).changes,
    });
  };

  const buildClassMembershipReconcile = ({
    acknowledgedIds,
    acknowledgedChildIds,
    pulledAt,
    bypassBreaker = false,
  } = {}) => {
    if (!Array.isArray(acknowledgedIds) || !Array.isArray(acknowledgedChildIds) || !pulledAt) {
      throw new Error(
        'childClassMemberships reconcile requires acknowledgedIds, acknowledgedChildIds, and pulledAt'
      );
    }
    const acknowledgedIdsJson = JSON.stringify(acknowledgedIds);
    const acknowledgedChildIdsJson = JSON.stringify(acknowledgedChildIds);
    const activeScopeSql = `
      from child_class_memberships
      where child_id in (select value from json_each(?))
        and exited_at is null
        and sync_status = 'synced'
    `;
    const absentSql = `${activeScopeSql}
      and id not in (select value from json_each(?))
    `;
    return (transaction) => runReconcileWithMassEndBreaker({
      transaction,
      scope: 'childClassMemberships',
      pulledAt,
      bypassBreaker,
      countCandidates: async (txn) => (
        await txn.getFirstAsync(
          `select count(*) as count ${activeScopeSql}`,
          acknowledgedChildIdsJson
        )
      )?.count,
      countWouldEnd: async (txn) => (
        await txn.getFirstAsync(
          `select count(*) as count ${absentSql}`,
          acknowledgedChildIdsJson,
          acknowledgedIdsJson
        )
      )?.count,
      apply: async (txn) => (
        await txn.runAsync(`
          update child_class_memberships
          set exited_at = ?,
              updated_at = ?
          where child_id in (select value from json_each(?))
            and exited_at is null
            and sync_status = 'synced'
            and id not in (select value from json_each(?))
        `, pulledAt, pulledAt, acknowledgedChildIdsJson, acknowledgedIdsJson)
      ).changes,
    });
  };

  const buildClassRosterMembershipReconcile = ({
    rosterClassIds, rosterMembershipIds, deliveryChildIds, pulledAt, bypassBreaker = false,
  } = {}) => {
    if (!Array.isArray(rosterClassIds) || !Array.isArray(rosterMembershipIds)
      || !Array.isArray(deliveryChildIds) || !pulledAt) {
      return async () => ({ ended: 0, reconcileCompleted: false });
    }
    const classIdsJson = JSON.stringify(rosterClassIds);
    const deliveryIdsJson = JSON.stringify(deliveryChildIds);
    const membershipIdsJson = JSON.stringify(rosterMembershipIds);
    const activeScopeSql = `
      from child_class_memberships
      where class_id in (select value from json_each(?))
        and child_id not in (select value from json_each(?))
        and exited_at is null
        and sync_status = 'synced'
    `;
    const absentSql = `${activeScopeSql}
      and id not in (select value from json_each(?))
    `;
    return (transaction) => runReconcileWithMassEndBreaker({
      transaction,
      scope: 'classRosterMemberships',
      pulledAt,
      bypassBreaker,
      countCandidates: async (txn) => (await txn.getFirstAsync(
        `select count(*) as count ${activeScopeSql}`, classIdsJson, deliveryIdsJson
      ))?.count,
      countWouldEnd: async (txn) => (await txn.getFirstAsync(
        `select count(*) as count ${absentSql}`, classIdsJson, deliveryIdsJson, membershipIdsJson
      ))?.count,
      apply: async (txn) => (await txn.runAsync(`
        update child_class_memberships
        set exited_at = ?, updated_at = ?
        where class_id in (select value from json_each(?))
          and child_id not in (select value from json_each(?))
          and exited_at is null
          and sync_status = 'synced'
          and id not in (select value from json_each(?))
      `, pulledAt, pulledAt, classIdsJson, deliveryIdsJson, membershipIdsJson)).changes,
    });
  };

  const getChildNamesByIds = async (ids = []) => {
    if (!ids.length) return {};
    const db = await resolveDatabase(database);
    const rows = [];
    for (const batch of chunkArray([...new Set(ids)])) {
      rows.push(...await db.getAllAsync(
        `select id, first_name, last_name, hidden_at from children where id in (${sqlPlaceholders(batch.length)})`,
        ...batch
      ));
    }
    return Object.fromEntries(rows.map(row => [row.id, {
      name: `${row.first_name} ${row.last_name}`, hidden: Boolean(row.hidden_at),
    }]));
  };

  const getChildrenByIds = async (ids = []) => {
    if (!ids.length) return {};
    const db = await resolveDatabase(database);
    const rows = [];
    for (const batch of chunkArray([...new Set(ids)])) {
      rows.push(...await db.getAllAsync(
        `select id, first_name, last_name, reading_level, class_id, history_reference, hidden_at
         from children where id in (${sqlPlaceholders(batch.length)})`,
        ...batch
      ));
    }
    return Object.fromEntries(rows.map(row => [row.id, row]));
  };

  const getWriteAuthority = async ({ userId, childIds, transaction }) => {
    if (!childIds.length) return {};
    const db = transaction || await resolveDatabase(database);
    const rows = await db.getAllAsync(`
      select requested.value as id, child.created_by = ? as creator,
        exists (
          select 1 from child_ea_assignments a
          where a.child_id = requested.value and a.user_id = ? and a.unassigned_at is null
        ) as deliver,
        (exists (
          select 1 from class_ea_assignments a
          join child_class_memberships m on m.class_id = a.class_id and m.exited_at is null
          where m.child_id = requested.value and a.ea_user_id = ? and a.unassigned_at is null
        ) or exists (
          select 1 from group_ea_assignments a
          join child_group_memberships m on m.group_id = a.group_id and m.removed_at is null
          where m.child_id = requested.value and a.ea_user_id = ? and a.unassigned_at is null
        )) as indirect
      from json_each(?) requested
      left join children child on child.id = requested.value
    `, userId, userId, userId, userId, JSON.stringify([...new Set(childIds)]));
    // Class or group access lets a child attend but is not child-edit authority (ADR-0005);
    // `level` mirrors assertDeliveryChild, the guard updateChild applies.
    return Object.fromEntries(rows.map(row => {
      const deliver = Boolean(row.deliver);
      const attend = deliver || Boolean(row.indirect);
      return [row.id, { attend, deliver, level: Boolean(row.creator) || deliver }];
    }));
  };

  const getChildren = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync(
      'select * from children where history_reference = 0 order by first_name, last_name'
    );
    return rows.map(mapChild);
  };

  const save = async (child, { actorUserId = child.created_by || child.user_id, transaction } = {}) => (
    runWrite(transaction, async (txn) => {
      await assertNotHistoryReference(txn, child.id);
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
        const assignmentId = activeAssignment?.id || childEaAssignmentDomainId({ userId: actorUserId, childId: child.id });
        const assignment = normalizeSyncFields({
          id: assignmentId,
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
        const enrollmentId = activeEnrollment?.id || childProgrammeEnrollmentDomainId({ childId: child.id, programmeId });
        const enrollment = normalizeSyncFields({
          id: enrollmentId,
          child_id: child.id,
          programme_id: programmeId,
          enrolled_at: now,
          ended_at: null,
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
    await assertNotHistoryReference(txn, id);
    const existing = await txn.getFirstAsync('select * from children where id = ?', id);
    if (!existing) return false;
    await assertDeliveryChild(txn, id);

    const next = normalizeSyncFields({
      ...normalizeChildRecord({
        ...mapChild(existing),
        ...updates,
      }),
      id,
      updated_at: updates.updated_at || new Date().toISOString(),
      // A local edit owns its sync state, even when updates spreads a synced row.
      sync_status: 'pending',
      synced: false,
      last_sync_error: null,
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
      // Every full-row save describes a real roster child; this is how a history reference
      // row (CAP-004) is upgraded in place when the roster pull later returns the child.
      history_reference: 0,
      sync_status: child.sync_status || syncStatusFromSynced(child.synced),
    });
    const existing = await txn.getFirstAsync(
      'select history_reference from children where id = ?',
      record.id
    );
    if (existing?.history_reference === 1 && record.sync_status !== 'synced') {
      throw new Error('History reference children are read-only');
    }
    if (await serverPullWouldClobberPendingLocal(txn, 'children', record)) {
      return false;
    }
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
      row_version: assignment.row_version,
    });
    if (await serverPullWouldClobberPendingLocal(txn, 'child_ea_assignments', record)) {
      return false;
    }
    const supersede = await supersedeStaleActivePairRow(txn, {
      tableName: 'child_ea_assignments',
      pairColumns: ['user_id', 'child_id'],
      endColumn: 'unassigned_at',
      record,
    });
    if (supersede.action === 'skip') {
      return false;
    }
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
    if (await serverPullWouldClobberPendingLocal(txn, 'child_programme_enrollments', record)) {
      return false;
    }
    const supersede = await supersedeStaleActivePairRow(txn, {
      tableName: 'child_programme_enrollments',
      pairColumns: ['child_id', 'programme_id'],
      endColumn: 'ended_at',
      record,
    });
    if (supersede.action === 'skip') {
      return false;
    }
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
    if (await serverPullWouldClobberPendingLocal(txn, 'child_class_memberships', record)) {
      return false;
    }
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

  const saveServerChildRow = async (row, { transaction } = {}) => runWrite(transaction, async (txn) => {
    let record = row;
    if (row.class_id) {
      const classExists = await txn.getFirstAsync('select id from classes where id = ?', row.class_id);
      if (!classExists) {
        console.warn(`Pulled child ${row.id} referenced missing class ${row.class_id}; saving class_id as null`);
        record = { ...row, class_id: null };
      }
    }
    return saveChildRecord(record, { transaction: txn });
  });

  const saveServerChildRows = async (rows = []) => (
    saveServerRows(rows, saveServerChildRow, 'children')
  );

  const saveServerStaffChildRows = async (rows = [], { reconcile } = {}) => (
    saveServerRows(rows, saveStaffChild, 'child_ea_assignments', {
      reconcile: reconcile ? buildChildEaReconcile(reconcile) : undefined,
    })
  );
  const saveServerChildProgrammeEnrollmentRows = async (rows = [], { reconcile } = {}) => (
    saveServerRows(rows, saveChildProgrammeEnrollment, 'child_programme_enrollments', {
      reconcile: reconcile ? buildProgrammeEnrollmentReconcile(reconcile) : undefined,
    })
  );
  const saveServerChildClassMembershipRows = async (rows = [], { reconcile } = {}) => (
    saveServerRows(rows, saveChildClassMembership, 'child_class_memberships', {
      reconcile: reconcile ? buildClassMembershipReconcile(reconcile) : undefined,
    })
  );

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
        and children.history_reference = 0
      order by children.first_name, children.last_name
    `, userId, userId);

    return rows.map(mapChild);
  };

  const getAssessableChildren = async (userId) => {
    const db = await resolveDatabase(database);
    // Delivery is owned by getMyChildren. Its population must not drift when the
    // separate assessment roster gains class-only children.
    const [deliveryChildren, programmeId] = await Promise.all([
      getMyChildren(userId),
      getActiveProgrammeId(db, userId),
    ]);
    const deliveryIds = new Set(deliveryChildren.map((child) => child.id));
    const rows = await db.getAllAsync(`
      with assigned_memberships as (
        select ccm.child_id, ccm.id as membership_id, ccm.class_id,
          classes.grade, classes.home_language,
          row_number() over (
            partition by ccm.child_id
            order by case when ay.is_active = 1 then 0 else 1 end,
              ccm.enrolled_at desc, ccm.id asc
          ) as membership_rank
        from child_class_memberships ccm
        join classes on classes.id = ccm.class_id and classes.archived_at is null
        join class_ea_assignments cea
          on cea.class_id = ccm.class_id
         and cea.ea_user_id = ?
         and cea.programme_id = ?
         and cea.unassigned_at is null
        -- The year FK guarantees the row; left join keeps C3 prior-year memberships even if it ever lapses.
        left join academic_years ay on ay.id = ccm.academic_year_id
        where ccm.exited_at is null
      )
      select children.*,
        coalesce(m.class_id, children.class_id) as assessable_class_id,
        case when m.membership_id is not null then m.grade else fallback.grade end as grade,
        case when m.membership_id is not null then m.home_language else fallback.home_language end as home_language,
        m.membership_id
      from children
      left join assigned_memberships m
        on m.child_id = children.id and m.membership_rank = 1
      left join classes fallback on fallback.id = children.class_id
      where children.id in (select value from json_each(?))
        or (m.membership_id is not null
          and children.archived_at is null
          and children.history_reference = 0)
      order by children.first_name, children.last_name
    `, userId, programmeId, JSON.stringify([...deliveryIds]));

    return rows.map(({ assessable_class_id, ...row }) => mapChild({
      ...row,
      class_id: assessable_class_id,
      is_delivery: deliveryIds.has(row.id),
    }));
  };

  const assertDeliveryChild = async (txn, childId) => {
    const actor = getConnectionActor(txn) ?? database?.userId;
    const allowed = actor && await txn.getFirstAsync(`
      select 1 from children c where c.id = ? and (
        c.created_by = ? or exists (
          select 1 from child_ea_assignments a
          where a.child_id = c.id and a.user_id = ? and a.unassigned_at is null
        )
      )
    `, childId, actor, actor);
    if (!allowed) {
      const error = new Error('This child is not in your delivery scope');
      error.code = 'NOT_DELIVERY_CHILD';
      throw error;
    }
  };

  const archiveChild = async (childId, {
    actorUserId,
    archivedAt = new Date().toISOString(),
    archiveReason = null,
    transaction,
  } = {}) => runWrite(transaction, async (txn) => {
    await assertNotHistoryReference(txn, childId);
    await assertDeliveryChild(txn, childId);
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
    await assertNotHistoryReference(txn, childId);
    const child = await txn.getFirstAsync('select created_by from children where id = ?', childId);
    if (!child) return false;
    await assertDeliveryChild(txn, childId);
    const checks = [
      "select 1 from session_attendees where child_id = ? limit 1",
      "select 1 from assessments where child_id = ? limit 1",
      "select 1 from battery_runs where child_id = ? limit 1",
      "select 1 from letter_mastery where child_id = ? limit 1",
      "select 1 from skill_mastery where child_id = ? limit 1",
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

    // Sync status describes the latest edit, not whether INSERT was acknowledged.
    // Any attempted INSERT may have committed remotely, including a failed request
    // or one reset after reopening. Only an untouched INSERT proves local-only data.
    const localInsert = await txn.getFirstAsync(`
      select id from sync_outbox
      where table_name = 'children' and record_id = ? and operation = 'insert'
        and status = 'pending'
        and retry_count = 0 and last_error is null
    `, childId);
    await txn.runAsync(`
      delete from sync_outbox
      where table_name = 'children' and record_id = ?
        and (? = 1 or operation <> 'insert')
    `, childId, localInsert ? 1 : 0);

    for (const tableName of ['child_class_memberships', 'child_programme_enrollments', 'child_ea_assignments']) {
      // These active relationships disappear with the child; none of their
      // queued writes should survive to recreate them or fail their FK check.
      await txn.runAsync(`
        delete from sync_outbox where table_name = ?
          and record_id in (select id from ${tableName} where child_id = ?)
      `, tableName, childId);
      await txn.runAsync(`delete from ${tableName} where child_id = ?`, childId);
    }
    await txn.runAsync('delete from children where id = ?', childId);

    if (!localInsert) {
      await enqueueDomainOutbox(
        txn,
        'children',
        childId,
        'hard_delete',
        { id: childId }
      );
    }

    return true;
  });

  return {
    getChildren,
    getChildNamesByIds,
    getChildrenByIds,
    getWriteAuthority,
    getMyChildren,
    buildClassMembershipReconcile,
    buildClassRosterMembershipReconcile,
    getAssessableChildren,
    save,
    saveChild: save,
    saveChildRecord,
    saveServerChildRow,
    withTransaction: (task) => runWrite(null, task),
    saveServerChildRows,
    updateChild,
    getUnsyncedChildren,
    getStaffChildren,
    saveStaffChild,
    saveServerStaffChildRows,
    saveChildProgrammeEnrollment,
    saveServerChildProgrammeEnrollmentRows,
    saveChildClassMembership,
    saveServerChildClassMembershipRows,
    deleteStaffChild,
    getUnsyncedStaffChildren,
    archiveChild,
    deleteIfNoHistory,
  };
};

export const childrenRepository = createChildrenRepository();
