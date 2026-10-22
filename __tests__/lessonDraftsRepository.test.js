import { runMigrations } from '../src/db/migrations';
import { runRepositoryTransaction } from '../src/db/repositories/repositoryRuntime';
import { createLessonDraftsRepository, presentChildIds } from '../src/db/repositories/lessonDraftsRepository';
import { createMigratedDatabase } from '../test-support/sqliteRepositoryTestUtils';

let db;
let repo;
beforeEach(async () => {
  db = await createMigratedDatabase(runMigrations);
  let n = 0;
  repo = createLessonDraftsRepository({ database: db, idFactory: () => `id-${++n}` });
});
afterEach(async () => db.closeAsync());

const MONDAY_TAP = '2026-10-19T08:15:00.000Z';
const start = {
  programme_id: 'programme-a', group_id: 'group-1', class_id: 'class-1', language_code: 'xh',
  pack_id: 'isixhosa-interim-letters-v1', lesson_date: '2026-10-19',
  attendance: { childIds: ['c1', 'c2'], absentChildIds: [], addedChildIds: [] },
};

test('no lesson in progress reads as null', async () => {
  expect(await repo.getActive()).toBeNull();
});

test('create keeps the lesson context, mints the session id and fills empty defaults', async () => {
  const draft = await repo.create(start);
  expect(draft).toEqual({
    id: 'id-1', session_id: 'id-2', ...start,
    plan: null, plan_fixed_at: null, ticks: { letters: [], blends: [], books: [] },
    tracker_changes: {}, reading_level_changes: {}, notes: null,
    created_at: expect.any(String), updated_at: expect.any(String),
  });
  expect(await repo.getActive()).toEqual(draft);
});

test('a second lesson is refused and names the one in progress (C7)', async () => {
  const first = await repo.create(start);
  await expect(repo.create({ ...start, group_id: 'group-2' })).rejects.toMatchObject({
    name: 'LessonDraftExistsError', code: 'LESSON_DRAFT_EXISTS', draftId: first.id,
  });
  expect(await repo.getActive()).toEqual(first);
});

test('create refuses a caller-chosen session id, a missing context and a language that is not a code', async () => {
  for (const bad of [
    { ...start, session_id: 'mine' },
    { ...start, lesson_date: '19/10/2026' },
    { ...start, group_id: '' },
    { ...start, class_id: null },             // a language and pack without a class
    { ...start, language_code: 'isiXhosa' },  // a stored label
    { ...start, language_code: 'isixhosa' },  // the shared pack file's name
  ]) {
    await expect(repo.create(bad)).rejects.toMatchObject({ name: 'TypeError' });
  }
  expect(await repo.getActive()).toBeNull();
});

test('update changes only what it is given and never the session id', async () => {
  const draft = await repo.create(start);
  const next = await repo.update(draft.id, { notes: 'Lulu tired', ticks: { letters: ['k'], blends: [], books: [] } });
  expect(next).toEqual({ ...draft, notes: 'Lulu tired', ticks: { letters: ['k'], blends: [], books: [] }, updated_at: expect.any(String) });
  expect(next.session_id).toBe(draft.session_id);
});

test('tracker changes keep the tap time and the lesson language exactly', async () => {
  const draft = await repo.create(start);
  const marks = { c1: { m: { mastered: true, languageCode: 'xh', madeAt: MONDAY_TAP } },
    c2: { o: { mastered: false, languageCode: 'xh', madeAt: MONDAY_TAP } } };
  await repo.update(draft.id, { tracker_changes: marks });
  expect((await repo.getActive()).tracker_changes).toEqual(marks);
  for (const bad of [
    { c1: { m: true } },
    { c1: { m: { mastered: true, languageCode: 'xh' } } },                          // no tap time
    { c1: { m: { mastered: true, languageCode: 'isiXhosa', madeAt: MONDAY_TAP } } }, // a label, not a code
    { c1: { m: { mastered: true, languageCode: 'en', madeAt: MONDAY_TAP } } },       // not the lesson's language (C18)
  ]) {
    await expect(repo.update(draft.id, { tracker_changes: bad })).rejects.toMatchObject({
      name: 'TypeError', message: expect.stringMatching(/tracker_changes\.c1\.m/) });
  }
  expect((await repo.getActive()).tracker_changes).toEqual(marks);
});

