import { markingSentence } from '../markingSentence';
import { WELA_PLUS_FULL_2024_1 } from '../wela_plus_full';
import { adaptEgraForm, egraFormFor } from '../../egra';

test.each(['letter', 'word', 'question'] as const)('markingSentence uses exact copy for %s', noun => {
  expect(markingSentence(noun)).toBe(`Mark each ${noun} Correct or Incorrect. The black ring shows which ${noun} you're on.`);
});
test('both Batteries supply the exact story-questions marking instructions', () => {
  for (const language of ['en', 'xh']) {
    expect(WELA_PLUS_FULL_2024_1.questions[1].instructions?.[language]).toMatch(
      /Then ask each question\. Mark each question Correct or Incorrect\. The black ring shows which question you're on\.$/);
  }
  const { battery } = adaptEgraForm(egraFormFor('dbe-egra-en-fal-2-v1')!);
  expect(battery.questions[3].instructions?.en).toBe("Ask the story questions. Use the answer guide to decide. Mark each question Correct or Incorrect. The black ring shows which question you're on.");
});
