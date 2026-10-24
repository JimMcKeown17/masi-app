/**
 * ListenPhonemeBlendQuestion — WelaPLUS Pattern B (oral checklist).
 *
 * Q4: EA reads each segmented prompt aloud (e.g., "s-u-n"); child says the
 * blended word; EA taps the prompt card if the child got it right. The
 * word gloss is always visible below each segmented form (PRD default A
 * in Q8d). Pattern B is untimed by design.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { monotonicNow } from '../../progress/clock';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ItemSetMeta } from '../../types/ItemSet';
import { resolveItemSet } from '../../itemsets/resolveItemSet';
import { MissingItemSet } from '../../progress/MissingItemSet';
import type { Result, ResultItem, StoppedReason } from '../../types/Result';
import type { ListenPhonemeBlendItemSet } from './types';
import { WELA_PLUS_PHONEME_BLEND_EN } from '../../itemsets/wela_plus_phoneme_blend.en';
import { WELA_PLUS_PHONEME_BLEND_XH } from '../../itemsets/wela_plus_phoneme_blend.xh';
import { useToggleMark } from '../../hooks/useToggleMark';
import { tokens } from '../../theme/tokens';
import { Canvas, ConfirmSheet, MarkTile, QuestionIntro, ToggleBar } from '../../ui';
import { SkipReasonPicker } from '../../skip/SkipReasonPicker';
import type { ManualSkipReason } from '../../skip/skipReasons';


type Phase = 'intro' | 'active' | 'confirm-finish' | 'skip-picker' | 'finished';

type FullItemSet = ListenPhonemeBlendItemSet & ItemSetMeta;

function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (!Array.isArray(o.prompts)) return false;
  if (typeof o.item_set_id !== 'string') return false;
  if (typeof o.question_version !== 'string') return false;
  if (typeof o.question_code !== 'string') return false;
  if (typeof o.language !== 'string') return false;
  // Defend against accidentally receiving a Q3-shaped itemset whose `prompts` lack
  // segmented/word fields; the runtime guard prevents silent shape mixups.
  return o.prompts.every(
    (p) =>
      p !== null &&
      typeof p === 'object' &&
      typeof (p as Record<string, unknown>).segmented === 'string',
  );
}

export function ListenPhonemeBlendQuestion(props: QuestionProps) {
  const itemSet = resolveItemSet(
    props.language,
    props.itemSet,
    { en: WELA_PLUS_PHONEME_BLEND_EN, xh: WELA_PLUS_PHONEME_BLEND_XH },
    isFullItemSet,
  );
  if (!itemSet) return <MissingItemSet language={props.language} />;
  return <ListenPhonemeBlendQuestionContent {...props} itemSet={itemSet} />;
}

function ListenPhonemeBlendQuestionContent(
  props: QuestionProps & { itemSet: FullItemSet },
) {
  const {
    language,
    itemSet: effectiveItemSet,
    instructions,
    onComplete,
    onItemMarked,
  } = props;
  const [phase, setPhase] = useState<Phase>('intro');
  const { isMarked, toggle } = useToggleMark();

  const isMarkedRef = useRef(isMarked);
  useEffect(() => {
    isMarkedRef.current = isMarked;
  }, [isMarked]);

  const hasFinishedRef = useRef(false);
  const startTimeMsRef = useRef<number | null>(null);

  const prompts = effectiveItemSet.prompts;
  const unmarkedCount = prompts.reduce(
    (acc, _p, idx) => acc + (isMarked(String(idx)) ? 0 : 1),
    0,
  );

  useEffect(() => {
    if (phase === 'active' && startTimeMsRef.current === null) {
      startTimeMsRef.current = monotonicNow();
    }
  }, [phase]);

  const finish = useCallback(
    (stoppedReason: StoppedReason) => {
      if (hasFinishedRef.current) return;
      hasFinishedRef.current = true;
      setPhase('finished');

      // Skip-emits-empty contract.
      const isSkipped = stoppedReason.startsWith('skipped_');
      const items = isSkipped
        ? []
        : prompts.map((p, idx) => ({
            position: idx,
            item_key: p.item_key,
            prompt: p.segmented,
            is_correct: isMarkedRef.current(String(idx)),
            metadata: { word: p.word },
          }));
      const totalCorrect = items.filter((i) => i.is_correct).length;
      const totalAttempted = isSkipped ? 0 : prompts.length;
      const elapsedMs =
        startTimeMsRef.current === null
          ? 0
          : Math.round(monotonicNow() - startTimeMsRef.current);

      const result: Result = {
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
          last_attempted_position: null,
          was_timed: false,
        },
      };
      onComplete(result);
    },
    [effectiveItemSet, language, prompts, onComplete],
  );

  const handleToggle = useCallback(
    (idx: number, item_key: string, segmented: string, word: string) => {
      const willBeMarked = !isMarkedRef.current(String(idx));
      toggle(String(idx));
      if (onItemMarked) {
        const item: ResultItem = {
          position: idx,
          item_key,
          prompt: segmented,
          is_correct: willBeMarked,
          metadata: { word },
        };
        onItemMarked(item);
      }
    },
    [toggle, onItemMarked],
  );

  const handleFinish = useCallback(() => {
    if (unmarkedCount > 0) {
      setPhase('confirm-finish');
    } else {
      finish('completed');
    }
  }, [unmarkedCount, finish]);

  const handleSkipChosen = useCallback(
    (reason: ManualSkipReason) => finish(reason),
    [finish],
  );

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

  const confirming = phase === 'confirm-finish';
  return (
    <Canvas>
      <View
        style={{ flex: 1 }}
        accessibilityElementsHidden={confirming}
        importantForAccessibility={confirming ? 'no-hide-descendants' : 'auto'}
        pointerEvents={confirming ? 'none' : 'auto'}
      >
        <ScrollView
          testID="prompt-scroll"
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: tokens.space.lg, gap: 10 }}
        >
          {prompts.map((p, idx) => {
            const state = isMarked(String(idx)) ? 'correct' : 'idle';
            return (
              <MarkTile
                key={idx}
                variant="promptCard"
                state={state}
                text={p.segmented}
                gloss={`(${p.word})`}
                accessibilityLabel={`${p.segmented}, ${state}`}
                onPress={() => handleToggle(idx, p.item_key, p.segmented, p.word)}
              />
            );
          })}
        </ScrollView>
        <ToggleBar primary={{ label: 'Finish', onPress: handleFinish }} onSkip={() => setPhase('skip-picker')} />
      </View>
      {confirming && (
        <ConfirmSheet
          testID="confirm-finish"
          title={`${unmarkedCount} items unmarked — finish anyway?`}
          confirmLabel="Yes, finish"
          onConfirm={() => finish('completed')}
          cancelLabel="Cancel"
          onCancel={() => setPhase('active')}
        />
      )}
    </Canvas>
  );
}
