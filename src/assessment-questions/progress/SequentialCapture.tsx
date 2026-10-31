import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { monotonicNow } from './clock';
import type { QuestionProps } from '../types/QuestionProps';
import type { ItemSetMeta } from '../types/ItemSet';
import type { Result, ResultItem, StoppedReason } from '../types/Result';
import { initStepState, stepReducer, type StepAction, type StopRule } from './stepByStep';
import { StopCard } from './StopCard';
import { Countdown } from './Countdown';
import { SkipReasonPicker } from '../skip/SkipReasonPicker';
import { MissingItemSet } from './MissingItemSet';
import { CaptureBody } from './CaptureBody';
import type { CaptureItem, CaptureCopy, CaptureBody as Body } from './captureTypes';
import { endMessage, reviewLine } from './captureCopy';
import { PositionLine } from '../ui/PositionLine';
import { FlipNotice } from '../ui/FlipNotice';
import { tokens } from '../theme/tokens';
import { paginate, pageIndexOf, PageIndicator, DecisionBar, QuestionIntro, ConfirmSheet, Canvas, ObservationPanel } from '../ui';

type Phase = 'intro' | 'active' | 'review' | 'end-confirmation' | 'skip-picker' | 'observation' | 'finished';

/** Choices are capture state, so stale source metadata cannot supply a strategy. */
function captureMetadata(item: CaptureItem, reached: boolean, strategy: string | undefined, choicesMode: boolean) {
  const metadata: Record<string, unknown> = { ...item.metadata, reached };
  if (choicesMode) {
    delete metadata.strategy;
    if (strategy !== undefined) metadata.strategy = strategy;
  }
  return metadata;
}

/** Keep card positions distinct even when prompts or item keys repeat. */
export function buildSequentialCard(promptRows: ReadonlyArray<ReadonlyArray<CaptureItem>>): { items: CaptureItem[]; rows: number[][] } {
  const items: CaptureItem[] = [];
  const rows = promptRows.map((row, rowIndex) => row.map((item) => {
    const position = items.length;
    items.push({ ...item, metadata: { row: rowIndex, ...item.metadata } });
    return position;
  }));
  return { items, rows };
}

