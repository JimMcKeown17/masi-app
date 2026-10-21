import { v4 as uuidv4 } from 'uuid';
import { getConnectionActor } from '../../session/signedInHandle';
import { PEDAGOGICAL_ORDERS } from '../../utils/assessmentRegistry';
import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import {
  enqueueDomainOutbox,
  getActiveProgrammeId,
  letterMasteryDomainId,
  mapDomainRow,
} from './domainRepositoryUtils';
import { chunkArray, sqlPlaceholders, upsertRecord } from './sqliteRepositoryUtils';

const MASTERY_WRITE_COLUMNS = [
  'id', 'child_id', 'letter', 'language', 'confirmed', 'changed_at', 'correction_id',
  'changed_by', 'programme_id', 'created_at', 'updated_at', 'sync_status', 'last_sync_error',
];

const mapMastery = (row) => {
  if (!row) return null;
  const { outbox_status, ...record } = row;
  return mapDomainRow(record, { booleanColumns: ['confirmed'] });
};

export const applyCorrectionAcknowledgement = async (txn, {
  recordId, sentCorrectionId, result, outboxDeleted,
}) => {
  const local = await txn.getFirstAsync('select correction_id from letter_mastery where id = ?', recordId);
  if (!local) return 'none';

  const canWrite = outboxDeleted && local.correction_id === sentCorrectionId;
  if (result.outcome === 'acknowledged') {
    if (!canWrite) return 'none';
    await txn.runAsync('delete from letter_mastery where id = ?', recordId);
    return 'deleted';
  }

  if (!canWrite) {
    await txn.runAsync(`
      update letter_mastery set server_changed_at = ?, server_correction_id = ? where id = ?
    `, result.changed_at, result.correction_id, recordId);
    return 'ordering_only';
  }

  await txn.runAsync(`
    update letter_mastery
    set confirmed = ?, changed_at = ?, correction_id = ?, changed_by = ?,
        server_changed_at = ?, server_correction_id = ?,
        sync_status = 'synced', last_sync_error = null,
        programme_id = case when ? = 'superseded' then null else programme_id end
    where id = ?
  `, result.confirmed ? 1 : 0, result.changed_at, result.correction_id, result.changed_by,
  result.changed_at, result.correction_id, result.outcome, recordId);
  return 'written';
};

export const createMasteryRepository = ({ database } = {}) => {
  const runWrite = (transaction, task) => (
    transaction ? task(transaction) : runRepositoryTransaction(database, task)
  );

  const setLetterMastery = async ({
    childId, letter, language, confirmed, changedAt, programmeId, transaction,
  } = {}) => {
    if (typeof childId !== 'string' || childId.trim().length === 0) {
      throw new TypeError('childId must be a non-empty string');
    }
    const order = PEDAGOGICAL_ORDERS[language];
    if (!Array.isArray(order)) throw new TypeError('language must have a pedagogical order');
    if (!order.includes(letter)) throw new TypeError('letter must be in the language pedagogical order');
    if (typeof confirmed !== 'boolean') throw new TypeError('confirmed must be a boolean');
    if (changedAt !== undefined && (typeof changedAt !== 'string' || !Number.isFinite(Date.parse(changedAt)))) {
      throw new TypeError('changedAt must be a valid date string');
    }
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const changed_at = new Date(Math.min(changedAt === undefined ? nowMs : Date.parse(changedAt), nowMs)).toISOString();
    const id = letterMasteryDomainId({ childId, letter, language });

    return runWrite(transaction, async (txn) => {
      const changed_by = getConnectionActor(txn);
      if (changed_by === null) throw new Error('letter_mastery.changed_by requires the signed-in EA');
      const existing = await txn.getFirstAsync(`
        select lm.*, o.status as outbox_status
        from letter_mastery lm
        left join sync_outbox o
          on o.table_name = 'letter_mastery' and o.record_id = lm.id
         and o.status in ('pending', 'failed', 'in_flight')
        where lm.id = ?
      `, id);
      if (existing?.outbox_status != null
        && Math.min(Date.parse(existing.changed_at), nowMs) > Date.parse(changed_at)) {
        return mapMastery(existing);
      }

      const record = {
        id, child_id: childId, letter, language, confirmed, changed_at,
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
        tableName: 'letter_mastery',
        columns: MASTERY_WRITE_COLUMNS,
        record,
        booleanColumns: ['confirmed'],
        preserveOnConflictColumns: ['created_at'],
      });
      const { child_id, correction_id, programme_id } = record;
      await enqueueDomainOutbox(txn, 'letter_mastery', id, 'update', {
        id, child_id, letter, language, confirmed, changed_at, correction_id, changed_by, programme_id,
      });
      return mapMastery(record);
    });
  };

  const getLetterMastery = async (options = {}) => {
    if (Object.hasOwn(options, 'userId') || Object.hasOwn(options, 'programmeId')) {
      throw new TypeError('getLetterMastery takes no userId or programmeId');
    }
    const { transaction, childId, childIds, language } = options;
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
      if (language) {
        clauses.push('language = ?');
        params.push(language);
      }
      rows.push(...await db.getAllAsync(
        `select * from letter_mastery where ${clauses.join(' and ')} order by child_id, letter`,
        ...params
      ));
    }
    // Child-id chunks can arrive in any order; match SQLite's text ordering after merging.
    rows.sort((a, b) => (
      a.child_id < b.child_id ? -1 : a.child_id > b.child_id ? 1
        : a.letter < b.letter ? -1 : a.letter > b.letter ? 1 : 0
    ));
    return rows.map(mapMastery);
  };

  const getUnsyncedRecords = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync("select * from letter_mastery where sync_status <> 'synced' order by created_at");
    return rows.map(mapMastery);
  };

  return { setLetterMastery, getLetterMastery, getUnsyncedRecords };
};

export const masteryRepository = createMasteryRepository();
