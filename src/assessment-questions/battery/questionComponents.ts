import type React from 'react';
import { ReadingComprehensionQuestion } from '../questions/ReadingComprehensionQuestion';
import { LetterSoundsQuestion } from '../questions/LetterSoundsQuestion';
import { ListenAndAnswerStoryQuestion } from '../questions/ListenAndAnswerStoryQuestion';
import { ListenFirstSoundQuestion } from '../questions/ListenFirstSoundQuestion';
import { ListenPhonemeBlendQuestion } from '../questions/ListenPhonemeBlendQuestion';
import { LetterWritingFromPicturesQuestion } from '../questions/LetterWritingFromPicturesQuestion';
import { ReadWordsQuestion } from '../questions/ReadWordsQuestion';
import { ReadSentencesQuestion } from '../questions/ReadSentencesQuestion';
import { ReadPassageQuestion } from '../questions/ReadPassageQuestion';
import { WriteCvcsQuestion } from '../questions/WriteCvcsQuestion';
import { WriteSentencesFromDictationQuestion } from '../questions/WriteSentencesFromDictationQuestion';
import { StoryWritingRubricQuestion } from '../questions/StoryWritingRubricQuestion';
import { NullQuestion } from '../questions/NullQuestion';

export interface QuestionEntry {
  Component: React.ComponentType<any>;
  extraProps: Record<string, unknown>;
}

const components = new Map<string, QuestionEntry>([
  ['reading_comprehension', { Component: ReadingComprehensionQuestion, extraProps: {} }],
  ['oral_reading', { Component: ReadPassageQuestion, extraProps: { markingPolarity: 'tap_wrong' } }],
  ['letter_sounds', { Component: LetterSoundsQuestion, extraProps: {} }],
  ['wela_plus_listen_and_answer_story', { Component: ListenAndAnswerStoryQuestion, extraProps: {} }],
  ['wela_plus_first_sound', { Component: ListenFirstSoundQuestion, extraProps: {} }],
  ['wela_plus_phoneme_blend', { Component: ListenPhonemeBlendQuestion, extraProps: {} }],
  ['wela_plus_letter_writing', { Component: LetterWritingFromPicturesQuestion, extraProps: {} }],
  ['wela_plus_read_words', { Component: ReadWordsQuestion, extraProps: {} }],
  ['wela_plus_read_sentences', { Component: ReadSentencesQuestion, extraProps: {} }],
  ['wela_plus_read_passage', { Component: ReadPassageQuestion, extraProps: {} }],
  ['wela_plus_write_cvcs', { Component: WriteCvcsQuestion, extraProps: {} }],
  ['wela_plus_write_sentences_dictation', { Component: WriteSentencesFromDictationQuestion, extraProps: {} }],
  ['wela_plus_story_writing', { Component: StoryWritingRubricQuestion, extraProps: {} }],
  ['word_reading', { Component: ReadWordsQuestion, extraProps: {} }],
  ['null_question', { Component: NullQuestion, extraProps: {} }],
]);

export function questionComponentFor(questionCode: string): QuestionEntry | null {
  return components.get(questionCode) ?? null;
}
