/**
 * LetterSoundsQuestion — WelaPLUS Pattern A (timed tap-grid).
 *
 * Pure capture component: accepts QuestionProps, emits a contract-valid
 * Result via onComplete. Knows nothing about children, EAs, programmes, or
 * storage. Host wraps and persists. See PRD §"Pattern A — Timed tap-grid".
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ResultItem, StoppedReason } from '../../types/Result';
import type { LetterSoundsItemSet } from './types';
import { WELA_PLUS_LETTER_SOUNDS_EN } from '../../itemsets/wela_plus_letter_sounds.en';
import { WELA_PLUS_LETTER_SOUNDS_XH } from '../../itemsets/wela_plus_letter_sounds.xh';
import { useToggleMark } from '../../hooks/useToggleMark';
import { tokens } from '../../theme/tokens';
import { SkipReasonPicker } from '../../skip/SkipReasonPicker';
import type { ManualSkipReason } from '../../skip/skipReasons';
import { applyProgress, NO_ATTEMPT } from '../../progress/applyProgress';
import { LastAttemptedSheet } from '../../progress/LastAttemptedSheet';

type Phase = 'intro' | 'active' | 'mark-last' | 'skip-picker' | 'finished';
type MarkReason = 'ea_ended' | 'timer';

type FullLetterSoundsItemSet = LetterSoundsItemSet & {
  item_set_id: string;
  question_version: string;
};

function isFullItemSet(value: unknown): value is FullLetterSoundsItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    Array.isArray(o.letters) &&
    typeof o.columns === 'number' &&
    typeof o.item_set_id === 'string' &&
    typeof o.question_version === 'string'
  );
}

function resolveItemSet(
  language: string,
  override: unknown,
): FullLetterSoundsItemSet {
  if (isFullItemSet(override)) return override;
  return language === 'xh'
    ? WELA_PLUS_LETTER_SOUNDS_XH
    : WELA_PLUS_LETTER_SOUNDS_EN;
}

function keyFor(idx: number, letter: string): string {
  return `${idx}:${letter}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from(
    { length: Math.ceil(items.length / size) },
    (_, row) => items.slice(row * size, (row + 1) * size),
  );
}

export function LetterSoundsQuestion(props: QuestionProps) {
  const {
    language,
    itemSet,
    instructions,
    durationSec,
    onComplete,
    onItemMarked,
  } = props;
  const [phase, setPhase] = useState<Phase>('intro');
  const [markReason, setMarkReason] = useState<MarkReason>('ea_ended');
  const { isMarked, toggle } = useToggleMark();
  const effectiveItemSet = resolveItemSet(language, itemSet);

  const isMarkedRef = useRef(isMarked);
  useEffect(() => {
    isMarkedRef.current = isMarked;
  }, [isMarked]);
  const hasFinishedRef = useRef(false);
  const startTimeMsRef = useRef<number | null>(null);
  const stopTimeMsRef = useRef<number | null>(null);

  const letters = effectiveItemSet.letters;
  const columns = effectiveItemSet.columns;
  const letterRows = chunk(letters, columns);
  const tileBasis: `${number}%` = `${100 / columns}%`;

  const finish = useCallback(
    (stoppedReason: StoppedReason, lastAttempted: number = NO_ATTEMPT) => {
      if (hasFinishedRef.current) return;
      hasFinishedRef.current = true;
      setPhase('finished');
      const isSkipped = stoppedReason.startsWith('skipped_');
      const raw = isSkipped
        ? []
        : letters.map((letter, idx) => ({
            position: idx,
            item_key: letter,
            prompt: letter,
            is_correct: isMarkedRef.current(keyFor(idx, letter)),
          }));
      const { items, totalAttempted } = isSkipped
        ? { items: [], totalAttempted: 0 }
        : applyProgress(raw, lastAttempted);
      const totalCorrect = items.filter((i) => i.is_correct).length;
      onComplete({
        question_code: 'wela_plus_letter_sounds',
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
    [
      effectiveItemSet,
      language,
      letters,
      durationSec,
      onComplete,
    ],
  );

  useEffect(() => {
    if (phase !== 'active') return undefined;
    if (startTimeMsRef.current === null) {
      startTimeMsRef.current = Date.now();
    }
    if (durationSec === undefined) return undefined;
    const deadlineMs = startTimeMsRef.current + durationSec * 1000;
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
  }, [phase, durationSec]);

  const handleToggle = useCallback(
    (idx: number, letter: string) => {
      const key = keyFor(idx, letter);
      const willBeMarked = !isMarkedRef.current(key);
      toggle(key);
      if (onItemMarked) {
        const item: ResultItem = {
          position: idx,
          item_key: letter,
          prompt: letter,
          is_correct: willBeMarked,
        };
        onItemMarked(item);
      }
    },
    [toggle, onItemMarked],
  );

  const handleSkipChosen = useCallback(
    (reason: ManualSkipReason) => finish(reason),
    [finish],
  );

  const highestMarkedIndex = useCallback(() => {
    for (let idx = letters.length - 1; idx >= 0; idx -= 1) {
      if (isMarkedRef.current(keyFor(idx, letters[idx]))) return idx;
    }
    return 0;
  }, [letters]);

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
        labels={letters}
        rowLengths={letterRows.map((row) => row.length)}
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

  return (
    <View>
      <View testID="letter-grid" style={styles.grid}>
        {letterRows.map((row, r) => (
          <View key={r} testID={`letter-row-${r}`} style={styles.row}>
            {row.map((letter, i) => {
              const idx = r * columns + i;
              const key = keyFor(idx, letter);
              const marked = isMarked(key);
              const labelState = marked ? 'correct' : 'idle';
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`${letter}, ${labelState}`}
                  onPress={() => handleToggle(idx, letter)}
                  style={[
                    styles.tile,
                    {
                      flexBasis: tileBasis,
                      backgroundColor: marked
                        ? tokens.color.marked
                        : tokens.color.surface,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.letter,
                      {
                        color: marked
                          ? tokens.color.onMarked
                          : tokens.color.ink,
                      },
                    ]}
                  >
                    {letter}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            // Timed scores measure reading, not time spent confirming the marker.
            if (durationSec !== undefined) stopTimeMsRef.current = Date.now();
            setMarkReason('ea_ended');
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
  grid: {
    gap: tokens.space.xs,
  },
  row: {
    flexDirection: 'row',
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: tokens.space.lg,
    borderWidth: 1,
    borderColor: tokens.color.line,
  },
  letter: {
    fontSize: tokens.font.markingItem,
    fontWeight: '600',
  },
  nav: {
    flexDirection: 'row',
    gap: tokens.space.lg,
    paddingTop: tokens.space.lg,
  },
});
