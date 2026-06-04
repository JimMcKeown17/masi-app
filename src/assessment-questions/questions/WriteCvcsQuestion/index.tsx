/**
 * WriteCvcsQuestion — WelaPLUS Pattern D (Q9, dictation of CVC words).
 *
 * EA dictates a CVC word; child writes from memory on paper; EA taps the
 * card if the child wrote it correctly. Live marking (one item at a time,
 * naturally gated by EA's own dictation pace). Single-column auto-scroll
 * layout shell — same shape as Pattern B (ListenFirstSoundQuestion).
 * Privacy of the prompt is the EA's physical responsibility (PRD §"Prompt
 * privacy"); no tap-to-reveal, no auto-hide.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { QuestionProps } from '../../types/QuestionProps';
import type { Result, ResultItem, StoppedReason } from '../../types/Result';
import type { WriteCvcsItemSet, WriteCvcsPrompt } from './types';
import { WELA_PLUS_WRITE_CVCS_EN } from '../../itemsets/wela_plus_write_cvcs.en';
import { WELA_PLUS_WRITE_CVCS_XH } from '../../itemsets/wela_plus_write_cvcs.xh';
import { useToggleMark } from '../../hooks/useToggleMark';
import { useChildReadingFontSize } from '../../hooks/useChildReadingFontSize';

const BASE_PROMPT_FONT_SIZE = 32;
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

type FullItemSet = WriteCvcsItemSet & {
  item_set_id: string;
  question_version: string;
};

function isValidPrompt(p: unknown): p is WriteCvcsPrompt {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return typeof o.item_key === 'string' && typeof o.word === 'string';
}

function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.item_set_id !== 'string') return false;
  if (typeof o.question_version !== 'string') return false;
  if (!Array.isArray(o.prompts)) return false;
  return o.prompts.every(isValidPrompt);
}

function resolveItemSet(language: string, override: unknown): FullItemSet {
  if (isFullItemSet(override)) return override;
  return language === 'xh'
    ? WELA_PLUS_WRITE_CVCS_XH
    : WELA_PLUS_WRITE_CVCS_EN;
}

export function WriteCvcsQuestion(props: QuestionProps) {
  const {
    language,
    itemSet,
    instructions,
    onComplete,
    onItemMarked,
    onAbandon,
  } = props;
  const [phase, setPhase] = useState<Phase>('intro');
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

  const prompts = effectiveItemSet.prompts;
  const unmarkedCount = prompts.reduce(
    (acc, p) => acc + (isMarked(p.item_key) ? 0 : 1),
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

      const items = prompts.map((p, idx) => ({
        position: idx,
        item_key: p.item_key,
        prompt: p.word,
        is_correct: isMarkedRef.current(p.item_key),
      }));
      const totalCorrect = items.filter((i) => i.is_correct).length;
      const elapsedMs =
        startTimeMsRef.current === null
          ? 0
          : Date.now() - startTimeMsRef.current;

      const result: Result = {
        question_code: 'wela_plus_write_cvcs',
        question_version: effectiveItemSet.question_version,
        item_set_id: effectiveItemSet.item_set_id,
        language,
        duration_ms: elapsedMs,
        stopped_reason: stoppedReason,
        items,
        derived: {
          total_correct: totalCorrect,
          total_attempted: prompts.length,
          percent:
            prompts.length > 0
              ? Math.round((totalCorrect / prompts.length) * 100)
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
    (idx: number, p: WriteCvcsPrompt) => {
      const willBeMarked = !isMarkedRef.current(p.item_key);
      toggle(p.item_key);
      if (onItemMarked) {
        const item: ResultItem = {
          position: idx,
          item_key: p.item_key,
          prompt: p.word,
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
      <View>
        {instructions ? <Text>{instructions}</Text> : null}
        <Pressable onPress={() => setPhase('active')}>
          <Text>Start</Text>
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
      <ScrollView
        testID="prompt-scroll"
        style={styles.scroll}
        contentContainerStyle={styles.list}
      >
        {prompts.map((p, idx) => {
          const marked = isMarked(p.item_key);
          const labelState = marked ? 'correct' : 'idle';
          return (
            <Pressable
              key={p.item_key}
              testID={`card-${p.item_key}`}
              accessibilityRole="button"
              accessibilityLabel={`${p.word}, ${labelState}`}
              onPress={() => handleToggle(idx, p)}
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
                {p.word}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.nav}>
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
  nav: {
    flexDirection: 'row',
    gap: 16,
    padding: 12,
  },
});
