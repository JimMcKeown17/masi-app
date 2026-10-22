import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { monotonicNow } from './clock';
import type { QuestionProps } from '../types/QuestionProps';
import type { ItemSetMeta } from '../types/ItemSet';
import type { ResultItem, StoppedReason } from '../types/Result';
import { initStepState, stepReducer, type StepAction, type StopRule } from './stepByStep';
import { StopCard } from './StopCard';
import { Countdown } from './Countdown';
import { SkipReasonPicker } from '../skip/SkipReasonPicker';
import { tokens } from '../theme/tokens';
import { paginate, pageIndexOf, PageIndicator, PagedGrid, MarkTile, DecisionBar, QuestionIntro, ConfirmSheet, Canvas, type PageLayout } from '../ui';

type Phase = 'intro' | 'active' | 'end-confirmation' | 'skip-picker' | 'finished';
type SequentialPrompt = { item_key: string; prompt: string };
type SequentialItem = SequentialPrompt & { row: number };

/** Keep card positions distinct even when prompts or item keys repeat. */
export function buildSequentialCard(promptRows: SequentialPrompt[][]) {
  const items: SequentialItem[] = [];
  const rows = promptRows.map((row, rowIndex) => row.map((prompt) => {
    const position = items.length;
    items.push({ ...prompt, row: rowIndex });
    return position;
  }));
  return { items, rows };
}

