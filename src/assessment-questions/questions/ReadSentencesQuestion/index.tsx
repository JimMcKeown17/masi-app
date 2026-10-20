/**
 * ReadSentencesQuestion — WelaPLUS Pattern C (Q7, untimed sentence-grouped reading).
 *
 * Child reads ~4 short sentences aloud; EA taps each correct word per pill.
 * Sentences are visually grouped (subtle background per sentence row).
 * Untimed by design; derived.per_sentence_percent reports comprehension
 * shape per sentence as a computed field.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ItemSetMeta } from '../../types/ItemSet';
import { resolveItemSet } from '../../itemsets/resolveItemSet';
import { MissingItemSet } from '../../progress/MissingItemSet';
import type { Result, ResultItem, StoppedReason } from '../../types/Result';
import type {
  ReadSentencesItemSet,
  ReadSentencesSentence,
  ReadSentencesWord,
} from './types';
import { WELA_PLUS_READ_SENTENCES_EN } from '../../itemsets/wela_plus_read_sentences.en';
import { WELA_PLUS_READ_SENTENCES_XH } from '../../itemsets/wela_plus_read_sentences.xh';
import { useToggleMark } from '../../hooks/useToggleMark';
import { tokens } from '../../theme/tokens';
import { SkipReasonPicker } from '../../skip/SkipReasonPicker';
import type { ManualSkipReason } from '../../skip/skipReasons';

type Phase = 'intro' | 'active' | 'confirm-finish' | 'skip-picker' | 'finished';

type MarkingPolarity = 'tap_correct' | 'tap_wrong';

type FullItemSet = ReadSentencesItemSet & ItemSetMeta;

function isValidWord(w: unknown): w is ReadSentencesWord {
  if (!w || typeof w !== 'object') return false;
  const o = w as Record<string, unknown>;
  return typeof o.item_key === 'string' && typeof o.word === 'string';
}

function isValidSentence(s: unknown): s is ReadSentencesSentence {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.item_key === 'string' &&
    Array.isArray(o.words) &&
    o.words.every(isValidWord)
  );
}

// Single-language overrides per codebase convention.
function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.item_set_id !== 'string') return false;
  if (typeof o.question_version !== 'string') return false;
  if (typeof o.question_code !== 'string') return false;
  if (typeof o.language !== 'string') return false;
  if (!Array.isArray(o.sentences)) return false;
  return o.sentences.every(isValidSentence);
}

interface FlatWord {
  item_key: string;
  word: string;
  sentenceIndex: number;
  position: number;
}

function flattenWords(sentences: ReadSentencesSentence[]): FlatWord[] {
  const out: FlatWord[] = [];
  let position = 0;
  sentences.forEach((s, sIdx) => {
    s.words.forEach((w) => {
      out.push({
        item_key: w.item_key,
        word: w.word,
        sentenceIndex: sIdx,
        position,
      });
      position += 1;
    });
  });
  return out;
}

export function ReadSentencesQuestion(
  props: QuestionProps & { markingPolarity?: MarkingPolarity },
) {
  const itemSet = resolveItemSet(
    props.language,
    props.itemSet,
    { en: WELA_PLUS_READ_SENTENCES_EN, xh: WELA_PLUS_READ_SENTENCES_XH },
    isFullItemSet,
  );
  if (!itemSet) return <MissingItemSet language={props.language} />;
  return <ReadSentencesQuestionContent {...props} itemSet={itemSet} />;
}

function ReadSentencesQuestionContent(
  props: QuestionProps & {
    itemSet: FullItemSet;
    markingPolarity?: MarkingPolarity;
  },
) {
  const {
    language,
    itemSet: effectiveItemSet,
    instructions,
    onComplete,
    onItemMarked,
    markingPolarity = 'tap_correct',
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
    (acc, w) => acc + (isMarked(w.item_key) ? 0 : 1),
    0,
  );

  useEffect(() => {
    if (phase === 'active' && startTimeMsRef.current === null) {
      startTimeMsRef.current = Date.now();
    }
  }, [phase]);

  const computePerSentencePercent = useCallback(
    (correctnessByPosition: boolean[]): number[] => {
      return sentences.map((s, sIdx) => {
        const sentenceWords = flatWords.filter((w) => w.sentenceIndex === sIdx);
        if (sentenceWords.length === 0) return 0;
        const correctInSentence = sentenceWords.filter(
          (w) => correctnessByPosition[w.position],
        ).length;
        return Math.round((correctInSentence / sentenceWords.length) * 100);
      });
    },
    [sentences, flatWords],
  );

  const finish = useCallback(
    (stoppedReason: StoppedReason) => {
      if (hasFinishedRef.current) return;
      hasFinishedRef.current = true;
      setPhase('finished');

      // Skip-emits-empty contract: skipped_* never persists per-item rows.
      const isSkipped = stoppedReason.startsWith('skipped_');
      const items = isSkipped
        ? []
        : flatWords.map((w) => {
            const tapped = isMarkedRef.current(w.item_key);
            const isCorrect =
              markingPolarity === 'tap_wrong' ? !tapped : tapped;
            return {
              position: w.position,
              item_key: w.item_key,
              prompt: w.word,
              is_correct: isCorrect,
            };
          });
      const correctnessByPosition = isSkipped
        ? []
        : items.map((i) => i.is_correct);
      const totalCorrect = items.filter((i) => i.is_correct).length;
      const totalAttempted = items.length;
      const percent =
        totalAttempted > 0
          ? Math.round((totalCorrect / totalAttempted) * 100)
          : 0;
      const elapsedMs =
        startTimeMsRef.current === null
          ? 0
          : Date.now() - startTimeMsRef.current;
      // For skipped runs per_sentence_percent is empty — no data to summarize.
      const perSentence = isSkipped
        ? []
        : computePerSentencePercent(correctnessByPosition);

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
          percent,
          last_attempted_position: isSkipped ? null : items.length - 1,
          was_timed: false,
          tracks_progress: !isSkipped,
          per_sentence_percent: perSentence,
        },
      };
      onComplete(result);
    },
    [
      effectiveItemSet,
      language,
      flatWords,
      markingPolarity,
      computePerSentencePercent,
      onComplete,
    ],
  );

  const handleToggle = useCallback(
    (w: FlatWord) => {
      const willBeMarked = !isMarkedRef.current(w.item_key);
      toggle(w.item_key);
      if (onItemMarked) {
        const tappedAfter = willBeMarked;
        const isCorrect =
          markingPolarity === 'tap_wrong' ? !tappedAfter : tappedAfter;
        const item: ResultItem = {
          position: w.position,
          item_key: w.item_key,
          prompt: w.word,
          is_correct: isCorrect,
        };
        onItemMarked(item);
      }
    },
    [toggle, markingPolarity, onItemMarked],
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
    return (
      <View>
        {instructions ? <Text>{instructions}</Text> : null}
        <Pressable onPress={() => setPhase('active')}>
          <Text>Start</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'finished') {
    return <View />;
  }

  if (phase === 'confirm-finish') {
    return (
      <View>
        <Text>{`${unmarkedCount} items unmarked — finish anyway?`}</Text>
        <Pressable onPress={() => finish('completed')}>
          <Text>Yes, finish</Text>
        </Pressable>
        <Pressable onPress={() => setPhase('active')}>
          <Text>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'skip-picker') {
    return (
      <SkipReasonPicker
        onChoose={handleSkipChosen}
        onCancel={() => setPhase('active')}
      />
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView testID="sentence-scroll" style={styles.scroll}>
        {sentences.map((s, sIdx) => (
          <View
            key={s.item_key}
            testID={`sentence-row-${s.item_key}`}
            style={styles.sentenceRow}
          >
            {s.words.map((w) => {
              const flat = flatWords.find((f) => f.item_key === w.item_key);
              if (!flat) return null;
              const marked = isMarked(w.item_key);
              const labelState = marked ? 'correct' : 'idle';
              return (
                <Pressable
                  key={w.item_key}
                  testID={`pill-${w.item_key}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${w.word}, ${labelState}`}
                  onPress={() => handleToggle(flat)}
                  style={[
                    styles.pill,
                    {
                      backgroundColor: marked ? tokens.color.marked : tokens.color.surface,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.word,
                      {
                        color: marked ? tokens.color.onMarked : tokens.color.ink,
                      },
                    ]}
                  >
                    {w.word}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
      <View style={styles.nav}>
        <Pressable accessibilityRole="button" onPress={handleFinish}>
          <Text>Finish</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setPhase('skip-picker')}
        >
          <Text>Skip question</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  sentenceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space.sm,
    padding: tokens.space.md,
    margin: tokens.space.sm,
    backgroundColor: tokens.color.canvas,
    borderRadius: tokens.radius.cell,
  },
  pill: {
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    borderWidth: 1,
    borderColor: tokens.color.line,
    borderRadius: tokens.radius.pill,
  },
  word: { fontSize: tokens.font.markingItem, fontWeight: '600' },
  nav: {
    flexDirection: 'row',
    gap: tokens.space.lg,
    padding: tokens.space.md,
  },
});
