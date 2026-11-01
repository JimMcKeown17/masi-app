import { v4 as uuidv4 } from 'uuid';
import { getConnectionActor } from '../../session/signedInHandle';
import { getCurriculum, listStepKeys } from '../../../content/numeracy-curriculum';
import { skillMasteryDomainId } from '../domainId';
import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import {
  enqueueDomainOutbox,
  getActiveProgrammeId,
  mapDomainRow,
} from './domainRepositoryUtils';
import { chunkArray, sqlPlaceholders, upsertRecord } from './sqliteRepositoryUtils';
import { serverTimestampMicros, compareServerTuples, compareServerTimestamps } from '../../utils/serverTimestamps';
import { ensureHistoryReferenceChildren, insertOrIgnoreRows, selectRowsByIds } from './historyPageApply';
import { removeFromHistoryCoverage, resolveHistoryPullState } from './historyCoverage';
import { createSyncStateRepository } from './syncStateRepository';

export const STEP_KEY_PATTERN = /^[a-z_]+\.[0-9a-z]+$/;
const KNOWN_STEP_KEYS = new Set(listStepKeys(getCurriculum()));

const MASTERY_WRITE_COLUMNS = [
  'id', 'child_id', 'step_key', 'confirmed', 'changed_at', 'correction_id',
  'changed_by', 'programme_id', 'created_at', 'updated_at', 'sync_status', 'last_sync_error',
];

export const skillMasteryHistoryScope = (userId) => `skill_mastery_pull:${userId}`;

export const deleteUndeliveredSkillMastery = async (txn, { userId, childIds }) => {
  if (!childIds.length) return 0;
  const undelivered = await txn.getAllAsync(`
    select json_each.value as child_id from json_each(?) where not exists (
      select 1 from child_ea_assignments a
      where a.child_id = json_each.value and a.user_id = ? and a.unassigned_at is null
    )
  `, JSON.stringify([...new Set(childIds)]), userId);
  const ids = undelivered.map((row) => row.child_id);
  if (!ids.length) return 0;
  const result = await txn.runAsync(`
    delete from skill_mastery
    where child_id in (select value from json_each(?)) and sync_status = 'synced'
      and not exists (
        select 1 from sync_outbox o where o.table_name = 'skill_mastery'
          and o.record_id = skill_mastery.id and o.status in ('pending', 'failed', 'in_flight')
      )
  `, JSON.stringify(ids));
  await removeFromHistoryCoverage(txn, { scope: skillMasteryHistoryScope(userId), coverageKey: 'childIds', ids });
  return result.changes;
};

const mapMastery = (row) => {
  if (!row) return null;
  const { outbox_status, outbox_changed_at, ...record } = row;
  return mapDomainRow(record, { booleanColumns: ['confirmed'] });
};

export const applyCorrectionAcknowledgement = async (txn, {
  recordId, sentCorrectionId, result, outboxDeleted,
}) => {
  const local = await txn.getFirstAsync('select correction_id from skill_mastery where id = ?', recordId);
  if (!local) return 'none';

  const newerOwed = outboxDeleted && await txn.getFirstAsync(`
    select id from sync_outbox where table_name = 'skill_mastery' and record_id = ?
      and status in ('pending', 'failed', 'in_flight')
      and json_extract(payload, '$.correction_id') is not ? limit 1
  `, recordId, sentCorrectionId);
  // A pull may have replaced the displayed correction after a refusal. The outbox
  // CAS and any newer owed slot, rather than that display id, own acknowledgement.
  const canWrite = outboxDeleted && !newerOwed;
  if (result.outcome === 'acknowledged') {
    if (!canWrite) return 'none';
    await txn.runAsync('delete from skill_mastery where id = ?', recordId);
    return 'deleted';
  }

  if (!canWrite) {
    await txn.runAsync(`
      update skill_mastery set server_changed_at = ?, server_correction_id = ? where id = ?
    `, result.changed_at, result.correction_id, recordId);
    return 'ordering_only';
  }

  await txn.runAsync(`
    update skill_mastery
    set confirmed = ?, changed_at = ?, correction_id = ?, changed_by = ?,
        server_changed_at = ?, server_correction_id = ?,
        sync_status = 'synced', last_sync_error = null,
        programme_id = case when ? = 'superseded' then null else programme_id end
    where id = ?
  `, result.confirmed ? 1 : 0, result.changed_at, result.correction_id, result.changed_by,
  result.changed_at, result.correction_id, result.outcome, recordId);
  return 'written';
};

