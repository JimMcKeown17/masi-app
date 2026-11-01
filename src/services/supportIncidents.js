import { incidentRepeatKey, ONCE_KINDS, releaseIdentity, withBundleOutcomes } from '../db/repositories/supportIncidentRepository';
import NetInfo from '@react-native-community/netinfo';
import { Paths } from 'expo-file-system/next';
import { v4 as uuidv4 } from 'uuid';
import { buildDiagnosticBundle, cleanupBundleFiles, uploadIncidentBundle } from './diagnosticBundle';
import { assertExportHandle } from '../db/debugDump';
import { utf8Bytes, boundedEnvelope, appErrorPayload, terminalPayload, backlogPayload, breakerPayload, historyFailurePayload } from './incidentPayloads';
import { getRuntimeDiagnostics } from '../utils/runtimeDiagnostics';
import { getInstallId } from './installId';
import { isStaleActorError } from '../session/staleActor';

export const buildIncidentEnvelope = async () => {
  const diagnostics = getRuntimeDiagnostics();
  return {
    appVersion: diagnostics.application.version,
    buildNumber: diagnostics.application.build,
    updateId: diagnostics.update.id,
    backend: diagnostics.backend.projectId,
    installId: await getInstallId(),
  };
};

const INVALID_INCIDENT = '22023';
const canonicalJson = value => JSON.stringify(value, (_key, item) => (
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item
));

export const buildDelivery = async (handle, installId) => {
  assertExportHandle(handle);
  const profile = await handle.services.deviceProfile.get();
  const network = await NetInfo.fetch();
  assertExportHandle(handle);
  const db = await handle.getReader();
  const groups = await db.getAllAsync('select status,error_class,count(*) as n from sync_outbox group by status,error_class');
  const byStatus = {}; const byClass = {};
  for (const group of groups) {
    byStatus[group.status] = (byStatus[group.status] || 0)+group.n;
    if (group.error_class) byClass[group.error_class] = (byClass[group.error_class] || 0)+group.n;
  }
  const meta = await handle.services.repositories.syncState.getSyncMeta();
  const runtime = getRuntimeDiagnostics();
  const droppedIncidents = await handle.services.repositories.localState.get('support_incidents_dropped',0);
  assertExportHandle(handle);
  return { installId, userId: handle.userId, email: profile?.email ?? null,
    displayName: profile?.displayName ?? ([profile?.first_name,profile?.last_name].filter(Boolean).join(' ') || null),
    appVersion: runtime.application.version, buildNumber: runtime.application.build, updateId: runtime.update.id,
    runtime, network, freeDiskBytes: Paths.availableDiskSpace ?? null, totalDiskBytes: Paths.totalDiskSpace ?? null,
    outboxSummary: { byStatus, byClass }, lastSuccessfulSyncTime: meta.lastSuccessfulSyncTime,
    lastServerResponseAt: handle.lastServerResponseAt ?? null, droppedIncidents: Number(droppedIncidents), sentAt: new Date().toISOString() };
};

export const drainSupportIncidents = async ({
  handle, repository, supabaseClient, enqueueRequest, envelope, limit = 20,
}) => {
  const outcome = { sent: 0, rejected: 0, failed: 0 };
  for (const row of await repository.listPending({ limit: Math.min(20, limit) })) {
    const incidentRef = { id: row.id, kind: row.kind, reportGeneration: row.report_generation };
    let response; let snapshot;
    try {
      if (row.schema_version === 1) {
        response = await enqueueRequest(() => supabaseClient.rpc('report_mobile_support_incident', {
          p_kind: row.kind, p_repeat_key: `${envelope.installId}:${row.repeatKey}`, p_payload: { ...row.payload, ...envelope },
        }));
      } else {
        assertExportHandle(handle);
        if (!await uploadIncidentBundle(handle, incidentRef)) { outcome.failed++; break; }
        const delivery = await buildDelivery(handle, envelope.installId);
        snapshot = await repository.freeze(incidentRef, { prepare: candidate => {
          const bounded = boundedEnvelope({ ...candidate, repeat_key: `${delivery.installId}:${candidate.repeat_key}`, delivery });
          if (bounded.error) throw Object.assign(new Error('TOO_LARGE'), { code: 'TOO_LARGE' });
          return { ...candidate, payload: bounded.envelope.payload };
        } });
        if (!snapshot) continue;
        const report = { ...snapshot, repeat_key: `${delivery.installId}:${snapshot.repeat_key}`, delivery };
        if (utf8Bytes(JSON.stringify(report)) > 56000) {
          await repository.markRejected(incidentRef, 'TOO_LARGE'); outcome.rejected++; continue;
        }
        response = await enqueueRequest(() => supabaseClient.rpc('report_mobile_support_incident_v2', { p_envelope: report }));
      }
    } catch (error) {
      if (isStaleActorError(error)) throw error;
      response = { error };
    }
    if (isStaleActorError(response?.error)) throw response.error;
    const accepted = row.schema_version === 1 ? response?.data === true || response?.data === false
      : ['inserted','duplicate'].includes(response?.data?.status);
    if (!response?.error && accepted) {
      await repository.markSent(incidentRef, { release: snapshot?.observed }); outcome.sent++;
    } else if ([INVALID_INCIDENT, 'TOO_LARGE'].includes(response?.error?.code)) {
      await repository.markRejected(incidentRef, response.error.message || INVALID_INCIDENT); outcome.rejected++;
    } else {
      await repository.markAttemptFailed(incidentRef, response?.error?.message || 'Incident report failed'); outcome.failed++; break;
    }
  }
  return outcome;
};

