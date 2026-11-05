// Frozen 1.5.0 disposition probe. This file is NOT a test of the current app.
//
// generate-1.5.0-dispositions.cjs copies it into a throwaway checkout of the installed field
// client (f002e08, app 1.5.0) as __tests__/__lifecycleCompatDispositionsProbe.test.js, next to a
// generated copy of that checkout's src/services/offlineSync.js that only adds exports. It records
// how that exact client classifies every server answer the lifecycle-compat harness can observe:
// the error classifier (_testClassifyError) and the acknowledgement rules inside
// runServerOperation (archive/restore/update need exactly one returned id, hard_delete needs
// `true`, and each RPC parser's accepted literals). The harness reads only the JSON this writes,
// never the current src/ tree, because two JS bundles coexist in the field.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  _testClassifyError,
  dispositionFor,
  PUSH_ORDER,
  _testUpdateByIdTables,
} from '../src/services/offlineSync';
import {
  __probeRunServerOperation,
  __probeArchiveServerColumns,
  __probeDeterministicErrorCodes,
  __probeInsertOrIgnoreTables,
} from '../src/services/__lifecycleCompatProbe_offlineSync';

const OUT = process.env.LIFECYCLE_COMPAT_PROBE_OUT;
const OWN = '0c000000-0000-4000-8000-000000000001';
const OTHER = '0c000000-0000-4000-8000-000000000002';
const CHILD = '0c000000-0000-4000-8000-000000000003';
const PROGRAMME = '0c000000-0000-4000-8000-000000000004';
const YEAR = '0c000000-0000-4000-8000-000000000005';
const USER = '0c000000-0000-4000-8000-000000000006';
const AT = '2026-11-02T08:00:00.000Z';

// Every code the classifier names, every SQLSTATE a lifecycle path can raise, and a sentinel for
// "a code 1.5.0 has never seen" (the retry-forever fall-through).
const CODES = [
  '28000', '23514', '23505', '23503', '42501', '23502', '22023', '22P02', '42703', 'PGRST204',
  'MV001', 'MA001', 'MA002', '40P01', '40001', '55P03', '57014', 'P0001', '42883', '42P01',
  'XX000', 'PGRST116', 'PGRST202', 'UPDATE_NOT_APPLIED', 'ARCHIVE_REQUIRED', 'ARCHIVE_NOT_APPLIED',
  'RESTORE_NOT_APPLIED', 'LOCAL_ONLY_REFERENCE', 'MISSING_OUTBOX_PAYLOAD', 'UNEXPECTED_RPC_RESULT',
  'ZZ_UNLISTED_CODE',
];

const labelFor = (code, classification, evidencePending) => {
  if (classification.markAsSynced) return 'synced';
  if (classification.terminal) return 'terminal';
  if (__probeDeterministicErrorCodes.includes(code)) return 'retry_then_terminal';
  const { errorClass } = dispositionFor({ code }, { parentEvidencePending: evidencePending });
  if (errorClass === 'needs_reauth') return 'retry_until_reauth';
  if (errorClass === 'needs_parent') return 'retry_needs_parent';
  return 'retry_forever';
};

// A Supabase client stand-in that answers every terminal call with one canned response. A pure
// read chain (the child_class_memberships pre-insert reconcile) gets an empty result instead.
const makeClient = (response) => {
  const from = () => {
    let mutating = false;
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      in: () => chain,
      limit: () => chain,
      update: () => { mutating = true; return chain; },
      delete: () => { mutating = true; return chain; },
      upsert: () => Promise.resolve({ data: null, error: response.error ?? null }),
      then: (resolve, reject) => Promise.resolve(
        mutating ? response : { data: [], error: null },
      ).then(resolve, reject),
    };
    return chain;
  };
  return { from, rpc: () => Promise.resolve(response) };
};

const run = async (tableName, operation, payload, response) => {
  const result = await __probeRunServerOperation(
    makeClient(response),
    { tableName, onConflict: 'id', duplicateIsSuccess: false },
    { id: 1, table_name: tableName, record_id: OWN, operation, payload },
  );
  return result.success
    ? { success: true }
    : { success: false, code: result.error?.code ?? null };
};

const archivePayload = (tableName, operation) => {
  const payload = { id: OWN, row_version: 2 };
  for (const column of __probeArchiveServerColumns[tableName]) {
    if (operation === 'restore') payload[column] = null;
    else if (column === 'status') payload[column] = 'archived';
    else if (column.endsWith('_at')) payload[column] = AT;
    else if (column.endsWith('_user_id')) payload[column] = USER;
    else payload[column] = 'probe';
  }
  return payload;
};

const ROW_RESPONSES = {
  none: { data: [], error: null },
  own: { data: [{ id: OWN }], error: null },
  'own+own': { data: [{ id: OWN }, { id: OWN }], error: null },
  other: { data: [{ id: OTHER }], error: null },
  null: { data: null, error: null },
  'error:42501': { data: null, error: { code: '42501', message: 'probe' } },
};

const assessmentPayload = () => ({
  id: OWN, user_id: USER, child_id: CHILD, programme_id: PROGRAMME,
  assessment_type: 'letter_sounds', assessment_date: '2026-10-28',
  assessment_purpose: 'progress_check', question_code: 'letter_sounds', question_version: '2026.1',
  item_set_id: 'letter_sounds@2026.1.en', language: 'en', stopped_reason: 'completed',
  derived: {}, total_items: 1, score: 1, duration_ms: 10, created_at: AT,
  items: [{
    id: OTHER, assessment_id: OWN, position: 0, item_key: 'a', is_correct: true, metadata: {},
  }],
});
const letterPayload = () => ({
  correction_id: OWN, child_id: CHILD, letter: 'k', language: 'xh', confirmed: true, changed_at: AT,
});

