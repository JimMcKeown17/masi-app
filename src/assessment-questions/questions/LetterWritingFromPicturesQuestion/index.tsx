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
import { monotonicNow } from '../../progress/clock';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ItemSetMeta } from '../../types/ItemSet';
import { resolveItemSet } from '../../itemsets/resolveItemSet';
import { MissingItemSet } from '../../progress/MissingItemSet';
import type { Result, ResultItem, StoppedReason } from '../../types/Result';
import type {
  LetterWritingFromPicturesItemSet,
  LetterWritingPrompt,
} from './types';
import { WELA_PLUS_LETTER_WRITING_EN } from '../../itemsets/wela_plus_letter_writing.en';
import { WELA_PLUS_LETTER_WRITING_XH } from '../../itemsets/wela_plus_letter_writing.xh';
import { useToggleMark } from '../../hooks/useToggleMark';
import { useChildReadingFontSize } from '../../hooks/useChildReadingFontSize';
import { tokens } from '../../theme/tokens';
import { SkipReasonPicker } from '../../skip/SkipReasonPicker';
import type { ManualSkipReason } from '../../skip/skipReasons';

const BASE_LETTER_FONT_SIZE = 18;
const BASE_ALT_FONT_SIZE = 14;

type Phase =
  | 'intro'
  | 'active'
  | 'confirm-finish'
  | 'skip-picker'
  | 'finished';

type FullItemSet = LetterWritingFromPicturesItemSet & ItemSetMeta;

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
  if (typeof o.question_code !== 'string') return false;
  if (typeof o.language !== 'string') return false;
  if (typeof o.itemsPerPage !== 'number') return false;
  if (typeof o.columns !== 'number') return false;
  if (!Array.isArray(o.prompts)) return false;
  return o.prompts.every(isValidPrompt);
}

export function LetterWritingFromPicturesQuestion(props: QuestionProps) {
  const itemSet = resolveItemSet(
    props.language,
    props.itemSet,
    { en: WELA_PLUS_LETTER_WRITING_EN, xh: WELA_PLUS_LETTER_WRITING_XH },
    isFullItemSet,
  );
  if (!itemSet) return <MissingItemSet language={props.language} />;
  return <LetterWritingFromPicturesQuestionContent {...props} itemSet={itemSet} />;
}

function LetterWritingFromPicturesQuestionContent(
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
  const [currentPage, setCurrentPage] = useState(0);
  const { isMarked, toggle } = useToggleMark();
  const fontScale = useChildReadingFontSize();
  const letterFontSize = BASE_LETTER_FONT_SIZE * fontScale;
  const altFontSize = BASE_ALT_FONT_SIZE * fontScale;

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
      startTimeMsRef.current = monotonicNow();
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
                  backgroundColor: marked ? tokens.color.marked : tokens.color.surface,
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
                      color: marked ? tokens.color.onMarked : tokens.color.ink,
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
                    color: marked ? tokens.color.onMarked : tokens.color.ink,
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
    borderColor: tokens.color.line,
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
