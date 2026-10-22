/**
 * WriteSentencesFromDictationQuestion — WelaPLUS Pattern D (Q10).
 *
 * EA dictates each sentence aloud; child writes from memory on paper; EA
 * marks each written word independently. Words are grouped by sentence.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { monotonicNow } from '../../progress/clock';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ItemSetMeta } from '../../types/ItemSet';
import { resolveItemSet } from '../../itemsets/resolveItemSet';
import { MissingItemSet } from '../../progress/MissingItemSet';
import type { Result, ResultItem, StoppedReason } from '../../types/Result';
import type {
  WriteSentencesFromDictationItemSet,
  WriteSentencesFromDictationSentence,
  WriteSentencesFromDictationWord,
} from './types';
import { WELA_PLUS_WRITE_SENTENCES_DICTATION_EN } from '../../itemsets/wela_plus_write_sentences_dictation.en';
import { WELA_PLUS_WRITE_SENTENCES_DICTATION_XH } from '../../itemsets/wela_plus_write_sentences_dictation.xh';
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

type FullItemSet = WriteSentencesFromDictationItemSet & ItemSetMeta;

function isValidWord(value: unknown): value is WriteSentencesFromDictationWord {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return typeof o.item_key === 'string' && typeof o.word === 'string';
}

function isValidSentence(
  value: unknown,
): value is WriteSentencesFromDictationSentence {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.item_key === 'string' &&
    Array.isArray(o.words) &&
    o.words.length > 0 &&
    o.words.every(isValidWord)
  );
}

function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.item_set_id !== 'string') return false;
  if (typeof o.question_version !== 'string') return false;
  if (typeof o.question_code !== 'string') return false;
  if (typeof o.language !== 'string') return false;
  if (!Array.isArray(o.sentences) || o.sentences.length === 0) return false;
  return o.sentences.every(isValidSentence);
}

interface FlatWord extends WriteSentencesFromDictationWord {
  sentenceIndex: number;
  wordIndex: number;
  position: number;
}

function flattenWords(
  sentences: WriteSentencesFromDictationSentence[],
): FlatWord[] {
  const flatWords: FlatWord[] = [];
  let position = 0;
  sentences.forEach((sentence, sentenceIndex) => {
    sentence.words.forEach((word, wordIndex) => {
      flatWords.push({
        ...word,
        sentenceIndex,
        wordIndex,
        position,
      });
      position += 1;
    });
  });
  return flatWords;
}

export function WriteSentencesFromDictationQuestion(props: QuestionProps) {
  const itemSet = resolveItemSet(
    props.language,
    props.itemSet,
    { en: WELA_PLUS_WRITE_SENTENCES_DICTATION_EN, xh: WELA_PLUS_WRITE_SENTENCES_DICTATION_XH },
    isFullItemSet,
  );
  if (!itemSet) return <MissingItemSet language={props.language} />;
  return <WriteSentencesFromDictationQuestionContent {...props} itemSet={itemSet} />;
}

function WriteSentencesFromDictationQuestionContent(
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

  const sentences = effectiveItemSet.sentences;
  const flatWords = React.useMemo(() => flattenWords(sentences), [sentences]);
  const unmarkedCount = flatWords.reduce(
    (acc, word) => acc + (isMarked(String(word.position)) ? 0 : 1),
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
        : flatWords.map((word) => ({
            position: word.position,
            item_key: word.item_key,
            prompt: word.word,
            is_correct: isMarkedRef.current(String(word.position)),
            metadata: {
              sentence_index: word.sentenceIndex,
              word_index: word.wordIndex,
            },
          }));
      const totalCorrect = items.filter((i) => i.is_correct).length;
      const totalAttempted = items.length;
      const elapsedMs =
        startTimeMsRef.current === null
          ? 0
          : Math.round(monotonicNow() - startTimeMsRef.current);
      const perSentence = isSkipped
        ? []
        : sentences.map((sentence, sentenceIndex) => {
            const sentenceWords = flatWords.filter(
              (word) => word.sentenceIndex === sentenceIndex,
            );
            return {
              correct: sentenceWords.filter((word) =>
                isMarkedRef.current(String(word.position)),
              ).length,
              total: sentence.words.length,
            };
          });

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
          per_sentence: perSentence,
        },
      };
      onComplete(result);
    },
    [effectiveItemSet, language, flatWords, sentences, onComplete],
  );

  const handleToggle = useCallback(
    (word: FlatWord) => {
      const willBeMarked = !isMarkedRef.current(String(word.position));
      toggle(String(word.position));
      if (onItemMarked) {
        const item: ResultItem = {
          position: word.position,
          item_key: word.item_key,
          prompt: word.word,
          is_correct: willBeMarked,
          metadata: {
            sentence_index: word.sentenceIndex,
            word_index: word.wordIndex,
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
    return <QuestionIntro instructions={instructions} onStart={() => setPhase('active')} />;
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
          groups={sentences.map((sentence, sentenceIndex) => ({
            key: String(sentenceIndex),
            heading: `${sentenceIndex + 1}.`,
            items: flatWords.filter(word => word.sentenceIndex === sentenceIndex),
          }))}
          renderTile={word => {
            const state = isMarked(String(word.position)) ? 'correct' : 'idle';
            return (
              <MarkTile
                variant="pill"
                state={state}
                text={word.word}
                testID={`word-${word.item_key}`}
                accessibilityLabel={`${word.word}, ${state}`}
                onPress={() => handleToggle(word)}
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
