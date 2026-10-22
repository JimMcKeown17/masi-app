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
  expect(questionComponentFor('word_reading')).toEqual({ Component: ReadWordsQuestion, extraProps: { captureMode: 'sequential' } });
  expect(questionComponentFor('null_question')).toEqual({ Component: NullQuestion, extraProps: {} });
  for (const code of ['unknown', 'toString', '__proto__', 'constructor']) expect(questionComponentFor(code)).toBeNull();
  expect(testFixtures.FIXTURE_STORY_WRITING_EN.picture).toBeDefined();
  expect(WELA_PLUS_STORY_WRITING_EN.question_code).toBe('wela_plus_story_writing');
});
