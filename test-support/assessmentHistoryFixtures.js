import { seedCoreData } from './sqliteRepositoryTestUtils';
import { bindTestActor } from './actorTestUtils';

export const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const USER = uuid(1);
export const OTHER_USER = uuid(2);
export const PROGRAMME = uuid(3);
export const CHILD = uuid(4);
export const UNKNOWN_CHILD = uuid(5);
export const stamp = (n = 1) => `2026-09-01T08:00:00.${String(n).padStart(6, '0')}+00:00`;

export const seedHistoryData = async (db) => {
  await seedCoreData(db);
  bindTestActor(db, USER);
  await db.runAsync('insert into programmes (id, code, name) values (?, ?, ?)', PROGRAMME, 'history-lit', 'History Literacy');
  await db.runAsync('insert into staff_programme_assignments (id, user_id, programme_id) values (?, ?, ?)', uuid(7), USER, PROGRAMME);
  await db.runAsync("insert into children (id, first_name, last_name, preferred_name, sync_status) values (?, 'Local', 'Roster', 'Local preferred', 'synced')", CHILD);
};

export const serverRun = (n = 1, extra = {}) => ({
  id: uuid(100 + n), user_id: USER, child_id: CHILD, programme_id: PROGRAMME,
  class_id: null, battery_code: 'wela_plus', battery_version: '2026.1',
  assessment_purpose: 'progress_check', assessment_window_id: null, language: 'en',
  started_at: stamp(), completed_at: null, status: 'in_progress', notes: null,
  created_at: stamp(), updated_at: stamp(),
  child_first_name: 'Server', child_last_name: 'Child', child_preferred_name: null,
  ...extra,
});

export const serverFamily = (n, { items = 61, run = null, childId = CHILD } = {}) => ({
  id: uuid(1000 + n), user_id: USER, child_id: childId, programme_id: PROGRAMME,
  assessment_tool_id: null, assessment_window_id: null, assessment_purpose: 'progress_check',
  grade_snapshot: '1', teacher_name_snapshot: 'Test teacher', assessment_type: 'letter_sounds',
  capture_mode: 'grid', assessment_date: '2026-09-01', score: items, total_items: items, notes: 'Server notes',
  question_code: 'letter_sounds', question_version: 'probe.1', item_set_id: 'letter_sounds@probe.1.en',
  language: 'en', stopped_reason: 'completed', duration_ms: 1000,
  derived: { total_correct: items, total_attempted: items, percent: 100, last_attempted_position: items - 1 },
  battery_run_id: run?.id ?? null, battery_run: run,
  created_at: stamp(n), updated_at: stamp(n + 100),
  child_first_name: 'Server', child_last_name: 'Child', child_preferred_name: 'Server preferred',
  items: Array.from({ length: items }, (_, position) => ({
    id: uuid(100_000 + n * 1000 + position), position, item_key: 'letter-' + position,
    prompt: 'a', response: 'a', is_correct: true, metadata: { reached: true },
  })),
});
