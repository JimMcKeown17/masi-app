import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import {
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
