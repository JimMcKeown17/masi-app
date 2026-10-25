/**
 * ReadWordsQuestion — WelaPLUS Pattern C (Q6, timed paged word grid).
 *
 * Child reads words aloud; EA taps each tile when the child gets it right.
 * When durationSec is provided, expiry opens the last-attempted marker.
 * Pages keep whole card rows together, reflowing words into two columns.
 * Sequential mode shares the letter test's capture flow.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { monotonicNow } from '../../progress/clock';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ItemSetMeta } from '../../types/ItemSet';
import { resolveItemSet } from '../../itemsets/resolveItemSet';
import { MissingItemSet } from '../../progress/MissingItemSet';
import type { ResultItem, StoppedReason } from '../../types/Result';
import type { ReadWordsItemSet, ReadWordsPrompt } from './types';
import { WELA_PLUS_READ_WORDS_EN } from '../../itemsets/wela_plus_read_words.en';
import { WELA_PLUS_READ_WORDS_XH } from '../../itemsets/wela_plus_read_words.xh';
import { useToggleMark } from '../../hooks/useToggleMark';
import { SkipReasonPicker } from '../../skip/SkipReasonPicker';
import type { ManualSkipReason } from '../../skip/skipReasons';
import { applyProgress, NO_ATTEMPT } from '../../progress/applyProgress';
import { LastAttemptedSheet } from '../../progress/LastAttemptedSheet';
import {
  Canvas, WORD_PAGE_LAYOUT, paginate, rowsFromLengths, PageIndicator, PagedGrid,
  MarkTile, QuestionIntro, ToggleBar,
} from '../../ui';
import { Countdown } from '../../progress/Countdown';
import { buildSequentialCard, SequentialCapture } from '../../progress/SequentialCapture';

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
  props: QuestionProps & { markingPolarity?: MarkingPolarity; captureMode?: 'grid' | 'sequential' },
) {
  const itemSet = resolveItemSet(
    props.language,
    props.itemSet,
    { en: WELA_PLUS_READ_WORDS_EN, xh: WELA_PLUS_READ_WORDS_XH },
    isFullItemSet,
  );
  if (!itemSet) return <MissingItemSet language={props.language} />;
  if (props.captureMode === 'sequential') return <ReadWordsSequentialContent {...props} itemSet={itemSet} />;
  return <ReadWordsQuestionContent {...props} itemSet={itemSet} />;
}

function ReadWordsSequentialContent(props: QuestionProps & { itemSet: FullItemSet }) {
  const { words, row_lengths } = props.itemSet;
  const card = useMemo(() => buildSequentialCard(
    chunkByLengths(words, row_lengths ?? [words.length]).map((row) =>
      row.map((word) => ({ item_key: word.item_key, prompt: word.word }))),
  ), [words, row_lengths]);
  return <SequentialCapture {...props} {...card} layout={WORD_PAGE_LAYOUT} stopRule={props.itemSet.stop_rule ?? null} testIDPrefix="word" />;
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
  const [pageIndex, setPageIndex] = useState(0);
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

  const getRemainingMs = useCallback(() => {
    if (durationSec === undefined) return 0;
    const d = getDeadlineMs();
    return d === null ? durationSec * 1000 : d - (stopTimeMsRef.current ?? monotonicNow());
  }, [getDeadlineMs, durationSec]);

  const words = effectiveItemSet.words;
  const pages = useMemo(() => paginate(
    rowsFromLengths(effectiveItemSet.row_lengths ?? [words.length]), WORD_PAGE_LAYOUT,
  ), [effectiveItemSet.row_lengths, words.length]);

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
            : Math.round((stopTimeMsRef.current ?? monotonicNow()) - startTimeMsRef.current),
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
      startTimeMsRef.current = monotonicNow();
    }
    const deadlineMs = getDeadlineMs();
    if (deadlineMs === null) return undefined;
    const interval = setInterval(() => {
      if (monotonicNow() >= deadlineMs) {
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
      <QuestionIntro instructions={instructions} onStart={() => { props.onStart?.(); setPhase('active'); }} />
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
        defaultIndex={markingPolarity === 'tap_wrong' ? null : highestMarkedIndex()}
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
    <Canvas>
      {durationSec !== undefined && <Countdown getRemainingMs={getRemainingMs} durationMs={durationSec * 1000} />}
      {pages[pageIndex] && <PagedGrid
        pages={pages}
        pageIndex={pageIndex}
        layout={WORD_PAGE_LAYOUT}
        variant="word"
        renderTile={(position, { width, height }) => {
          const w = words[position];
          const correct = isMarked(keyFor(position, w.word));
          return <MarkTile
            key={position}
            variant="word"
            state={correct ? 'correct' : 'idle'}
            text={w.word}
            width={width}
            height={height}
            accessibilityLabel={`${w.word}, ${correct ? 'correct' : 'idle'}`}
            onPress={() => handleToggle(position, w.item_key, w.word)}
          />;
        }}
      />}
      <ToggleBar
        header={<PageIndicator
          pages={pages}
          current={pageIndex}
          onPrevious={() => setPageIndex((index) => Math.max(0, index - 1))}
          onNext={() => setPageIndex((index) => Math.min(pages.length - 1, index + 1))}
        />}
        primary={{
          label: 'End',
          onPress: () => {
            const nowMs = monotonicNow();
            const deadlineMs = getDeadlineMs();
            const deadlineReached = deadlineMs !== null && nowMs >= deadlineMs;
            // Resolve expiry here too: End can arrive before a delayed timer callback.
            if (deadlineMs !== null) {
              stopTimeMsRef.current = deadlineReached ? deadlineMs : nowMs;
            }
            setMarkReason(deadlineReached ? 'timer' : 'ea_ended');
            setPhase('mark-last');
          },
        }}
        onSkip={() => setPhase('skip-picker')}
      />
    </Canvas>
  );
}
