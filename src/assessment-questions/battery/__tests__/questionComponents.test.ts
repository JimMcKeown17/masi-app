import {
  questionComponentFor, NullQuestion, WELA_PLUS_FULL_2024_1,
  LetterSoundsQuestion, ListenAndAnswerStoryQuestion, ListenFirstSoundQuestion,
  ListenPhonemeBlendQuestion, LetterWritingFromPicturesQuestion, ReadWordsQuestion,
  ReadSentencesQuestion, ReadPassageQuestion, WriteCvcsQuestion,
  WriteSentencesFromDictationQuestion, StoryWritingRubricQuestion, testFixtures,
  WELA_PLUS_STORY_WRITING_EN,
} from '../..';

it('every battery and standalone question code maps to a component; unknown codes map to null', () => {
  const expected = [LetterSoundsQuestion, ListenAndAnswerStoryQuestion, ListenFirstSoundQuestion,
    ListenPhonemeBlendQuestion, LetterWritingFromPicturesQuestion, ReadWordsQuestion,
    ReadSentencesQuestion, ReadPassageQuestion, WriteCvcsQuestion,
    WriteSentencesFromDictationQuestion, StoryWritingRubricQuestion];
  WELA_PLUS_FULL_2024_1.questions.forEach((question, index) => {
    expect(questionComponentFor(question.question_code)).toEqual({ Component: expected[index], extraProps: {} });
  });
  expect(questionComponentFor('word_reading')).toEqual({ Component: ReadWordsQuestion, extraProps: {} });
  expect(questionComponentFor('null_question')).toEqual({ Component: NullQuestion, extraProps: {} });
  for (const code of ['unknown', 'toString', '__proto__', 'constructor']) expect(questionComponentFor(code)).toBeNull();
  expect(testFixtures.FIXTURE_STORY_WRITING_EN.picture).toBeDefined();
  expect(WELA_PLUS_STORY_WRITING_EN.question_code).toBe('wela_plus_story_writing');
});

import { MASI_MATHS_2026_1_DRAFT, MathsGridQuestion, MathsCardsQuestion } from '../..';
test('every maths question code maps to its grid or cards component', () => {
  const grids=['maths_read_numbers','egma_number_id','egma_addition_l1','egma_subtraction_l1'];
  for (const q of MASI_MATHS_2026_1_DRAFT.questions) expect(questionComponentFor(q.question_code)).toEqual({
    Component:grids.includes(q.question_code)?MathsGridQuestion:MathsCardsQuestion,extraProps:{},
  });
});
