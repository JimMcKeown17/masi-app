import { v5 as uuidv5 } from 'uuid';
import { buildSyncPayload } from './syncPayload';
import { INCIDENT_KEY_NAMESPACE } from '../db/repositories/supportIncidentRepository';

export const utf8Bytes = text => {
  let n = 0;
  for (const c of text) { const cp = c.codePointAt(0); n += cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4; }
  return n;
};
export const terminalPayload = row => {
  let wirePayload; let wirePayloadError; let serverRecordId = row.record_id;
  try {
    wirePayload = buildSyncPayload(row.table_name, typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload, row.operation);
    serverRecordId = ['letter_mastery', 'skill_mastery'].includes(row.table_name) ? null : wirePayload?.id ?? wirePayload?.p_assessment?.id ?? row.record_id;
  } catch (error) { wirePayload = null; wirePayloadError = error.message; }
  return { table: row.table_name, operation: row.operation, recordId: row.record_id, serverRecordId,
    errorClass: row.error_class, errorCode: row.error_code, lastError: row.last_error, retryCount: row.retry_count,
    outboxCreatedAt: row.created_at, outboxUpdatedAt: row.updated_at, wirePayload,
    ...(wirePayloadError === undefined ? {} : { wirePayloadError }) };
};
export const normalizeErrorMessage = message => String(message ?? '')
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
  .replace(/\d+/g, '#').replace(/\s+/g, ' ').slice(0, 500);
export const appErrorPayload = ({ errorName = 'Error', message = '', stack = null, componentStack = null, components = [] }) => ({
  errorName, message, stack, componentStack, components,
  messageDigest: uuidv5(normalizeErrorMessage(message), INCIDENT_KEY_NAMESPACE),
});

export const truncateUtf8 = (text, maxBytes) => {
  let bytes = 0; let end = 0;
  for (const char of text) {
    const n = utf8Bytes(char);
    if (bytes + n > maxBytes) break;
    bytes += n; end += char.length;
  }
  return text.slice(0, end);
};
const mark = (object, key, original) => {
  object[`${key}Truncated`] = true;
  object[`${key}OriginalBytes`] = utf8Bytes(JSON.stringify(original));
};
const cutWire = (value, stringLimit, arrayLimit) => {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, arrayLimit).map(v => cutWire(v, stringLimit, arrayLimit));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' && !/(^id$|_id$|Id$)/.test(key) && utf8Bytes(item) > stringLimit) {
      out[key] = truncateUtf8(item, stringLimit);
      out[`${key}Truncated`] = true; out[`${key}OriginalBytes`] = utf8Bytes(item);
    } else if (Array.isArray(item)) {
      out[key] = cutWire(item, stringLimit, arrayLimit);
      if (item.length > arrayLimit) mark(out, key, item);
    } else out[key] = cutWire(item, stringLimit, arrayLimit);
  }
  return out;
};
export const boundedEnvelope = envelope => {
  // Never alter the persisted snapshot or producer's diagnostic payload.
  const out = { ...envelope, payload: { ...envelope.payload } };
  const size = () => utf8Bytes(JSON.stringify(out));
  if (size() <= 56000) return { envelope: out };
  if (out.payload.wirePayload) {
    for (const [strings, arrays] of [[2048, 20], [512, 5], [128, 1]]) {
      out.payload.wirePayload = cutWire(envelope.payload.wirePayload, strings, arrays);
      if (size() <= 56000) return { envelope: out };
    }
  }
  for (const key of ['stack', 'componentStack', 'sampleLastErrors']) {
    const original = out.payload[key];
    if (original == null) continue;
    out.payload[key] = typeof original === 'string' ? truncateUtf8(original, 2048)
      : original.slice(0, 10).map(v => truncateUtf8(String(v), 256));
    if (JSON.stringify(original) !== JSON.stringify(out.payload[key])) {
      mark(out.payload, key, original);
      if (typeof original === 'string') out.payload[`${key}OriginalBytes`] = utf8Bytes(original);
    }
    if (size() <= 56000) return { envelope: out };
  }
  return { error: 'TOO_LARGE' };
};

export const backlogPayload = (rows, now) => {
  const counts = key => rows.reduce((out, row) => { const k = row[key] ?? 'unknown'; out[k] = (out[k] || 0) + 1; return out; }, {});
  const oldest = rows[0];
  return { unsentByClass: counts('error_class'), unsentByTable: counts('table_name'), unsentByCode: counts('error_code'),
    oldestUnsentAgeHours: (Date.parse(now) - Date.parse(oldest.created_at)) / 3600000,
    oldestUnsent: { table: oldest.table_name, recordId: oldest.record_id, operation: oldest.operation,
      errorClass: oldest.error_class, errorCode: oldest.error_code, lastError: oldest.last_error },
    sampleLastErrors: [...new Set(rows.map(r => r.last_error).filter(Boolean))].slice(0, 10) };
};
export const breakerPayload = (scope, note) => ({ scope, scopeFamily: scope.split(':')[0],
  candidateCount: note.candidateCount, wouldEndCount: note.wouldEndCount, triggeredAt: note.triggeredAt });
export const historyFailurePayload = (scope, cursor, now) => ({ scope, scopeFamily: scope.split(':')[0],
  failureKind: cursor.lastFailureKind, lastFailureMessage: cursor.lastFailureMessage,
  failingForHours: (Date.parse(now) - Date.parse(cursor.lastFailureAt)) / 3600000, cursor });
