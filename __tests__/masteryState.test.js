import { loadMasteryState, countMastered } from '../src/utils/masteryState';
import { assessmentsRepository } from '../src/db/repositories/assessmentsRepository';
import { masteryRepository } from '../src/db/repositories/masteryRepository';

jest.mock('../src/db/repositories/assessmentsRepository', () => ({
  assessmentsRepository: { getAssessments: jest.fn() },
}));
jest.mock('../src/db/repositories/masteryRepository', () => ({
  masteryRepository: { getLetterMastery: jest.fn() },
}));

const letterAssessment = {
  id: 'a-letter',
  child_id: 'child-1',
  assessment_type: 'letter_egra',
  letter_language: 'English',
  date_assessed: '2026-07-01',
  created_at: '2026-07-01T10:00:00Z',
  last_letter_attempted: { index: 2 },
  correct_letters: [{ index: 0 }, { index: 1 }, { index: 2 }],
};
const newerWordAssessment = {
  id: 'a-word',
  child_id: 'child-1',
  assessment_type: 'word_egra',
  letter_language: 'English',
  date_assessed: '2026-07-02',
  created_at: '2026-07-02T10:00:00Z',
  last_letter_attempted: { index: 5 },
  correct_letters: [],
};

describe('loadMasteryState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    masteryRepository.getLetterMastery.mockResolvedValue([]);
  });

  test('picks the latest LETTER assessment even when a word assessment is newer', async () => {
    assessmentsRepository.getAssessments.mockResolvedValue([letterAssessment, newerWordAssessment]);
    const state = await loadMasteryState({ userId: 'user-1', childId: 'child-1', languageKey: 'english' });
    expect(state.latestAssessment.id).toBe('a-letter');
    expect(state.assessmentMastered.size).toBeGreaterThan(0);
  });

  test('legacy assessments without assessment_type still count as letter assessments', async () => {
    const legacy = { ...letterAssessment, id: 'a-legacy' };
    delete legacy.assessment_type;
    assessmentsRepository.getAssessments.mockResolvedValue([legacy]);
    const state = await loadMasteryState({ userId: 'user-1', childId: 'child-1', languageKey: 'english' });
    expect(state.latestAssessment.id).toBe('a-legacy');
  });

  test('taught records exclude soft-deleted rows and other languages', async () => {
    assessmentsRepository.getAssessments.mockResolvedValue([]);
    masteryRepository.getLetterMastery.mockResolvedValue([
      { id: 'm1', child_id: 'child-1', letter: 'a', language: 'English', _deleted: false },
      { id: 'm2', child_id: 'child-1', letter: 'b', language: 'English', _deleted: true },
      { id: 'm3', child_id: 'child-1', letter: 'c', language: 'isiXhosa', _deleted: false },
    ]);
    const state = await loadMasteryState({ userId: 'user-1', childId: 'child-1', languageKey: 'english' });
    expect(state.taughtRecords.map(r => r.id)).toEqual(['m1']);
  });

  test('unknown language key returns empty state without repository calls', async () => {
    const state = await loadMasteryState({ userId: 'user-1', childId: 'child-1', languageKey: 'klingon' });
    expect(state.assessmentMastered.size).toBe(0);
    expect(state.taughtRecords).toEqual([]);
    expect(assessmentsRepository.getAssessments).not.toHaveBeenCalled();
  });
});

describe('countMastered', () => {
  const pedagogicalOrder = ['a', 'b', 'c', 'd'];

  test('counts assessment, pending-add, and stored-taught; pending-remove wins over stored', () => {
    const count = countMastered({
      assessmentMastered: new Set(['a']),
      taughtLetters: new Set(['b', 'c']),
      pendingChanges: { c: false, d: true },
      pedagogicalOrder,
    });
    // a (assessment) + b (stored) + d (pending add); c removed by pending false
    expect(count).toBe(3);
  });

  test('preserves the old bottom-sheet count helper semantics', () => {
    const count = countMastered({
      assessmentMastered: new Set(),
      taughtLetters: new Set(['a', 's']),
      pendingChanges: { m: true, s: false },
      pedagogicalOrder: ['a', 'm', 's'],
    });
    expect(count).toBe(2);
  });
});
