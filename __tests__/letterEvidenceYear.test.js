jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createAssessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { createMasteryRepository } from '../src/db/repositories/masteryRepository';
import { createMigratedDatabase } from '../test-support/sqliteRepositoryTestUtils';
import { seedHistoryData, serverFamily, serverRun, USER, OTHER_USER, CHILD } from '../test-support/assessmentHistoryFixtures';
import { createReferenceDataRepository } from '../src/db/repositories/referenceDataRepository';
import { createLocalStateRepository } from '../src/db/repositories/localStateRepository';
import { createChildrenRepository } from '../src/db/repositories/childrenRepository';
import { createBatteryRunsRepository } from '../src/db/repositories/batteryRunsRepository';
import { pullReferenceData } from '../src/services/offlineSync';
import { loadMasteryState, countMastered } from '../src/utils/masteryState';
import { getLetterMasteryRanking } from '../src/utils/dashboardStats';

describe('current academic year letter evidence through real SQLite', () => {
  let oldPhone, freshPhone;
  const createPhone = async () => {
    const db = await createMigratedDatabase(runMigrations);
    await seedHistoryData(db); // Active 2026: 15 January through 15 December.
    await db.runAsync(`insert into academic_years (id, label, starts_on, ends_on, is_active)
      values ('year-2025', '2025', '2025-01-15', '2025-12-15', 0)`);
    return { db, repositories: {
      assessments: createAssessmentsRepository({ database: db }),
      mastery: createMasteryRepository({ database: db }),
    } };
  };
  beforeEach(async () => {
    oldPhone = await createPhone();
    freshPhone = await createPhone();
  });
  afterEach(async () => {
    await oldPhone.db.closeAsync();
    await freshPhone.db.closeAsync();
  });
  const store = async (phone, n, date, letters, overrides = {}) => {
    const family = { ...serverFamily(n, { items: letters.length }), ...overrides };
    family.assessment_date = date;
    family.items.forEach((item, position) => { item.prompt = letters[position]; });
    await phone.repositories.assessments.saveHistoryPage([family], {
      scope: 'year-evidence-fixture', pullState: { cursor: '{}' }, admit: () => true,
    });
    return family.id;
  };
  const load = phone => loadMasteryState({
    repositories: phone.repositories, userId: USER, childId: CHILD, languageCode: 'en',
  });
  const trackerCount = state => countMastered({
    ...state, taughtLetters: new Set(state.taughtRecords.map(row => row.letter)),
  });

  const refreshYear = async phone => {
    const tables = ['schools', 'job_titles', 'programmes', 'assessment_tools', 'academic_years',
      'assessment_windows', 'teachers', 'staff_programme_assignments'];
    const rows = {}, repositories = {};
    for (const table of tables) {
      rows[table] = await phone.db.getAllAsync('select * from ' + table);
      repositories[table] = createReferenceDataRepository({ database: phone.db, tableName: table });
    }
    rows.academic_years = [{ id: 'year-2027', label: '2027', starts_on: '2027-01-15', ends_on: '2027-12-15', is_active: true },
      ...rows.academic_years.map(year => ({ ...year, is_active: false }))];
    const client = { from: table => {
      const query = { select: () => query, eq: () => query,
        then: resolve => Promise.resolve({ data: rows[table], error: null }).then(resolve) };
      return query;
    } };
    await pullReferenceData({ userId: USER, supabaseClient: client, enqueueRequest: task => task(), repositories,
      localStateRepository: createLocalStateRepository({ database: phone.db }) });
  };

  test('a real reference rollover hides a cached co-EA family and detail while preserving owner history and the roster', async () => {
    await oldPhone.db.runAsync("insert into child_ea_assignments (id, user_id, child_id, sync_status) values ('delivery', ?, ?, 'synced')", USER, CHILD);
    await oldPhone.db.runAsync("insert into child_programme_enrollments (id, child_id, programme_id, sync_status) select 'enrolment', ?, programme_id, 'synced' from staff_programme_assignments where user_id = ?", CHILD, USER);
    await oldPhone.db.runAsync("insert into class_ea_assignments (id, class_id, ea_user_id, programme_id, sync_status) select 'class-ea', 'class-1', ?, programme_id, 'synced' from staff_programme_assignments where user_id = ?", USER, USER);
    await oldPhone.db.runAsync("insert into child_class_memberships (id, child_id, class_id, academic_year_id, sync_status) values ('member', ?, 'class-1', 'year-2026', 'synced')", CHILD);
    const own = await store(oldPhone, 1, '2026-03-01', ['a']);
    const run = serverRun(2, { user_id: OTHER_USER });
    const coEA = await store(oldPhone, 2, '2026-04-01', ['m'], {
      user_id: OTHER_USER, battery_run_id: run.id, battery_run: run,
    });
    const repo = oldPhone.repositories.assessments;
    const runs = createBatteryRunsRepository({ database: oldPhone.db });
    const roster = createChildrenRepository({ database: oldPhone.db });
    expect((await roster.getMyChildren(USER)).map(child => child.id)).toContain(CHILD);
    expect((await repo.getQuestionResults({ userId: USER })).map(row => row.id)).toEqual([own, coEA]);
    expect((await repo.getQuestionResults({ userId: USER, assessmentId: coEA }))[0].items).toHaveLength(1);
    expect((await runs.getRunWithResults(run.id)).results.map(row => row.id)).toEqual([coEA]);
    const cached = await Promise.all(['assessments', 'assessment_items'].map(table => oldPhone.db.getAllAsync('select * from ' + table + ' order by id')));
    await refreshYear(oldPhone);
    expect((await roster.getMyChildren(USER)).map(child => child.id)).toContain(CHILD);
    for (const options of [{}, { childId: CHILD }, { childIds: [CHILD] },
      { childIds: Array.from({ length: 1205 }, (_, i) => i === 0 ? CHILD : 'absent-' + i) }]) {
      expect((await repo.getQuestionResults({ userId: USER, ...options })).map(row => row.id)).toEqual([own]);
    }
    expect(await repo.getQuestionResults({ userId: USER, assessmentId: coEA, includeSkipped: true })).toEqual([]);
    expect((await repo.getQuestionResults({ userId: USER, assessmentId: own }))[0].items).toHaveLength(1);
    expect((await repo.getLetterResults({ userId: USER })).map(row => row.id)).toEqual([own]);
    expect(await repo.countResults({ userId: USER, childId: CHILD, questionCode: 'letter_sounds' })).toBe(1);
    expect((await repo.getQuestionResults()).map(row => row.id)).toEqual([own]); // Bound actor, no identity bypass.
    expect((await runs.getRunWithResults(run.id)).results).toEqual([]);
    expect(await Promise.all(['assessments', 'assessment_items'].map(table => oldPhone.db.getAllAsync('select * from ' + table + ' order by id')))).toEqual(cached);
  });

  test('co-EA visibility is inclusive within the active year and no active year returns only owner rows', async () => {
    const own = await store(oldPhone, 1, '2025-11-01', ['a']);
    const futureOwn = await store(oldPhone, 2, '2028-01-01', ['s']);
    const first = await store(oldPhone, 3, '2026-01-15', ['m'], { user_id: OTHER_USER });
    const last = await store(oldPhone, 4, '2026-12-15', ['s'], { user_id: OTHER_USER });
    await store(oldPhone, 5, '2026-01-14', ['k'], { user_id: OTHER_USER });
    await store(oldPhone, 6, '2026-12-16', ['t'], { user_id: OTHER_USER });
    const repo = oldPhone.repositories.assessments;
    expect((await repo.getQuestionResults({ userId: USER })).map(row => row.id)).toEqual([own, first, last, futureOwn]);
    await oldPhone.db.runAsync('update academic_years set is_active = 0');
    expect((await repo.getQuestionResults({ userId: USER })).map(row => row.id)).toEqual([own, futureOwn]);
    expect(await repo.getQuestionResults({ userId: USER, assessmentId: first, includeSkipped: true })).toEqual([]);
    expect((await repo.getLetterResults({ userId: USER })).map(row => row.id)).toEqual([own, futureOwn]);
    expect(await repo.countResults({ userId: USER, childId: CHILD, questionCode: 'letter_sounds' })).toBe(2);
  });

  test("an old phone holding last year's result and a fresh phone agree", async () => {
    await store(oldPhone, 1, '2025-11-01', ['a', 'm', 's']);
    for (const phone of [oldPhone, freshPhone]) {
      await store(phone, 2, '2026-03-01', ['a']);
      expect((await load(phone)).assessmentMastered).toEqual(new Set(['a']));
    }
  });

  test("last year's result alone supplies no evidence", async () => {
    await store(oldPhone, 1, '2025-11-01', ['a', 'm', 's']);
    expect((await load(oldPhone)).assessmentMastered).toEqual(new Set());
    expect((await load(oldPhone)).assessmentMastered).toEqual((await load(freshPhone)).assessmentMastered);
  });

  test("a result dated after the year's end is not evidence", async () => {
    await store(oldPhone, 1, '2026-12-16', ['a', 'm', 's']);
    expect((await load(oldPhone)).assessmentMastered).toEqual(new Set());
  });

  test('with no active year there is no assessment evidence; confirmations still show', async () => {
    await store(oldPhone, 1, '2026-03-01', ['a']);
    await oldPhone.repositories.mastery.setLetterMastery({ childId: CHILD, letter: 'm', language: 'en', confirmed: true });
    await oldPhone.db.runAsync('update academic_years set is_active = 0');
    const state = await load(oldPhone);
    expect(state.assessmentMastered).toEqual(new Set());
    expect(state.latestAssessment).toBeNull();
    expect(state.taughtRecords.map(row => row.letter)).toEqual(['m']);
    expect(trackerCount(state)).toBe(1);
  });

  test('the ranking and the tracker agree', async () => {
    await store(oldPhone, 1, '2025-11-01', ['a', 'm', 's']);
    const counts = [];
    for (const phone of [oldPhone, freshPhone]) {
      const assessments = await phone.repositories.assessments.getLetterEvidenceResults({ userId: USER });
      const confirmations = await phone.repositories.mastery.getLetterMastery({ childIds: [CHILD] });
      const [rank] = getLetterMasteryRanking([{ id: CHILD, class_id: 'class-1' }], assessments,
        confirmations, [{ id: 'class-1', home_language: 'English' }]);
      expect(rank.masteredCount).toBe(trackerCount(await load(phone)));
      counts.push(rank.masteredCount);
    }
    expect(counts).toEqual([0, 0]);
  });

  test('year bounds are inclusive and child filters still apply', async () => {
    const first = await store(oldPhone, 1, '2026-01-15', ['a']);
    const last = await store(oldPhone, 2, '2026-12-15', ['m']);
    await store(oldPhone, 3, '2026-01-14', ['s']);
    await store(oldPhone, 4, '2026-12-16', ['t']);
    const repository = oldPhone.repositories.assessments;
    for (const filters of [{ childId: CHILD }, { childIds: [CHILD] }]) {
      expect((await repository.getLetterEvidenceResults({ userId: USER, ...filters })).map(row => row.id))
        .toEqual([first, last]);
    }
    expect(await repository.getLetterEvidenceResults({ userId: USER, childIds: [] })).toEqual([]);
    // Owner history remains available; assessment evidence always uses the active year.
    expect(await repository.getLetterResults({ userId: USER })).toHaveLength(4);
    expect((await repository.getQuestionResults({ userId: USER, sinceDate: '2026-01-15', untilDate: '2026-12-15' }))
      .map(row => row.id)).toEqual([first, last]);
  });
});
