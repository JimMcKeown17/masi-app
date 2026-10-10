/**
 * LetterWritingFromPicturesQuestion — WelaPLUS Pattern D (Q5).
 *
 * Paginated grid mirroring the paper sheet. Child writes the first letter
 * of each picture's name on paper at their own pace; EA marks per-cell on
 * the device AFTER (batch marking). Each cell shows a picture (or alt-text
 * fallback for the stub) + a small expected-letter label so the EA does
 * not need to recall it. Untimed. is_correct=false default.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import type { QuestionProps } from '../../types/QuestionProps';
import type { Result, ResultItem, StoppedReason } from '../../types/Result';
import type {
  LetterWritingFromPicturesItemSet,
  LetterWritingPrompt,
} from './types';
import { WELA_PLUS_LETTER_WRITING_EN } from '../../itemsets/wela_plus_letter_writing.en';
import { WELA_PLUS_LETTER_WRITING_XH } from '../../itemsets/wela_plus_letter_writing.xh';
import { useToggleMark } from '../../hooks/useToggleMark';
import { useChildReadingFontSize } from '../../hooks/useChildReadingFontSize';

const BASE_LETTER_FONT_SIZE = 18;
const BASE_ALT_FONT_SIZE = 14;
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

type FullItemSet = LetterWritingFromPicturesItemSet & {
  item_set_id: string;
  question_version: string;
};

function isValidPrompt(p: unknown): p is LetterWritingPrompt {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  if (typeof o.item_key !== 'string') return false;
  if (typeof o.expected_letter !== 'string') return false;
  if (!o.picture || typeof o.picture !== 'object') return false;
  const pic = o.picture as Record<string, unknown>;
  return typeof pic.alt === 'string';
}

function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.item_set_id !== 'string') return false;
  if (typeof o.question_version !== 'string') return false;
  if (typeof o.itemsPerPage !== 'number') return false;
  if (typeof o.columns !== 'number') return false;
  if (!Array.isArray(o.prompts)) return false;
  return o.prompts.every(isValidPrompt);
}

function resolveItemSet(language: string, override: unknown): FullItemSet {
  if (isFullItemSet(override)) return override;
  return language === 'xh'
    ? WELA_PLUS_LETTER_WRITING_XH
    : WELA_PLUS_LETTER_WRITING_EN;
}

export function LetterWritingFromPicturesQuestion(props: QuestionProps) {
  const {
    language,
    itemSet,
    instructions,
    onComplete,
    onItemMarked,
    onAbandon,
  } = props;
  const [phase, setPhase] = useState<Phase>('intro');
  const [currentPage, setCurrentPage] = useState(0);
  const { isMarked, toggle } = useToggleMark();
  const fontScale = useChildReadingFontSize();
  const letterFontSize = BASE_LETTER_FONT_SIZE * fontScale;
  const altFontSize = BASE_ALT_FONT_SIZE * fontScale;
  const effectiveItemSet = resolveItemSet(language, itemSet);

  const isMarkedRef = useRef(isMarked);
  useEffect(() => {
    isMarkedRef.current = isMarked;
  }, [isMarked]);

  const hasFinishedRef = useRef(false);
  const startTimeMsRef = useRef<number | null>(null);

  const prompts = effectiveItemSet.prompts;
  const totalItems = prompts.length;
  const itemsPerPage = effectiveItemSet.itemsPerPage;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const columns = effectiveItemSet.columns;
  const tileBasis: `${number}%` = `${100 / columns}%`;

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

      // Skip-emits-empty contract: a skipped_* stop must NOT persist as if
      // every item was answered wrong. The host's storage layer translates
      // items=[] + stopped_reason=skipped_* into NULL score / zero items.
      const isSkipped = stoppedReason.startsWith('skipped_');
      const items = isSkipped
        ? []
        : prompts.map((p, idx) => ({
            position: idx,
            item_key: p.item_key,
            prompt: `${p.picture.alt} → ${p.expected_letter}`,
            is_correct: isMarkedRef.current(p.item_key),
          }));
      const totalCorrect = items.filter((i) => i.is_correct).length;
      const totalAttempted = isSkipped ? 0 : totalItems;
      const elapsedMs =
        startTimeMsRef.current === null
          ? 0
          : Date.now() - startTimeMsRef.current;

      const result: Result = {
        question_code: 'wela_plus_letter_writing',
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
    [effectiveItemSet, language, prompts, totalItems, onComplete],
  );

  const handleToggle = useCallback(
    (idx: number, p: LetterWritingPrompt) => {
      const willBeMarked = !isMarkedRef.current(p.item_key);
      toggle(p.item_key);
      if (onItemMarked) {
        const item: ResultItem = {
          position: idx,
          item_key: p.item_key,
          prompt: `${p.picture.alt} → ${p.expected_letter}`,
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

  const pageStart = currentPage * itemsPerPage;
  const pagePrompts = prompts.slice(pageStart, pageStart + itemsPerPage);

  return (
    <View style={styles.root}>
      <View testID="picture-grid" style={styles.grid}>
        {pagePrompts.map((p, i) => {
          const idx = pageStart + i;
          const marked = isMarked(p.item_key);
          const labelState = marked ? 'correct' : 'idle';
          return (
            <Pressable
              key={p.item_key}
              testID={`cell-${p.item_key}`}
              accessibilityRole="button"
              accessibilityLabel={`${p.picture.alt} → ${p.expected_letter}, ${labelState}`}
              onPress={() => handleToggle(idx, p)}
              style={[
                styles.tile,
                {
                  flexBasis: tileBasis,
                  backgroundColor: marked ? MARKED_BG : IDLE_BG,
                },
              ]}
            >
              {p.picture.source ? (
                <Image
                  source={p.picture.source}
                  style={styles.thumbnail}
                  accessibilityLabel={p.picture.alt}
                />
              ) : (
                <Text
                  style={[
                    styles.altText,
                    {
                      fontSize: altFontSize,
                      color: marked ? '#ffffff' : '#444',
                    },
                  ]}
                >
                  {p.picture.alt}
                </Text>
              )}
              <Text
                style={[
                  styles.letter,
                  {
                    fontSize: letterFontSize,
                    color: marked ? '#ffffff' : '#111',
                  },
                ]}
              >
                {p.expected_letter}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.nav}>
        {currentPage > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setCurrentPage((p) => Math.max(0, p - 1))}
          >
            <Text>Prev</Text>
          </Pressable>
        ) : null}
        {currentPage < totalPages - 1 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
            }
          >
            <Text>Next</Text>
          </Pressable>
        ) : null}
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#999',
    minHeight: 80,
  },
  thumbnail: { width: 48, height: 48, marginBottom: 4 },
  altText: { fontStyle: 'italic', marginBottom: 4 },
  letter: { fontWeight: '600' },
  nav: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
    paddingHorizontal: 12,
  },
});