test('a class with no known language waits for one language pick, then fixes it', async () => {
  await expect(repo.create({ ...start, language_code: null })).rejects.toMatchObject({ name: 'TypeError' }); // a pack with no language
  const draft = await repo.create({ ...start, language_code: null, pack_id: null });
  expect(draft).toMatchObject({ class_id: 'class-1', language_code: null, pack_id: null });
  await expect(repo.update(draft.id, { tracker_changes: { c1: { m: { mastered: true, languageCode: 'en', madeAt: MONDAY_TAP } } } }))
    .rejects.toMatchObject({ name: 'TypeError' }); // no tracker changes before the pick
  const picked = await repo.update(draft.id, { language_code: 'en', pack_id: 'english-interim-letters-v1' });
  expect(picked).toMatchObject({ class_id: 'class-1', language_code: 'en', pack_id: 'english-interim-letters-v1' });
  await expect(repo.update(draft.id, { language_code: 'xh' }))
    .rejects.toMatchObject({ name: 'LessonDraftContextError', field: 'language_code' }); // fixed once picked
});

test('reading levels hold only the levels the EA changed', async () => {
  const draft = await repo.create(start);
  expect(draft.reading_level_changes).toEqual({});
  await repo.update(draft.id, { reading_level_changes: { c1: '3 Letter Blends' } });
  expect((await repo.getActive()).reading_level_changes).toEqual({ c1: '3 Letter Blends' });
  await expect(repo.update(draft.id, { reading_level_changes: { c2: 'Level 5' } }))
    .rejects.toMatchObject({ name: 'TypeError' });
});

test('the lesson context is fixed: class, language and pack once set; group, programme and session always', async () => {
  const draft = await repo.create(start);
  for (const [field, value] of [['class_id', 'class-2'], ['language_code', 'en'], ['pack_id', 'x'],
    ['group_id', 'group-2'], ['programme_id', 'p2'], ['session_id', 's2']]) {
    await expect(repo.update(draft.id, { [field]: value })).rejects.toMatchObject({
      name: 'LessonDraftContextError', field });
  }
  await expect(repo.update(draft.id, { class_id: 'class-1' })).resolves.toMatchObject({ class_id: 'class-1' }); // same value
  expect((await repo.update(draft.id, { lesson_date: '2026-10-16' })).lesson_date).toBe('2026-10-16'); // Wrap up date
});

test('a mixed-class group picks its class once (C18)', async () => {
  const draft = await repo.create({ ...start, class_id: null, language_code: null, pack_id: null });
  const picked = await repo.update(draft.id, { class_id: 'class-2', language_code: 'en', pack_id: 'english-interim-letters-v1' });
  expect(picked).toMatchObject({ class_id: 'class-2', language_code: 'en', pack_id: 'english-interim-letters-v1' });
  await expect(repo.update(draft.id, { class_id: 'class-1' })).rejects.toMatchObject({ name: 'LessonDraftContextError' });
});

test('the plan is fixed once the first tick fixes it', async () => {
  const draft = await repo.create(start);
  await repo.update(draft.id, { plan: { engine_version: 1, made_on: '2026-10-19' } });
  await repo.update(draft.id, { plan: { engine_version: 1, made_on: '2026-10-19', reason: 'ok' }, plan_fixed_at: MONDAY_TAP });
  await expect(repo.update(draft.id, { plan: { engine_version: 1, made_on: '2026-10-21' } }))
    .rejects.toMatchObject({ name: 'LessonDraftContextError', field: 'plan' });
  await expect(repo.update(draft.id, { plan_fixed_at: null }))
    .rejects.toMatchObject({ name: 'LessonDraftContextError', field: 'plan_fixed_at' });
});

