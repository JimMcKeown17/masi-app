/** Reading words: paged card rows marked sequentially through the shared engine. */
import React, { useMemo } from 'react';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ItemSetMeta } from '../../types/ItemSet';
import { resolveItemSet } from '../../itemsets/resolveItemSet';
import { MissingItemSet } from '../../progress/MissingItemSet';
import type { ReadWordsItemSet, ReadWordsPrompt } from './types';
import { WELA_PLUS_READ_WORDS_EN } from '../../itemsets/wela_plus_read_words.en';
import { WELA_PLUS_READ_WORDS_XH } from '../../itemsets/wela_plus_read_words.xh';
import { WORD_PAGE_LAYOUT } from '../../ui';
import { flatCopy } from '../../progress/captureCopy';
import { buildSequentialCard, SequentialCapture } from '../../progress/SequentialCapture';

type FullItemSet = ReadWordsItemSet & ItemSetMeta;

function isValidWord(p: unknown): p is ReadWordsPrompt {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return typeof o.item_key === 'string' && typeof o.word === 'string';
}

// Itemset overrides are SINGLE-LANGUAGE by codebase convention.
function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.item_set_id !== 'string') return false;
  if (typeof o.question_version !== 'string') return false;
  if (typeof o.question_code !== 'string') return false;
  if (typeof o.language !== 'string') return false;
  if (!Array.isArray(o.words)) return false;
  if (o.row_lengths !== undefined) {
    if (!Array.isArray(o.row_lengths)) return false;
    if (
      !o.row_lengths.every(
        (length) => Number.isInteger(length) && length > 0,
      )
    ) {
      return false;
    }
    const total = o.row_lengths.reduce(
      (sum, length) => sum + (length as number),
      0,
    );
    if (total !== o.words.length) return false;
  }
  return o.words.every(isValidWord);
}

function chunkByLengths<T>(items: T[], rowLengths: number[]): T[][] {
  let cursor = 0;
  return rowLengths.map((length) => {
    const row = items.slice(cursor, cursor + length);
    cursor += length;
    return row;
  });
}

export function ReadWordsQuestion(
  props: QuestionProps,
) {
  const itemSet = resolveItemSet(
    props.language,
    props.itemSet,
    { en: WELA_PLUS_READ_WORDS_EN, xh: WELA_PLUS_READ_WORDS_XH },
    isFullItemSet,
  );
  if (!itemSet) return <MissingItemSet language={props.language} />;
  return <ReadWordsSequentialContent {...props} itemSet={itemSet} />;
}

function ReadWordsSequentialContent(props: QuestionProps & { itemSet: FullItemSet }) {
  const { words, row_lengths } = props.itemSet;
  const card = useMemo(() => buildSequentialCard(
    chunkByLengths(words, row_lengths ?? [words.length]).map((row) =>
      row.map((word) => ({ item_key: word.item_key, prompt: word.word }))),
  ), [words, row_lengths]);
  return <SequentialCapture {...props} items={card.items} copy={flatCopy('word', card.items.length)}
    body={{ kind: 'grid', rows: card.rows, layout: WORD_PAGE_LAYOUT, variant: 'word', testID: 'word-grid' }} stopRule={props.itemSet.stop_rule ?? null} testIDPrefix="word" />;
}
