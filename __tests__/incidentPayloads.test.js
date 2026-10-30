import * as builders from '../src/services/incidentPayloads';
import { buildSyncPayload } from '../src/services/syncPayload';
const row = { table_name: 'session_attendees', record_id: 'local', operation: 'insert',
  payload: JSON.stringify({ id: 'local', session_id: 's1', child_id: 'child-raw', notes: 'raw note' }),
  error_class: 'terminal', error_code: 'RLS_DENIED', last_error: 'raw server text', retry_count: 8,
  created_at: 'first', updated_at: 'last' };
test('terminal evidence uses the actual wire serializer and retains raw identifiers/errors', () => {
  expect(typeof builders.terminalPayload).toBe('function');
  const wire = buildSyncPayload(row.table_name, JSON.parse(row.payload), row.operation);
  expect(builders.terminalPayload(row)).toEqual({ table: row.table_name, operation: row.operation,
    recordId: 'local', serverRecordId: wire.id, errorClass: 'terminal', errorCode: 'RLS_DENIED',
    lastError: 'raw server text', retryCount: 8, outboxCreatedAt: 'first', outboxUpdatedAt: 'last', wirePayload: wire });
});
test('complete envelope truncates UTF-8 evidence with sibling markers, keeping ids and frozen provenance', () => {
  expect(typeof builders.boundedEnvelope).toBe('function');
  const envelope = { schema_version: 2, observed: { application: { version: 'old' } }, first_observed: {},
    payload: { wirePayload: { id: 'keep', notes: '😀'.repeat(40000), items: Array.from({length: 400}, (_, i) => ({ id: `id${i}`, text: 'é'.repeat(300) })) }, stack: 'é'.repeat(40000) },
    delivery: { runtime: { application: { version: 'new' } } }, bundle_path: 'ea/path' };
  const result = builders.boundedEnvelope(envelope);
  expect(result.error).toBeUndefined();
  expect(Buffer.byteLength(JSON.stringify(result.envelope))).toBeLessThanOrEqual(56000);
  expect(result.envelope.payload.wirePayload).toMatchObject({ id: 'keep', notesTruncated: true, notesOriginalBytes: 160000, itemsTruncated: true });
  expect(result.envelope.observed).toEqual(envelope.observed);
  expect(envelope.payload.wirePayload.notes.length).toBe(80000);
  expect(builders.boundedEnvelope({ payload: { irreducible: 'x'.repeat(60000) }, delivery: {} }).error).toBe('TOO_LARGE');
  expect(builders.boundedEnvelope({ payload: { message: 'raw' }, delivery: {} }).envelope).toEqual({ payload: { message: 'raw' }, delivery: {} });
});
test('shared app-error identity fixture is exact, while raw messages remain evidence', () => {
  for (const fixture of require('../test-support/fixtures/fieldDiagnosticsIdentity.json').messages) {
    expect(builders.normalizeErrorMessage(fixture.message)).toBe(fixture.normalized);
    expect(builders.appErrorPayload({ message: fixture.message })).toMatchObject({ message: fixture.message, messageDigest: fixture.messageDigest });
  }
});
test('shared envelope/storage fixture uses dedicated provenance, final outcomes and explicit null release identity',()=>{
 const fixture=require('../test-support/fixtures/fieldDiagnosticsIdentity.json');
 const {releaseIdentity}=require('../src/db/repositories/supportIncidentRepository');
 expect(releaseIdentity(fixture.release)).toEqual(fixture.releaseIdentity);
 expect(builders.boundedEnvelope(fixture.envelope).envelope).toEqual(fixture.envelope);
 expect(fixture.storageRow).toMatchObject({payload:fixture.envelope.payload,observed:fixture.envelope.observed,
 first_observed:fixture.envelope.first_observed,delivery:fixture.envelope.delivery,bundle_path:fixture.envelope.bundle_path,screenshot_path:null});
 expect(Buffer.byteLength(JSON.stringify(fixture.envelope))).toBeLessThanOrEqual(56000);
});
test('the phone rejects the 56,000-to-65,536 byte window rather than relying on the larger server budget',()=>{
 const fixture=require('../test-support/fixtures/fieldDiagnosticsIdentity.json');
 const envelope={...fixture.envelope,payload:{message:'é'.repeat(29000)}};
 expect(Buffer.byteLength(JSON.stringify(envelope))).toBeGreaterThan(56000);
 // Even this indented representation is below the server byte ceiling. The real
 // jsonb-text validation belongs to A's PostgreSQL harness, not this phone test.
 expect(Buffer.byteLength(JSON.stringify(envelope,null,1))).toBeLessThan(65536);
 expect(builders.boundedEnvelope(envelope)).toEqual({error:'TOO_LARGE'});
});
