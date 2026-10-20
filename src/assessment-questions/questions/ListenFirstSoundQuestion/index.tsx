/**
 * ListenFirstSoundQuestion — WelaPLUS Pattern B (oral checklist).
 *
 * Q3: EA reads each word aloud; child says the first sound; EA taps the
 * prompt card if the child got it right. Pattern B is untimed by design
 * (PRD §"Pattern B — Timer: none"). Single vertical column layout.
 * "Finish" prompts a confirmation when items are unmarked.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ItemSetMeta } from '../../types/ItemSet';
import { resolveItemSet } from '../../itemsets/resolveItemSet';
import { MissingItemSet } from '../../progress/MissingItemSet';
import type { Result, ResultItem, StoppedReason } from '../../types/Result';
import type { ListenFirstSoundItemSet } from './types';
import { WELA_PLUS_FIRST_SOUND_EN } from '../../itemsets/wela_plus_first_sound.en';
import { WELA_PLUS_FIRST_SOUND_XH } from '../../itemsets/wela_plus_first_sound.xh';
import { useToggleMark } from '../../hooks/useToggleMark';
import { useChildReadingFontSize } from '../../hooks/useChildReadingFontSize';
import { tokens } from '../../theme/tokens';
import { SkipReasonPicker } from '../../skip/SkipReasonPicker';
import type { ManualSkipReason } from '../../skip/skipReasons';

const BASE_PROMPT_FONT_SIZE = 28;

type Phase = 'intro' | 'active' | 'confirm-finish' | 'skip-picker' | 'finished';

type FullItemSet = ListenFirstSoundItemSet & ItemSetMeta;

function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    Array.isArray(o.prompts) &&
    typeof o.item_set_id === 'string' &&
    typeof o.question_version === 'string' &&
    typeof o.question_code === 'string' &&
    typeof o.language === 'string'
  );
}

export function ListenFirstSoundQuestion(props: QuestionProps) {
  const itemSet = resolveItemSet(
    props.language,
    props.itemSet,
    { en: WELA_PLUS_FIRST_SOUND_EN, xh: WELA_PLUS_FIRST_SOUND_XH },
    isFullItemSet,
  );
  if (!itemSet) return <MissingItemSet language={props.language} />;
  return <ListenFirstSoundQuestionContent {...props} itemSet={itemSet} />;
}

function ListenFirstSoundQuestionContent(
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
  const fontScale = useChildReadingFontSize();
  const promptFontSize = BASE_PROMPT_FONT_SIZE * fontScale;

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

      // Skip-emits-empty contract: see other Pattern components.
      const isSkipped = stoppedReason.startsWith('skipped_');
      const items = isSkipped
        ? []
        : prompts.map((p, idx) => ({
            position: idx,
            item_key: p.item_key,
            prompt: p.prompt,
            is_correct: isMarkedRef.current(p.item_key),
          }));
      const totalCorrect = items.filter((i) => i.is_correct).length;
      const totalAttempted = isSkipped ? 0 : prompts.length;
      const elapsedMs =
        startTimeMsRef.current === null
          ? 0
          : Date.now() - startTimeMsRef.current;

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
              accessibilityRole="button"
              accessibilityLabel={`${p.prompt}, ${labelState}`}
              onPress={() => handleToggle(idx, p.item_key, p.prompt)}
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
                {p.prompt}
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
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  list: {
    flexDirection: 'column',
    paddingBottom: 16,
  },
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: tokens.color.line,
    marginBottom: 8,
  },
  promptText: {
    fontWeight: '600',
  },
});