test('attendance names only children on the lesson', async () => {
  const draft = await repo.create(start);
  const next = await repo.update(draft.id, { attendance: { childIds: ['c1', 'c2', 'c9'], absentChildIds: ['c2'], addedChildIds: ['c9'] } });
  expect(presentChildIds(next.attendance)).toEqual(['c1', 'c9']);
  await expect(repo.update(draft.id, { attendance: { childIds: ['c1'], absentChildIds: ['c2'], addedChildIds: [] } }))
    .rejects.toMatchObject({ name: 'TypeError' });
});

test('keys wave 2 adds inside ticks survive a round trip', async () => {
  const draft = await repo.create(start);
  const ticks = { letters: [], blends: ['ku'], books: [{ id: 'xh-int-v1-r03', how: 'app' }], blendTierShown: '3 Letter Blends' };
  await repo.update(draft.id, { ticks });
  expect((await repo.getActive()).ticks).toEqual(ticks);
});

test('an unreadable column is reported, never read as empty, and the row survives until discard', async () => {
  const draft = await repo.create(start);
  await db.runAsync("update lesson_drafts set tracker_changes = 'not json', ticks = '[' where id = ?", draft.id);
  await expect(repo.getActive()).rejects.toMatchObject({
    name: 'LessonDraftCorruptError', draftId: draft.id, fields: ['ticks', 'tracker_changes'] });
  await expect(repo.update(draft.id, { notes: 'x' })).rejects.toMatchObject({ name: 'LessonDraftCorruptError' });
  await expect(repo.create(start)).rejects.toMatchObject({ name: 'LessonDraftExistsError' });
  expect(await db.getFirstAsync('select tracker_changes, ticks from lesson_drafts where id = ?', draft.id))
    .toEqual({ tracker_changes: 'not json', ticks: '[' }); // raw evidence kept
  expect(await repo.discard(draft.id)).toBe(true);
  expect(await repo.getActive()).toBeNull();
});

test('updating a draft that no longer exists is refused', async () => {
  await expect(repo.update('gone', { notes: 'x' })).rejects.toMatchObject({ name: 'LessonDraftNotFoundError', draftId: 'gone' });
});

test('a save that discards the draft and then fails keeps the draft and its session id', async () => {
  const draft = await repo.create(start);
  await expect(runRepositoryTransaction(db, async (txn) => {
    expect(await repo.discard(draft.id, { transaction: txn })).toBe(true);
    throw new Error('save failed');
  })).rejects.toMatchObject({ message: 'save failed' });
  expect(await repo.getActive()).toEqual(draft);
});

test('a committed discard removes the draft and frees the slot', async () => {
  const draft = await repo.create(start);
  await runRepositoryTransaction(db, (txn) => repo.discard(draft.id, { transaction: txn }));
  expect(await repo.getActive()).toBeNull();
  expect(await repo.discard(draft.id)).toBe(false);
  expect((await repo.create(start)).session_id).not.toBe(draft.session_id);
});

test('minimal creation fills every optional field without creating synced work', async () => {
  const draft = await repo.create({ programme_id: 'p', group_id: 'g', lesson_date: '2026-10-19' });
  expect(draft).toEqual({
    id: 'id-1', session_id: 'id-2', programme_id: 'p', group_id: 'g', lesson_date: '2026-10-19',
    class_id: null, language_code: null, pack_id: null,
    attendance: { childIds: [], absentChildIds: [], addedChildIds: [] },
    plan: null, plan_fixed_at: null, ticks: { letters: [], blends: [], books: [] },
    tracker_changes: {}, reading_level_changes: {}, notes: null,
    created_at: expect.any(String), updated_at: expect.any(String),
  });
  expect(new Date(draft.created_at).toISOString()).toBe(draft.created_at);
  expect(new Date(draft.updated_at).toISOString()).toBe(draft.updated_at);
  await repo.update(draft.id, { notes: 'local' });
  await repo.discard(draft.id);
  expect(await db.getAllAsync('select * from sync_outbox')).toEqual([]);
  expect(await db.getAllAsync('select * from sessions')).toEqual([]);
});

