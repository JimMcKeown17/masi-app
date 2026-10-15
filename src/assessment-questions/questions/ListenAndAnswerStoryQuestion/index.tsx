/**
 * ListenAndAnswerStoryQuestion — WelaPLUS Pattern F (Q2).
 *
 * EA reads a short story aloud from the intro screen, then asks 5
 * comprehension questions one at a time. Persistent "Re-read story" pill
 * opens a modal sheet of the story without losing marking state. Pattern F
 * is untimed by design (PRD §"Pattern F — Timer: none").
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, StyleSheet } from 'react-native';
import type { QuestionProps } from '../../types/QuestionProps';
import type { Result, ResultItem, StoppedReason } from '../../types/Result';
import type { ListenAndAnswerStoryItemSet } from './types';
import { WELA_PLUS_LISTEN_AND_ANSWER_STORY_EN } from '../../itemsets/wela_plus_listen_and_answer_story.en';
import { WELA_PLUS_LISTEN_AND_ANSWER_STORY_XH } from '../../itemsets/wela_plus_listen_and_answer_story.xh';
import { useToggleMark } from '../../hooks/useToggleMark';
import { useChildReadingFontSize } from '../../hooks/useChildReadingFontSize';
import { tokens } from '../../theme/tokens';
import { SkipReasonPicker } from '../../skip/SkipReasonPicker';
import type { ManualSkipReason } from '../../skip/skipReasons';

const BASE_PROMPT_FONT_SIZE = 28;

type Phase =
  | 'intro'
  | 'active'
  | 'confirm-finish'
  | 'skip-picker'
  | 'finished';

type FullItemSet = ListenAndAnswerStoryItemSet & {
  item_set_id: string;
  question_version: string;
};

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
// `resolveItemSet(language, override)` picks the per-language file.
function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.story !== 'string') return false;
  if (!Array.isArray(o.questions)) return false;
  if (typeof o.item_set_id !== 'string') return false;
  if (typeof o.question_version !== 'string') return false;
  return o.questions.every(isValidComprehensionQuestion);
}

function resolveItemSet(language: string, override: unknown): FullItemSet {
  if (isFullItemSet(override)) return override;
  return language === 'xh'
    ? WELA_PLUS_LISTEN_AND_ANSWER_STORY_XH
    : WELA_PLUS_LISTEN_AND_ANSWER_STORY_EN;
}

export function ListenAndAnswerStoryQuestion(props: QuestionProps) {
  const {
    language,
    itemSet,
    instructions,
    onComplete,
    onItemMarked,
  } = props;
  const [phase, setPhase] = useState<Phase>('intro');
  const [showReread, setShowReread] = useState(false);
  const { isMarked, toggle } = useToggleMark();
  const fontScale = useChildReadingFontSize();
  const promptFontSize = BASE_PROMPT_FONT_SIZE * fontScale;
  const effectiveItemSet = resolveItemSet(language, itemSet);

  const isMarkedRef = useRef(isMarked);
  useEffect(() => {
    isMarkedRef.current = isMarked;
  }, [isMarked]);

  const hasFinishedRef = useRef(false);
  const startTimeMsRef = useRef<number | null>(null);

  const questions = effectiveItemSet.questions;
  const unmarkedCount = questions.reduce(
    (acc, q) => acc + (isMarked(q.item_key) ? 0 : 1),
    0,
  );

  useEffect(() => {
    if (phase === 'active' && startTimeMsRef.current === null) {
      startTimeMsRef.current = Date.now();
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
            is_correct: isMarkedRef.current(q.item_key),
          }));
      const totalCorrect = items.filter((i) => i.is_correct).length;
      const totalAttempted = isSkipped ? 0 : questions.length;
      const elapsedMs =
        startTimeMsRef.current === null
          ? 0
          : Date.now() - startTimeMsRef.current;

      const result: Result = {
        question_code: 'wela_plus_listen_and_answer_story',
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
      const willBeMarked = !isMarkedRef.current(item_key);
      toggle(item_key);
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
      <View style={styles.introRoot}>
        <ScrollView
          testID="intro-story-scroll"
          style={styles.introScroll}
          contentContainerStyle={styles.introScrollContent}
        >
          {instructions ? <Text>{instructions}</Text> : null}
          <Text style={styles.introStory}>{effectiveItemSet.story}</Text>
        </ScrollView>
        <Pressable
          onPress={() => setPhase('active')}
          style={styles.introStartButton}
        >
          <Text style={styles.introStartButtonText}>I've finished reading</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'finished') {
    return <View />;
  }

  if (phase === 'confirm-finish') {
    return (
      <View>
        <Text>{`${unmarkedCount} items unmarked — finish anyway?`}</Text>
        <Pressable onPress={() => finish('completed')}>
          <Text>Yes, finish</Text>
        </Pressable>
        <Pressable onPress={() => setPhase('active')}>
          <Text>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'skip-picker') {
    return (
      <SkipReasonPicker
        onChoose={handleSkipChosen}
        onCancel={() => setPhase('active')}
      />
    );
  }

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setShowReread(true)}
        style={styles.rereadPill}
      >
        <Text style={styles.rereadPillText}>Re-read story</Text>
      </Pressable>
      <Modal
        visible={showReread}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowReread(false)}
      >
        <View style={styles.modalRoot}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalStory}>{effectiveItemSet.story}</Text>
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowReread(false)}
            style={styles.modalCloseButton}
          >
            <Text style={styles.modalCloseText}>Close</Text>
          </Pressable>
        </View>
      </Modal>
      <ScrollView
        testID="prompt-scroll"
        style={styles.scroll}
        contentContainerStyle={styles.list}
      >
        {questions.map((q, idx) => {
          const marked = isMarked(q.item_key);
          const labelState = marked ? 'correct' : 'idle';
          return (
            <Pressable
              key={q.item_key}
              accessibilityRole="button"
              accessibilityLabel={`${q.prompt}, ${labelState}`}
              onPress={() => handleToggle(idx, q.item_key, q.prompt)}
              style={[
                styles.card,
                {
                  backgroundColor: marked ? tokens.color.marked : tokens.color.surface,
                },
              ]}
            >
              <Text
                style={[
                  styles.promptText,
                  {
                    fontSize: promptFontSize,
                    color: marked ? tokens.color.onMarked : tokens.color.ink,
                  },
                ]}
              >
                {q.prompt}
              </Text>
              <Text
                style={[
                  styles.gloss,
                  { color: marked ? tokens.color.onMarked : tokens.color.muted },
                ]}
              >
                {q.acceptable_answers.join(', ')}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable accessibilityRole="button" onPress={handleFinish}>
        <Text>Finish</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => setPhase('skip-picker')}
      >
        <Text>Skip question</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  list: { flexDirection: 'column', paddingBottom: 16 },
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: tokens.color.line,
    marginBottom: 8,
  },
  promptText: { fontWeight: '600' },
  gloss: { fontSize: 14, marginTop: 8 },
  rereadPill: {
    alignSelf: 'center',
    backgroundColor: tokens.color.canvas,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: 8,
  },
  rereadPillText: { color: tokens.color.primary, fontWeight: '600' },
  modalRoot: { flex: 1, backgroundColor: tokens.color.surface },
  modalContent: { padding: 24 },
  modalStory: { fontSize: 18, lineHeight: 26 },
  modalCloseButton: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: tokens.color.primary,
    borderRadius: 8,
    margin: 16,
  },
  modalCloseText: { color: tokens.color.onPrimary, fontWeight: '600' },
  introRoot: { flex: 1 },
  introScroll: { flex: 1 },
  introScrollContent: { padding: 16 },
  introStory: { fontSize: 18, lineHeight: 26, marginTop: 8 },
  introStartButton: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: tokens.color.primary,
    borderRadius: 8,
    margin: 16,
  },
  introStartButtonText: { color: tokens.color.onPrimary, fontWeight: '600' },
});
