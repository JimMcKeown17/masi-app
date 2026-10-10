/**
 * ReadWordsQuestion — WelaPLUS Pattern C (Q6, timed pill grid).
 *
 * Child reads words aloud; EA taps each pill when the child gets it right.
 * Timed: when durationSec elapses the Question finishes with stopped_reason='timer'.
 * Pills wrap; pill size responds to childReadingFontSize. derived.was_timed=true.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { QuestionProps } from '../../types/QuestionProps';
import type { Result, ResultItem, StoppedReason } from '../../types/Result';
import type { ReadWordsItemSet, ReadWordsPrompt } from './types';
import { WELA_PLUS_READ_WORDS_EN } from '../../itemsets/wela_plus_read_words.en';
import { WELA_PLUS_READ_WORDS_XH } from '../../itemsets/wela_plus_read_words.xh';
import { useToggleMark } from '../../hooks/useToggleMark';
import { useChildReadingFontSize } from '../../hooks/useChildReadingFontSize';

const BASE_WORD_FONT_SIZE = 24;
const MARKED_BG = '#2e7d32';
const IDLE_BG = '#ffffff';

type Phase = 'intro' | 'active' | 'abandon-picker' | 'finished';

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

type FullItemSet = ReadWordsItemSet & {
  item_set_id: string;
  question_version: string;
};

function isValidWord(p: unknown): p is ReadWordsPrompt {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return typeof o.item_key === 'string' && typeof o.word === 'string';
}

// Itemset overrides are SINGLE-LANGUAGE by codebase convention.
function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.item_set_id !== 'string') return false;
  if (typeof o.question_version !== 'string') return false;
  if (!Array.isArray(o.words)) return false;
  return o.words.every(isValidWord);
}

function resolveItemSet(language: string, override: unknown): FullItemSet {
  if (isFullItemSet(override)) return override;
  return language === 'xh' ? WELA_PLUS_READ_WORDS_XH : WELA_PLUS_READ_WORDS_EN;
}

function keyFor(idx: number, word: string): string {
  return `${idx}:${word}`;
}

export function ReadWordsQuestion(
  props: QuestionProps & { markingPolarity?: MarkingPolarity },
) {
  const {
    language,
    itemSet,
    instructions,
    durationSec,
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
  const lastAttemptedPositionRef = useRef<number | null>(null);

  const words = effectiveItemSet.words;

  const finish = useCallback(
    (stoppedReason: StoppedReason) => {
      if (hasFinishedRef.current) return;
      hasFinishedRef.current = true;
      setPhase('finished');

      // Timed Pattern C Questions MUST report a numeric last_attempted_position
      // per the contract validator. -1 is the sentinel for "no items reached"
      // when the EA abandons with zero taps; downstream consumers compute
      // total_attempted = max(0, last_attempted_position + 1).
      // Known limitation (codex review): in tap_correct mode the EA only taps
      // CORRECT words, so this cursor underestimates "reached" — wrong-untapped
      // words past max-tapped are conflated with not-reached. Resolving the
      // ambiguity requires a separate progress cursor UI (deferred until
      // pedagogy validates the limitation in the field).
      const wasTimed = durationSec !== undefined;
      const lastPosRaw = lastAttemptedPositionRef.current;
      const lastPos = wasTimed
        ? lastPosRaw === null
          ? -1
          : lastPosRaw
        : lastPosRaw;

      // Skip-emits-empty contract: skipped_* never persists per-item rows.
      const isSkipped = stoppedReason.startsWith('skipped_');
      const items = isSkipped
        ? []
        : words.map((w, idx) => {
            const tapped = isMarkedRef.current(keyFor(idx, w.word));
            // Items past the reached boundary in a timed Question are "not
            // reached" — they must NOT count as correct, regardless of
            // polarity. For lastPos = -1 (no taps), every idx>=0 is past
            // lastPos → all items not reached (tap_wrong + zero-tap fix).
            const notReached =
              wasTimed && lastPos !== null && idx > lastPos;
            const isCorrect = notReached
              ? false
              : markingPolarity === 'tap_wrong'
              ? !tapped
              : tapped;
            return {
              position: idx,
              item_key: w.item_key,
              prompt: w.word,
              is_correct: isCorrect,
            };
          });
      const totalCorrect = items.filter((i) => i.is_correct).length;
      const totalAttempted = isSkipped
        ? 0
        : lastPos === null || lastPos < 0
        ? 0
        : lastPos + 1;
      const percent =
        totalAttempted > 0
          ? Math.round((totalCorrect / totalAttempted) * 100)
          : 0;
      const elapsedMs =
        startTimeMsRef.current === null
          ? 0
          : Date.now() - startTimeMsRef.current;

      const result: Result = {
        question_code: 'wela_plus_read_words',
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
          last_attempted_position: lastPos,
          was_timed: wasTimed,
        },
      };
      onComplete(result);
    },
    [effectiveItemSet, language, words, markingPolarity, durationSec, onComplete],
  );

  useEffect(() => {
    if (phase !== 'active') return undefined;
    if (startTimeMsRef.current === null) {
      startTimeMsRef.current = Date.now();
    }
    if (durationSec === undefined) return undefined;
    const interval = setInterval(() => {
      const elapsed =
        startTimeMsRef.current === null
          ? 0
          : Date.now() - startTimeMsRef.current;
      if (elapsed >= durationSec * 1000) {
        clearInterval(interval);
        finish('timer');
      }
    }, 250);
    return () => clearInterval(interval);
  }, [phase, durationSec, finish]);

  const handleToggle = useCallback(
    (idx: number, item_key: string, word: string) => {
      const key = keyFor(idx, word);
      const willBeMarked = !isMarkedRef.current(key);
      toggle(key);
      // Track furthest position the EA has touched — used for last_attempted_position.
      if (
        lastAttemptedPositionRef.current === null ||
        idx > lastAttemptedPositionRef.current
      ) {
        lastAttemptedPositionRef.current = idx;
      }
      if (onItemMarked) {
        const tappedAfter = willBeMarked;
        const isCorrect =
          markingPolarity === 'tap_wrong' ? !tappedAfter : tappedAfter;
        const item: ResultItem = {
          position: idx,
          item_key,
          prompt: word,
          is_correct: isCorrect,
        };
        onItemMarked(item);
      }
    },
    [toggle, markingPolarity, onItemMarked],
  );

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
      <ScrollView
        testID="word-scroll"
        style={styles.scroll}
        contentContainerStyle={styles.wrap}
      >
        {words.map((w, idx) => {
          const key = keyFor(idx, w.word);
          const marked = isMarked(key);
          const labelState = marked ? 'correct' : 'idle';
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={`${w.word}, ${labelState}`}
              onPress={() => handleToggle(idx, w.item_key, w.word)}
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
      </ScrollView>
      <View style={styles.nav}>
        <Pressable accessibilityRole="button" onPress={() => finish('ea_ended')}>
          <Text>End</Text>
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
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 12,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
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
