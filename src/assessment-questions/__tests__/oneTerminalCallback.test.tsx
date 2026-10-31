import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import * as Q from '../index';
import * as F from '../testFixtures';

const CASES: Array<[string, React.ComponentType<any>, unknown, Record<string, unknown>]> = [
  ['MathsGrid', Q.MathsGridQuestion, F.FIXTURE_MATHS_GRID_TIMED_EN, { durationSec: 60 }],
  ['MathsCounters', Q.MathsCardsQuestion, F.FIXTURE_MATHS_CARDS_COUNTERS_EN, {}],
  ['MathsPlain', Q.MathsCardsQuestion, F.FIXTURE_MATHS_CARDS_PLAIN_EN, {}],
  ['LetterSounds', Q.LetterSoundsQuestion, F.FIXTURE_LETTER_SOUNDS_EN, { durationSec: 60 }],
  ['ListenAndAnswerStory', Q.ListenAndAnswerStoryQuestion, F.FIXTURE_LISTEN_AND_ANSWER_STORY_EN, {}],
  ['FirstSound', Q.ListenFirstSoundQuestion, F.FIXTURE_FIRST_SOUND_EN, {}],
  ['PhonemeBlend', Q.ListenPhonemeBlendQuestion, F.FIXTURE_PHONEME_BLEND_EN, {}],
  ['LetterWriting', Q.LetterWritingFromPicturesQuestion, F.FIXTURE_LETTER_WRITING_EN, {}],
  ['ReadWords', Q.ReadWordsQuestion, F.FIXTURE_READ_WORDS_EN, {}],
  ['ReadSentences', Q.ReadSentencesQuestion, F.FIXTURE_READ_SENTENCES_EN, {}],
  ['ReadPassage', Q.ReadPassageQuestion, F.FIXTURE_READ_PASSAGE_EN, {}],
  ['WriteCvcs', Q.WriteCvcsQuestion, F.FIXTURE_WRITE_CVCS_EN, {}],
  ['WriteSentencesDictation', Q.WriteSentencesFromDictationQuestion, F.FIXTURE_WRITE_SENTENCES_DICTATION_EN, {}],
  ['StoryWriting', Q.StoryWritingRubricQuestion, F.FIXTURE_STORY_WRITING_EN, {}],
];

describe.each(CASES)('%s — one terminal callback', (_name, Component, itemSet, extra) => {
  function start(onComplete: jest.Mock) {
    const r = render(<Component language="en" itemSet={itemSet} instructions="." onComplete={onComplete} {...extra} />);
    // Q2's intro is the story itself, ending in "I've finished reading"; every other Question has Start.
    fireEvent.press(r.queryByText('Start') ?? r.getByText("I've finished reading"));
    return r;
  }

  test('skip emits exactly one onComplete, skipped reason, no items', () => {
    const onComplete = jest.fn();
    const r = start(onComplete);
    fireEvent.press(r.getByText('Skip question'));
    fireEvent.press(r.getByText('Child is tired'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].stopped_reason).toBe('skipped_tired');
    expect(onComplete.mock.calls[0][0].items).toEqual([]);
  });

  test('double-press on a skip reason still emits exactly one onComplete', () => {
    const onComplete = jest.fn();
    const r = start(onComplete);
    fireEvent.press(r.getByText('Skip question'));
    const tired = r.getByText('Child is tired');
    fireEvent.press(tired);
    fireEvent.press(tired);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('picker never offers Prerequisite unmet', () => {
    const r = start(jest.fn());
    fireEvent.press(r.getByText('Skip question'));
    expect(r.queryByText('Prerequisite unmet')).toBeNull();
  });

  test('cancelling the picker returns to marking without any callback', () => {
    const onComplete = jest.fn();
    const r = start(onComplete);
    fireEvent.press(r.getByText('Skip question'));
    fireEvent.press(r.getByText('Cancel'));
    expect(onComplete).not.toHaveBeenCalled();
    expect(r.getByText('Skip question')).toBeTruthy();
  });
});
