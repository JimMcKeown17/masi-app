import React, { useMemo } from 'react';
import type { QuestionProps } from '../../types/QuestionProps';
import type { LetterSoundsItemSet } from './types';
import { resolveItemSet } from '../../itemsets/resolveItemSet';
import { LETTER_SOUNDS_2026_2_EN } from '../../itemsets/letter_sounds@2026.2.en';
import { LETTER_SOUNDS_2026_2_XH } from '../../itemsets/letter_sounds@2026.2.xh';
import { MissingItemSet } from '../../progress/MissingItemSet';
import { LETTER_PAGE_LAYOUT } from '../../ui';
import { flatCopy } from '../../progress/captureCopy';
import { buildSequentialCard, SequentialCapture } from '../../progress/SequentialCapture';

function isFullItemSet(value: unknown): value is LetterSoundsItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    Array.isArray(o.rows) && o.rows.length > 0 &&
    o.rows.every((row) => Array.isArray(row) && row.length > 0 &&
      row.every((letter) => typeof letter === 'string')) &&
    (o.stop_rule === null || (typeof o.stop_rule === 'object' && !Array.isArray(o.stop_rule))) &&
    typeof o.item_set_id === 'string' && typeof o.question_version === 'string' &&
    typeof o.question_code === 'string' && typeof o.language === 'string'
  );
}

export function LetterSoundsQuestion(props: QuestionProps) {
  const itemSet = resolveItemSet(props.language, props.itemSet,
    { en: LETTER_SOUNDS_2026_2_EN, xh: LETTER_SOUNDS_2026_2_XH }, isFullItemSet);
  if (!itemSet) return <MissingItemSet language={props.language} />;
  return <LetterSoundsQuestionContent {...props} itemSet={itemSet} />;
}

function LetterSoundsQuestionContent(props: QuestionProps & { itemSet: LetterSoundsItemSet }) {
  const card = useMemo(() => {
    let position = 0;
    return buildSequentialCard(
      props.itemSet.rows.map((row) => row.map((letter) => ({
        item_key: String(position++),
        prompt: letter,
      }))),
    );
  }, [props.itemSet.rows]);
  return <SequentialCapture {...props} items={card.items} copy={flatCopy('letter', card.items.length)}
    body={{ kind: 'grid', rows: card.rows, layout: LETTER_PAGE_LAYOUT, variant: 'letter', testID: 'letter-grid', rowTestID: r => `letter-row-${r}` }} stopRule={props.itemSet.stop_rule} testIDPrefix="letter" />;
}