test('concurrent starts admit one draft and refuse the other without overwriting it', async () => {
  const outcomes = await Promise.allSettled([repo.create(start), repo.create({ ...start, group_id: 'other' })]);
  const admitted = outcomes.find(({ status }) => status === 'fulfilled').value;
  expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.find(({ status }) => status === 'rejected').reason).toMatchObject({
    name: 'LessonDraftExistsError', code: 'LESSON_DRAFT_EXISTS', draftId: admitted.id,
  });
  expect(await repo.getActive()).toEqual(admitted);
});

test('reserved and unknown top-level keys cannot be created or patched', async () => {
  for (const field of ['id', 'session_id', 'created_at', 'updated_at', 'slot', 'unexpected']) {
    await expect(repo.create({ ...start, [field]: 'caller' })).rejects.toMatchObject({
      name: 'TypeError', message: expect.stringContaining(field),
    });
  }
  const draft = await repo.create(start);
  for (const field of ['created_at', 'updated_at', 'slot', 'unexpected']) {
    await expect(repo.update(draft.id, { [field]: 'caller' })).rejects.toMatchObject({
      name: 'TypeError', message: expect.stringContaining(field),
    });
  }
  expect(await repo.getActive()).toEqual(draft);
});

test('invalid shapes name their field path and leave the complete row untouched', async () => {
  const draft = await repo.create(start);
  const before = await db.getAllAsync('select * from lesson_drafts');
  const badPatches = [
    ['lesson_date', { lesson_date: '2026-02-30' }],
    ['notes', { notes: 7 }],
    ['plan', { plan: [] }],
    ['plan_fixed_at', { plan_fixed_at: '2026-10-19T08:15:00Z' }],
    ['plan_fixed_at', { plan_fixed_at: 'invalid' }],
    ['attendance.childIds', { attendance: { childIds: ['c1', 'c1'], absentChildIds: [], addedChildIds: [] } }],
    ['attendance.absentChildIds', { attendance: { childIds: ['c1'], absentChildIds: ['c1', 'c1'], addedChildIds: [] } }],
    ['attendance.addedChildIds', { attendance: { childIds: ['c1'], absentChildIds: [], addedChildIds: ['c2'] } }],
    ['ticks.letters', { ticks: { letters: [7], blends: [], books: [] } }],
    ['ticks.blends', { ticks: { letters: [], blends: null, books: [] } }],
    ['ticks.books.0.id', { ticks: { letters: [], blends: [], books: [{ id: '', how: 'app' }] } }],
    ['ticks.books.0.how', { ticks: { letters: [], blends: [], books: [{ id: 'book', how: 'web' }] } }],
    ['tracker_changes.c1.m.mastered', { tracker_changes: { c1: { m: { mastered: 1, languageCode: 'xh', madeAt: MONDAY_TAP } } } }],
    ['tracker_changes.c1.m.madeAt', { tracker_changes: { c1: { m: { mastered: true, languageCode: 'xh', madeAt: 'Monday' } } } }],
    ['reading_level_changes.c1', { reading_level_changes: { c1: null } }],
  ];
  for (const [field, patch] of badPatches) {
    await expect(repo.update(draft.id, patch)).rejects.toMatchObject({
      name: 'TypeError', message: expect.stringContaining(field),
    });
    expect(await db.getAllAsync('select * from lesson_drafts')).toEqual(before);
  }
});