export const observeStandingConditions = async handle => {
  assertExportHandle(handle);
  const db = await handle.getReader();
  const terminal = await db.getAllAsync("select * from sync_outbox where status = 'terminal' and owner_user_id = ?", handle.userId);
  const foreign = await db.getAllAsync("select id,table_name from sync_outbox where status = 'terminal' and error_code = 'FOREIGN_OWNER' and owner_user_id != ? order by id", handle.userId);
  const now = new Date().toISOString();
  const backlog = await db.getAllAsync("select * from sync_outbox where status in ('pending','failed') and owner_user_id = ? order by created_at, id", handle.userId);
  const states = await db.getAllAsync(`select scope,cursor from sync_state where
    (scope >= 'pull_reconcile_breaker:' and scope < 'pull_reconcile_breaker;') or
    (scope >= 'session_history_pull:' and scope < 'session_history_pull;') or
    (scope >= 'assessment_history_pull:' and scope < 'assessment_history_pull;') or
    (scope >= 'battery_run_history_pull:' and scope < 'battery_run_history_pull;') or
    (scope >= 'skill_mastery_pull:' and scope < 'skill_mastery_pull;') or
    (scope >= 'letter_mastery_pull:' and scope < 'letter_mastery_pull;')`);
  const conditions = terminal.map(row => ({ kind: 'upload_terminal',
    parts: [row.table_name, row.record_id, row.operation, row.created_at, row.error_class, row.error_code], payload: terminalPayload(row) }));
  if (backlog.length && Date.parse(backlog[0].created_at) < Date.parse(now)-72*3600000 &&
      Date.parse(handle.lastServerResponseAt) >= Date.parse(now)-86400000) {
    conditions.push({kind:'upload_backlog_stale',parts:['backlog'],payload:backlogPayload(backlog,now)});
  }
  for (const state of states) {
    let cursor; try { cursor = JSON.parse(state.cursor); } catch { continue; }
    if (!cursor) continue;
    if (state.scope.startsWith('pull_reconcile_breaker:')) {
      const scope = cursor.scope ?? state.scope.slice('pull_reconcile_breaker:'.length);
      conditions.push({kind:'reconcile_breaker_tripped',parts:[scope],payload:breakerPayload(scope,cursor)});
    } else if (Date.parse(cursor.lastFailureAt) <= Date.parse(now)-86400000 &&
        !(Date.parse(cursor.lastSuccessAt) > Date.parse(cursor.lastFailureAt))) {
      const payload = historyFailurePayload(state.scope,cursor,now);
      conditions.push({kind:'pull_failing',parts:[payload.scopeFamily,payload.failureKind],payload});
    }
  }
  if (foreign.length) {
    const foreignByTable = {};
    for (const row of foreign) foreignByTable[row.table_name] = (foreignByTable[row.table_name] || 0)+1;
    conditions.push({kind:'foreign_owner_in_file',parts:['foreign',...foreign.map(row=>row.id)],
      payload:{foreignTotal:foreign.length,foreignByTable}});
  }
  // At most 200 live conditions. Unchanged refreshes need not acquire the domain writer.
  const queue = await db.getAllAsync(`select kind,repeat_key,schema_version,status,bundle_state,updated_at,
    has_unsent_changes,last_sent_at,last_seen_at,payload,observed from support_incident_queue`);
  const release = canonicalJson(releaseIdentity(getRuntimeDiagnostics()));
  const changed = conditions.filter(condition => {
    const old = queue.find(row => row.kind === condition.kind && row.repeat_key === incidentRepeatKey(...condition.parts));
    if (!old) return true;
    if (old.schema_version !== 2 || old.status === 'rejected' ||
        (ONCE_KINDS.includes(old.kind) && old.status === 'sent')) return false;
    const oldPayload = JSON.parse(old.payload);
    return canonicalJson(withBundleOutcomes(condition.payload, oldPayload)) !== canonicalJson(oldPayload) ||
      release !== canonicalJson(releaseIdentity(JSON.parse(old.observed))) ||
      Date.parse(old.last_seen_at) <= Date.parse(now) - 15 * 60000;
  });
  const recoveryAt = new Date(Date.parse(now)-600000).toISOString();
  const hasTransition = queue.some(row => (row.bundle_state === 'capturing' && row.updated_at <= recoveryAt) ||
    (row.schema_version === 2 && row.status === 'sent' && row.has_unsent_changes && !ONCE_KINDS.includes(row.kind) &&
      Date.parse(row.last_sent_at) <= Date.parse(now)-86400000));
  assertExportHandle(handle);
  if (!changed.length && !hasTransition) return;
  const repository = handle.services.repositories.supportIncidents;
  const captures = []; const evicted = [];
  await handle.withTransaction(async txn => {
    for (const condition of changed) {
      const result = await repository.record(txn,condition.kind,condition.parts,condition.payload,{event:false});
      evicted.push(...(result.evictedFiles ?? []));
      if (await repository.reserveCapture(txn,result)) captures.push(result.incidentRef);
    }
    const staleCaptures = await txn.getAllAsync("select id,payload from support_incident_queue where bundle_state = 'capturing' and updated_at <= ?", recoveryAt);
    for (const row of staleCaptures) await txn.runAsync(`update support_incident_queue set bundle_state = 'failed',
      payload = ?, updated_at = ? where id = ? and bundle_state = 'capturing'`,
    JSON.stringify({...JSON.parse(row.payload),bundleCaptureFailed:true}),now,row.id);
    await repository.promoteDue(txn,now);
  });
  cleanupBundleFiles(handle,evicted);
  for (const incidentRef of captures) {
    void buildDiagnosticBundle(handle,{trigger:incidentRef.kind,incidentRef}).catch(error => {
      // Revocation leaves capturing for the next open's ten-minute recovery (N1).
      if (!isStaleActorError(error)) console.warn('Automatic diagnostic bundle capture failed:', error?.message ?? String(error));
    });
  }
};

