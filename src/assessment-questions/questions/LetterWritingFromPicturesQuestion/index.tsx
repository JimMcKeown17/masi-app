/**
 * LetterWritingFromPicturesQuestion — WelaPLUS Pattern D (Q5).
 *
 * Paginated grid mirroring the paper sheet. Child writes the first letter
 * of each picture's name on paper at their own pace; EA marks per-cell on
 * the device AFTER (batch marking). Each cell shows the picture name and
 * expected letter so the EA does not need to recall it. Picture images need
 * their own tile layout before shipping. Untimed. is_correct=false default.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
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
import { Canvas, ConfirmSheet, MarkTile, PagedGrid, PageIndicator, paginate, QuestionIntro, ToggleBar } from '../../ui';
import { SkipReasonPicker } from '../../skip/SkipReasonPicker';
import type { ManualSkipReason } from '../../skip/skipReasons';

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

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.item_set_id !== 'string') return false;
  if (typeof o.question_version !== 'string') return false;
  if (typeof o.question_code !== 'string') return false;
  if (typeof o.language !== 'string') return false;
  if (!isPositiveInteger(o.itemsPerPage)) return false;
  if (!isPositiveInteger(o.columns)) return false;
  if (!Array.isArray(o.prompts)) return false;
  return o.prompts.every(isValidPrompt);
}

export function LetterWritingFromPicturesQuestion(props: QuestionProps) {
  // Invalid paging hints must never reach paginate or silently select another card.
  // Keep the shared resolver's fallback for other malformed overrides unchanged.
  if (props.itemSet && typeof props.itemSet === 'object') {
    const override = props.itemSet as Record<string, unknown>;
    if (['itemsPerPage', 'columns'].some(field => field in override && !isPositiveInteger(override[field]))) {
      return <MissingItemSet language={props.language} />;
    }
  }
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

  const isMarkedRef = useRef(isMarked);
  useEffect(() => {
    isMarkedRef.current = isMarked;
  }, [isMarked]);

  const hasFinishedRef = useRef(false);
  const startTimeMsRef = useRef<number | null>(null);

  const prompts = effectiveItemSet.prompts;
  const totalItems = prompts.length;
  const itemsPerPage = effectiveItemSet.itemsPerPage;
  const columns = effectiveItemSet.columns;
  const layout = React.useMemo(
    () => ({ columns, capacity: itemsPerPage, breakAtCardRow: false }),
    [columns, itemsPerPage],
  );
  const pages = React.useMemo(
    () => paginate([prompts.map((_, i) => i)], layout),
    [prompts, layout],
  );

  const unmarkedCount = prompts.reduce(
    (acc, _, idx) => acc + (isMarked(String(idx)) ? 0 : 1),
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
            is_correct: isMarkedRef.current(String(idx)),
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
      const willBeMarked = !isMarkedRef.current(String(idx));
      toggle(String(idx));
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
    return <QuestionIntro instructions={instructions} onStart={() => setPhase('active')} />;
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
  const page = pages[currentPage];
  return (
    <Canvas>
      <View
        style={{ flex: 1 }}
        accessibilityElementsHidden={confirming}
        importantForAccessibility={confirming ? 'no-hide-descendants' : 'auto'}
        pointerEvents={confirming ? 'none' : 'auto'}
      >
        {page && <PagedGrid
          testID="picture-grid"
          pages={pages}
          pageIndex={currentPage}
          variant="picture"
          layout={layout}
          renderTile={(position, size) => {
            const p = prompts[position];
            const state = isMarked(String(position)) ? 'correct' : 'idle';
            return (
              <MarkTile
                variant="picture"
                {...size}
                state={state}
                caption={p.picture.alt}
                text={p.expected_letter}
                testID={`cell-${p.item_key}`}
                accessibilityLabel={`${p.picture.alt} → ${p.expected_letter}, ${state}`}
                onPress={() => handleToggle(position, p)}
              />
            );
          }}
        />}
        <ToggleBar
          header={<PageIndicator
            pages={pages}
            current={currentPage}
            onPrevious={() => setCurrentPage(p => Math.max(0, p - 1))}
            onNext={() => setCurrentPage(p => Math.min(pages.length - 1, p + 1))}
          />}
          primary={{ label: 'Finish', onPress: handleFinish }}
          onSkip={() => setPhase('skip-picker')}
        />
      </View>
      {confirming && <ConfirmSheet
        testID="confirm-finish"
        title={`${unmarkedCount} items unmarked — finish anyway?`}
        confirmLabel="Yes, finish"
        onConfirm={() => finish('completed')}
        cancelLabel="Cancel"
        onCancel={() => setPhase('active')}
      />}
    </Canvas>
  );
}
