/**
 * ReadPassageQuestion — WelaPLUS Pattern C (Q8, ORF passage).
 *
 * Child reads a flowing-paragraph passage aloud; EA taps each correct word.
 * Untimed unless durationSec is provided. Passage length and paragraph starts
 * come from the itemSet. Timed runs report correct words per minute.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { monotonicNow } from '../../progress/clock';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ItemSetMeta } from '../../types/ItemSet';
import { resolveItemSet } from '../../itemsets/resolveItemSet';
import { MissingItemSet } from '../../progress/MissingItemSet';
import type { ResultItem, StoppedReason } from '../../types/Result';
import type { ReadPassageItemSet, ReadPassageWord } from './types';
import { WELA_PLUS_READ_PASSAGE_EN } from '../../itemsets/wela_plus_read_passage.en';
import { WELA_PLUS_READ_PASSAGE_XH } from '../../itemsets/wela_plus_read_passage.xh';
import { useToggleMark } from '../../hooks/useToggleMark';
import { SkipReasonPicker } from '../../skip/SkipReasonPicker';
import type { ManualSkipReason } from '../../skip/skipReasons';
import { applyProgress, NO_ATTEMPT } from '../../progress/applyProgress';
import { LastAttemptedSheet } from '../../progress/LastAttemptedSheet';
import { Canvas, MarkTile, QuestionIntro, TileGroups, ToggleBar } from '../../ui';
import { Countdown } from '../../progress/Countdown';

type Phase = 'intro' | 'active' | 'mark-last' | 'skip-picker' | 'finished';
type MarkReason = 'ea_ended' | 'timer';
type MarkingPolarity = 'tap_correct' | 'tap_wrong';

type FullItemSet = ReadPassageItemSet & ItemSetMeta;

function isValidWord(p: unknown): p is ReadPassageWord {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return typeof o.item_key === 'string' && typeof o.word === 'string';
}

// Single-language overrides per codebase convention.
function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.item_set_id !== 'string') return false;
  if (typeof o.question_version !== 'string') return false;
  if (typeof o.question_code !== 'string') return false;
  if (typeof o.language !== 'string') return false;
  const words = o.words;
  if (!Array.isArray(words)) return false;
  const paragraphStarts = o.paragraph_starts;
  if (paragraphStarts !== undefined) {
    if (!Array.isArray(paragraphStarts)) return false;
    if (paragraphStarts.length === 0 || paragraphStarts[0] !== 0) {
      return false;
    }
    if (
      !paragraphStarts.every(
        (start, idx) =>
          Number.isInteger(start) &&
          start >= 0 &&
          start < words.length &&
          (idx === 0 || start > paragraphStarts[idx - 1]),
      )
    ) {
      return false;
    }
  }
  return words.every(isValidWord);
}

function keyFor(idx: number, word: string): string {
  return `${idx}:${word}`;
}

function splitParagraphs<T>(items: T[], starts?: number[]): T[][] {
  const paragraphStarts = starts ?? [0];
  return paragraphStarts.map((start, idx) =>
    items.slice(start, paragraphStarts[idx + 1] ?? items.length),
  );
}

export function ReadPassageQuestion(
  props: QuestionProps & { markingPolarity?: MarkingPolarity },
) {
  const itemSet = resolveItemSet(
    props.language,
    props.itemSet,
    { en: WELA_PLUS_READ_PASSAGE_EN, xh: WELA_PLUS_READ_PASSAGE_XH },
    isFullItemSet,
  );
  if (!itemSet) return <MissingItemSet language={props.language} />;
  return <ReadPassageQuestionContent {...props} itemSet={itemSet} />;
}

function ReadPassageQuestionContent(
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

  const getRemainingMs = useCallback(() => {
    if (durationSec === undefined) return 0;
    const d = getDeadlineMs();
    return d === null ? durationSec * 1000 : d - (stopTimeMsRef.current ?? monotonicNow());
  }, [getDeadlineMs, durationSec]);

  const words = effectiveItemSet.words;
  const indexedWords = words.map((word, idx) => ({ word, idx }));
  const paragraphs = splitParagraphs(
    indexedWords,
    effectiveItemSet.paragraph_starts,
  );

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
      const elapsedMs =
        startTimeMsRef.current === null
          ? 0
          : Math.round((stopTimeMsRef.current ?? monotonicNow()) - startTimeMsRef.current);
      const wasTimed = durationSec !== undefined;
      const wpm =
        elapsedMs > 0
          ? Math.round((totalCorrect / elapsedMs) * 60000)
          : 0;
      onComplete({
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
          last_attempted_position: isSkipped ? null : lastAttempted,
          was_timed: wasTimed,
          tracks_progress: !isSkipped,
          ...(wasTimed && !isSkipped
            ? { correct_words_per_minute: wpm }
            : {}),
        },
      });
    },
    [
      effectiveItemSet,
      language,
      words,
      markingPolarity,
      durationSec,
      onComplete,
    ],
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
    (idx: number, w: ReadPassageWord) => {
      const key = keyFor(idx, w.word);
      const willBeMarked = !isMarkedRef.current(key);
      toggle(key);
      if (onItemMarked) {
        const tappedAfter = willBeMarked;
        const isCorrect =
          markingPolarity === 'tap_wrong' ? !tappedAfter : tappedAfter;
        const item: ResultItem = {
          position: idx,
          item_key: w.item_key,
          prompt: w.word,
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
      <QuestionIntro instructions={instructions} onStart={() => setPhase('active')} />
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
        rowLengths={paragraphs.map((paragraph) => paragraph.length)}
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

  const renderWord = ({ word: w, idx }: { word: ReadPassageWord; idx: number }) => {
    const key = keyFor(idx, w.word);
    const marked = isMarked(key);
    const labelState = marked ? 'correct' : 'idle';
    return (
      <MarkTile
        key={idx}
        variant="pill"
        state={labelState}
        text={w.word}
        testID={`pill-${w.item_key}`}
        accessibilityLabel={`${w.word}, ${labelState}`}
        onPress={() => handleToggle(idx, w)}
      />
    );
  };

  return (
    <Canvas>
      {durationSec !== undefined && <Countdown getRemainingMs={getRemainingMs} durationMs={durationSec * 1000} />}
      <TileGroups
        testID="passage-scroll"
        groups={paragraphs.map((paragraph, p) => ({
          key: String(p), testID: `paragraph-${p}`, items: paragraph,
        }))}
        renderTile={renderWord}
      />
      <ToggleBar
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
