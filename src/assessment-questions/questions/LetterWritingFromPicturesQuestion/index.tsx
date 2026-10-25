/** Letter writing: mark the child's finished sheet in order, using the picture grid. */
import React, { useMemo } from 'react';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ItemSetMeta } from '../../types/ItemSet';
import { resolveItemSet } from '../../itemsets/resolveItemSet';
import { MissingItemSet } from '../../progress/MissingItemSet';
import { SequentialCapture } from '../../progress/SequentialCapture';
import { flatCopy } from '../../progress/captureCopy';
import type { LetterWritingFromPicturesItemSet, LetterWritingPrompt } from './types';
import { WELA_PLUS_LETTER_WRITING_EN } from '../../itemsets/wela_plus_letter_writing.en';
import { WELA_PLUS_LETTER_WRITING_XH } from '../../itemsets/wela_plus_letter_writing.xh';

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

function LetterWritingFromPicturesQuestionContent(props: QuestionProps & { itemSet: FullItemSet }) {
  const { prompts, columns, itemsPerPage } = props.itemSet;
  const items = useMemo(() => prompts.map(({ item_key, picture, expected_letter }) => ({
    item_key, prompt: `${picture.alt} → ${expected_letter}`, text: expected_letter, caption: picture.alt,
  })), [prompts]);
  const rows = useMemo(() => [items.map((_, position) => position)], [items]);
  return <SequentialCapture {...props} items={items} testIDPrefix="letter-writing"
    body={{ kind: 'grid', rows, layout: { columns, capacity: itemsPerPage, breakAtCardRow: false },
      variant: 'picture', testID: 'picture-grid', labelFor: (page, count) => [
        { text: `Page ${page.index + 1}`, strong: true }, { text: ` of ${count}` },
      ] }} copy={flatCopy('letter', items.length)} stopRule={null} durationSec={undefined} />;
}
