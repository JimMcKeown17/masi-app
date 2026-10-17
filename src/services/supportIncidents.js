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

export const drainSupportIncidents = async ({
  repository, supabaseClient, enqueueRequest, envelope, limit = 20,
}) => {
  const outcome = { sent: 0, rejected: 0, failed: 0 };
  for (const row of await repository.listPending({ limit })) {
    let response;
    try {
      response = await enqueueRequest(() => supabaseClient.rpc('report_mobile_support_incident', {
        p_kind: row.kind,
        p_repeat_key: `${envelope.installId}:${row.repeatKey}`,
        p_payload: { ...row.payload, ...envelope },
      }));
    } catch (error) {
      if (isStaleActorError(error)) throw error;
      response = { error };
    }
    if (isStaleActorError(response?.error)) throw response.error;
    if (!response?.error) {
      await repository.markSent(row.id);
      outcome.sent += 1;
    } else if (response.error.code === INVALID_INCIDENT) {
      await repository.markRejected(row.id, response.error.message || INVALID_INCIDENT);
      outcome.rejected += 1;
    } else {
      // Transport or auth trouble: keep it, stop this pass, retry on a later pass.
      await repository.markAttemptFailed(row.id, response.error.message || 'Incident report failed');
      outcome.failed += 1;
      break;
    }
  }
  return outcome;
};
