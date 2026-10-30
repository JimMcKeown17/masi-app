import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { resolveDatabase, runRepositoryTransaction } from './repositoryRuntime';
import { timestamp } from './sqliteRepositoryUtils';
import { getRuntimeDiagnostics } from '../../utils/runtimeDiagnostics';

export const ONCE_KINDS = ['left_behind_unsent_work', 'foreign_owner_in_file', 'legacy_shared_file_unsent'];
export const EVENT_KINDS = ['app_error_caught', 'ea_report', 'diagnostics_sent'];
export const SUPPORT_INCIDENT_KINDS = [...ONCE_KINDS, 'upload_terminal', 'upload_backlog_stale',
  'reconcile_breaker_tripped', 'pull_failing', ...EVENT_KINDS];
export const MAX_QUEUED_INCIDENTS = 200;
export const INCIDENT_KEY_NAMESPACE = 'd3a1c6f2-5b7e-4c1a-9f0e-2b8d4e6a7c10';
export const incidentRepeatKey = (...parts) => uuidv5(parts.map(String).join('\u0000'), INCIDENT_KEY_NAMESPACE);
export const incidentReportId = (id, generation) => uuidv5(`${id}:${generation}`, INCIDENT_KEY_NAMESPACE);
export const releaseIdentity = runtime => ({ version: runtime?.application?.version ?? null,
  build: runtime?.application?.build ?? null, updateId: runtime?.update?.id ?? null });
const json = value => JSON.stringify(value);
const decode = row => row && ({ ...row, repeatKey: row.repeat_key,
  ...Object.fromEntries(['payload', 'observed', 'first_observed', 'report_snapshot', 'last_sent_release']
    .map(key => [key, row[key] == null ? null : JSON.parse(row[key])])) });
const ref = row => ({ id: row.id, kind: row.kind, reportGeneration: row.report_generation });
const retryDelayMs = attempts => Math.min(5000 * 3 ** attempts, 900000);
const OUTCOME_FLAGS = ['bundleUploadFailed', 'bundleCaptureFailed', 'bundleDropped'];
export const withBundleOutcomes = (payload, previous) => {
  const body = { ...payload };
  for (const flag of OUTCOME_FLAGS) if (previous[flag]) body[flag] = true;
  return body;
};

