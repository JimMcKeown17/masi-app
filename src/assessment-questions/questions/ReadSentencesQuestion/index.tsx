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
import type { Result, ResultItem, StoppedReason } from '../../types/Result';
import type {
  ReadSentencesItemSet,
  ReadSentencesSentence,
  ReadSentencesWord,
} from './types';
import { WELA_PLUS_READ_SENTENCES_EN } from '../../itemsets/wela_plus_read_sentences.en';
import { WELA_PLUS_READ_SENTENCES_XH } from '../../itemsets/wela_plus_read_sentences.xh';
import { useToggleMark } from '../../hooks/useToggleMark';
import { useChildReadingFontSize } from '../../hooks/useChildReadingFontSize';

const BASE_WORD_FONT_SIZE = 22;
const MARKED_BG = '#2e7d32';
const IDLE_BG = '#ffffff';
const SENTENCE_BG = '#f4f6fa';

type Phase = 'intro' | 'active' | 'confirm-finish' | 'abandon-picker' | 'finished';

type MarkingPolarity = 'tap_correct' | 'tap_wrong';

type SkipReason = Extract<StoppedReason, `skipped_${string}` | 'ea_ended'>;

const SKIP_REASONS: { reason: SkipReason; label: string }[] = [
  { reason: 'skipped_child_refused', label: 'Child refused' },
  { reason: 'skipped_tired', label: 'Child tired' },
  { reason: 'skipped_time', label: 'Out of time' },
  { reason: 'skipped_age', label: 'Age inappropriate' },
  { reason: 'skipped_prerequisite_unmet', label: 'Prerequisite unmet' },
  { reason: 'skipped_other', label: 'Other' },
];

type FullItemSet = ReadSentencesItemSet & {
  item_set_id: string;
  question_version: string;
};

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
  if (!Array.isArray(o.sentences)) return false;
  return o.sentences.every(isValidSentence);
}

function resolveItemSet(language: string, override: unknown): FullItemSet {
  if (isFullItemSet(override)) return override;
  return language === 'xh'
    ? WELA_PLUS_READ_SENTENCES_XH
    : WELA_PLUS_READ_SENTENCES_EN;
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
  const {
    language,
    itemSet,
    instructions,
    onComplete,
    onItemMarked,
    onAbandon,
    markingPolarity = 'tap_correct',
  } = props;
  const [phase, setPhase] = useState<Phase>('intro');
  const { isMarked, toggle } = useToggleMark();
  const fontScale = useChildReadingFontSize();
  const wordFontSize = BASE_WORD_FONT_SIZE * fontScale;
  const effectiveItemSet = resolveItemSet(language, itemSet);

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

      const items = flatWords.map((w) => {
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
      const correctnessByPosition = items.map((i) => i.is_correct);
      const totalCorrect = items.filter((i) => i.is_correct).length;
      const totalAttempted = flatWords.length;
      const percent =
        totalAttempted > 0
          ? Math.round((totalCorrect / totalAttempted) * 100)
          : 0;
      const elapsedMs =
        startTimeMsRef.current === null
          ? 0
          : Date.now() - startTimeMsRef.current;
      const perSentence = computePerSentencePercent(correctnessByPosition);

      const result: Result = {
        question_code: 'wela_plus_read_sentences',
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
          last_attempted_position: null,
          was_timed: false,
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

  const handleAbandonChosen = useCallback(
    (reason: SkipReason) => {
      if (onAbandon) onAbandon(reason);
      finish(reason);
    },
    [onAbandon, finish],
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

  if (phase === 'abandon-picker') {
    return (
      <View>
        <Text>Why are you abandoning?</Text>
        {SKIP_REASONS.map(({ reason, label }) => (
          <Pressable
            key={reason}
            accessibilityRole="button"
            onPress={() => handleAbandonChosen(reason)}
          >
            <Text>{label}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setPhase('active')}>
          <Text>Cancel</Text>
        </Pressable>
      </View>
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
                    { backgroundColor: marked ? MARKED_BG : IDLE_BG },
                  ]}
                >
                  <Text
                    style={[
                      styles.word,
                      {
                        fontSize: wordFontSize,
                        color: marked ? '#ffffff' : '#111',
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
          onPress={() => setPhase('abandon-picker')}
        >
          <Text>Abandon</Text>
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
    gap: 8,
    padding: 12,
    margin: 8,
    backgroundColor: SENTENCE_BG,
    borderRadius: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 999,
  },
  word: { fontWeight: '600' },
  nav: {
    flexDirection: 'row',
    gap: 16,
    padding: 12,
  },
});
