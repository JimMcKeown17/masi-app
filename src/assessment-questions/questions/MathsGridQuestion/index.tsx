import React, { useMemo } from 'react';
import type { QuestionProps } from '../../types/QuestionProps';
import { MissingItemSet } from '../../progress/MissingItemSet';
import { SequentialCapture } from '../../progress/SequentialCapture';
import { flatCopy } from '../../progress/captureCopy';
import { LETTER_PAGE_LAYOUT, WORD_PAGE_LAYOUT, THREE_BY_THREE_LAYOUT } from '../../ui';
import { OBSERVATION_OPTIONS } from '../../egma/strategies';
import { withRate } from '../../egma/rate';
import { isMathsCaptureItem, isMathsStopRule, type MathsGridItemSet } from './types';

const layouts = {
  three_by_three: THREE_BY_THREE_LAYOUT,
  five_by_four: LETTER_PAGE_LAYOUT,
  two_by_five: WORD_PAGE_LAYOUT,
};

export function isMathsGridItemSet(value: unknown): value is MathsGridItemSet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const itemSet = value as Record<string, unknown>;
  return itemSet.kind === 'maths_grid' &&
    typeof itemSet.item_set_id === 'string' && typeof itemSet.question_code === 'string' &&
    typeof itemSet.question_version === 'string' && typeof itemSet.language === 'string' &&
    (itemSet.layout === 'three_by_three' || itemSet.layout === 'five_by_four' || itemSet.layout === 'two_by_five') &&
    (itemSet.tile === 'number' || itemSet.tile === 'sum') && (itemSet.noun === 'number' || itemSet.noun === 'item') &&
    typeof itemSet.strategy_step === 'boolean' && isMathsStopRule(itemSet.stop_rule) &&
    Array.isArray(itemSet.items) && itemSet.items.every(isMathsCaptureItem);
}

export function MathsGridQuestion(props: QuestionProps) {
  if (!isMathsGridItemSet(props.itemSet)) return <MissingItemSet language={props.language} />;
  return <MathsGridQuestionContent {...props} itemSet={props.itemSet} />;
}

function MathsGridQuestionContent(props: QuestionProps & { itemSet: MathsGridItemSet }) {
  const items = useMemo(() => props.itemSet.items.map(({ item_key, prompt, gloss, skill, band }) => ({
    item_key, prompt, gloss, metadata: { skill, band },
  })), [props.itemSet.items]);
  const rows = useMemo(() => [items.map((_, position) => position)], [items]);
  const durationSec = props.durationSec;
  return <SequentialCapture {...props} items={items} testIDPrefix="maths"
    body={{ kind: 'grid', rows, layout: layouts[props.itemSet.layout],
      variant: props.itemSet.tile === 'sum' ? 'sum' : 'letter', testID: 'maths-grid' }}
    copy={flatCopy(props.itemSet.noun, items.length)} stopRule={props.itemSet.stop_rule}
    observation={props.itemSet.strategy_step ? { options: OBSERVATION_OPTIONS } : undefined}
    finalizeResult={durationSec === undefined ? undefined : base => withRate(base, durationSec)} />;
}
