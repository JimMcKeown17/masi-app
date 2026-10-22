export const MON = '2026-10-19T09:00:00.000Z';
export const WED = '2026-10-21T09:00:00.000Z';

export const lessonDraftInput = (overrides = {}) => ({
  programme_id: 'programme-a', group_id: 'group-1', class_id: 'class-1',
  language_code: 'en', pack_id: 'english-interim-letters-v1', lesson_date: '2026-10-19',
  attendance: { childIds: ['c1', 'c2'], absentChildIds: [], addedChildIds: [] },
  plan: {
    engine_version: 1, made_on: '2026-10-19', reason: 'ok', history_complete: true, mastery_complete: true,
    present_child_ids: ['c1', 'c2'], known_letters: [], suggested_letters: ['a', 'm'], review_letters: [],
    unlocked_letters: ['a', 'm'], blend_tier: '2 Letter Blends', suggested_blends: ['am'],
    suggested_book: 'reader-1', up_next_group_id: 'group-1',
  },
  plan_fixed_at: MON, ticks: { letters: ['a'], blends: ['am'], books: [{ id: 'reader-1', how: 'printed' }] },
  tracker_changes: { c1: { a: { mastered: true, languageCode: 'en', madeAt: MON } } },
  reading_level_changes: { c1: '3 Letter Blends' }, notes: 'Monday lesson', ...overrides,
});