export const createSkillMasteryRepository = ({ database } = {}) => {
  const runWrite = (transaction, task) => (
    transaction ? task(transaction) : runRepositoryTransaction(database, task)
  );

  const setSkillMastery = async ({
    childId, stepKey, confirmed, changedAt, programmeId, transaction,
  } = {}) => {
    if (typeof childId !== 'string' || childId.trim().length === 0) {
      throw new TypeError('childId must be a non-empty string');
    }
    if (!KNOWN_STEP_KEYS.has(stepKey)) throw new TypeError('stepKey must be a step in the bundled curriculum');
    if (typeof confirmed !== 'boolean') throw new TypeError('confirmed must be a boolean');
    if (changedAt !== undefined && (typeof changedAt !== 'string' || !Number.isFinite(Date.parse(changedAt)))) {
      throw new TypeError('changedAt must be a valid date string');
    }
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const changed_at = new Date(Math.min(changedAt === undefined ? nowMs : Date.parse(changedAt), nowMs)).toISOString();
    const id = skillMasteryDomainId(childId, stepKey);

    return runWrite(transaction, async (txn) => {
      const changed_by = getConnectionActor(txn) ?? database?.userId ?? null;
      if (changed_by === null) throw new Error('skill_mastery.changed_by requires the signed-in EA');
      // Anchor the existing keyed read on delivery authority. The left join still
      // returns a row for an authorised child's first confirmation.
      const existing = await txn.getFirstAsync(`
        select lm.*, o.status as outbox_status, json_extract(o.payload, '$.changed_at') as outbox_changed_at
        from (select 1 from child_ea_assignments
          where child_id = ? and user_id = ? and unassigned_at is null limit 1) delivery
        left join (select * from skill_mastery lm where lm.id = ?) lm on 1 = 1
        left join sync_outbox o
          on o.table_name = 'skill_mastery' and o.record_id = ?
         and o.status in ('pending', 'failed', 'in_flight')
      `, childId, changed_by, id, id);
      if (!existing) {
        const error = new Error('Skill mastery requires an active delivery assignment');
        error.code = 'NOT_DELIVERY_CHILD';
        throw error;
      }
      // History repair can restore an older accepted row, and handover can then delete
      // it, while a newer refused and retried correction is still owed. The slot is read
      // by record id, and its payload time guards it even when no row is shown.
      const owedTimes = [existing.changed_at, existing.outbox_changed_at].map(Date.parse).filter(Number.isFinite);
      if (existing.outbox_status != null && owedTimes.length > 0
        && Math.min(Math.max(...owedTimes), nowMs) > Date.parse(changed_at)) {
        return existing.id == null ? null : mapMastery(existing);
      }

      const record = {
        id, child_id: childId, step_key: stepKey, confirmed, changed_at,
        correction_id: uuidv4(), changed_by,
        programme_id: programmeId ?? await getActiveProgrammeId(txn, changed_by),
        created_at: existing?.created_at ?? now,
        updated_at: now,
        sync_status: 'pending',
        last_sync_error: null,
        server_updated_at: existing?.server_updated_at ?? null,
        server_changed_at: existing?.server_changed_at ?? null,
        server_correction_id: existing?.server_correction_id ?? null,
      };
      // Only local-write columns enter the upsert; server ordering stays untouched.
      await upsertRecord(txn, {
        tableName: 'skill_mastery',
        columns: MASTERY_WRITE_COLUMNS,
        record,
        booleanColumns: ['confirmed'],
        preserveOnConflictColumns: ['created_at'],
      });
      const { child_id, correction_id, programme_id } = record;
      await enqueueDomainOutbox(txn, 'skill_mastery', id, 'update', {
        id, child_id, step_key: stepKey, confirmed, changed_at, correction_id, changed_by, programme_id,
      });
      return mapMastery(record);
    });
  };

  const getSkillMastery = async (options = {}) => {
    if (Object.hasOwn(options, 'userId') || Object.hasOwn(options, 'programmeId')) {
      throw new TypeError('getSkillMastery takes no userId or programmeId');
    }
    const { transaction, childId, childIds } = options;
    if (childIds?.length === 0) return [];
    const db = transaction || await resolveDatabase(database);
    const groups = childIds ? chunkArray([...new Set(childIds)], 500) : [null];
    const rows = [];
    for (const group of groups) {
      const clauses = ["sync_status <> 'terminal'"];
      const params = [];
      if (childId) {
        clauses.push('child_id = ?');
        params.push(childId);
      }
      if (group) {
        clauses.push(`child_id in (${sqlPlaceholders(group.length)})`);
        params.push(...group);
      }
      rows.push(...await db.getAllAsync(
        `select * from skill_mastery where ${clauses.join(' and ')} order by child_id, step_key`,
        ...params
      ));
    }
    // Child-id chunks can arrive in any order; match SQLite's text ordering after merging.
    rows.sort((a, b) => (
      a.child_id < b.child_id ? -1 : a.child_id > b.child_id ? 1
        : a.step_key < b.step_key ? -1 : a.step_key > b.step_key ? 1 : 0
    ));
    return rows.map(mapMastery);
  };

  const getSkillCorrectionTimes = async ({ childIds, transaction }) => {
    const times = Object.fromEntries(childIds.map(id => [id, {}]));
    if (!childIds.length) return times;
    const db = transaction || await resolveDatabase(database);
    const ids = JSON.stringify([...new Set(childIds)]);
    // A refused correction's payload can be newer than the row restored by a pull.
    // Neither row nor outbox status may hide that ordering evidence.
    const rows = await db.getAllAsync(`
      select child_id, step_key, changed_at from skill_mastery
      where child_id in (select value from json_each(?))
      union all
      select json_extract(payload, '$.child_id') as child_id,
        json_extract(payload, '$.step_key') as step_key, json_extract(payload, '$.changed_at') as changed_at
      from sync_outbox
      where table_name = 'skill_mastery'
        and json_extract(payload, '$.child_id') in (select value from json_each(?))
    `, ids, ids);
    for (const row of rows) {
      const previous = times[row.child_id][row.step_key];
      if (previous === undefined || compareServerTimestamps(row.changed_at, previous) === 1) {
        times[row.child_id][row.step_key] = row.changed_at;
      }
    }
    return times;
  };

  const saveHistoryPage = async (rows, { scope, pullState, admit }) => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const row of rows) {
      if (serverTimestampMicros(row?.changed_at) === null
        || typeof row.correction_id !== 'string' || !uuid.test(row.correction_id)
        || typeof row.confirmed !== 'boolean'
        || typeof row.step_key !== 'string' || !STEP_KEY_PATTERN.test(row.step_key)) {
        throw Object.assign(new TypeError('Invalid pulled skill mastery'), { kind: 'query' });
      }
    }
    return runRepositoryTransaction(database, async (txn) => {
      if (admit && !admit()) throw Object.assign(new Error('Skill mastery history run cancelled'), { kind: 'cancelled' });
      await ensureHistoryReferenceChildren(txn, rows);
      const ids = rows.map((row) => row.id);
      const existing = await selectRowsByIds(txn, 'skill_mastery', ids);
      const outstanding = new Set((await txn.getAllAsync(`
        select record_id from sync_outbox where table_name = 'skill_mastery'
          and status in ('pending', 'failed', 'in_flight')
          and record_id in (select value from json_each(?))
      `, JSON.stringify(ids))).map((row) => row.record_id));
      const absent = rows.filter((row) => !existing.has(row.id));
      await insertOrIgnoreRows(txn, {
        table: 'skill_mastery',
        columns: [...MASTERY_WRITE_COLUMNS, 'server_updated_at', 'server_changed_at', 'server_correction_id'],
        rows: absent.map((row) => ({ ...row, confirmed: row.confirmed ? 1 : 0,
          sync_status: 'synced', last_sync_error: null, server_updated_at: row.updated_at,
          server_changed_at: row.changed_at, server_correction_id: row.correction_id })),
      });
      let applied = 0;
      let skipped = 0;
      for (const row of rows) {
        const local = existing.get(row.id);
        if (!local) continue;
        if (['pending', 'failed'].includes(local.sync_status) || outstanding.has(row.id)) {
          skipped += 1;
          continue;
        }
        const order = local.server_changed_at == null || local.server_correction_id == null ? null
          : compareServerTuples([row.changed_at, row.correction_id], [local.server_changed_at, local.server_correction_id]);
        const repairEqual = order === 0 && (local.sync_status === 'terminal'
          || local.correction_id !== local.server_correction_id
          || local.changed_at !== local.server_changed_at
          || Boolean(local.confirmed) !== row.confirmed || local.changed_by !== row.changed_by);
        if (!['synced', 'terminal'].includes(local.sync_status)
          || !(order === null || order === 1 || repairEqual)) {
          skipped += 1;
          continue;
        }
        await txn.runAsync(`
          update skill_mastery set confirmed = ?, changed_at = ?, correction_id = ?, changed_by = ?,
            programme_id = ?, created_at = ?, updated_at = ?, server_updated_at = ?,
            server_changed_at = ?, server_correction_id = ?, sync_status = 'synced', last_sync_error = null
          where id = ?
        `, row.confirmed ? 1 : 0, row.changed_at, row.correction_id, row.changed_by,
        row.programme_id ?? null, row.created_at, row.updated_at, row.updated_at,
        row.changed_at, row.correction_id, row.id);
        applied += 1;
      }
      await createSyncStateRepository({ database }).setPullState(
        scope, await resolveHistoryPullState(txn, pullState), { transaction: txn }
      );
      if (admit && !admit()) throw Object.assign(new Error('Skill mastery history run cancelled'), { kind: 'cancelled' });
      return { inserted: absent.length, applied, skipped };
    });
  };

  return { setSkillMastery, getSkillMastery, getSkillCorrectionTimes, saveHistoryPage };
};
