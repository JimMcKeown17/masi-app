/**
 * ListenAndAnswerStoryQuestion — WelaPLUS Pattern F (Q2).
 *
 * EA reads a short story aloud from the intro screen, then asks 5
 * comprehension questions one at a time. Persistent "Re-read story" pill
 * opens a modal sheet of the story without losing marking state. Pattern F
 * is untimed by design (PRD §"Pattern F — Timer: none").
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { monotonicNow } from '../../progress/clock';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ItemSetMeta } from '../../types/ItemSet';
import { resolveItemSet } from '../../itemsets/resolveItemSet';
import { MissingItemSet } from '../../progress/MissingItemSet';
import type { Result, ResultItem, StoppedReason } from '../../types/Result';
import type { ListenAndAnswerStoryItemSet } from './types';
import { WELA_PLUS_LISTEN_AND_ANSWER_STORY_EN } from '../../itemsets/wela_plus_listen_and_answer_story.en';
import { WELA_PLUS_LISTEN_AND_ANSWER_STORY_XH } from '../../itemsets/wela_plus_listen_and_answer_story.xh';
import { useToggleMark } from '../../hooks/useToggleMark';
import { tokens } from '../../theme/tokens';
import { Canvas, ConfirmSheet, MarkTile, QuestionIntro, ToggleBar, ContentText, FullScreenSheet, SecondaryButton } from '../../ui';
import { SkipReasonPicker } from '../../skip/SkipReasonPicker';
import type { ManualSkipReason } from '../../skip/skipReasons';


type Phase =
  | 'intro'
  | 'active'
  | 'confirm-finish'
  | 'skip-picker'
  | 'finished';

type FullItemSet = ListenAndAnswerStoryItemSet & ItemSetMeta;

function isValidComprehensionQuestion(q: unknown): boolean {
  if (!q || typeof q !== 'object') return false;
  const item = q as Record<string, unknown>;
  if (typeof item.item_key !== 'string') return false;
  if (typeof item.prompt !== 'string') return false;
  if (!Array.isArray(item.acceptable_answers)) return false;
  return item.acceptable_answers.every((a) => typeof a === 'string');
}

// Note: itemset overrides are SINGLE-LANGUAGE by codebase convention,
// matching wela_plus_listen_and_answer_story.{en,xh}.ts. The PRD's
// bilingual story/prompt nesting is the abstract content model;
// `resolveItemSet` picks only the requested per-language file.
function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.story !== 'string') return false;
  if (!Array.isArray(o.questions)) return false;
  if (typeof o.item_set_id !== 'string') return false;
  if (typeof o.question_version !== 'string') return false;
  if (typeof o.question_code !== 'string') return false;
  if (typeof o.language !== 'string') return false;
  return o.questions.every(isValidComprehensionQuestion);
}

export function ListenAndAnswerStoryQuestion(props: QuestionProps) {
  const itemSet = resolveItemSet(
    props.language,
    props.itemSet,
    { en: WELA_PLUS_LISTEN_AND_ANSWER_STORY_EN, xh: WELA_PLUS_LISTEN_AND_ANSWER_STORY_XH },
    isFullItemSet,
  );
  if (!itemSet) return <MissingItemSet language={props.language} />;
  return <ListenAndAnswerStoryQuestionContent {...props} itemSet={itemSet} />;
}

function ListenAndAnswerStoryQuestionContent(
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
  const [showReread, setShowReread] = useState(false);
  const { isMarked, toggle } = useToggleMark();

  const isMarkedRef = useRef(isMarked);
  useEffect(() => {
    isMarkedRef.current = isMarked;
  }, [isMarked]);

  const hasFinishedRef = useRef(false);
  const startTimeMsRef = useRef<number | null>(null);

  const questions = effectiveItemSet.questions;
  const unmarkedCount = questions.reduce(
    (acc, _q, idx) => acc + (isMarked(String(idx)) ? 0 : 1),
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
        : questions.map((q, idx) => ({
            position: idx,
            item_key: q.item_key,
            prompt: q.prompt,
            is_correct: isMarkedRef.current(String(idx)),
          }));
      const totalCorrect = items.filter((i) => i.is_correct).length;
      const totalAttempted = isSkipped ? 0 : questions.length;
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
    [effectiveItemSet, language, questions, onComplete],
  );

  const handleToggle = useCallback(
    (idx: number, item_key: string, prompt: string) => {
      const willBeMarked = !isMarkedRef.current(String(idx));
      toggle(String(idx));
      if (onItemMarked) {
        const item: ResultItem = {
          position: idx,
          item_key,
          prompt,
          is_correct: willBeMarked,
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
      <QuestionIntro
        testID="intro-story"
        instructions={instructions}
        startLabel="I've finished reading"
        onStart={() => setPhase('active')}
      >
        <ContentText size="story">{effectiveItemSet.story}</ContentText>
      </QuestionIntro>
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
        <View style={{ paddingHorizontal: tokens.space.lg }}>
          <SecondaryButton label="Re-read story" onPress={() => setShowReread(true)} />
        </View>
        <FullScreenSheet visible={showReread} onClose={() => setShowReread(false)}>
          <ScrollView contentContainerStyle={{ padding: tokens.space.lg }}>
            <ContentText size="story">{effectiveItemSet.story}</ContentText>
          </ScrollView>
        </FullScreenSheet>
        <ScrollView
          testID="prompt-scroll"
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: tokens.space.lg, gap: 10 }}
        >
          {questions.map((p, idx) => {
            const state = isMarked(String(idx)) ? 'correct' : 'idle';
            return (
              <MarkTile
                key={idx}
                variant="promptCard"
                state={state}
                text={p.prompt}
                gloss={p.acceptable_answers.join(', ')}
                accessibilityLabel={`${p.prompt}, ${state}`}
                onPress={() => handleToggle(idx, p.item_key, p.prompt)}
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
