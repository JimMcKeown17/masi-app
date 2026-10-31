import { Platform } from 'react-native';
jest.mock('expo-application', () => ({ nativeBuildVersion: '55' }));
import { requireCurrentHandle } from '../src/session/signedInHandle';
let mockWrittenContent;

jest.mock('expo-file-system/next', () => ({
  Paths: { cache: '/tmp' },
  File: jest.fn().mockImplementation(function MockFile(_path, filename) {
    this.uri = `file:///tmp/${filename}`;
    this.exists = false;
    this.delete = jest.fn();
    this.create = jest.fn();
    this.write = jest.fn((content) => {
      mockWrittenContent = content;
    });
  }),
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-updates', () => ({ channel: null }));

jest.mock('expo-constants', () => ({
  expoConfig: {
    version: '1.2.0',
    runtimeVersion: { policy: 'appVersion' },
    ios: { buildNumber: '1' },
    android: {},
    updates: { url: 'https://u.expo.dev/test-project' },
    extra: {
      gitCommit: 'abc1234',
      supabaseTarget: 'sqlite-staging',
      supabaseProjectId: 'segygjzpujphwvrubusm',
    },
  },
}), { virtual: true });

jest.mock('../src/utils/runtimeDiagnostics', () => ({
  getRuntimeDiagnostics: () => ({
    application: { id: 'org.masinyusane.masi', version: '1.2.0', build: '47' },
    device: { modelName: 'Pixel 8a', osName: 'Android', osVersion: '15' },
    update: { id: 'update-123', channel: 'production', runtimeVersion: '1.2.0' },
    backend: { target: 'sqlite-staging', projectId: 'segygjzpujphwvrubusm' },
    sqlite: { schemaVersion: 8 },
  }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTestWriter } from '../test-support/testDatabase';
import { debugDump } from '../src/db/debugDump';
import { runMigrations, CURRENT_SCHEMA_VERSION } from '../src/db/migrations';
import { exportDatabase, exportLogs } from '../src/utils/debugExport';
import { logger } from '../src/utils/logger';

beforeEach(async () => {
  mockWrittenContent = null;
  await AsyncStorage.clear();
});

describe('debug database export metadata', () => {
  test('exports SQLite database state with app metadata and sync diagnostics', async () => {
    const db = await getTestWriter();
    await runMigrations(db);
    await AsyncStorage.setItem('@sessions', JSON.stringify([]));
    await db.runAsync(`
      insert into sync_state (scope, last_pulled_at, cursor)
      values ('reference_data', '2026-05-22T12:00:00.000Z', 'cursor-1')
    `);
    await db.runAsync(`
      insert into sync_outbox (
        owner_user_id,
        id,
        table_name,
        record_id,
        operation,
        payload,
        status,
        retry_count,
        last_error
      )
      values
        ('user-1', 'sessions:session-1:insert', 'sessions', 'session-1', 'insert', '{"id":"session-1"}', 'failed', 2, 'network down'),
        ('user-1', 'assessments:assessment-1:insert', 'assessments', 'assessment-1', 'insert', '{"id":"assessment-1"}', 'terminal', 1, 'RLS denied')
    `);

    await db.runAsync("insert into children (id, first_name, last_name) values ('mastery-child', 'Test', 'Learner')");
    await db.runAsync("insert into programmes (id, code, name) values ('mastery-programme', 'literacy', 'Literacy')");
    await db.runAsync(`insert into letter_mastery
      (id, child_id, letter, language, confirmed, changed_at, correction_id, changed_by, programme_id,
       sync_status, server_changed_at, server_correction_id)
      values ('mastery-k', 'mastery-child', 'k', 'en', 1, '2026-10-20T08:00:00.000Z',
       'correction-k', 'other-ea', 'mastery-programme', 'terminal',
       '2026-10-20T08:00:00.123456+00:00', 'server-correction-k')`);

    jest.replaceProperty(Platform, 'OS', 'android');
    const result = await exportDatabase({ handle: requireCurrentHandle() });

    expect(result).toEqual({ success: true });
    const exported = JSON.parse(mockWrittenContent);
    expect(exported.content_diagnostics.decodabilitySelfCheck).toEqual({ vectorVersion: 1, passed: 72, failed: [] });
    expect(exported.content_diagnostics.previewContentAllowed).toBe(false);
    expect(exported.sqlite_refactor_build).toBe('plan-6');
    expect(exported.app_version).toBe('1.2.0');
    expect(exported.android_version_code).toBe(55);
    expect(exported.releaseMetadata).toEqual(expect.objectContaining({
      appVersion: '1.2.0', androidVersionCode: 55, releaseLabel: '1.2.0 (55)', gitCommit: 'abc1234',
      supabaseTarget: 'sqlite-staging',
      supabaseProjectId: 'segygjzpujphwvrubusm',
    }));
    expect(exported.runtimeDiagnostics).toEqual(expect.objectContaining({
      application: expect.objectContaining({ build: '47' }),
      device: expect.objectContaining({ modelName: 'Pixel 8a', osVersion: '15' }),
      update: expect.objectContaining({ id: 'update-123' }),
    }));
    expect(exported.database.database).toBe('sqlite');
    expect(exported.database.releaseMetadata).toEqual(expect.objectContaining({
      supabaseTarget: 'sqlite-staging',
      supabaseProjectId: 'segygjzpujphwvrubusm',
    }));
    expect(exported.database.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(exported.database.tableCounts).toEqual(expect.objectContaining({
      sync_outbox: 2,
      sync_state: 1,
    }));
    expect(exported.database.syncState).toEqual([
      expect.objectContaining({
        scope: 'reference_data',
        lastPulledAt: '2026-05-22T12:00:00.000Z',
        cursor: 'cursor-1',
      }),
    ]);
    expect(exported.database.failedOutboxRows).toEqual([
      expect.objectContaining({
        tableName: 'sessions',
        recordId: 'session-1',
        status: 'failed',
        retryCount: 2,
        lastError: 'network down',
      }),
      expect.objectContaining({
        tableName: 'assessments',
        recordId: 'assessment-1',
        status: 'terminal',
        retryCount: 1,
        lastError: 'RLS denied',
      }),
    ]);
    expect(exported.database.letterMastery).toEqual([{
      childId: 'mastery-child', letter: 'k', language: 'en', confirmed: true,
      changedAt: '2026-10-20T08:00:00.000Z', correctionId: 'correction-k',
      changedBy: 'other-ea', programmeId: 'mastery-programme', syncStatus: 'terminal',
      serverChangedAt: '2026-10-20T08:00:00.123456+00:00', serverCorrectionId: 'server-correction-k',
    }]);
    expect(exported.database['@sessions']).toBeUndefined();
  });

  test('orders mastery diagnostics by child and letter and retains unconfirmed records without names', async () => {
    const db = await getTestWriter();
    await runMigrations(db);
    for (const childId of ['child-b', 'child-a']) {
      await db.runAsync('insert into children (id, first_name, last_name) values (?, ?, ?)', childId, 'Test', 'Learner');
    }
    for (const [childId, letter, confirmed] of [['child-b', 'a', 1], ['child-a', 'z', 0], ['child-a', 'a', 1]]) {
      await db.runAsync(`insert into letter_mastery
        (id, child_id, letter, language, confirmed, changed_at, correction_id, changed_by)
        values (?, ?, ?, 'en', ?, '2026-10-20T08:00:00.000Z', ?, 'user-1')`,
      childId + letter, childId, letter, confirmed, 'correction-' + childId + letter);
    }
    const dump = await debugDump({ handle: requireCurrentHandle() });
    expect(dump.letterMastery.map(row => [row.childId, row.letter, row.confirmed])).toEqual([
      ['child-a', 'a', true], ['child-a', 'z', false], ['child-b', 'a', true],
    ]);
    expect(dump.letterMastery.every(row => Object.keys(row).sort().join(',') === [
      'childId', 'letter', 'language', 'confirmed', 'changedAt', 'correctionId', 'changedBy',
      'programmeId', 'syncStatus', 'serverChangedAt', 'serverCorrectionId',
    ].sort().join(','))).toBe(true);
    expect(JSON.stringify(dump.letterMastery)).not.toContain('Learner');
  });

  test('a content diagnostics module that fails to load does not break the export', async () => {
    const db = await getTestWriter();
    await runMigrations(db);
    jest.doMock('../src/lessonPlan/packs/contentDiagnostics', () => { throw new Error('checker failed to load'); });
    try {
      const result = await exportDatabase({ handle: requireCurrentHandle() });
      expect(result).toEqual({ success: true });
      expect(JSON.parse(mockWrittenContent).content_diagnostics).toEqual({ error: 'Error: checker failed to load' });
    } finally {
      jest.dontMock('../src/lessonPlan/packs/contentDiagnostics');
    }
  });

  test('a content diagnostics call that throws does not break the export', async () => {
    const db = await getTestWriter();
    await runMigrations(db);
    jest.doMock('../src/lessonPlan/packs/contentDiagnostics', () => ({
      getContentDiagnostics: () => { throw new Error('diagnostics call failed'); },
    }));
    try {
      expect(await exportDatabase({ handle: requireCurrentHandle() })).toEqual({ success: true });
      expect(JSON.parse(mockWrittenContent).content_diagnostics).toEqual({ error: 'Error: diagnostics call failed' });
    } finally {
      jest.dontMock('../src/lessonPlan/packs/contentDiagnostics');
    }
  });

  test('logs export still shares persisted logger output', async () => {
    logger.addLog('WARN', ['plan 6 log export']);

    const result = await exportLogs();

    expect(result).toEqual({ success: true });
    expect(mockWrittenContent).toContain('WARN: plan 6 log export');
  });

  test('marks abnormal sync diagnostic query failures instead of reporting empty queues', async () => {
    const failingDiagnosticDb = {
      getFirstAsync: jest.fn(async (sql) => {
        if (sql.includes('PRAGMA user_version')) return { user_version: CURRENT_SCHEMA_VERSION };
        return { count: 0 };
      }),
      getAllAsync: jest.fn(async (sql) => {
        if (sql.includes('sqlite_master')) return [
          { name: 'sync_state' },
          { name: 'sync_outbox' },
        ];
        if (sql.includes('schema_migrations')) return [];
        if (sql.includes('from sync_state')) throw new Error('sync_state unreadable');
        if (sql.includes('from sync_outbox')) throw new Error('sync_outbox unreadable');
        return [];
      }),
    };

    const dump = await debugDump({ handle: { isOpen: () => true, isCurrent: () => true, getReader: async () => failingDiagnosticDb } });

    expect(dump.syncState).toEqual({
      error: 'Error: sync_state unreadable',
    });
    expect(dump.failedOutboxRows).toEqual({
      error: 'Error: sync_outbox unreadable',
    });
  });
});

test('Share database preserves raw failure evidence, dispositions, actual wire ids and every incident status', async () => {
  const handle = require('../test-support/defaultTestHandle').getDefaultTestHandle();
  const payload = { id: 'local-attendee', session_id: 'session-raw', child_id: 'child-raw', sync_status: 'terminal', rawEvidence: 'keep in export' };
  await handle.withTransaction(async txn => {
    await txn.runAsync(`insert into sync_outbox
      (id, table_name, record_id, operation, payload, status, error_class, error_code, last_error, owner_user_id)
      values ('wire-export', 'session_attendees', 'local-attendee', 'insert', ?, 'terminal', 'terminal', '23503', 'full raw server message', ?)`,
    JSON.stringify(payload), handle.userId);
    for (const status of ['pending', 'sent', 'rejected']) {
      await txn.runAsync(`insert into support_incident_queue (id, kind, repeat_key, payload, observed, first_observed, report_snapshot, status)
        values (?, 'ea_report', ?, ?, ?, ?, ?, ?)`, status, status, '{"raw":"message"}', '{"version":"observed"}', '{"version":"first"}', '{"frozen":true}', status);
    }
  });
  expect(await exportDatabase({ handle })).toEqual({ success: true });
  const dump = JSON.parse(mockWrittenContent).database;
  const expectedId = require('../src/db/repositories/domainRepositoryUtils').sessionAttendeeDomainId('session-raw', 'child-raw');
  expect(dump.failedOutboxRows).toEqual([expect.objectContaining({ errorClass: 'terminal', errorCode: '23503',
    payload, lastError: 'full raw server message', serverRecordId: expectedId,
    wirePayload: { id: expectedId, session_id: 'session-raw', child_id: 'child-raw' } })]);
  expect(dump.supportIncidents).toHaveLength(3);
  expect(dump.supportIncidents.map(row => row.status).sort()).toEqual(['pending', 'rejected', 'sent']);
  expect(dump.supportIncidents[0]).toMatchObject({ payload: { raw: 'message' }, observed: { version: 'observed' },
    first_observed: { version: 'first' }, report_snapshot: { frozen: true } });
});

test('wire evidence uses canonical item and assignment ids and keeps archive identity', async () => {
  const handle = require('../test-support/defaultTestHandle').getDefaultTestHandle();
  const ids = require('../src/db/repositories/domainRepositoryUtils');
  const cases = [
    ['assessment_items', { id: 'local-item', assessment_id: 'assessment', item_key: 'a', position: 0, is_correct: true },
      ids.assessmentItemDomainId({ assessmentId: 'assessment', itemKey: 'a', position: 0, isCorrect: true })],
    ['child_ea_assignments', { id: 'local-cea', child_id: 'child', user_id: 'ea' },
      ids.childEaAssignmentDomainId({ childId: 'child', userId: 'ea' })],
    ['child_programme_enrollments', { id: 'local-cpe', child_id: 'child', programme_id: 'programme' },
      ids.childProgrammeEnrollmentDomainId({ childId: 'child', programmeId: 'programme' })],
    ['class_ea_assignments', { id: 'local-classea', class_id: 'class', ea_user_id: 'ea', programme_id: 'programme' },
      ids.classEaAssignmentDomainId({ classId: 'class', eaUserId: 'ea', programmeId: 'programme' })],
    ['group_ea_assignments', { id: 'local-gea', group_id: 'group' }, ids.groupEaAssignmentDomainId({ groupId: 'group' })],
    ['class_grouping_state', { id: 'local-cgs', class_id: 'class', academic_year_id: 'year' },
      ids.classGroupingStateDomainId({ classId: 'class', academicYearId: 'year' })],
    ['child_ea_assignments', { id: 'archive-id', unassigned_at: '2026-10-29' }, 'archive-id', 'archive'],
  ];
  await handle.withTransaction(async txn => {
    for (const [table, payload, , operation = 'insert'] of cases) {
      await txn.runAsync(`insert into sync_outbox (id, table_name, record_id, operation, payload, status, owner_user_id)
        values (?, ?, ?, ?, ?, 'terminal', ?)`, payload.id, table, payload.id, operation, JSON.stringify(payload), handle.userId);
    }
  });
  const dump = await debugDump({ handle });
  for (const [, payload, serverId] of cases) {
    expect(dump.failedOutboxRows.find(row => row.recordId === payload.id)).toMatchObject({ payload, serverRecordId: serverId, wirePayload: { id: serverId } });
  }
});

test('RPC wire evidence uses the assessment parent id, null mastery id, and retains malformed rows', async () => {
  const handle = require('../test-support/defaultTestHandle').getDefaultTestHandle();
  const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
  const assessment = { id: uuid(1), user_id: uuid(2), child_id: uuid(3), programme_id: uuid(4),
    assessment_type: 'letter_sounds', assessment_date: '2026-10-29', assessment_purpose: 'progress_check',
    question_code: 'letter_sounds', question_version: '2026.1', item_set_id: 'letter_sounds@2026.1.en',
    language: 'en', stopped_reason: 'completed', duration_ms: 1000, derived: { total_correct: 1 }, total_items: 1,
    items: [{ id: uuid(5), assessment_id: uuid(1), item_key: 'a', position: 0, is_correct: true, metadata: {} }] };
  const mastery = { id: 'local-mastery', correction_id: uuid(6), child_id: uuid(3), letter: 'a', language: 'en',
    confirmed: false, changed_at: '2026-10-29T08:00:00Z' };
  await handle.withTransaction(async txn => {
    for (const [id, table, payload] of [['assessment', 'assessments', assessment], ['mastery', 'letter_mastery', mastery],
      ['malformed', 'assessments', { id: 'raw-invalid-id', message: 'retain raw' }]]) {
      await txn.runAsync(`insert into sync_outbox (id, table_name, record_id, operation, payload, status, last_error, owner_user_id)
        values (?, ?, ?, 'insert', ?, 'terminal', 'raw error', ?)`, id, table, id, JSON.stringify(payload), handle.userId);
    }
  });
  const dump = await debugDump({ handle });
  expect(dump.failedOutboxRows).toHaveLength(3);
  expect(dump.failedOutboxRows.find(row => row.id === 'assessment')).toMatchObject({ serverRecordId: uuid(1),
    wirePayload: { p_assessment: { id: uuid(1) }, p_items: [{ id: uuid(5) }] } });
  expect(dump.failedOutboxRows.find(row => row.id === 'mastery')).toMatchObject({ serverRecordId: null, wirePayload: {
    p_correction_id: uuid(6), p_child_id: uuid(3), p_letter: 'a', p_language: 'en', p_confirmed: false, p_changed_at: mastery.changed_at,
  } });
  expect(dump.failedOutboxRows.find(row => row.id === 'malformed')).toMatchObject({ serverRecordId: 'malformed', wirePayload: null,
    wirePayloadError: 'user_id: must be a nonempty string', payload: { id: 'raw-invalid-id', message: 'retain raw' }, lastError: 'raw error' });
});

test('bounded bundle export limits SQL rows and payload extraction while manual export remains complete', async () => {
  const h = requireCurrentHandle();
  for (let i=0;i<3;i++) await h.withTransaction(txn=>txn.runAsync(`insert into sync_outbox
    (owner_user_id,id,table_name,record_id,operation,payload,status,updated_at) values (?,?, 'children',?,'insert',?,'terminal',?)`,
  h.userId,`bounded-${i}`,`child-${i}`,JSON.stringify({id:`child-${i}`,notes:'😀'.repeat(10000)}),`2026-10-29T00:00:0${i}Z`));
  const bounded=await debugDump({handle:h},{outboxLimit:2,payloadMaxBytes:20480,masteryLimit:1,sectionLimit:2});
  expect(bounded.failedOutboxRows).toHaveLength(2);
  expect(bounded.failedOutboxRows[0]).toMatchObject({id:'bounded-2',payloadTruncated:true,wirePayload:null});
  expect(Buffer.byteLength(bounded.failedOutboxRows[0].payload)).toBeLessThanOrEqual(20480);
  expect((await debugDump({handle:h})).failedOutboxRows).toHaveLength(3);
});
test('bounded variable-size error, cursor and incident fields carry honest sibling truncation markers',async()=>{
 const h=requireCurrentHandle();const raw='é'.repeat(30000);
 await h.withTransaction(async txn=>{
  await txn.runAsync(`insert into sync_outbox (owner_user_id,id,table_name,record_id,operation,payload,status,last_error)
    values (?,'bounded-error','children','c','insert','{}','terminal',?)`,h.userId,raw);
  await txn.runAsync("insert into sync_state (scope,cursor) values ('large-cursor',?)",raw);
  await h.services.repositories.supportIncidents.record(txn,'upload_terminal',['large'],{raw},{event:false});
 });
 const bounded=await debugDump({handle:h},{outboxLimit:200,payloadMaxBytes:20480,masteryLimit:500,sectionLimit:200});
 expect(bounded.failedOutboxRows[0]).toMatchObject({lastErrorTruncated:true,lastErrorOriginalBytes:60000});
 expect(bounded.syncState[0]).toMatchObject({cursorTruncated:true,cursorOriginalBytes:60000});
 expect(bounded.supportIncidents[0]).toMatchObject({payloadTruncated:true,payloadOriginalBytes:60010,reportSnapshotOmitted:1});
});
