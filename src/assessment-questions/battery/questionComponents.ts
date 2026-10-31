import { MathsGridQuestion } from '../questions/MathsGridQuestion';
import { MathsCardsQuestion } from '../questions/MathsCardsQuestion';
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
  ['maths_count_aloud', { Component: MathsCardsQuestion, extraProps: {} }],
  ['maths_quick_see', { Component: MathsCardsQuestion, extraProps: {} }],
  ['maths_count_out', { Component: MathsCardsQuestion, extraProps: {} }],
  ['maths_read_numbers', { Component: MathsGridQuestion, extraProps: {} }],
  ['egma_number_id', { Component: MathsGridQuestion, extraProps: {} }],
  ['maths_which_more', { Component: MathsCardsQuestion, extraProps: {} }],
  ['egma_number_discrimination', { Component: MathsCardsQuestion, extraProps: {} }],
  ['maths_neighbours', { Component: MathsCardsQuestion, extraProps: {} }],
  ['egma_missing_number', { Component: MathsCardsQuestion, extraProps: {} }],
  ['maths_add_counters', { Component: MathsCardsQuestion, extraProps: {} }],
  ['maths_take_away_counters', { Component: MathsCardsQuestion, extraProps: {} }],
  ['maths_make_five_ten', { Component: MathsCardsQuestion, extraProps: {} }],
  ['egma_addition_l1', { Component: MathsGridQuestion, extraProps: {} }],
  ['egma_addition_l2', { Component: MathsCardsQuestion, extraProps: {} }],
  ['egma_subtraction_l1', { Component: MathsGridQuestion, extraProps: {} }],
  ['egma_subtraction_l2', { Component: MathsCardsQuestion, extraProps: {} }],
  ['egma_word_problems', { Component: MathsCardsQuestion, extraProps: {} }],

  ['reading_comprehension', { Component: ReadingComprehensionQuestion, extraProps: {} }],
  ['oral_reading', { Component: ReadPassageQuestion, extraProps: {} }],
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
