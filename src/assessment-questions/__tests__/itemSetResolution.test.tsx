import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import {
  CURRENT_ITEM_SETS,
  LetterSoundsQuestion,
  LetterWritingFromPicturesQuestion,
  ListenAndAnswerStoryQuestion,
  ListenFirstSoundQuestion,
  ListenPhonemeBlendQuestion,
  ReadPassageQuestion,
  ReadSentencesQuestion,
  ReadWordsQuestion,
  StoryWritingRubricQuestion,
  WriteCvcsQuestion,
  WriteSentencesFromDictationQuestion,
} from '../index';
import { FIXTURE_READ_WORDS_EN } from '../testFixtures';
import type { QuestionProps } from '../types/QuestionProps';
import type { Result } from '../types/Result';

const QUESTIONS: Array<[string, React.ComponentType<QuestionProps>]> = [
  ['LetterSoundsQuestion', LetterSoundsQuestion],
  ['LetterWritingFromPicturesQuestion', LetterWritingFromPicturesQuestion],
  ['ListenAndAnswerStoryQuestion', ListenAndAnswerStoryQuestion],
  ['ListenFirstSoundQuestion', ListenFirstSoundQuestion],
  ['ListenPhonemeBlendQuestion', ListenPhonemeBlendQuestion],
  ['ReadPassageQuestion', ReadPassageQuestion],
  ['ReadSentencesQuestion', ReadSentencesQuestion],
  ['ReadWordsQuestion', ReadWordsQuestion],
  ['StoryWritingRubricQuestion', StoryWritingRubricQuestion],
  ['WriteCvcsQuestion', WriteCvcsQuestion],
  ['WriteSentencesFromDictationQuestion', WriteSentencesFromDictationQuestion],
];

