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
import type { Result, ResultItem, StoppedReason } from '../../types/Result';
import type { LetterSoundsItemSet } from './types';
import { WELA_PLUS_LETTER_SOUNDS_EN } from '../../itemsets/wela_plus_letter_sounds.en';
import { WELA_PLUS_LETTER_SOUNDS_XH } from '../../itemsets/wela_plus_letter_sounds.xh';
import { useToggleMark } from '../../hooks/useToggleMark';
import { useChildReadingFontSize } from '../../hooks/useChildReadingFontSize';

const BASE_LETTER_FONT_SIZE = 32;
const MARKED_BG = '#2e7d32';
const IDLE_BG = '#ffffff';

type Phase = 'intro' | 'active' | 'finished';

function resolveItemSet(
  language: string,
  override: unknown,
): LetterSoundsItemSet & { item_set_id: string; question_version: string } {
  if (override && typeof override === 'object' && 'letters' in override) {
    return override as LetterSoundsItemSet & {
      item_set_id: string;
      question_version: string;
    };
  }
  return language === 'xh'
    ? WELA_PLUS_LETTER_SOUNDS_XH
    : WELA_PLUS_LETTER_SOUNDS_EN;
}

function keyFor(idx: number, letter: string): string {
  return `${idx}:${letter}`;
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
  const [currentPage, setCurrentPage] = useState(0);
  const { isMarked, toggle } = useToggleMark();
  const fontScale = useChildReadingFontSize();
  const letterFontSize = BASE_LETTER_FONT_SIZE * fontScale;
  const effectiveItemSet = resolveItemSet(language, itemSet);

  const isMarkedRef = useRef(isMarked);
  isMarkedRef.current = isMarked;
  const highestPageVisitedRef = useRef(0);
  const hasFinishedRef = useRef(false);
  const startTimeMsRef = useRef<number | null>(null);

  const totalLetters = effectiveItemSet.letters.length;
  const lettersPerPage = effectiveItemSet.lettersPerPage;
  const totalPages = Math.max(1, Math.ceil(totalLetters / lettersPerPage));
  const columns = effectiveItemSet.columns;
  const tileBasis: `${number}%` = `${100 / columns}%`;

  const finish = useCallback(
    (stoppedReason: StoppedReason) => {
      if (hasFinishedRef.current) return;
      hasFinishedRef.current = true;
      setPhase('finished');

      const lastVisibleOnPage =
        Math.min(
          (highestPageVisitedRef.current + 1) * lettersPerPage,
          totalLetters,
        ) - 1;

      const items = effectiveItemSet.letters.map((letter, idx) => ({
        position: idx,
        item_key: letter,
        prompt: letter,
        is_correct: isMarkedRef.current(keyFor(idx, letter)),
      }));
      const totalCorrect = items.filter((i) => i.is_correct).length;
      const totalAttempted = lastVisibleOnPage + 1;
      const percent =
        totalAttempted > 0
          ? Math.round((totalCorrect / totalAttempted) * 100)
          : 0;
      const elapsedMs =
        startTimeMsRef.current === null ? 0 : Date.now() - startTimeMsRef.current;

      const result: Result = {
        question_code: 'wela_plus_letter_sounds',
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
          last_attempted_position: lastVisibleOnPage,
          was_timed: durationSec !== undefined,
        },
      };
      onComplete(result);
    },
    [
      effectiveItemSet,
      language,
      lettersPerPage,
      totalLetters,
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

  const pageStart = currentPage * lettersPerPage;
  const pageLetters = effectiveItemSet.letters.slice(
    pageStart,
    pageStart + lettersPerPage,
  );

  return (
    <View>
      <View testID="letter-grid" style={styles.grid}>
        {pageLetters.map((letter, i) => {
          const idx = pageStart + i;
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
                  backgroundColor: marked ? MARKED_BG : IDLE_BG,
                },
              ]}
            >
              <Text
                style={[
                  styles.letter,
                  { fontSize: letterFontSize, color: marked ? '#ffffff' : '#111' },
                ]}
              >
                {letter}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.nav}>
        {currentPage > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setCurrentPage((p) => Math.max(0, p - 1))}
          >
            <Text>Prev</Text>
          </Pressable>
        ) : null}
        {currentPage < totalPages - 1 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setCurrentPage((p) => {
                const next = Math.min(totalPages - 1, p + 1);
                if (next > highestPageVisitedRef.current) {
                  highestPageVisitedRef.current = next;
                }
                return next;
              });
            }}
          >
            <Text>Next</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => finish('ea_ended')}
        >
          <Text>End</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#999',
  },
  letter: {
    fontWeight: '600',
  },
  nav: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 16,
  },
});
