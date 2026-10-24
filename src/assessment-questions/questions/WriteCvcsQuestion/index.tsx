/**
 * WriteCvcsQuestion — WelaPLUS Pattern D (Q9, dictation of CVC words).
 *
 * EA dictates a word; child writes from memory on paper; EA marks each
 * scoring letter independently. Scoring letters come from content and may
 * omit a prefix that is not assessed.
 * Privacy of the prompt is the EA's physical responsibility (PRD §"Prompt
 * privacy"); no tap-to-reveal, no auto-hide.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { monotonicNow } from '../../progress/clock';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ItemSetMeta } from '../../types/ItemSet';
import { resolveItemSet } from '../../itemsets/resolveItemSet';
import { MissingItemSet } from '../../progress/MissingItemSet';
import type { Result, ResultItem, StoppedReason } from '../../types/Result';
import type { WriteCvcsItemSet, WriteCvcsWord } from './types';
import { WELA_PLUS_WRITE_CVCS_EN } from '../../itemsets/wela_plus_write_cvcs.en';
import { WELA_PLUS_WRITE_CVCS_XH } from '../../itemsets/wela_plus_write_cvcs.xh';
import { useToggleMark } from '../../hooks/useToggleMark';
import { Canvas, ConfirmSheet, MarkTile, QuestionIntro, TileGroups, ToggleBar } from '../../ui';
import { SkipReasonPicker } from '../../skip/SkipReasonPicker';
import type { ManualSkipReason } from '../../skip/skipReasons';

type Phase =
  | 'intro'
  | 'active'
  | 'confirm-finish'
  | 'skip-picker'
  | 'finished';

type FullItemSet = WriteCvcsItemSet & ItemSetMeta;

function isValidWord(value: unknown): value is WriteCvcsWord {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.item_key === 'string' &&
    typeof o.word === 'string' &&
    Array.isArray(o.letters) &&
    o.letters.length > 0 &&
    o.letters.every((letter) => typeof letter === 'string')
  );
}

function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.item_set_id !== 'string') return false;
  if (typeof o.question_version !== 'string') return false;
  if (typeof o.question_code !== 'string') return false;
  if (typeof o.language !== 'string') return false;
  if (!Array.isArray(o.words)) return false;
  return o.words.every(isValidWord);
}

interface ScoringLetter {
  word: WriteCvcsWord;
  wordIndex: number;
  letter: string;
  letterIndex: number;
  position: number;
  itemKey: string;
}

function buildScoringRows(words: WriteCvcsWord[]): ScoringLetter[][] {
  let position = 0;
  return words.map((word, wordIndex) =>
    word.letters.map((letter, letterIndex) => ({
      word,
      wordIndex,
      letter,
      letterIndex,
      position: position++,
      itemKey: `${word.item_key}.l${letterIndex + 1}`,
    })),
  );
}

export function WriteCvcsQuestion(props: QuestionProps) {
  const itemSet = resolveItemSet(
    props.language,
    props.itemSet,
    { en: WELA_PLUS_WRITE_CVCS_EN, xh: WELA_PLUS_WRITE_CVCS_XH },
    isFullItemSet,
  );
  if (!itemSet) return <MissingItemSet language={props.language} />;
  return <WriteCvcsQuestionContent {...props} itemSet={itemSet} />;
}

function WriteCvcsQuestionContent(
  props: QuestionProps & { itemSet: FullItemSet },
) {
  const {
    language,
    itemSet: effectiveItemSet,
    instructions,
    onComplete,
    onItemMarked,
  } = props;
  const [phase, setPhase] = useState<Phase>('intro');
  const { isMarked, toggle } = useToggleMark();

  const isMarkedRef = useRef(isMarked);
  useEffect(() => {
    isMarkedRef.current = isMarked;
  }, [isMarked]);

  const hasFinishedRef = useRef(false);
  const startTimeMsRef = useRef<number | null>(null);

  const words = effectiveItemSet.words;
  const scoringRows = React.useMemo(() => buildScoringRows(words), [words]);
  const scoringLetters = React.useMemo(
    () => scoringRows.flat(),
    [scoringRows],
  );
  const unmarkedCount = scoringLetters.reduce(
    (acc, scoringLetter) =>
      acc + (isMarked(String(scoringLetter.position)) ? 0 : 1),
    0,
  );

  useEffect(() => {
    if (phase === 'active' && startTimeMsRef.current === null) {
      startTimeMsRef.current = monotonicNow();
    }
  }, [phase]);

  const finish = useCallback(
    (stoppedReason: StoppedReason) => {
      if (hasFinishedRef.current) return;
      hasFinishedRef.current = true;
      setPhase('finished');

      const isSkipped = stoppedReason.startsWith('skipped_');
      const items = isSkipped
        ? []
        : scoringLetters.map((scoringLetter) => ({
            position: scoringLetter.position,
            item_key: scoringLetter.itemKey,
            prompt: scoringLetter.letter,
            is_correct: isMarkedRef.current(String(scoringLetter.position)),
            metadata: {
              word: scoringLetter.word.word,
              word_index: scoringLetter.wordIndex,
              letter_index: scoringLetter.letterIndex,
            },
          }));
      const totalCorrect = items.filter((i) => i.is_correct).length;
      const totalAttempted = items.length;
      const elapsedMs =
        startTimeMsRef.current === null
          ? 0
          : Math.round(monotonicNow() - startTimeMsRef.current);
      const perWord = isSkipped
        ? []
        : scoringRows.map((row) => ({
            word: row[0].word.word,
            correct: row.filter((letter) =>
              isMarkedRef.current(String(letter.position)),
            ).length,
            total: row.length,
          }));

      const result: Result = {
        question_code: effectiveItemSet.question_code,
        question_version: effectiveItemSet.question_version,
        item_set_id: effectiveItemSet.item_set_id,
        language,
        duration_ms: elapsedMs,
        stopped_reason: stoppedReason,
        items,
        derived: {
          total_correct: totalCorrect,
          total_attempted: totalAttempted,
          percent:
            totalAttempted > 0
              ? Math.round((totalCorrect / totalAttempted) * 100)
              : 0,
          last_attempted_position: null,
          was_timed: false,
          per_word: perWord,
        },
      };
      onComplete(result);
    },
    [effectiveItemSet, language, scoringLetters, scoringRows, onComplete],
  );

  const handleToggle = useCallback(
    (scoringLetter: ScoringLetter) => {
      const willBeMarked = !isMarkedRef.current(String(scoringLetter.position));
      toggle(String(scoringLetter.position));
      if (onItemMarked) {
        const item: ResultItem = {
          position: scoringLetter.position,
          item_key: scoringLetter.itemKey,
          prompt: scoringLetter.letter,
          is_correct: willBeMarked,
          metadata: {
            word: scoringLetter.word.word,
            word_index: scoringLetter.wordIndex,
            letter_index: scoringLetter.letterIndex,
          },
        };
        onItemMarked(item);
      }
    },
    [toggle, onItemMarked],
  );

  const handleFinish = useCallback(() => {
    if (unmarkedCount > 0) {
      setPhase('confirm-finish');
    } else {
      finish('completed');
    }
  }, [unmarkedCount, finish]);

  const handleSkipChosen = useCallback(
    (reason: ManualSkipReason) => finish(reason),
    [finish],
  );

  if (phase === 'intro') {
    return <QuestionIntro instructions={instructions} onStart={() => { props.onStart?.(); setPhase('active'); }} />;
  }

  if (phase === 'finished') {
    return <View />;
  }

  if (phase === 'skip-picker') {
    return (
      <SkipReasonPicker
        onChoose={handleSkipChosen}
        onCancel={() => setPhase('active')}
      />
    );
  }

  const confirming = phase === 'confirm-finish';
  return (
    <Canvas>
      <View
        style={{ flex: 1 }}
        accessibilityElementsHidden={confirming}
        importantForAccessibility={confirming ? 'no-hide-descendants' : 'auto'}
        pointerEvents={confirming ? 'none' : 'auto'}
      >
        <TileGroups
          card
          testID="prompt-scroll"
          groups={scoringRows.map((row, wordIndex) => ({
            key: String(wordIndex),
            heading: `${wordIndex + 1}. ${row[0].word.word}`,
            items: row,
          }))}
          renderTile={scoringLetter => {
            const state = isMarked(String(scoringLetter.position)) ? 'correct' : 'idle';
            return (
              <MarkTile
                variant="letter"
                width={52}
                state={state}
                text={scoringLetter.letter}
                testID={`letter-${scoringLetter.itemKey}`}
                accessibilityLabel={`${scoringLetter.word.word} letter ${scoringLetter.letterIndex + 1} ${scoringLetter.letter}, ${state}`}
                onPress={() => handleToggle(scoringLetter)}
              />
            );
          }}
        />
        <ToggleBar primary={{ label: 'Finish', onPress: handleFinish }} onSkip={() => setPhase('skip-picker')} />
      </View>
      {confirming && (
        <ConfirmSheet
          testID="confirm-finish"
          title={`${unmarkedCount} items unmarked — finish anyway?`}
          confirmLabel="Yes, finish"
          onConfirm={() => finish('completed')}
          cancelLabel="Cancel"
          onCancel={() => setPhase('active')}
        />
      )}
    </Canvas>
  );
}
