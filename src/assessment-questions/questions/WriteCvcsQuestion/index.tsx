/**
 * WriteCvcsQuestion — WelaPLUS Pattern D (Q9, dictation of CVC words).
 *
 * EA dictates a word; child writes from memory on paper; EA marks each
 * scoring letter independently. Scoring letters come from content and may
 * omit a prefix that is not assessed.
 * Privacy of the prompt is the EA's physical responsibility (PRD §"Prompt
 * privacy"); no tap-to-reveal, no auto-hide.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { QuestionProps } from '../../types/QuestionProps';
import type { Result, ResultItem, StoppedReason } from '../../types/Result';
import type { WriteCvcsItemSet, WriteCvcsWord } from './types';
import { WELA_PLUS_WRITE_CVCS_EN } from '../../itemsets/wela_plus_write_cvcs.en';
import { WELA_PLUS_WRITE_CVCS_XH } from '../../itemsets/wela_plus_write_cvcs.xh';
import { useToggleMark } from '../../hooks/useToggleMark';
import { tokens } from '../../theme/tokens';
import { SkipReasonPicker } from '../../skip/SkipReasonPicker';
import type { ManualSkipReason } from '../../skip/skipReasons';

type Phase =
  | 'intro'
  | 'active'
  | 'confirm-finish'
  | 'skip-picker'
  | 'finished';

type FullItemSet = WriteCvcsItemSet & {
  item_set_id: string;
  question_version: string;
};

function isValidWord(value: unknown): value is WriteCvcsWord {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.item_key === 'string' &&
    typeof o.word === 'string' &&
    Array.isArray(o.letters) &&
    o.letters.length > 0 &&
    o.letters.every((letter) => typeof letter === 'string')
  );
}

function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.item_set_id !== 'string') return false;
  if (typeof o.question_version !== 'string') return false;
  if (!Array.isArray(o.words)) return false;
  return o.words.every(isValidWord);
}

function resolveItemSet(language: string, override: unknown): FullItemSet {
  if (isFullItemSet(override)) return override;
  return language === 'xh'
    ? WELA_PLUS_WRITE_CVCS_XH
    : WELA_PLUS_WRITE_CVCS_EN;
}

interface ScoringLetter {
  word: WriteCvcsWord;
  wordIndex: number;
  letter: string;
  letterIndex: number;
  position: number;
  itemKey: string;
}

function buildScoringRows(words: WriteCvcsWord[]): ScoringLetter[][] {
  let position = 0;
  return words.map((word, wordIndex) =>
    word.letters.map((letter, letterIndex) => ({
      word,
      wordIndex,
      letter,
      letterIndex,
      position: position++,
      itemKey: `${word.item_key}.l${letterIndex + 1}`,
    })),
  );
}

export function WriteCvcsQuestion(props: QuestionProps) {
  const {
    language,
    itemSet,
    instructions,
    onComplete,
    onItemMarked,
  } = props;
  const [phase, setPhase] = useState<Phase>('intro');
  const { isMarked, toggle } = useToggleMark();
  const effectiveItemSet = resolveItemSet(language, itemSet);

  const isMarkedRef = useRef(isMarked);
  useEffect(() => {
    isMarkedRef.current = isMarked;
  }, [isMarked]);

  const hasFinishedRef = useRef(false);
  const startTimeMsRef = useRef<number | null>(null);

  const words = effectiveItemSet.words;
  const scoringRows = React.useMemo(() => buildScoringRows(words), [words]);
  const scoringLetters = React.useMemo(
    () => scoringRows.flat(),
    [scoringRows],
  );
  const unmarkedCount = scoringLetters.reduce(
    (acc, scoringLetter) =>
      acc + (isMarked(scoringLetter.itemKey) ? 0 : 1),
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

      const isSkipped = stoppedReason.startsWith('skipped_');
      const items = isSkipped
        ? []
        : scoringLetters.map((scoringLetter) => ({
            position: scoringLetter.position,
            item_key: scoringLetter.itemKey,
            prompt: scoringLetter.letter,
            is_correct: isMarkedRef.current(scoringLetter.itemKey),
            metadata: {
              word: scoringLetter.word.word,
              word_index: scoringLetter.wordIndex,
              letter_index: scoringLetter.letterIndex,
            },
          }));
      const totalCorrect = items.filter((i) => i.is_correct).length;
      const totalAttempted = items.length;
      const elapsedMs =
        startTimeMsRef.current === null
          ? 0
          : Date.now() - startTimeMsRef.current;
      const perWord = isSkipped
        ? []
        : scoringRows.map((row) => ({
            word: row[0].word.word,
            correct: row.filter((letter) =>
              isMarkedRef.current(letter.itemKey),
            ).length,
            total: row.length,
          }));

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
          total_attempted: totalAttempted,
          percent:
            totalAttempted > 0
              ? Math.round((totalCorrect / totalAttempted) * 100)
              : 0,
          last_attempted_position: null,
          was_timed: false,
          per_word: perWord,
        },
      };
      onComplete(result);
    },
    [effectiveItemSet, language, scoringLetters, scoringRows, onComplete],
  );

  const handleToggle = useCallback(
    (scoringLetter: ScoringLetter) => {
      const willBeMarked = !isMarkedRef.current(scoringLetter.itemKey);
      toggle(scoringLetter.itemKey);
      if (onItemMarked) {
        const item: ResultItem = {
          position: scoringLetter.position,
          item_key: scoringLetter.itemKey,
          prompt: scoringLetter.letter,
          is_correct: willBeMarked,
          metadata: {
            word: scoringLetter.word.word,
            word_index: scoringLetter.wordIndex,
            letter_index: scoringLetter.letterIndex,
          },
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
        {scoringRows.map((row, wordIndex) => (
          <View key={row[0].word.item_key} style={styles.wordRow}>
            <Text style={styles.wordLabel}>{`${wordIndex + 1}. ${row[0].word.word}`}</Text>
            <View style={styles.letterRow}>
              {row.map((scoringLetter) => {
                const marked = isMarked(scoringLetter.itemKey);
                const labelState = marked ? 'correct' : 'idle';
                return (
                  <Pressable
                    key={scoringLetter.itemKey}
                    testID={`letter-${scoringLetter.itemKey}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${scoringLetter.word.word} letter ${scoringLetter.letterIndex + 1} ${scoringLetter.letter}, ${labelState}`}
                    onPress={() => handleToggle(scoringLetter)}
                    style={[
                      styles.letterCell,
                      {
                        backgroundColor: marked
                          ? tokens.color.marked
                          : tokens.color.surface,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.letterText,
                        {
                          color: marked
                            ? tokens.color.onMarked
                            : tokens.color.ink,
                        },
                      ]}
                    >
                      {scoringLetter.letter}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.nav}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  list: {
    gap: tokens.space.sm,
    paddingBottom: tokens.space.lg,
  },
  wordRow: {
    gap: tokens.space.sm,
    padding: tokens.space.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
    borderRadius: tokens.radius.card,
    backgroundColor: tokens.color.canvas,
  },
  wordLabel: {
    fontSize: tokens.font.body,
    fontWeight: '600',
    color: tokens.color.ink,
  },
  letterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space.sm,
  },
  letterCell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    borderWidth: 1,
    borderColor: tokens.color.line,
    borderRadius: tokens.radius.cell,
  },
  letterText: { fontSize: tokens.font.markingItem, fontWeight: '600' },
  nav: {
    flexDirection: 'row',
    gap: tokens.space.lg,
    padding: tokens.space.md,
  },
});