export function SequentialCapture({
  language, itemSet, items: cardItems, rows, layout, stopRule, testIDPrefix,
  instructions, durationSec, childName, allowSkip = true, onItemMarked, onStart, onComplete,
}: QuestionProps & {
  itemSet: ItemSetMeta;
  items: SequentialItem[];
  rows: number[][];
  layout: PageLayout;
  stopRule: StopRule | null;
  testIDPrefix: 'letter' | 'word';
}) {
  const [phase, setPhase] = useState<Phase>('intro');
  const phaseRef = useRef<Phase>('intro');
  const [state, setState] = useState(initStepState);
  const stateRef = useRef(state);
  const hasFinishedRef = useRef(false);
  const startTimeMsRef = useRef<number | null>(null);
  const stopTimeMsRef = useRef<number | null>(null);
  const pages = useMemo(() => paginate(rows, layout), [rows, layout]);
  const focus = state.stopped ? state.cursor - 1 : Math.min(state.cursor, cardItems.length - 1);
  const pageIndex = pageIndexOf(pages, focus);

  // Phase and decision refs are updated before React commits, guarding queued taps.
  const transition = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const getDeadlineMs = useCallback(() => (
    durationSec === undefined || startTimeMsRef.current === null
      ? null : startTimeMsRef.current + durationSec * 1000
  ), [durationSec]);

  const getRemainingMs = useCallback(() => {
    const deadline = getDeadlineMs();
    if (deadline === null) return 0;
    return Math.max(0, deadline - (stopTimeMsRef.current ?? monotonicNow()));
  }, [getDeadlineMs]);

  const finish = useCallback((reason: StoppedReason) => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    transition('finished');
    const current = stateRef.current;
    const isSkipped = reason.startsWith('skipped_');
    const items: ResultItem[] = isSkipped ? [] : cardItems.map((item, position) => ({
      position, item_key: item.item_key, prompt: item.prompt,
      is_correct: position < current.cursor && current.decisions[position] === true,
      metadata: { row: item.row, reached: position < current.cursor },
    }));
    const totalAttempted = isSkipped ? 0 : current.cursor;
    const totalCorrect = items.filter((item) => item.is_correct).length;
    onComplete({
      question_code: itemSet.question_code,
      question_version: itemSet.question_version,
      item_set_id: itemSet.item_set_id,
      language,
      duration_ms: startTimeMsRef.current === null ? 0
        : Math.round((stopTimeMsRef.current ?? monotonicNow()) - startTimeMsRef.current),
      stopped_reason: reason,
      items,
      derived: {
        total_correct: totalCorrect,
        total_attempted: totalAttempted,
        percent: totalAttempted > 0 ? Math.round(totalCorrect / totalAttempted * 100) : 0,
        last_attempted_position: isSkipped ? null : current.cursor - 1,
        was_timed: durationSec !== undefined,
        tracks_progress: !isSkipped,
        capture_mode: 'sequential',
        correction_count: current.correctionCount,
        max_consecutive_wrong: current.maxConsecutiveWrong,
      },
    });
  }, [durationSec, cardItems, itemSet, language, onComplete, transition]);

  const finishIfExpired = useCallback(() => {
    const deadline = getDeadlineMs();
    if (deadline === null || monotonicNow() < deadline) return false;
    stopTimeMsRef.current = deadline;
    finish('timer');
    return true;
  }, [finish, getDeadlineMs]);

  useEffect(() => {
    if (phase !== 'active' || state.stopped) return;
    if (finishIfExpired() || getDeadlineMs() === null) return;
    const interval = setInterval(() => {
      // A queued interval must not replace the tap's frozen stop/End time.
      if (phaseRef.current === 'active' && !stateRef.current.stopped) finishIfExpired();
    }, 250);
    return () => clearInterval(interval);
  }, [phase, state.stopped, finishIfExpired, getDeadlineMs]);

  const dispatch = useCallback((action: StepAction) => {
    if (hasFinishedRef.current || phaseRef.current !== 'active') return;
    if (!stateRef.current.stopped && finishIfExpired()) return;
    const previous = stateRef.current;
    const next = stepReducer(previous, action, { totalItems: cardItems.length, stopRule });
    if (next === stateRef.current) return;
    const now = monotonicNow();
    if (next.stopped) {
      stopTimeMsRef.current = now;
    } else if (previous.stopped) {
      // Undo excludes the prompt's pause and moves the deadline by the same amount.
      if (startTimeMsRef.current !== null && stopTimeMsRef.current !== null) {
        startTimeMsRef.current += now - stopTimeMsRef.current;
      }
      stopTimeMsRef.current = null;
    }
    stateRef.current = next;
    setState(next);
    if (action.type === 'decide') {
      const position = previous.cursor;
      const item = cardItems[position];
      onItemMarked?.({ position, item_key: item.item_key, prompt: item.prompt,
        is_correct: action.correct, metadata: { row: item.row, reached: true } });
    }
    if (!next.stopped && next.cursor === cardItems.length) finish('completed');
  }, [finish, finishIfExpired, cardItems, stopRule, onItemMarked]);

  const handleEnd = () => {
    if (hasFinishedRef.current || phaseRef.current !== 'active' || stateRef.current.stopped) return;
    if (finishIfExpired()) return;
    stopTimeMsRef.current = monotonicNow();
    transition('end-confirmation');
  };

  if (phase === 'intro') {
    return <QuestionIntro testID={`${testIDPrefix}-intro`} instructions={instructions} onStart={() => {
      if (phaseRef.current !== 'intro') return;
      startTimeMsRef.current = monotonicNow();
      onStart?.();
      transition('active');
    }} />;
  }
  if (phase === 'finished') return <View />;
  if (phase === 'skip-picker') {
    return <SkipReasonPicker onChoose={finish} onCancel={() => transition('active')} />;
  }

  const covered = state.stopped || phase === 'end-confirmation';
  return (
    <Canvas>
      <View style={styles.root} pointerEvents={covered ? 'none' : 'auto'}
        accessibilityElementsHidden={covered} importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}>
        {durationSec === undefined ? null : <View style={styles.timerSpacing}>
          <Countdown getRemainingMs={getRemainingMs} durationMs={durationSec * 1000} />
        </View>}
        <PageIndicator pages={pages} current={pageIndex} />
        {pages[pageIndex] ? <PagedGrid pages={pages} pageIndex={pageIndex} layout={layout} variant={testIDPrefix} testID={`${testIDPrefix}-grid`}
          groupTestID={testIDPrefix === 'letter' ? (row) => `letter-row-${row}` : undefined}
          renderTile={(position, size) => {
            const { prompt } = cardItems[position];
            const decision = state.decisions[position];
            const tileState = !state.stopped && position === state.cursor ? 'current'
              : decision === true ? 'correct' : decision === false ? 'incorrect' : 'idle';
            const label = tileState === 'idle' ? 'not reached' : tileState;
            return <MarkTile variant={testIDPrefix} state={tileState} text={prompt} {...size}
              accessibilityLabel={`${prompt}, ${label}`} />;
          }} /> : <View style={styles.root} />}
        <DecisionBar testIDPrefix={testIDPrefix}
          onCorrect={() => dispatch({ type: 'decide', correct: true })}
          onIncorrect={() => dispatch({ type: 'decide', correct: false })}
          onBack={() => dispatch({ type: 'back' })} backDisabled={state.cursor === 0}
          onEnd={handleEnd}
          onSkip={allowSkip ? () => {
            if (hasFinishedRef.current || phaseRef.current !== 'active' || stateRef.current.stopped) return;
            transition('skip-picker');
          } : undefined} />
      </View>
      {state.stopped && stopRule ? <StopCard childName={childName} stopAt={stopRule.stop_at}
        onSave={() => { if (stateRef.current.stopped) finish('stop_rule'); }}
        onUndo={() => dispatch({ type: 'undoStop' })} /> : null}
      {phase === 'end-confirmation' ? <ConfirmSheet testID="end-confirmation"
        title="End the test?" confirmLabel="End test" confirmTone="danger" cancelLabel="Cancel"
        onConfirm={() => {
          if (phaseRef.current === 'end-confirmation') finish('ea_ended');
        }} onCancel={() => {
          if (phaseRef.current !== 'end-confirmation') return;
          stopTimeMsRef.current = null;
          transition('active');
        }} /> : null}
    </Canvas>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // TimerBar already supplies 8dp above its content; bring the total to 12dp.
  timerSpacing: { paddingTop: tokens.space.xs },
});