test('JSON updates replace whole fields and validate a language pick with marks in either key order', async () => {
  const draft = await repo.create({ ...start, language_code: null, pack_id: null });
  const marks = { c1: { m: { mastered: true, languageCode: 'en', madeAt: MONDAY_TAP } } };
  const picked = await repo.update(draft.id, {
    tracker_changes: marks, pack_id: 'english-interim-letters-v1', language_code: 'en',
  });
  expect(picked.tracker_changes).toEqual(marks);
  await repo.update(draft.id, { tracker_changes: {}, reading_level_changes: { c1: '3 Letter Blends' } });
  expect((await repo.getActive()).tracker_changes).toEqual({});
  await repo.update(draft.id, { reading_level_changes: { c2: 'Cannot blend' } });
  expect((await repo.getActive()).reading_level_changes).toEqual({ c2: 'Cannot blend' });
});

test('equal fixed values are accepted regardless of plan key order and every update stamps updated_at', async () => {
  const draft = await repo.create({ ...start, plan: { engine_version: 1, reason: 'ok' }, plan_fixed_at: MONDAY_TAP });
  const later = '2026-10-21T10:00:00.000Z';
  jest.useFakeTimers({ now: new Date(later) });
  try {
    const next = await repo.update(draft.id, {
      session_id: draft.session_id, programme_id: draft.programme_id, group_id: draft.group_id,
      class_id: draft.class_id, language_code: draft.language_code, pack_id: draft.pack_id,
      plan: { reason: 'ok', engine_version: 1 }, plan_fixed_at: MONDAY_TAP,
    });
    expect(next).toEqual({ ...draft, updated_at: later });
    expect((await repo.update(draft.id, {})).updated_at).toBe(later);
  } finally {
    jest.useRealTimers();
  }
});

test('corruption reports every JSON column in sorted order without repairing stored bytes', async () => {
  const draft = await repo.create(start);
  await db.runAsync(`update lesson_drafts set attendance = '', plan = '{', ticks = '[',
    tracker_changes = 'x', reading_level_changes = 'undefined' where id = ?`, draft.id);
  const before = await db.getAllAsync('select * from lesson_drafts');
  await expect(repo.getActive()).rejects.toMatchObject({
    name: 'LessonDraftCorruptError', code: 'LESSON_DRAFT_CORRUPT', draftId: draft.id,
    fields: ['attendance', 'plan', 'reading_level_changes', 'ticks', 'tracker_changes'],
  });
  await expect(repo.update(draft.id, { ticks: { letters: [], blends: [], books: [] } }))
    .rejects.toMatchObject({ code: 'LESSON_DRAFT_CORRUPT' });
  expect(await db.getAllAsync('select * from lesson_drafts')).toEqual(before);
  expect(await repo.discard(draft.id)).toBe(true);
});

test('JSON fields refuse values that serialization would silently change or drop', async () => {
  const draft = await repo.create(start);
  const before = await db.getAllAsync('select * from lesson_drafts');
  const cycle = {};
  cycle.self = cycle;
  for (const [field, patch] of [
    ['ticks.future', { ticks: { letters: [], blends: [], books: [], future: undefined } }],
    ['plan.value', { plan: { value: NaN } }],
    ['plan.value', { plan: { value: () => true } }],
    ['plan.self', { plan: cycle }],
  ]) {
    await expect(repo.update(draft.id, patch)).rejects.toMatchObject({
      name: 'TypeError', message: expect.stringContaining(field),
    });
    expect(await db.getAllAsync('select * from lesson_drafts')).toEqual(before);
  }
});

test('the draft id follows the fixed-field equality rule', async () => {
  const draft = await repo.create(start);
  await expect(repo.update(draft.id, { id: draft.id })).resolves.toMatchObject({ id: draft.id });
  await expect(repo.update(draft.id, { id: 'other' })).rejects.toMatchObject({
    name: 'LessonDraftContextError', code: 'LESSON_DRAFT_CONTEXT_FIXED', field: 'id',
  });
  await expect(repo.update('gone', {})).rejects.toMatchObject({
    name: 'LessonDraftNotFoundError', code: 'LESSON_DRAFT_NOT_FOUND', draftId: 'gone',
  });
  expect((await repo.getActive()).id).toBe(draft.id);
});
