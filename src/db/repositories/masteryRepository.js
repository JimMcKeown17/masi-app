import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import {
  assertRlsRequiredFields,
  enqueueDomainOutbox,
  getActiveProgrammeId,
  mapDomainRow,
  normalizeSyncFields,
  resolveProgrammeId,
  shouldEnqueueOutbox,
  upsertDomainRecord,
} from './domainRepositoryUtils';
import { syncStatusFromSynced } from './sqliteRepositoryUtils';

const MASTERY_COLUMNS = [
  'id',
  'user_id',
  'child_id',
  'programme_id',
  'letter',
  'language',
  'source',
  'mastered_at',
  'deleted_at',
  'created_at',
  'updated_at',
  'sync_status',
  'last_sync_error',
  'server_updated_at',
];

const mapMastery = (row) => {
  const mapped = mapDomainRow(row);
  if (!mapped) return null;
  return {
    ...mapped,
    _deleted: Boolean(mapped.deleted_at),
  };
};

export const createMasteryRepository = ({ database } = {}) => {
  const runWrite = (transaction, task) => (
    transaction ? task(transaction) : runRepositoryTransaction(database, task)
  );

  const getLetterMastery = async ({
    transaction,
    userId,
    childId,
    programmeId,
  } = {}) => {
    const db = transaction || await resolveDatabase(database);
    const activeProgrammeId = programmeId || (userId ? await getActiveProgrammeId(db, userId) : null);
    if (userId && !activeProgrammeId) return [];
    const clauses = [];
    const params = [];
    if (activeProgrammeId) {
      clauses.push('programme_id = ?');
      params.push(activeProgrammeId);
    }
    if (userId) {
      clauses.push('user_id = ?');
      params.push(userId);
    }
    if (childId) {
      clauses.push('child_id = ?');
      params.push(childId);
    }
    const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
    const rows = await db.getAllAsync(
      `select * from letter_mastery ${where} order by created_at, id`,
      ...params
    );
    return rows.map(mapMastery);
  };

  const saveLetterMasteryRecord = async (record, { transaction } = {}) => runWrite(transaction, async (txn) => {
    assertRlsRequiredFields('letter_mastery', record, ['user_id']);
    const programmeId = await resolveProgrammeId(txn, {
      programmeId: record.programme_id,
      userId: record.user_id,
    });
    const existing = await txn.getFirstAsync(`
      select *
      from letter_mastery
      where user_id = ?
        and child_id = ?
        and programme_id = ?
        and letter = ?
        and language = ?
        and source = ?
        and deleted_at is null
      limit 1
    `, record.user_id, record.child_id, programmeId, record.letter, record.language, record.source || 'taught');
    const id = existing?.id || record.id;
    const masteryRecord = normalizeSyncFields({
      ...mapMastery(existing),
      ...record,
      id,
      programme_id: programmeId,
      source: record.source || 'taught',
      deleted_at: record._deleted ? (record.deleted_at || record.updated_at || new Date().toISOString()) : record.deleted_at || null,
      sync_status: record.sync_status || syncStatusFromSynced(record.synced),
    });

    await upsertDomainRecord(txn, {
      tableName: 'letter_mastery',
      columns: MASTERY_COLUMNS,
    }, masteryRecord);
    if (shouldEnqueueOutbox(masteryRecord)) {
      await enqueueDomainOutbox(txn, 'letter_mastery', id, masteryRecord.deleted_at ? 'archive' : 'insert', masteryRecord);
    }
    return true;
  });

  const updateLetterMasteryRecord = async (id, updates, { transaction } = {}) => runWrite(transaction, async (txn) => {
    const existing = await txn.getFirstAsync('select * from letter_mastery where id = ?', id);
    if (!existing) return false;
    const deletedAt = updates._deleted
      ? (updates.deleted_at || updates.updated_at || new Date().toISOString())
      : updates.deleted_at || null;
    const masteryRecord = normalizeSyncFields({
      ...mapMastery(existing),
      ...updates,
      id,
      deleted_at: deletedAt,
      sync_status: updates.sync_status || syncStatusFromSynced(updates.synced),
    });
    await upsertDomainRecord(txn, {
      tableName: 'letter_mastery',
      columns: MASTERY_COLUMNS,
    }, masteryRecord);
    if (shouldEnqueueOutbox(masteryRecord)) {
      await enqueueDomainOutbox(txn, 'letter_mastery', id, deletedAt ? 'archive' : 'update', masteryRecord);
    }
    return true;
  });

  const removeLetterMasteryRecord = async (id, options = {}) => updateLetterMasteryRecord(id, {
    _deleted: true,
    synced: false,
    updated_at: new Date().toISOString(),
  }, options);

  const getUnsyncedRecords = async () => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync("select * from letter_mastery where sync_status <> 'synced' order by created_at");
    return rows.map(mapMastery);
  };

  return {
    getLetterMastery,
    saveLetterMasteryRecord,
    updateLetterMasteryRecord,
    removeLetterMasteryRecord,
    getUnsyncedRecords,
  };
};

export const masteryRepository = createMasteryRepository();
