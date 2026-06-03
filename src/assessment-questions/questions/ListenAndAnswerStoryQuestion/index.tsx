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

const BASE_PROMPT_FONT_SIZE = 28;
const MARKED_BG = '#2e7d32';
const IDLE_BG = '#ffffff';

type Phase =
  | 'intro'
  | 'active'
  | 'confirm-finish'
  | 'abandon-picker'
  | 'finished';

type SkipReason = Extract<StoppedReason, `skipped_${string}` | 'ea_ended'>;

const SKIP_REASONS: { reason: SkipReason; label: string }[] = [
  { reason: 'skipped_child_refused', label: 'Child refused' },
  { reason: 'skipped_tired', label: 'Child tired' },
  { reason: 'skipped_time', label: 'Out of time' },
  { reason: 'skipped_age', label: 'Age inappropriate' },
  { reason: 'skipped_prerequisite_unmet', label: 'Prerequisite unmet' },
  { reason: 'skipped_other', label: 'Other' },
];

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
    onAbandon,
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

      const items = questions.map((q, idx) => ({
        position: idx,
        item_key: q.item_key,
        prompt: q.prompt,
        is_correct: isMarkedRef.current(q.item_key),
      }));
      const totalCorrect = items.filter((i) => i.is_correct).length;
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
          total_attempted: questions.length,
          percent:
            questions.length > 0
              ? Math.round((totalCorrect / questions.length) * 100)
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

  const handleAbandonChosen = useCallback(
    (reason: SkipReason) => {
      if (onAbandon) onAbandon(reason);
      finish(reason);
    },
    [onAbandon, finish],
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

  if (phase === 'abandon-picker') {
    return (
      <View>
        <Text>Why are you abandoning?</Text>
        {SKIP_REASONS.map(({ reason, label }) => (
          <Pressable
            key={reason}
            accessibilityRole="button"
            onPress={() => handleAbandonChosen(reason)}
          >
            <Text>{label}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setPhase('active')}>
          <Text>Cancel</Text>
        </Pressable>
      </View>
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
                { backgroundColor: marked ? MARKED_BG : IDLE_BG },
              ]}
            >
              <Text
                style={[
                  styles.promptText,
                  {
                    fontSize: promptFontSize,
                    color: marked ? '#ffffff' : '#111',
                  },
                ]}
              >
                {q.prompt}
              </Text>
              <Text
                style={[
                  styles.gloss,
                  { color: marked ? '#e0e0e0' : '#666' },
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
        onPress={() => setPhase('abandon-picker')}
      >
        <Text>Abandon</Text>
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
    borderColor: '#999',
    marginBottom: 8,
  },
  promptText: { fontWeight: '600' },
  gloss: { fontSize: 14, marginTop: 8 },
  rereadPill: {
    alignSelf: 'center',
    backgroundColor: '#e8eef5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: 8,
  },
  rereadPillText: { color: '#1f3a5c', fontWeight: '600' },
  modalRoot: { flex: 1, backgroundColor: '#ffffff' },
  modalContent: { padding: 24 },
  modalStory: { fontSize: 18, lineHeight: 26 },
  modalCloseButton: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#1f3a5c',
    borderRadius: 8,
    margin: 16,
  },
  modalCloseText: { color: '#ffffff', fontWeight: '600' },
  introRoot: { flex: 1 },
  introScroll: { flex: 1 },
  introScrollContent: { padding: 16 },
  introStory: { fontSize: 18, lineHeight: 26, marginTop: 8 },
  introStartButton: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#1f3a5c',
    borderRadius: 8,
    margin: 16,
  },
  introStartButtonText: { color: '#ffffff', fontWeight: '600' },
});
