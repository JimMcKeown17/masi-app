import { buildLessonRecord } from '../src/lessonPlan/lessonRecord';
import { lessonDraftInput, MON, WED } from '../test-support/lessonSaveFixtures';

const mondayDraft = () => ({ ...lessonDraftInput(), id: 'draft-1', session_id: 'session-1', created_at: MON, updated_at: MON });
const build = (draft = mondayDraft()) => buildLessonRecord({ draft, userId: 'ea',
  currentLevels: { c1: '2 Letter Blends', c2: '3 Letter Blends' }, sessionTypeFields: { session_type_id: 'st' }, nowIso: WED });

test('activities match spec §6 key for key', () => {
  const draft = mondayDraft();
  const before = JSON.stringify(draft);
  const { session } = build(draft);
  expect(Object.keys(session.activities)).toEqual(['letters_focused', 'session_reading_level', 'child_reading_levels', 'comments', 'lesson']);
  expect(Object.keys(session.activities.lesson)).toEqual(['version','pack_id','language','plan','blend_tier_shown','blends_done','books_read','tracker_check']);
  expect(session).toEqual({
    id: 'session-1', user_id: 'ea', programme_id: 'programme-a', group_id: 'group-1', class_id: 'class-1',
    session_date: '2026-10-19', children_ids: ['c1', 'c2'], notes: 'Monday lesson', session_type_id: 'st',
    synced: false, created_at: WED, updated_at: WED,
    activities: { letters_focused: ['a'], session_reading_level: '2 Letter Blends',
      child_reading_levels: { c1: '3 Letter Blends', c2: '3 Letter Blends' }, comments: 'Monday lesson',
      lesson: { version: 1, pack_id: draft.pack_id, language: 'en', plan: draft.plan,
        blend_tier_shown: '2 Letter Blends', blends_done: ['am'], books_read: [{ id: 'reader-1', how: 'printed' }], tracker_check: 'marked' } },
  });
  expect(session.activities.lesson.plan.made_on).toBe('2026-10-19');
  expect(JSON.stringify(draft)).toBe(before);
});

test('a changed date drops the plan with plan_reason past_date', () => {
  const { session } = build({ ...mondayDraft(), lesson_date: '2026-10-18' });
  expect(session.session_date).toBe('2026-10-18');
  expect(session.activities.lesson).toMatchObject({ plan: null, plan_reason: 'past_date' });
});
test('a backdated lesson keeps the default tier that was on screen', () => {
  expect(build({ ...mondayDraft(), lesson_date: '2026-10-18' }).session.activities.lesson)
    .toMatchObject({ plan: null, blend_tier_shown: '2 Letter Blends' });
});
test('a backdated lesson keeps an explicitly chosen higher tier', () => {
  const draft = mondayDraft(); draft.lesson_date = '2026-10-18'; draft.ticks.blendTierShown = '4 Letter Blends';
  expect(build(draft).session.activities.lesson).toMatchObject({ plan: null, blend_tier_shown: '4 Letter Blends' });
});
test('only present children are attendees and get levels, marks and reading-level changes', () => {
  const draft = mondayDraft(); draft.attendance.absentChildIds = ['c1'];
  const result = build(draft);
  expect(result.session.children_ids).toEqual(['c2']);
  expect(result.session.activities.child_reading_levels).toEqual({ c2: '3 Letter Blends' });
  expect(result.trackerChanges).toEqual({}); expect(result.readingLevelChanges).toEqual({});
});
test('no letters and no blends: letters_focused [] and session_reading_level null', () => {
  const draft = mondayDraft(); draft.ticks = { letters: [], blends: [], books: [] }; draft.notes = null;
  expect(build(draft).session.activities).toMatchObject({ letters_focused: [], session_reading_level: null, comments: '' });
  expect(build(draft).session.notes).toBe('');
});
test('session_reading_level is the highest tier among blends ticked, top-up items at their own tier', () => {
  const draft = mondayDraft();
  for (const [blends, expected] of [[['am', 'cat'], '3 Letter Blends'], [['am', 'mama'], '4 Letter Blends'], [['am', 'mamama'], 'Word Reading']]) {
    draft.ticks.blends = blends;
    expect(build(draft).session.activities.session_reading_level).toBe(expected);
  }
});
test('tracker_check: marked, none (every present child "No one new yet"), null', () => {
  const draft = mondayDraft();
  expect(build(draft).session.activities.lesson.tracker_check).toBe('marked');
  draft.tracker_changes = {}; draft.ticks.noOneNew = ['c1', 'c2'];
  expect(build(draft).session.activities.lesson.tracker_check).toBe('none');
  draft.ticks.noOneNew = ['c1'];
  expect(build(draft).session.activities.lesson.tracker_check).toBeNull();
  draft.attendance.absentChildIds = ['c2'];
  expect(build(draft).session.activities.lesson.tracker_check).toBe('none');
});
