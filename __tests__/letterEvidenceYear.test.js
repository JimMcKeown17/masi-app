jest.mock('expo-sqlite', () => require('../test-support/expoSQLiteMock'));

import { runMigrations } from '../src/db/migrations';
import { createAssessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { createMasteryRepository } from '../src/db/repositories/masteryRepository';
import { createMigratedDatabase } from '../test-support/sqliteRepositoryTestUtils';
import { seedHistoryData, serverFamily, USER, CHILD } from '../test-support/assessmentHistoryFixtures';
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
  const store = async (phone, n, date, letters) => {
    const family = serverFamily(n, { items: letters.length });
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
    // Ordinary history remains available; only evidence uses the active year.
    expect(await repository.getLetterResults({ userId: USER })).toHaveLength(4);
    expect((await repository.getQuestionResults({ userId: USER, sinceDate: '2026-01-15', untilDate: '2026-12-15' }))
      .map(row => row.id)).toEqual([first, last]);
  });
});