export function SequentialCapture({
  language, itemSet, items: cardItems, body, copy, stopRule, testIDPrefix,
  instructions, durationSec, childName, allowSkip = true, onItemMarked, onStart, onComplete,
  endNoun = 'question', intro, aboveBody, finalizeResult, choices, observation,
}: QuestionProps & {
  itemSet: ItemSetMeta;
  items: ReadonlyArray<CaptureItem>;
  body: Body;
  stopRule: StopRule | null;
  testIDPrefix: string;
  copy: CaptureCopy;
  intro?: { startLabel?: string; testID?: string; content?: React.ReactNode };
  aboveBody?: React.ReactNode;
  finalizeResult?: (base: Result) => Result;
  choices?: ReadonlyArray<{ key: string; label: string }>;
  observation?: { options: ReadonlyArray<{ key: string; label: string; exclusive?: boolean }> };
}) {
  const [phase, setPhase] = useState<Phase>('intro');
  const phaseRef = useRef<Phase>('intro');
  const [state, setState] = useState(initStepState);
  const stateRef = useRef(state);
  const hasFinishedRef = useRef(false);
  const pendingResultRef = useRef<Result | null>(null);
  const [correctingPosition, setCorrectingPosition] = useState<number | null>(null);
  const correctingPositionRef = useRef<number | null>(null);
  const startTimeMsRef = useRef<number | null>(null);
  const stopTimeMsRef = useRef<number | null>(null);
  const gridRows = body.kind === 'grid' ? body.rows : undefined;
  const gridLayout = body.kind === 'grid' ? body.layout : undefined;
  const pages = useMemo(() => gridRows && gridLayout ? paginate(gridRows, gridLayout) : [], [gridRows, gridLayout]);
  const [reviewPage, setReviewPage] = useState(0);
  const skipReturnPhaseRef = useRef<'active' | 'review'>('active');
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
  const focus = state.stopped ? state.cursor - 1 : Math.min(state.cursor, cardItems.length - 1);
  const pageIndex = phase === 'review' ? reviewPage : pageIndexOf(pages, focus);

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

  const emitResult = useCallback((base: Result) => {
    transition('finished');
    onComplete(finalizeResult ? finalizeResult(base) : base);
  }, [onComplete, finalizeResult, transition]);

  const finish = useCallback((reason: StoppedReason) => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    const current = stateRef.current;
    const isSkipped = reason.startsWith('skipped_');
    const items: ResultItem[] = isSkipped ? [] : cardItems.map((item, position) => ({
      position, item_key: item.item_key, prompt: item.prompt,
      is_correct: position < current.cursor && current.decisions[position] === true,
      metadata: captureMetadata(item, position < current.cursor,
        position < current.cursor && current.decisions[position] === true ? current.choices[position] : undefined,
        choices !== undefined),
    }));
    const totalAttempted = isSkipped ? 0 : current.cursor;
    const totalCorrect = items.filter((item) => item.is_correct).length;
    const base: Result = {
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
    };
    if (observation && !isSkipped) {
      if (totalCorrect > 0) {
        pendingResultRef.current = base;
        transition('observation');
        return;
      }
      base.derived.strategies = [];
    }
    emitResult(base);
  }, [durationSec, cardItems, itemSet, language, choices, observation, emitResult, transition]);

  const finishIfExpired = useCallback(() => {
    if (phaseRef.current !== 'active') return false;
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
    if (hasFinishedRef.current || (phaseRef.current !== 'active' && phaseRef.current !== 'review')) return;
    if (phaseRef.current === 'review' && action.type !== 'back' && action.type !== 'flip' && action.type !== 'set') return;
    if (correctingPositionRef.current !== null && action.type !== 'set') return;
    if (!stateRef.current.stopped && finishIfExpired()) return;
    const wasReview = phaseRef.current === 'review';
    const previous = stateRef.current;
    const next = stepReducer(previous, action, { totalItems: cardItems.length, stopRule });
    if (next === stateRef.current) return;
    const now = monotonicNow();
    if (next.stopped) {
      stopTimeMsRef.current = now;
    } else if (previous.stopped || (wasReview && action.type === 'back')) {
      // Undo and Back from review exclude the pause and shift the deadline equally.
      if (startTimeMsRef.current !== null && stopTimeMsRef.current !== null) {
        startTimeMsRef.current += now - stopTimeMsRef.current;
      }
      stopTimeMsRef.current = null;
      if (wasReview) transition('active');
    }
    stateRef.current = next;
    setState(next);
    if (action.type === 'decide' || action.type === 'flip' || action.type === 'set') {
      const position = action.type === 'decide' ? previous.cursor : action.position;
      const item = cardItems[position];
      const correct = next.decisions[position];
      onItemMarked?.({ position, item_key: item.item_key, prompt: item.prompt,
        is_correct: correct, metadata: captureMetadata(item, true, correct ? next.choices[position] : undefined, choices !== undefined) });
      if (action.type === 'flip') {
        setNotice(previousNotice => ({ id: (previousNotice?.id ?? 0) + 1,
          text: `${copy.itemName(position)} changed to ${correct ? 'Correct' : 'Incorrect'}` }));
      }
    }
    if (action.type === 'decide' && !next.stopped && next.cursor === cardItems.length) {
      stopTimeMsRef.current = now;
      setReviewPage(pageIndexOf(pages, cardItems.length - 1));
      transition('review');
    }
  }, [finishIfExpired, cardItems, stopRule, onItemMarked, copy, pages, transition, choices]);

  const closeCorrection = () => {
    correctingPositionRef.current = null;
    setCorrectingPosition(null);
  };
  const handleMark = (correct: boolean, choice?: string) => {
    if (correctingPosition !== null) {
      // A queued second tap on the old correction controls must not mark the cursor.
      if (correctingPositionRef.current !== correctingPosition) return;
      closeCorrection();
      dispatch({ type: 'set', position: correctingPosition, correct, choice });
    } else {
      dispatch({ type: 'decide', correct, choice });
    }
  };

  // One callback identity for memoised tiles; the ref reads the latest choices mode and dispatch.
  const tapPositionRef = useRef<(position: number) => void>(() => {});
  tapPositionRef.current = position => {
    if (!choices) {
      dispatch({ type: 'flip', position });
      return;
    }
    const current = stateRef.current;
    if (hasFinishedRef.current || (phaseRef.current !== 'active' && phaseRef.current !== 'review') ||
      current.stopped || !Number.isInteger(position) || position < 0 || position >= current.cursor) return;
    if (finishIfExpired()) return;
    correctingPositionRef.current = position;
    setCorrectingPosition(position);
  };
  const onTapPosition = useCallback((position: number) => tapPositionRef.current(position), []);

  const handleEnd = () => {
    if (hasFinishedRef.current || phaseRef.current !== 'active' || stateRef.current.stopped || correctingPositionRef.current !== null) return;
    if (finishIfExpired()) return;
    stopTimeMsRef.current = monotonicNow();
    transition('end-confirmation');
  };

  if (cardItems.length === 0) return <MissingItemSet language={language} reason="empty" />;
  if (phase === 'intro') {
    return <QuestionIntro testID={intro?.testID ?? `${testIDPrefix}-intro`} startLabel={intro?.startLabel} instructions={instructions} onStart={() => {
      if (phaseRef.current !== 'intro') return;
      startTimeMsRef.current = monotonicNow();
      onStart?.();
      transition('active');
    }}>{intro?.content}</QuestionIntro>;
  }
  if (phase === 'finished') return <View />;
  if (phase === 'observation') {
    return <ObservationPanel testID={`${testIDPrefix}-observation`}
      title={`How did ${childName ?? 'the child'} work these out? Tick all you saw.`}
      options={observation!.options} confirmLabel="Save" onConfirm={keys => {
        const base = pendingResultRef.current;
        if (phaseRef.current !== 'observation' || base === null) return;
        // Claim before finalization/callback so queued confirmation taps cannot emit twice.
        pendingResultRef.current = null;
        emitResult({ ...base, derived: { ...base.derived, strategies: keys } });
      }} />;
  }
  if (phase === 'skip-picker') {
    return <SkipReasonPicker onChoose={finish} onCancel={() => transition(skipReturnPhaseRef.current)} />;
  }

  const covered = state.stopped || phase === 'end-confirmation';
  return (
    <Canvas>
      <View style={styles.root} pointerEvents={covered ? 'none' : 'auto'}
        accessibilityElementsHidden={covered} importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}>
        {durationSec === undefined ? null : <View style={styles.timerSpacing}>
          <Countdown getRemainingMs={getRemainingMs} durationMs={durationSec * 1000} />
        </View>}
        {aboveBody}
        <PageIndicator pages={pages} current={pageIndex}
          labelFor={body.kind === 'grid' ? body.labelFor : undefined}
          onPrevious={phase === 'review' ? () => setReviewPage(page => Math.max(0, page - 1)) : undefined}
          onNext={phase === 'review' ? () => setReviewPage(page => Math.min(pages.length - 1, page + 1)) : undefined} />
        <CaptureBody body={body} pages={pages} pageIndex={pageIndex} itemCount={cardItems.length} onTapPosition={onTapPosition}
          tileFor={position => {
            const item = cardItems[position];
            const decision = state.decisions[position];
            const tileState = phase === 'active' && !state.stopped && position === state.cursor ? 'current'
              : decision === true ? 'correct' : decision === false ? 'incorrect' : body.kind === 'cards' ? 'notReached' : 'idle';
            const tappable = position < state.cursor && (phase === 'active' || phase === 'review') && !state.stopped;
            const label = tileState === 'idle' || tileState === 'notReached' ? 'not reached' : tileState;
            const hint = tappable ? choices ? '. Double-tap to change' : `. Double-tap to change to ${decision ? 'incorrect' : 'correct'}` : '';
            // The tile is one accessible element, so the gloss (answer guide, target word) must be spoken too.
            const gloss = item.gloss ? `, ${item.gloss}` : '';
            return { state: tileState, text: item.text ?? item.prompt, gloss: item.gloss, caption: item.caption,
              tappable, accessibilityLabel: `${item.label ?? item.prompt}${gloss}, ${label}${hint}` };
          }} />
        <View><FlipNotice notice={notice} /></View>
        {!state.stopped && <PositionLine parts={phase === 'review'
          ? reviewLine(cardItems.length, Object.values(state.decisions).filter(Boolean).length, copy.noun)
          : copy.position(state.cursor)} />}
        <DecisionBar testIDPrefix={testIDPrefix} mode={phase === 'review' ? 'review' : 'deciding'}
          onFinish={() => { if (phaseRef.current === 'review' && correctingPositionRef.current === null) finish('completed'); }} endLabel={`End ${endNoun}`}
          correctChoices={choices} onChoose={key => handleMark(true, key)}
          correcting={correctingPosition === null ? undefined : {
            title: `Change ${copy.itemName(correctingPosition).toLowerCase()}`,
            detail: `${cardItems[correctingPosition].prompt} · Marked: ${state.decisions[correctingPosition]
              ? choices?.find(choice => choice.key === state.choices[correctingPosition])?.label ?? 'Correct'
              : 'Incorrect'}`,
            onCancel: closeCorrection,
          }}
          onCorrect={() => handleMark(true)}
          onIncorrect={() => handleMark(false)}
          onBack={() => dispatch({ type: 'back' })} backDisabled={state.cursor === 0}
          onEnd={handleEnd}
          onSkip={allowSkip ? () => {
            if (hasFinishedRef.current || (phaseRef.current !== 'active' && phaseRef.current !== 'review') || stateRef.current.stopped || correctingPositionRef.current !== null) return;
            if (finishIfExpired()) return;
            skipReturnPhaseRef.current = phaseRef.current;
            // The picker unmounts the notice; clearing it stops Cancel replaying an old one.
            setNotice(null);
            transition('skip-picker');
          } : undefined} />
      </View>
      {state.stopped && stopRule ? <StopCard childName={childName} stopRule={stopRule}
        onSave={() => { if (stateRef.current.stopped) finish('stop_rule'); }}
        onUndo={() => dispatch({ type: 'undoStop' })} /> : null}
      {phase === 'end-confirmation' ? <ConfirmSheet testID="end-confirmation"
        title={`End this ${endNoun}?`} message={endMessage(state.cursor, cardItems.length)}
        confirmLabel={`End ${endNoun}`} confirmTone="danger" cancelLabel="Keep marking"
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
