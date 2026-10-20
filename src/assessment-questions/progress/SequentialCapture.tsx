import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { QuestionProps } from '../types/QuestionProps';
import type { ItemSetMeta } from '../types/ItemSet';
import type { ResultItem, StoppedReason } from '../types/Result';
import { initStepState, stepReducer, type StepAction, type StopRule } from './stepByStep';
import { StopCard } from './StopCard';
import { SkipReasonPicker } from '../skip/SkipReasonPicker';
import { tokens } from '../theme/tokens';

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
  language, itemSet, items: cardItems, rows, stopRule, testIDPrefix,
  instructions, durationSec, childName, allowSkip = true, onItemMarked, onComplete,
}: QuestionProps & {
  itemSet: ItemSetMeta;
  items: SequentialItem[];
  rows: number[][];
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
  const scrollRef = useRef<ScrollView>(null);
  const rowOffsetsRef = useRef<Record<number, number>>({});

  // Phase and decision refs are updated before React commits, guarding queued taps.
  const transition = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const getDeadlineMs = useCallback(() => (
    durationSec === undefined || startTimeMsRef.current === null
      ? null : startTimeMsRef.current + durationSec * 1000
  ), [durationSec]);

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
        : (stopTimeMsRef.current ?? Date.now()) - startTimeMsRef.current,
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
    if (deadline === null || Date.now() < deadline) return false;
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
    const now = Date.now();
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

  const currentRow = cardItems[state.cursor]?.row;
  useEffect(() => {
    const y = currentRow === undefined ? undefined : rowOffsetsRef.current[currentRow];
    if (phase === 'active' && y !== undefined) scrollRef.current?.scrollTo({ y, animated: true });
  }, [currentRow, phase]);

  const handleEnd = () => {
    if (hasFinishedRef.current || phaseRef.current !== 'active' || stateRef.current.stopped) return;
    if (finishIfExpired()) return;
    stopTimeMsRef.current = Date.now();
    transition('end-confirmation');
  };

  if (phase === 'intro') {
    return <View>
      {instructions ? <Text>{instructions}</Text> : null}
      <Pressable accessibilityRole="button" onPress={() => {
        if (phaseRef.current !== 'intro') return;
        startTimeMsRef.current = Date.now();
        transition('active');
      }} style={styles.primaryButton}><Text style={styles.onPrimary}>Start</Text></Pressable>
    </View>;
  }
  if (phase === 'finished') return <View />;
  if (phase === 'skip-picker') {
    return <SkipReasonPicker onChoose={finish} onCancel={() => transition('active')} />;
  }

  const covered = state.stopped || phase === 'end-confirmation';
  return (
    <View style={styles.root}>
      <View style={styles.root} pointerEvents={covered ? 'none' : 'auto'}
        accessibilityElementsHidden={covered} importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}>
        <ScrollView ref={scrollRef} style={styles.root} contentContainerStyle={styles.grid} testID={`${testIDPrefix}-grid`}>
          {rows.map((row, rowIndex) => (
            <View key={rowIndex} testID={`${testIDPrefix}-row-${rowIndex}`} style={styles.row} onLayout={(event) => {
              const y = event.nativeEvent.layout.y;
              rowOffsetsRef.current[rowIndex] = y;
              if (cardItems[stateRef.current.cursor]?.row === rowIndex) scrollRef.current?.scrollTo({ y, animated: true });
            }}>
              {row.map((position) => {
                const { prompt } = cardItems[position];
                const decision = state.decisions[position];
                const current = position === state.cursor;
                const label = current ? 'current' : decision === true ? 'correct' : decision === false ? 'incorrect' : 'not reached';
                return <View key={position} accessible accessibilityRole="text" accessibilityLabel={`${prompt}, ${label}`}
                  accessibilityState={{ selected: current }}
                  style={[styles.tile, decision === true && styles.correctTile, decision === false && styles.incorrectTile,
                    current && styles.currentTile]}>
                  <Text style={[styles.prompt, current && styles.currentPrompt]}>{prompt}</Text>
                </View>;
              })}
            </View>
          ))}
        </ScrollView>
        <View style={styles.controls}>
          <View style={styles.decisionRow} testID={`${testIDPrefix}-decisions`}>
            <Pressable accessibilityRole="button" accessibilityLabel="Correct" onPress={() => dispatch({ type: 'decide', correct: true })}
              style={[styles.decisionButton, styles.correctButton]}><Text style={styles.onPrimary}>Correct</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Incorrect" onPress={() => dispatch({ type: 'decide', correct: false })}
              style={[styles.decisionButton, styles.incorrectButton]}><Text style={styles.onPrimary}>Incorrect</Text></Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" disabled={state.cursor === 0}
            accessibilityState={{ disabled: state.cursor === 0 }} onPress={() => dispatch({ type: 'back' })}
            style={styles.backButton}><Text style={[styles.link, state.cursor === 0 && styles.disabled]}>Back</Text></Pressable>
          <View style={styles.nav}>
            <Pressable accessibilityRole="button" onPress={handleEnd} style={styles.backButton}><Text style={styles.link}>End</Text></Pressable>
            {allowSkip ? <Pressable accessibilityRole="button" style={styles.backButton} onPress={() => {
              if (hasFinishedRef.current || phaseRef.current !== 'active' || stateRef.current.stopped) return;
              transition('skip-picker');
            }}><Text style={styles.link}>Skip question</Text></Pressable> : null}
          </View>
        </View>
      </View>
      {state.stopped && stopRule ? <StopCard childName={childName} stopAt={stopRule.stop_at}
        onSave={() => { if (stateRef.current.stopped) finish('stop_rule'); }}
        onUndo={() => dispatch({ type: 'undoStop' })} /> : null}
      {phase === 'end-confirmation' ? (
        <View testID="end-confirmation" style={styles.sheetOverlay} accessibilityViewIsModal>
          <View style={styles.sheetPanel}>
            <Text style={styles.heading}>End the test?</Text>
            <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={() => {
              if (phaseRef.current === 'end-confirmation') finish('ea_ended');
            }}><Text style={styles.onPrimary}>End test</Text></Pressable>
            <Pressable accessibilityRole="button" style={styles.backButton} onPress={() => {
              if (phaseRef.current !== 'end-confirmation') return;
              stopTimeMsRef.current = null;
              transition('active');
            }}><Text style={styles.link}>Cancel</Text></Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  grid: { gap: tokens.space.xs },
  row: { flexDirection: 'row', flexWrap: 'nowrap' },
  tile: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingVertical: tokens.space.lg,
    borderWidth: 1, borderColor: tokens.color.line, backgroundColor: tokens.color.surface },
  correctTile: { backgroundColor: tokens.color.markedSoft },
  incorrectTile: { backgroundColor: tokens.color.errorSoft },
  currentTile: { backgroundColor: tokens.color.ink },
  prompt: { fontSize: tokens.font.markingItem, fontWeight: '600', color: tokens.color.ink },
  currentPrompt: { color: tokens.color.surface },
  controls: { padding: tokens.space.lg, gap: tokens.space.sm, backgroundColor: tokens.color.surface },
  decisionRow: { flexDirection: 'row', gap: tokens.space.md },
  decisionButton: { flex: 1, minHeight: 56, borderRadius: tokens.radius.pill, padding: tokens.space.md,
    alignItems: 'center', justifyContent: 'center' },
  correctButton: { backgroundColor: tokens.color.marked },
  incorrectButton: { backgroundColor: tokens.color.error },
  backButton: { minHeight: 44, padding: tokens.space.sm, alignItems: 'center', justifyContent: 'center' },
  link: { color: tokens.color.primaryPressed, fontSize: tokens.font.body, fontWeight: '600' },
  disabled: { color: tokens.color.notReached },
  nav: { flexDirection: 'row', justifyContent: 'space-between' },
  sheetOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', backgroundColor: tokens.color.scrim },
  sheetPanel: { padding: tokens.space.xl, gap: tokens.space.md, backgroundColor: tokens.color.surface,
    borderTopLeftRadius: tokens.radius.card, borderTopRightRadius: tokens.radius.card },
  heading: { color: tokens.color.ink, fontSize: tokens.font.heading, fontWeight: '600' },
  primaryButton: { backgroundColor: tokens.color.primaryPressed, borderRadius: tokens.radius.pill,
    minHeight: 56, padding: tokens.space.md, alignItems: 'center', justifyContent: 'center' },
  onPrimary: { color: tokens.color.onPrimary, fontSize: tokens.font.body, fontWeight: '600' },
});
