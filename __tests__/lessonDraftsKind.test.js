import fs from 'fs';
import os from 'os';
import path from 'path';
import { MIGRATIONS, runMigrations } from '../src/db/migrations';
import {
  createLessonDraftsRepository, LESSON_DRAFT_KINDS,
} from '../src/db/repositories/lessonDraftsRepository';
import { createBetterSqliteTestDatabase } from '../test-support/betterSqliteAdapter';

let db;
let repo;
let directory;
const madeAt = '2026-11-01T08:00:00.000Z';
const base = { programme_id: 'p', group_id: 'g', lesson_date: '2026-11-01' };
const numeracy = { ...base, kind: 'numeracy', ticks: { taught: null } };
const rejected = async (operation, expected) => {
  let caught;
  try { await operation(); } catch (error) { caught = error; }
  expect(caught).toMatchObject(expected);
};
beforeEach(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'masi-draft-kind-'));
  db = createBetterSqliteTestDatabase(path.join(directory, 'draft.db'));
  await runMigrations(db);
  repo = createLessonDraftsRepository({ database: db });
});
afterEach(async () => {
  await db.closeAsync();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('v22 adds kind with literacy as the default for existing drafts', async () => {
  await db.closeAsync();
  db = createBetterSqliteTestDatabase(path.join(directory, 'v21.db'));
  for (const migration of MIGRATIONS.filter(({ version }) => version <= 21)) {
    await db.execAsync(migration.sql);
  }
  await db.execAsync("PRAGMA user_version = 21; insert into lesson_drafts (id, session_id, programme_id, group_id, lesson_date) values ('d', 's', 'p', 'g', '2026-11-01');");
  const before = await db.getFirstAsync('select * from lesson_drafts');
  await db.closeAsync();
  db = createBetterSqliteTestDatabase(path.join(directory, 'v21.db'));
  await runMigrations(db);
  expect(await db.getFirstAsync('select * from lesson_drafts')).toEqual({ ...before, kind: 'literacy' });
  expect(await db.getFirstAsync('pragma user_version')).toEqual({ user_version: 22 });
});

test('the database refuses a kind outside literacy and numeracy', async () => {
  await rejected(() => db.runAsync("insert into lesson_drafts (id, session_id, programme_id, group_id, lesson_date, kind) values ('d', 's', 'p', 'g', '2026-11-01', 'maths')"),
    { message: expect.stringMatching(/CHECK constraint failed/) });
});

test('a numeracy draft round-trips with step-key tracker changes', async () => {
  expect(LESSON_DRAFT_KINDS).toEqual(['literacy', 'numeracy']);
  expect(Object.isFrozen(LESSON_DRAFT_KINDS)).toBe(true);
  const tracker_changes = { c1: { 'add.5': { mastered: true, madeAt } } };
  const draft = await repo.create({ ...numeracy, tracker_changes });
  expect(draft).toMatchObject({ kind: 'numeracy', ticks: { taught: null }, tracker_changes,
    language_code: null, pack_id: null, reading_level_changes: {} });
  expect(await repo.getActive()).toEqual(draft);
  const ticks = { taught: [{ slot: 'activity', step_key: 'add.5', activity: 'Add counters' }] };
  expect(await repo.update(draft.id, { ticks })).toMatchObject({ kind: 'numeracy', ticks });
  await repo.discard(draft.id);
  await rejected(() => repo.create({ ...numeracy, kind: 'maths' }), { name: 'TypeError', message: 'Invalid lesson draft kind' });
});

test('a numeracy draft refuses literacy ticks and a language code', async () => {
  await rejected(() => repo.create({ ...numeracy, ticks: { letters: [], blends: [], books: [] } }),
    { name: 'TypeError', message: 'Invalid lesson draft ticks' });
  await rejected(() => repo.create({ ...numeracy, language_code: 'en' }), { name: 'TypeError', message: 'Invalid lesson draft language_code' });
});

test('a numeracy draft refuses a bad step key or a languageCode on a mark', async () => {
  for (const marks of [
    { 'Add.5': { mastered: true, madeAt } },
    { 'add.5': { mastered: true, madeAt, languageCode: 'en' } },
  ]) {
    await rejected(() => repo.create({ ...numeracy, tracker_changes: { c1: marks } }), { name: 'TypeError', message: expect.stringMatching(/^Invalid lesson draft tracker_changes\.c1\./) });
  }
});

test('kind cannot change after create', async () => {
  const draft = await repo.create(numeracy);
  await rejected(() => repo.update(draft.id, { kind: 'literacy' }), { name: 'LessonDraftContextError', field: 'kind' });
  expect(await repo.update(draft.id, { kind: 'numeracy' })).toMatchObject({ kind: 'numeracy' });
});

test('the one-slot rule spans both kinds', async () => {
  const draft = await repo.create(base);
  expect(draft.kind).toBe('literacy');
  await rejected(() => repo.create(numeracy), { name: 'LessonDraftExistsError', draftId: draft.id });
});

test('a corrupt numeracy draft reports its kind', async () => {
  const draft = await repo.create(numeracy);
  await db.runAsync("update lesson_drafts set ticks = '[' where id = ?", draft.id);
  await rejected(() => repo.getActive(), { name: 'LessonDraftCorruptError', kind: 'numeracy', fields: ['ticks'] });
});

test('lessonRouteForDraft sends each kind to its own screen', () => {
  const { lessonRouteForDraft } = require('../src/utils/lessonDraftRoutes');
  expect(lessonRouteForDraft({ kind: 'numeracy' })).toBe('NumeracyLesson');
  for (const draft of [{ kind: 'literacy' }, null, {}, { kind: 'maths' }, undefined]) {
    expect(lessonRouteForDraft(draft)).toBe('Lesson');
  }
});