const RPC_LITERALS = [
  'inserted', 'already_present', 'updated', 'unchanged', 'applied', 'superseded',
  'acknowledged', 'ok', '', true, false, null, 1, 0,
];
const TYPES = { boolean: true, string: 'x', null: null };
const masterySignatures = () => {
  const out = [];
  for (const outcome of ['applied', 'superseded', 'acknowledged', 'other']) {
    for (const c of Object.keys(TYPES)) {
      for (const a of Object.keys(TYPES)) {
        for (const r of Object.keys(TYPES)) {
          for (const b of Object.keys(TYPES)) {
            out.push({
              signature: `${outcome}|${c}|${a}|${r}|${b}`,
              row: {
                outcome,
                confirmed: TYPES[c],
                changed_at: TYPES[a],
                correction_id: TYPES[r],
                changed_by: TYPES[b],
              },
            });
          }
        }
      }
    }
  }
  return out;
};

test('record the 1.5.0 classifier and acknowledgement rules', async () => {
  expect(OUT).toBeTruthy();
  const offlineSyncPath = path.join(__dirname, '..', 'src', 'services', 'offlineSync.js');
  const source = fs.readFileSync(offlineSyncPath);

  const classify = {};
  for (const table of PUSH_ORDER) {
    classify[table] = {};
    for (const code of CODES) {
      const entry = {};
      for (const evidencePending of [false, true]) {
        const classification = _testClassifyError(
          { code },
          { tableName: table, duplicateIsSuccess: false },
          { parentEvidencePending: evidencePending },
        );
        entry[evidencePending ? 'evidencePending' : 'steady'] = labelFor(
          code, classification, evidencePending,
        );
      }
      classify[table][code] = entry;
    }
  }

  const ack = { archive: {}, restore: {}, update: {}, insert: {}, rpc: {} };
  for (const table of Object.keys(__probeArchiveServerColumns)) {
    for (const operation of ['archive', 'restore']) {
      ack[operation][table] = {};
      for (const [key, response] of Object.entries(ROW_RESPONSES)) {
        ack[operation][table][key] = await run(table, operation, archivePayload(table, operation), response);
      }
    }
  }
  for (const table of _testUpdateByIdTables) {
    ack.update[table] = {};
    for (const [key, response] of Object.entries(ROW_RESPONSES)) {
      ack.update[table][key] = await run(table, 'update', { id: OWN, updated_at: AT, row_version: 2 }, response);
    }
  }
  for (const table of PUSH_ORDER.filter((t) => !['assessments', 'battery_runs', 'letter_mastery'].includes(t))) {
    const payload = table === 'child_class_memberships'
      ? { id: OWN, child_id: CHILD, class_id: OTHER, academic_year_id: YEAR, enrolled_at: AT, row_version: 2 }
      : { id: OWN, created_at: AT, row_version: 2 };
    ack.insert[table] = {
      ok: await run(table, 'insert', payload, { data: null, error: null }),
      'error:42501': await run(table, 'insert', payload, ROW_RESPONSES['error:42501']),
    };
  }

  ack.rpc.delete_child_if_no_history = {};
  for (const literal of RPC_LITERALS) {
    ack.rpc.delete_child_if_no_history[JSON.stringify(literal)] = await run(
      'children', 'hard_delete', null, { data: literal, error: null },
    );
  }
  ack.rpc.submit_assessment = {};
  ack.rpc.save_battery_run = {};
  for (const literal of RPC_LITERALS) {
    ack.rpc.submit_assessment[JSON.stringify(literal)] = await run(
      'assessments', 'insert', assessmentPayload(), { data: literal, error: null },
    );
    ack.rpc.save_battery_run[JSON.stringify(literal)] = await run(
      'battery_runs', 'insert', { id: OWN }, { data: literal, error: null },
    );
  }
  ack.rpc.set_letter_mastery = { rows: {}, rowCounts: {} };
  for (const { signature, row } of masterySignatures()) {
    ack.rpc.set_letter_mastery.rows[signature] = await run(
      'letter_mastery', 'insert', letterPayload(), { data: [row], error: null },
    );
  }
  const applied = masterySignatures().find((s) => s.signature === 'applied|boolean|string|string|string').row;
  for (const count of [0, 2]) {
    ack.rpc.set_letter_mastery.rowCounts[count] = await run(
      'letter_mastery', 'insert', letterPayload(), { data: Array(count).fill(applied), error: null },
    );
  }

  const fixture = {
    description: 'How the installed 1.5.0 client (f002e08) classifies each server answer. Generated by scripts/fixtures/lifecycle-compat/generate-1.5.0-dispositions.cjs; never edit by hand.',
    source: {
      file: 'src/services/offlineSync.js',
      sha256: crypto.createHash('sha256').update(source).digest('hex'),
    },
    assumptions: {
      duplicateIsSuccess: 'false: no production caller passes safeDuplicateSuccessTables',
      liveSession: 'true: a 42501 with a live session stays terminal (the steady state)',
      steadyState: 'parentEvidencePending=false: the phone holds no unacknowledged parent or grant',
    },
    pushOrder: PUSH_ORDER,
    archiveServerColumns: __probeArchiveServerColumns,
    insertOrIgnoreTables: [...__probeInsertOrIgnoreTables].sort(),
    updateByIdTables: [..._testUpdateByIdTables].sort(),
    deterministicCodes: __probeDeterministicErrorCodes,
    classify,
    ack,
  };
  fs.writeFileSync(OUT, `${JSON.stringify(fixture, null, 2)}\n`);
});
