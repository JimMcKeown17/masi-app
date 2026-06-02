/**
 * ListenFirstSoundQuestion — WelaPLUS Pattern B (oral checklist).
 *
 * Q3: EA reads each word aloud; child says the first sound; EA taps the
 * prompt card if the child got it right. No timer. Single vertical
 * column layout. "Finish" prompts a confirmation when items are unmarked.
 * See PRD §"Pattern B — Oral response checklist".
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { QuestionProps } from '../../types/QuestionProps';
import type { Result, ResultItem, StoppedReason } from '../../types/Result';
import type { ListenFirstSoundItemSet } from './types';
import { WELA_PLUS_FIRST_SOUND_EN } from '../../itemsets/wela_plus_first_sound.en';
import { WELA_PLUS_FIRST_SOUND_XH } from '../../itemsets/wela_plus_first_sound.xh';
import { useToggleMark } from '../../hooks/useToggleMark';
import { useChildReadingFontSize } from '../../hooks/useChildReadingFontSize';

const BASE_PROMPT_FONT_SIZE = 28;
const MARKED_BG = '#2e7d32';
const IDLE_BG = '#ffffff';

type Phase = 'intro' | 'active' | 'confirm-finish' | 'finished';

function resolveItemSet(
  language: string,
  override: unknown,
): ListenFirstSoundItemSet & {
  item_set_id: string;
  question_version: string;
} {
  if (override && typeof override === 'object' && 'prompts' in override) {
    return override as ListenFirstSoundItemSet & {
      item_set_id: string;
      question_version: string;
    };
  }
  return language === 'xh'
    ? WELA_PLUS_FIRST_SOUND_XH
    : WELA_PLUS_FIRST_SOUND_EN;
}

export function ListenFirstSoundQuestion(props: QuestionProps) {
  const {
    language,
    itemSet,
    instructions,
    durationSec,
    onComplete,
    onItemMarked,
  } = props;
  const [phase, setPhase] = useState<Phase>('intro');
  const { isMarked, toggle } = useToggleMark();
  const fontScale = useChildReadingFontSize();
  const promptFontSize = BASE_PROMPT_FONT_SIZE * fontScale;
  const effectiveItemSet = resolveItemSet(language, itemSet);

  const isMarkedRef = useRef(isMarked);
  isMarkedRef.current = isMarked;
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
        prompt: p.prompt,
        is_correct: isMarkedRef.current(p.item_key),
      }));
      const totalCorrect = items.filter((i) => i.is_correct).length;
      const elapsedMs =
        startTimeMsRef.current === null
          ? 0
          : Date.now() - startTimeMsRef.current;

      const result: Result = {
        question_code: 'wela_plus_first_sound',
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
          was_timed: durationSec !== undefined,
        },
      };
      onComplete(result);
    },
    [effectiveItemSet, language, prompts, durationSec, onComplete],
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
        <Pressable
          onPress={() => {
            setPhase('active');
            finish('completed');
          }}
        >
          <Text>Yes, finish</Text>
        </Pressable>
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
              accessibilityRole="button"
              accessibilityLabel={`${p.prompt}, ${labelState}`}
              onPress={() => handleToggle(idx, p.item_key, p.prompt)}
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
                {p.prompt}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable accessibilityRole="button" onPress={handleFinish}>
        <Text>Finish</Text>
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
    borderColor: '#999',
    marginBottom: 8,
  },
  promptText: {
    fontWeight: '600',
  },
});
