/**
 * ReadWordsQuestion — WelaPLUS Pattern C (Q6, timed pill grid).
 *
 * Child reads words aloud; EA taps each pill when the child gets it right.
 * When durationSec is provided, expiry opens the last-attempted marker.
 * Pills follow card rows when row_lengths is provided and otherwise wrap.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ItemSetMeta } from '../../types/ItemSet';
import { resolveItemSet } from '../../itemsets/resolveItemSet';
import { MissingItemSet } from '../../progress/MissingItemSet';
import type { ResultItem, StoppedReason } from '../../types/Result';
import type { ReadWordsItemSet, ReadWordsPrompt } from './types';
import { WELA_PLUS_READ_WORDS_EN } from '../../itemsets/wela_plus_read_words.en';
import { WELA_PLUS_READ_WORDS_XH } from '../../itemsets/wela_plus_read_words.xh';
import { useToggleMark } from '../../hooks/useToggleMark';
import { tokens } from '../../theme/tokens';
import { SkipReasonPicker } from '../../skip/SkipReasonPicker';
import type { ManualSkipReason } from '../../skip/skipReasons';
import { applyProgress, NO_ATTEMPT } from '../../progress/applyProgress';
import { LastAttemptedSheet } from '../../progress/LastAttemptedSheet';

type Phase = 'intro' | 'active' | 'mark-last' | 'skip-picker' | 'finished';
type MarkReason = 'ea_ended' | 'timer';

type MarkingPolarity = 'tap_correct' | 'tap_wrong';

type FullItemSet = ReadWordsItemSet & ItemSetMeta;

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
  if (typeof o.question_code !== 'string') return false;
  if (typeof o.language !== 'string') return false;
  if (!Array.isArray(o.words)) return false;
  if (o.row_lengths !== undefined) {
    if (!Array.isArray(o.row_lengths)) return false;
    if (
      !o.row_lengths.every(
        (length) => Number.isInteger(length) && length > 0,
      )
    ) {
      return false;
    }
    const total = o.row_lengths.reduce(
      (sum, length) => sum + (length as number),
      0,
    );
    if (total !== o.words.length) return false;
  }
  return o.words.every(isValidWord);
}

function keyFor(idx: number, word: string): string {
  return `${idx}:${word}`;
}

function chunkByLengths<T>(items: T[], rowLengths: number[]): T[][] {
  let cursor = 0;
  return rowLengths.map((length) => {
    const row = items.slice(cursor, cursor + length);
    cursor += length;
    return row;
  });
}

export function ReadWordsQuestion(
  props: QuestionProps & { markingPolarity?: MarkingPolarity },
) {
  const itemSet = resolveItemSet(
    props.language,
    props.itemSet,
    { en: WELA_PLUS_READ_WORDS_EN, xh: WELA_PLUS_READ_WORDS_XH },
    isFullItemSet,
  );
  if (!itemSet) return <MissingItemSet language={props.language} />;
  return <ReadWordsQuestionContent {...props} itemSet={itemSet} />;
}

function ReadWordsQuestionContent(
  props: QuestionProps & {
    itemSet: FullItemSet;
    markingPolarity?: MarkingPolarity;
  },
) {
  const {
    language,
    itemSet: effectiveItemSet,
    instructions,
    durationSec,
    onComplete,
    onItemMarked,
    markingPolarity = 'tap_correct',
  } = props;
  const [phase, setPhase] = useState<Phase>('intro');
  const [markReason, setMarkReason] = useState<MarkReason>('ea_ended');
  const { isMarked, toggle } = useToggleMark();

  const isMarkedRef = useRef(isMarked);
  useEffect(() => {
    isMarkedRef.current = isMarked;
  }, [isMarked]);

  const hasFinishedRef = useRef(false);
  const startTimeMsRef = useRef<number | null>(null);
  const stopTimeMsRef = useRef<number | null>(null);

  const getDeadlineMs = useCallback(() => {
    if (startTimeMsRef.current === null || durationSec === undefined) return null;
    return startTimeMsRef.current + durationSec * 1000;
  }, [durationSec]);

  const words = effectiveItemSet.words;
  const indexedWords = words.map((word, idx) => ({ word, idx }));
  const wordRows = effectiveItemSet.row_lengths
    ? chunkByLengths(indexedWords, effectiveItemSet.row_lengths)
    : null;

  const finish = useCallback(
    (stoppedReason: StoppedReason, lastAttempted: number = NO_ATTEMPT) => {
      if (hasFinishedRef.current) return;
      hasFinishedRef.current = true;
      setPhase('finished');
      const isSkipped = stoppedReason.startsWith('skipped_');
      const raw = isSkipped
        ? []
        : words.map((w, idx) => {
            const tapped = isMarkedRef.current(keyFor(idx, w.word));
            return {
              position: idx,
              item_key: w.item_key,
              prompt: w.word,
              is_correct:
                markingPolarity === 'tap_wrong' ? !tapped : tapped,
            };
          });
      const { items, totalAttempted } = isSkipped
        ? { items: [], totalAttempted: 0 }
        : applyProgress(raw, lastAttempted);
      const totalCorrect = items.filter((i) => i.is_correct).length;
      onComplete({
        question_code: effectiveItemSet.question_code,
        question_version: effectiveItemSet.question_version,
        item_set_id: effectiveItemSet.item_set_id,
        language,
        duration_ms:
          startTimeMsRef.current === null
            ? 0
            : (stopTimeMsRef.current ?? Date.now()) - startTimeMsRef.current,
        stopped_reason: stoppedReason,
        items,
        derived: {
          total_correct: totalCorrect,
          total_attempted: totalAttempted,
          percent:
            totalAttempted > 0
              ? Math.round((totalCorrect / totalAttempted) * 100)
              : 0,
          last_attempted_position: isSkipped ? null : lastAttempted,
          was_timed: durationSec !== undefined,
          tracks_progress: !isSkipped,
        },
      });
    },
    [effectiveItemSet, language, words, markingPolarity, durationSec, onComplete],
  );

  useEffect(() => {
    if (phase !== 'active') return undefined;
    if (startTimeMsRef.current === null) {
      startTimeMsRef.current = Date.now();
    }
    const deadlineMs = getDeadlineMs();
    if (deadlineMs === null) return undefined;
    const interval = setInterval(() => {
      if (Date.now() >= deadlineMs) {
        clearInterval(interval);
        // Reading ends at the deadline, even if this callback runs late.
        stopTimeMsRef.current = deadlineMs;
        setMarkReason('timer');
        setPhase('mark-last');
      }
    }, 250);
    return () => clearInterval(interval);
  }, [phase, getDeadlineMs]);

  const handleToggle = useCallback(
    (idx: number, item_key: string, word: string) => {
      const key = keyFor(idx, word);
      const willBeMarked = !isMarkedRef.current(key);
      toggle(key);
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

  const handleSkipChosen = useCallback(
    (reason: ManualSkipReason) => finish(reason),
    [finish],
  );

  const highestMarkedIndex = useCallback(() => {
    for (let idx = words.length - 1; idx >= 0; idx -= 1) {
      if (isMarkedRef.current(keyFor(idx, words[idx].word))) return idx;
    }
    return 0;
  }, [words]);

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

  if (phase === 'skip-picker') {
    return (
      <SkipReasonPicker
        onChoose={handleSkipChosen}
        onCancel={() => setPhase('active')}
      />
    );
  }

  if (phase === 'mark-last') {
    return (
      <LastAttemptedSheet
        labels={words.map((word) => word.word)}
        rowLengths={effectiveItemSet.row_lengths}
        defaultIndex={highestMarkedIndex()}
        onConfirm={(idx) => finish(markReason, idx)}
        onCancel={
          markReason === 'ea_ended'
            ? () => {
                stopTimeMsRef.current = null;
                setPhase('active');
              }
            : undefined
        }
      />
    );
  }

  const renderWord = ({ word: w, idx }: { word: ReadWordsPrompt; idx: number }) => {
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
          {
            backgroundColor: marked
              ? tokens.color.marked
              : tokens.color.surface,
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
  };

  return (
    <View style={styles.root}>
      <ScrollView
        testID="word-scroll"
        style={styles.scroll}
        contentContainerStyle={wordRows ? styles.rows : styles.wrap}
      >
        {wordRows
          ? wordRows.map((row, r) => (
              <View key={r} testID={`word-row-${r}`} style={styles.row}>
                {row.map(renderWord)}
              </View>
            ))
          : indexedWords.map(renderWord)}
      </ScrollView>
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const nowMs = Date.now();
            const deadlineMs = getDeadlineMs();
            const deadlineReached = deadlineMs !== null && nowMs >= deadlineMs;
            // Resolve expiry here too: End can arrive before a delayed timer callback.
            if (deadlineMs !== null) {
              stopTimeMsRef.current = deadlineReached ? deadlineMs : nowMs;
            }
            setMarkReason(deadlineReached ? 'timer' : 'ea_ended');
            setPhase('mark-last');
          }}
        >
          <Text>End</Text>
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
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space.sm,
    padding: tokens.space.md,
  },
  rows: {
    gap: tokens.space.sm,
    padding: tokens.space.md,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space.sm,
  },
  pill: {
    paddingHorizontal: tokens.space.lg,
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
