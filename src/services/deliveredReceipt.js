import { buildSyncPayload } from './syncPayload';
import {
  deliveredReceiptKey, incidentRepeatKey, uploadTerminalParts, wireDigest,
} from '../db/repositories/supportIncidentRepository';

// Lifecycle safety O1 item 2, the exact-revision delivered-receipt rule. A refused (terminal)
// outbox row R may leave the phone only when its upload_terminal receipt
//   (a) is sent (and is a schema 2 receipt), and
//   (b) has a delivery proof for its current report_generation, written by markSent from the
//       bounded snapshot the office accepted, and
//   (c) that proof names R's outbox id and R's current updated_at, its wire digest equals the
//       digest of buildSyncPayload of R as it is now, and nothing in the accepted copy was cut.
// has_unsent_changes is deliberately not a condition: the observer sets it on every 15-minute
// last-seen refresh of a live receipt, so it does not mean the work changed. (c) compares the
// proof with R itself, which is the stronger check.
//
// Returns 'delivered' (the office holds R's exact current revision), 'waiting' (it may still,
// once a receipt of this revision is sent) or 'support' (the phone can never prove it: the copy
// was cut or rejected, or the receipt predates delivery receipts).

const decode = (value) => {
  if (typeof value !== 'string') return value ?? null;
  try { return JSON.parse(value); } catch { return undefined; }
};

const currentWireDigest = (row) => {
  try {
    const payload = decode(row.payload);
    if (payload === undefined) return null;
    return wireDigest(buildSyncPayload(row.table_name, payload, row.operation));
  } catch {
    return null;
  }
};

export const readDeliveredReceipt = async (db, row) => {
  const incident = await db.getFirstAsync(`
    select id, status, schema_version, report_generation from support_incident_queue
    where kind = 'upload_terminal' and repeat_key = ?
  `, incidentRepeatKey(...uploadTerminalParts(row)));
  if (!incident) return { delivery: 'waiting', incidentId: null };
  const incidentId = incident.id;
  if (incident.status === 'rejected' || incident.schema_version !== 2) return { delivery: 'support', incidentId };
  if (incident.status !== 'sent') return { delivery: 'waiting', incidentId };
  const stored = await db.getFirstAsync('select value from local_state where key = ?', deliveredReceiptKey(incidentId));
  const proof = stored ? decode(stored.value) : null;
  if (!proof || proof.report_generation !== incident.report_generation) return { delivery: 'waiting', incidentId };
  const sameRevision = proof.outboxId === row.id && proof.outboxUpdatedAt === row.updated_at;
  if (sameRevision && proof.cut) return { delivery: 'support', incidentId };
  if (!sameRevision || proof.cut || proof.wireDigest !== currentWireDigest(row)) return { delivery: 'waiting', incidentId };
  return { delivery: 'delivered', incidentId };
};
