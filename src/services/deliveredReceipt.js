import { buildSyncPayload } from './syncPayload';
import {
  deliveredReceiptKey, incidentRepeatKey, uploadTerminalParts, wireDigest,
} from '../db/repositories/supportIncidentRepository';

// Lifecycle safety O1 item 2, the exact-revision delivered-receipt rule. A refused (terminal)
// outbox row R may leave the phone only when its upload_terminal receipt
//   (a) is sent (and is a schema 2 receipt), and
//   (b) has a delivery proof for its current report_generation, written by markSent from the
//       bounded snapshot the office accepted, and
//   (c) that proof names R's outbox id, its wire digest equals the digest of buildSyncPayload of R
//       as it is now, and nothing in the accepted copy was cut.
// The match is on content, not on R's updated_at (2026-11-05): a forced pass re-sends refused
// history, and each refusal gives R a new updated_at with the same content, so a timestamp match
// would close the exit on every pull to refresh. The digest leaves out the send-time row_version
// stamp (wireDigest). The proof keeps outboxUpdatedAt for diagnostics only.
// has_unsent_changes is deliberately not a condition: the observer sets it on every 15-minute
// last-seen refresh of a live receipt, so it does not mean the work changed.
//
// Returns 'delivered' (the office holds R's current content in full), 'waiting' (it may, once a
// receipt of this content is sent) or 'support' (the phone cannot prove it: the accepted copy of
// this row was cut, the receipt was rejected, or it predates delivery receipts). A cut proof stays
// 'support' until a later send replaces it, even if R's content has changed since.

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
  if (proof.outboxId !== row.id) return { delivery: 'waiting', incidentId };
  if (proof.cut !== false) return { delivery: 'support', incidentId };
  if (proof.wireDigest !== currentWireDigest(row)) return { delivery: 'waiting', incidentId };
  return { delivery: 'delivered', incidentId };
};