// Transaction primitive. Native/async identity reads never belong in this boundary.
export const record = async (txn, kind, conditionParts, payload, { event = false, repeatKey } = {}) => {
  const key = repeatKey ?? incidentRepeatKey(...conditionParts);
  const old = decode(await txn.getFirstAsync('select * from support_incident_queue where kind = ? and repeat_key = ?', kind, key));
  const now = timestamp();
  const observed = getRuntimeDiagnostics();
  if (old) {
    if (old.schema_version === 1 || old.status === 'rejected' || (ONCE_KINDS.includes(kind) && old.status === 'sent')) {
      return { queued: false, incidentRef: ref(old), created: false, reason: 'duplicate' };
    }
    const body = withBundleOutcomes(payload, old.payload);
    await txn.runAsync(`update support_incident_queue set payload = ?, observed = ?, last_seen_at = max(last_seen_at, ?),
      first_seen_at = min(first_seen_at, ?), occurrence_count = occurrence_count + ?,
      updated_at = case when bundle_state = 'capturing' then updated_at else ? end where id = ?`,
    json(body), json(observed), now, now, event ? 1 : 0, now, old.id);
    if (old.report_snapshot || old.status === 'sent') {
      await txn.runAsync('update support_incident_queue set has_unsent_changes = 1 where id = ?', old.id);
    }
    if (old.status === 'sent' && !ONCE_KINDS.includes(kind) &&
        json(releaseIdentity(observed)) !== json(old.last_sent_release)) {
      await promote(txn, old.id, now);
      old.report_generation += 1;
    }
    return { queued: true, incidentRef: ref(old), created: false };
  }
  const evictedFiles = [];
  const { n } = await txn.getFirstAsync('select count(*) as n from support_incident_queue');
  if (n >= MAX_QUEUED_INCIDENTS) {
    const events = "('app_error_caught','ea_report','diagnostics_sent')";
    let victim = await txn.getFirstAsync(`select * from support_incident_queue
      where status in ('sent','rejected') and kind not in ${events} order by updated_at, id limit 1`);
    if (!victim) victim = await txn.getFirstAsync(`select * from support_incident_queue
      where status = 'sent' and kind in ${events} and has_unsent_changes = 0 order by updated_at, id limit 1`);
    if (!victim && ['ea_report','diagnostics_sent'].includes(kind)) victim = await txn.getFirstAsync(`
      select * from support_incident_queue where status = 'pending' and kind not in ${events} order by created_at, id limit 1`);
    if (!victim) {
      await txn.runAsync(`insert into local_state (key,value,updated_at) values ('support_incidents_dropped','1',?)
        on conflict(key) do update set value = cast(cast(value as integer) + 1 as text), updated_at = excluded.updated_at`, now);
      return { queued: false, created: false, reason: 'full' };
    }
    evictedFiles.push(victim.bundle_file, victim.screenshot_file);
    await txn.runAsync('delete from support_incident_queue where id = ?', victim.id);
  }
  const id = uuidv4();
  await txn.runAsync(`insert into support_incident_queue
    (id, kind, repeat_key, payload, observed, first_observed, first_seen_at, last_seen_at, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, kind, key, json(payload ?? {}), json(observed), json(observed), now, now, now, now);
  return { queued: true, incidentRef: { id, kind, reportGeneration: 1 }, created: true, evictedFiles: evictedFiles.filter(Boolean) };
};
// Prehashed Plan 3 episode keys are already stable. Do not hash them a second time.
export const enqueueSupportIncident = async (txn, { kind, repeatKey, payload }) => {
  const result = await record(txn, kind, [], payload, { repeatKey });
  return { ...result, queued: result.created, ...(!result.created && !result.reason ? { reason: 'duplicate' } : {}) };
};

const promote = (txn, id, now) => txn.runAsync(`update support_incident_queue set
  report_generation = report_generation + 1, report_snapshot = null, status = 'pending',
  has_unsent_changes = 0, attempts = 0, next_attempt_at = null, last_error = null, updated_at = ? where id = ?`, now, id);
const generationRef = value => typeof value === 'string' ? { id: value, reportGeneration: 1 } : value;

export const createSupportIncidentRepository = ({ database } = {}) => {
  const write = async (transaction, task) => {
    if (transaction) return task(transaction);
    let result;
    await runRepositoryTransaction(database, async txn => { result = await task(txn); });
    return result;
  };
  const DUE = `status = 'pending' and bundle_state != 'capturing' and (next_attempt_at is null or next_attempt_at <= ?)`;
  const listPending = async ({ limit = 20, now = timestamp() } = {}) => (await (await resolveDatabase(database)).getAllAsync(
    `select * from support_incident_queue where ${DUE} order by
      case when kind in ('ea_report','diagnostics_sent') then 0 when report_generation = 1 then 1 else 2 end,
      created_at, id limit ?`, now, Math.min(limit, 200))).map(decode);
  const mutate = (reference, transaction, task) => write(transaction, async txn => {
    const r = generationRef(reference);
    const row = decode(await txn.getFirstAsync('select * from support_incident_queue where id = ? and report_generation = ?', r.id, r.reportGeneration));
    if (!row || row.status !== 'pending') return null;
    return task(txn, row);
  });
  return {
    record,
    reserveCapture: async (txn, result) => {
      if (!result.queued || !result.created) return false;
      const kind = result.incidentRef.kind;
      const manual = ['ea_report', 'diagnostics_sent'].includes(kind);
      if (!manual && !['upload_terminal','app_error_caught','upload_backlog_stale','pull_failing','reconcile_breaker_tripped'].includes(kind)) return false;
      const now = timestamp();
      if (!manual) {
        const last = await txn.getFirstAsync("select value from local_state where key = 'support_auto_bundle_last_at'");
        if (last && Date.parse(JSON.parse(last.value)) > Date.parse(now) - 86400000) return false;
        await txn.runAsync(`insert into local_state (key,value,updated_at) values ('support_auto_bundle_last_at',?,?)
          on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`, json(now), now);
      }
      await txn.runAsync("update support_incident_queue set bundle_state = 'capturing', bundle_id = ?, updated_at = ? where id = ? and report_generation = ?",
        uuidv4(), now, result.incidentRef.id, result.incidentRef.reportGeneration);
      return true;
    },
    updateBundle: (reference, patch, { expectedState, transaction } = {}) => mutate(reference, transaction, async (txn, row) => {
      if (row.report_snapshot || (expectedState && row.bundle_state !== expectedState)) return null;
      const allowed = ['bundle_id','bundle_file','screenshot_file','bundle_state','bundle_attempts','bundle_path','screenshot_path'];
      const fields = Object.keys(patch).filter(k => allowed.includes(k));
      const body = { ...row.payload, ...patch.flags };
      return txn.runAsync(`update support_incident_queue set ${fields.map(k => `${k} = ?`).join(', ')}${fields.length ? ',' : ''}
        payload = ?, updated_at = ? where id = ? and report_generation = ?`,
      ...fields.map(k => patch[k]), json(body), timestamp(), row.id, row.report_generation);
    }),
    promoteDue: async (txn, now = timestamp()) => {
      const rows = await txn.getAllAsync(`select id from support_incident_queue where schema_version = 2
        and status = 'sent' and has_unsent_changes = 1 and last_sent_at <= ?
        and kind not in ('left_behind_unsent_work','foreign_owner_in_file','legacy_shared_file_unsent')`,
      new Date(Date.parse(now) - 86400000).toISOString());
      for (const row of rows) await promote(txn, row.id, now);
    },
    freeze: (reference, { transaction, prepare = snapshot => snapshot } = {}) => mutate(reference, transaction, async (txn, row) => {
      if (row.schema_version !== 2 || !['none', 'uploaded', 'failed'].includes(row.bundle_state)) return null;
      if (row.report_snapshot) return row.report_snapshot;
      const snapshot = prepare({ schema_version: 2, kind: row.kind, repeat_key: row.repeat_key,
        report_id: incidentReportId(row.id, row.report_generation), report_generation: row.report_generation,
        occurrence_count: row.occurrence_count, first_seen_at: row.first_seen_at, last_seen_at: row.last_seen_at,
        payload: row.payload, observed: row.observed, first_observed: row.first_observed,
        bundle_path: row.bundle_path, screenshot_path: row.screenshot_path });
      await txn.runAsync('update support_incident_queue set report_snapshot = ? where id = ? and report_snapshot is null', json(snapshot), row.id);
      return snapshot;
    }),
    markSent: (reference, { transaction, now = timestamp(), release } = {}) => mutate(reference, transaction, (txn, row) => txn.runAsync(`
      update support_incident_queue set status = 'sent', last_sent_at = ?, last_sent_release = ?, report_snapshot = null,
      next_attempt_at = null, last_error = null, updated_at = ? where id = ? and report_generation = ?`,
    now, json(releaseIdentity(release ?? row.report_snapshot?.observed ?? row.observed)), now, row.id, row.report_generation)),
    markRejected: (reference, errorMessage, { transaction } = {}) => mutate(reference, transaction, (txn, row) => txn.runAsync(`
      update support_incident_queue set status = 'rejected', last_error = ?, next_attempt_at = null, updated_at = ?
      where id = ? and report_generation = ?`, errorMessage, timestamp(), row.id, row.report_generation)),
    markAttemptFailed: (reference, errorMessage, { transaction, now = timestamp() } = {}) => mutate(reference, transaction, (txn, row) => txn.runAsync(`
      update support_incident_queue set attempts = attempts + 1, last_error = ?, next_attempt_at = ?, updated_at = ?
      where id = ? and report_generation = ?`, errorMessage, new Date(Date.parse(now) + retryDelayMs(row.attempts)).toISOString(),
    now, row.id, row.report_generation)),
    enqueue: (incident, { transaction } = {}) => write(transaction, txn => enqueueSupportIncident(txn, incident)),
    listPending,
    get: async id => decode(await (await resolveDatabase(database)).getFirstAsync('select * from support_incident_queue where id = ?', id)),
    countDue: async ({ now = timestamp() } = {}) => (await (await resolveDatabase(database)).getFirstAsync(
      `select count(*) as n from support_incident_queue where ${DUE}`, now)).n,
  };
};
