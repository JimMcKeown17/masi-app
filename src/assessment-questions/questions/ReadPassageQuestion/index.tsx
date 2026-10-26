/** Q8 and EGRA oral reading: flowing paragraphs, marked word by word. */
import React, { useCallback, useMemo } from 'react';
import { SequentialCapture } from '../../progress/SequentialCapture';
import { flatCopy } from '../../progress/captureCopy';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ItemSetMeta } from '../../types/ItemSet';
import type { Result } from '../../types/Result';
import { resolveItemSet } from '../../itemsets/resolveItemSet';
import { MissingItemSet } from '../../progress/MissingItemSet';
import type { ReadPassageItemSet, ReadPassageWord } from './types';
import { WELA_PLUS_READ_PASSAGE_EN } from '../../itemsets/wela_plus_read_passage.en';
import { WELA_PLUS_READ_PASSAGE_XH } from '../../itemsets/wela_plus_read_passage.xh';

type FullItemSet = ReadPassageItemSet & ItemSetMeta;

function isValidWord(p: unknown): p is ReadPassageWord {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return typeof o.item_key === 'string' && typeof o.word === 'string';
}

// Single-language overrides per codebase convention.
function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.item_set_id !== 'string') return false;
  if (typeof o.question_version !== 'string') return false;
  if (typeof o.question_code !== 'string') return false;
  if (typeof o.language !== 'string') return false;
  const words = o.words;
  if (!Array.isArray(words)) return false;
  const paragraphStarts = o.paragraph_starts;
  if (paragraphStarts !== undefined) {
    if (!Array.isArray(paragraphStarts)) return false;
    if (paragraphStarts.length === 0 || paragraphStarts[0] !== 0) {
      return false;
    }
    if (
      !paragraphStarts.every(
        (start, idx) =>
          Number.isInteger(start) &&
          start >= 0 &&
          start < words.length &&
          (idx === 0 || start > paragraphStarts[idx - 1]),
      )
    ) {
      return false;
    }
  }
  return words.every(isValidWord);
}

export function ReadPassageQuestion(props: QuestionProps) {
  const itemSet = resolveItemSet(props.language, props.itemSet,
    { en: WELA_PLUS_READ_PASSAGE_EN, xh: WELA_PLUS_READ_PASSAGE_XH }, isFullItemSet);
  if (!itemSet) return <MissingItemSet language={props.language} />;
  return <ReadPassageQuestionContent {...props} itemSet={itemSet} />;
}

function ReadPassageQuestionContent(props: QuestionProps & { itemSet: FullItemSet }) {
  const { words, paragraph_starts } = props.itemSet;
  const items = useMemo(() => words.map(word => ({ item_key: word.item_key, prompt: word.word })), [words]);
  const groups = useMemo(() => {
    const starts = paragraph_starts ?? [0];
    return starts.map((start, i) => ({ key: String(i), testID: `paragraph-${i}`,
      positions: Array.from({ length: (starts[i + 1] ?? words.length) - start }, (_, j) => start + j) }));
  }, [paragraph_starts, words.length]);
  const finalizeResult = useCallback((base: Result): Result => (
    base.derived.was_timed && !base.stopped_reason.startsWith('skipped_') ? {
      ...base, derived: { ...base.derived, correct_words_per_minute: base.duration_ms > 0
        ? Math.round(base.derived.total_correct / base.duration_ms * 60000) : 0 },
    } : base
  ), []);

  return <SequentialCapture {...props} items={items} testIDPrefix="passage"
    body={{ kind: 'groups', testID: 'passage-scroll', card: false, variant: 'pill', groups }}
    copy={flatCopy('word', items.length)} stopRule={null} finalizeResult={finalizeResult} />;
}