export const captureEvent = async (handle, kind, payload, { conditionParts, screenshotFile } = {}) => {
  assertExportHandle(handle);
  if (!['ea_report','diagnostics_sent','app_error_caught'].includes(kind)) throw new Error('Unsupported incident event');
  const body = kind === 'app_error_caught' ? appErrorPayload(payload) : payload;
  const parts = conditionParts ?? (kind === 'app_error_caught'
    ? [body.errorName, body.messageDigest, body.components[0] ?? ''] : [uuidv4()]);
  const repository = handle.services.repositories.supportIncidents;
  let result; let capture;
  await handle.withTransaction(async txn => {
    result = await repository.record(txn, kind, parts, body, { event: true });
    capture = await repository.reserveCapture(txn, result);
  });
  cleanupBundleFiles(handle, result.evictedFiles ?? []);
  if (!result.queued) return { saved: false, reason: result.reason };
  if (capture) await buildDiagnosticBundle(handle, { trigger: kind, incidentRef: result.incidentRef, screenshotFile });
  assertExportHandle(handle);
  return { incidentRef: result.incidentRef, saved: true };
};
export const getDeliveryState = async (handle, incidentRef) => {
  const row = await handle.services.repositories.supportIncidents.get(incidentRef.id);
  assertExportHandle(handle);
  if (!row || row.report_generation < incidentRef.reportGeneration) return 'unknown';
  // Promotion is possible only after acknowledgement, so earlier generations are sent.
  if (row.report_generation > incidentRef.reportGeneration) return 'sent';
  return row.status;
};
