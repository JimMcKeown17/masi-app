global.__MASI_NO_DEFAULT_HANDLE__ = true;

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  requestOpen, requestClose, resetHandleRegistryForTests, setLatestAuthSession,
} from '../src/session/signedInHandle';
import { createPathDatabaseOpener } from '../test-support/actorTestUtils';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const MONDAY_TAP = '2026-10-19T08:15:00.000Z';
const start = {
  programme_id: 'programme-a', group_id: 'group-1', class_id: 'class-1', language_code: 'xh',
  pack_id: 'isixhosa-interim-letters-v1', lesson_date: '2026-10-19',
  attendance: { childIds: ['c1', 'c2'], absentChildIds: [], addedChildIds: [] },
};
const offline = jest.fn(async () => { throw new TypeError('Network request failed'); });
let dir;
let openDatabase;
const open = async (userId, transport) => {
  setLatestAuthSession({ user: { id: userId }, access_token: `token-${userId}` });
  return requestOpen({ userId, openDatabase, fetchImpl: transport });
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-lesson-drafts-'));
  openDatabase = createPathDatabaseOpener(dir);
  offline.mockClear();
});
afterEach(async () => {
  await resetHandleRegistryForTests();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a lesson draft is on disk at commit and survives a handle reopen offline unchanged', async () => {
  const a = await open(A, offline);
  const draft = await a.repositories.lessonDrafts.create(start);
  const saved = await a.repositories.lessonDrafts.update(draft.id, {
    tracker_changes: { c1: { m: { mastered: true, languageCode: 'xh', madeAt: MONDAY_TAP } } },
    reading_level_changes: { c2: '2 Letter Blends' },
  });
  // Process death: nothing is closed; the committed row is already on disk.
  const raw = createBetterSqliteTestDatabase(path.join(dir, a.fileName));
  expect(await raw.getFirstAsync('select session_id, language_code, lesson_date from lesson_drafts'))
    .toEqual({ session_id: saved.session_id, language_code: 'xh', lesson_date: '2026-10-19' });
  await raw.closeAsync();
  // An orderly close and reopen, not a process kill: resetHandleRegistryForTests requests close and
  // awaits disposal (src/session/signedInHandle.js:457-460). The raw read above is what proves the
  // row was committed; a real force-quit is Task 6's device gate.
  await resetHandleRegistryForTests();
  const relaunched = await open(A, offline);
  expect(await relaunched.repositories.lessonDrafts.getActive()).toEqual(saved);
});

test('another EA on the phone never sees the lesson, and its EA gets it back', async () => {
  const a = await open(A, offline);
  const draft = await a.repositories.lessonDrafts.create(start);
  await requestClose({ reason: 'switch' });
  const b = await open(B, offline);
  expect(await b.repositories.lessonDrafts.getActive()).toBeNull();
  await expect(a.repositories.lessonDrafts.update(draft.id, { notes: 'late' }))
    .rejects.toMatchObject({ name: 'StaleActorError' });
  await b.repositories.lessonDrafts.create({ ...start, group_id: 'group-b' }); // B's own file, own slot
  await requestClose({ reason: 'switch back' });
  const again = await open(A, offline);
  expect(await again.repositories.lessonDrafts.getActive()).toEqual(draft);
});
