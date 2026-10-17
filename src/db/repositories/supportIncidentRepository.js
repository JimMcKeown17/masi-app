import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import { timestamp } from './sqliteRepositoryUtils';

export const SUPPORT_INCIDENT_KINDS = [
  'left_behind_unsent_work', 'foreign_owner_in_file', 'legacy_shared_file_unsent',
];
export const MAX_QUEUED_INCIDENTS = 200;
export const MAX_INCIDENT_PAYLOAD_BYTES = 8192;

// Fixed namespace for incident repeat keys. Never change it: that would re-report every situation.
const INCIDENT_KEY_NAMESPACE = 'd3a1c6f2-5b7e-4c1a-9f0e-2b8d4e6a7c10';

// Outbox ids carry record ids (`table:recordId:operation`). The repeat key identifies the
// situation without revealing it: deterministic for dedupe, one-way for privacy (spec T12).
export const incidentRepeatKey = (...parts) => uuidv5(
  parts.map(String).join('\u0000'), INCIDENT_KEY_NAMESPACE
);

// The outbox's retry curve (offlineSync getRetryDelay): 5 s, ×3 per failure, capped at 15 min.
const retryDelayMs = (attemptsBefore) => Math.min(5000 * 3 ** attemptsBefore, 15 * 60 * 1000);

const utf8Bytes = (text) => {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0);
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
};

// For callers already inside a transaction (the integrity scan). Counts only: the payload
// is built by the caller from counts and ids of outbox rows, never from domain records.
export const enqueueSupportIncident = async (txn, { kind, repeatKey, payload }) => {
  const json = JSON.stringify(payload ?? {});
  if (utf8Bytes(json) > MAX_INCIDENT_PAYLOAD_BYTES) return { queued: false, reason: 'too_large' };
  const existing = await txn.getFirstAsync(
    'select id from support_incident_queue where kind = ? and repeat_key = ?', kind, repeatKey
  );
  if (existing) return { queued: false, reason: 'duplicate' };
  const { n } = await txn.getFirstAsync('select count(*) as n from support_incident_queue');
  if (n >= MAX_QUEUED_INCIDENTS) {
    await txn.runAsync(`
      delete from support_incident_queue where id in (
        select id from support_incident_queue where status in ('sent', 'rejected')
        order by updated_at, id limit ?
      )`, n - MAX_QUEUED_INCIDENTS + 1);
    const after = await txn.getFirstAsync('select count(*) as n from support_incident_queue');
    if (after.n >= MAX_QUEUED_INCIDENTS) {
      console.warn('[SupportIncidents] queue full; incident dropped', { kind });
      return { queued: false, reason: 'full' };
    }
  }
  const now = timestamp();
  await txn.runAsync(`
    insert into support_incident_queue (id, kind, repeat_key, payload, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?)`, uuidv4(), kind, repeatKey, json, now, now);
  return { queued: true };
};

export const createSupportIncidentRepository = ({ database } = {}) => {
  const runWrite = async (transaction, task) => {
    if (transaction) return task(transaction);
    // Expo transactions resolve void, so preserve the repository result explicitly.
    let result;
    await runRepositoryTransaction(database, async (txn) => {
      result = await task(txn);
    });
    return result;
  };
  const enqueue = (incident, { transaction } = {}) => runWrite(
    transaction, (txn) => enqueueSupportIncident(txn, incident)
  );
  const DUE = `status = 'pending' and (next_attempt_at is null or next_attempt_at <= ?)`;
  const listPending = async ({ limit = 20, now = timestamp() } = {}) => {
    const db = await resolveDatabase(database);
    const rows = await db.getAllAsync(`
      select id, kind, repeat_key, payload, attempts from support_incident_queue
      where ${DUE} order by created_at, id limit ?`, now, limit);
    return rows.map((row) => ({
      id: row.id, kind: row.kind, repeatKey: row.repeat_key,
      payload: JSON.parse(row.payload), attempts: row.attempts,
    }));
  };
  const countDue = async ({ now = timestamp() } = {}) => {
    const db = await resolveDatabase(database);
    const { n } = await db.getFirstAsync(`select count(*) as n from support_incident_queue where ${DUE}`, now);
    return n;
  };
  const close = (status) => (id, errorMessage = null, { transaction } = {}) => runWrite(
    transaction, (txn) => txn.runAsync(`update support_incident_queue
      set status = ?, last_error = ?, next_attempt_at = null, updated_at = ? where id = ?`,
    status, errorMessage, timestamp(), id)
  );
  const markAttemptFailed = (id, errorMessage, { now = timestamp(), transaction } = {}) => runWrite(
    transaction, async (txn) => {
      const row = await txn.getFirstAsync('select attempts from support_incident_queue where id = ?', id);
      if (!row) return;
      const nextAttemptAt = new Date(Date.parse(now) + retryDelayMs(row.attempts)).toISOString();
      await txn.runAsync(`update support_incident_queue
        set attempts = attempts + 1, last_error = ?, next_attempt_at = ?, updated_at = ? where id = ?`,
      errorMessage, nextAttemptAt, now, id);
    }
  );
  return {
    enqueue,
    listPending,
    countDue,
    markSent: (id, options) => close('sent')(id, null, options),
    markRejected: close('rejected'),
    markAttemptFailed,
  };
};