describe('item-set resolution', () => {
  test('the battery path has no Afrikaans default: LetterSoundsQuestion without an item set shows the missing card', () => {
    const onComplete = jest.fn();
    const { getByText } = render(<LetterSoundsQuestion language="af" onComplete={onComplete} />);
    expect(getByText('This test has no card for this language yet.')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('the Afrikaans cards the host passes render: Grid A from l, the word card from die', () => {
    const letters = render(<LetterSoundsQuestion language="af" itemSet={CURRENT_ITEM_SETS.letter_sounds.af} onComplete={jest.fn()} />);
    fireEvent.press(letters.getByText('Start'));
    expect(letters.getByLabelText('l, current')).toBeTruthy();
    expect(letters.getByText('Card rows 1–2 · page 1 of 3')).toBeTruthy();
    const words = render(<ReadWordsQuestion language="af" itemSet={CURRENT_ITEM_SETS.word_reading.af} captureMode="sequential" onComplete={jest.fn()} />);
    fireEvent.press(words.getByText('Start'));
    expect(words.getByLabelText('die, current')).toBeTruthy();
  });

  describe('Afrikaans card pagination and completion', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('the word card starts on card rows 1–2, page 1 of 5', () => {
      const words = render(<ReadWordsQuestion language="af" itemSet={CURRENT_ITEM_SETS.word_reading.af} captureMode="sequential" onComplete={jest.fn()} />);
      fireEvent.press(words.getByText('Start'));
      expect(words.getByText('Card rows 1–2 · page 1 of 5')).toBeTruthy();
    });

    test('marking 20 letters Correct moves to card rows 3–4, page 2 of 3', () => {
      const letters = render(<LetterSoundsQuestion language="af" itemSet={CURRENT_ITEM_SETS.letter_sounds.af} durationSec={60} onComplete={jest.fn()} />);
      fireEvent.press(letters.getByText('Start'));
      for (let i = 0; i < 19; i += 1) {
        fireEvent.press(letters.getByRole('button', { name: 'Correct' }));
      }
      expect(letters.getByText('Card rows 1–2 · page 1 of 3')).toBeTruthy();
      fireEvent.press(letters.getByRole('button', { name: 'Correct' }));
      expect(letters.getByText('Card rows 3–4 · page 2 of 3')).toBeTruthy();
    });

    test('marking every letter Correct completes with all 60 card items', () => {
      const itemSet = CURRENT_ITEM_SETS.letter_sounds.af;
      const cardLength = itemSet.rows.flat().length;
      expect(cardLength).toBe(60);
      const onComplete = jest.fn<void, [Result]>();
      const letters = render(<LetterSoundsQuestion language="af" itemSet={itemSet} durationSec={60} onComplete={onComplete} />);
      fireEvent.press(letters.getByText('Start'));
      for (let i = 0; i < cardLength - 1; i += 1) {
        fireEvent.press(letters.getByRole('button', { name: 'Correct' }));
      }
      expect(onComplete).not.toHaveBeenCalled();
      fireEvent.press(letters.getByRole('button', { name: 'Correct' }));
      expect(onComplete).not.toHaveBeenCalled();
      fireEvent.press(letters.getByText('Finish'));
      expect(onComplete).toHaveBeenCalledTimes(1);
      const result = onComplete.mock.calls[0][0];
      expect(result).toMatchObject({
        item_set_id: itemSet.item_set_id, language: 'af', stopped_reason: 'completed',
        derived: { total_attempted: cardLength, total_correct: cardLength, percent: 100 },
      });
      expect(result.items).toHaveLength(cardLength);
      expect(result.items.every((item) => item.is_correct)).toBe(true);
    });

    test('marking every word Correct completes with all 50 card items', () => {
      const itemSet = CURRENT_ITEM_SETS.word_reading.af;
      const cardLength = itemSet.words.length;
      expect(cardLength).toBe(50);
      const onComplete = jest.fn<void, [Result]>();
      const words = render(<ReadWordsQuestion language="af" itemSet={itemSet} captureMode="sequential" onComplete={onComplete} />);
      fireEvent.press(words.getByText('Start'));
      for (let i = 0; i < cardLength - 1; i += 1) {
        fireEvent.press(words.getByRole('button', { name: 'Correct' }));
      }
      expect(onComplete).not.toHaveBeenCalled();
      fireEvent.press(words.getByRole('button', { name: 'Correct' }));
      expect(onComplete).not.toHaveBeenCalled();
      fireEvent.press(words.getByText('Finish'));
      expect(onComplete).toHaveBeenCalledTimes(1);
      const result = onComplete.mock.calls[0][0];
      expect(result).toMatchObject({
        item_set_id: itemSet.item_set_id, language: 'af', stopped_reason: 'completed',
        derived: { total_attempted: cardLength, total_correct: cardLength, percent: 100 },
      });
      expect(result.items).toHaveLength(cardLength);
      expect(result.items.every((item) => item.is_correct)).toBe(true);
    });
  });

  test.each(QUESTIONS)(
    '%s shows the missing-card state for isiZulu without completing',
    (_name, Question) => {
      const onComplete = jest.fn();
      const { getByText } = render(
        <Question language="zu" onComplete={onComplete} />,
      );

      expect(
        getByText('This test has no card for this language yet.'),
      ).toBeTruthy();
      expect(onComplete).not.toHaveBeenCalled();
    },
  );

  test('ReadWordsQuestion completes with the question code and version from its override', () => {
    const itemSet = {
      ...FIXTURE_READ_WORDS_EN,
      question_code: 'word_reading',
      question_version: 'override-1',
      item_set_id: 'word_reading@override-1.en',
    };
    const onComplete = jest.fn();
    const { getByText, getByLabelText } = render(
      <ReadWordsQuestion
        language="en"
        itemSet={itemSet}
        onComplete={onComplete}
      />,
    );

    fireEvent.press(getByText('Start'));
    fireEvent.press(getByLabelText('cat, idle'));
    fireEvent.press(getByText('End'));
    fireEvent.press(getByText('Reached the end'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({
      question_code: 'word_reading',
      question_version: 'override-1',
      item_set_id: 'word_reading@override-1.en',
    });
  });
});
