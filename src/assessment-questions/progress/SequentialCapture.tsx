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
import { paginate, pageIndexOf, PageIndicator, DecisionBar, QuestionIntro, ConfirmSheet, Canvas } from '../ui';

type Phase = 'intro' | 'active' | 'review' | 'end-confirmation' | 'skip-picker' | 'finished';

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
  endNoun = 'question', intro, aboveBody, finalizeResult,
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
}) {
  const [phase, setPhase] = useState<Phase>('intro');
  const phaseRef = useRef<Phase>('intro');
  const [state, setState] = useState(initStepState);
  const stateRef = useRef(state);
  const hasFinishedRef = useRef(false);
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

  const finish = useCallback((reason: StoppedReason) => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    transition('finished');
    const current = stateRef.current;
    const isSkipped = reason.startsWith('skipped_');
    const items: ResultItem[] = isSkipped ? [] : cardItems.map((item, position) => ({
      position, item_key: item.item_key, prompt: item.prompt,
      is_correct: position < current.cursor && current.decisions[position] === true,
      metadata: { ...item.metadata, reached: position < current.cursor },
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
    onComplete(finalizeResult ? finalizeResult(base) : base);
  }, [durationSec, cardItems, itemSet, language, onComplete, finalizeResult, transition]);

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
    if (phaseRef.current === 'review' && action.type !== 'back' && action.type !== 'flip') return;
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
    if (action.type === 'decide' || action.type === 'flip') {
      const position = action.type === 'decide' ? previous.cursor : action.position;
      const item = cardItems[position];
      const correct = next.decisions[position];
      onItemMarked?.({ position, item_key: item.item_key, prompt: item.prompt,
        is_correct: correct, metadata: { ...item.metadata, reached: true } });
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
  }, [finishIfExpired, cardItems, stopRule, onItemMarked, copy, pages, transition]);

  // Tile callbacks keep one identity while always reading the latest engine dispatch.
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const onTapPosition = useCallback((position: number) => dispatchRef.current({ type: 'flip', position }), []);

  const handleEnd = () => {
    if (hasFinishedRef.current || phaseRef.current !== 'active' || stateRef.current.stopped) return;
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
            const hint = tappable ? `. Double-tap to change to ${decision ? 'incorrect' : 'correct'}` : '';
            return { state: tileState, text: item.text ?? item.prompt, gloss: item.gloss, caption: item.caption,
              tappable, accessibilityLabel: `${item.label ?? item.prompt}, ${label}${hint}` };
          }} />
        <View><FlipNotice notice={notice} /></View>
        {!state.stopped && <PositionLine parts={phase === 'review'
          ? reviewLine(cardItems.length, Object.values(state.decisions).filter(Boolean).length, copy.noun)
          : copy.position(state.cursor)} />}
        <DecisionBar testIDPrefix={testIDPrefix} mode={phase === 'review' ? 'review' : 'deciding'}
          onFinish={() => { if (phaseRef.current === 'review') finish('completed'); }} endLabel={`End ${endNoun}`}
          onCorrect={() => dispatch({ type: 'decide', correct: true })}
          onIncorrect={() => dispatch({ type: 'decide', correct: false })}
          onBack={() => dispatch({ type: 'back' })} backDisabled={state.cursor === 0}
          onEnd={handleEnd}
          onSkip={allowSkip ? () => {
            if (hasFinishedRef.current || (phaseRef.current !== 'active' && phaseRef.current !== 'review') || stateRef.current.stopped) return;
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
