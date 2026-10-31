import React, { useMemo } from 'react';
import type { QuestionProps } from '../../types/QuestionProps';
import { MissingItemSet } from '../../progress/MissingItemSet';
import { SequentialCapture } from '../../progress/SequentialCapture';
import { flatCopy } from '../../progress/captureCopy';
import { ADD_CHOICES, TAKE_AWAY_CHOICES, OBSERVATION_OPTIONS } from '../../egma/strategies';
import { isMathsCaptureItem, isMathsStopRule } from '../MathsGridQuestion/types';
import type { MathsCardsItemSet } from './types';

export function isMathsCardsItemSet(value: unknown): value is MathsCardsItemSet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const itemSet = value as Record<string, unknown>;
  return itemSet.kind === 'maths_cards' &&
    typeof itemSet.item_set_id === 'string' && typeof itemSet.question_code === 'string' &&
    typeof itemSet.question_version === 'string' && typeof itemSet.language === 'string' &&
    (itemSet.noun === 'item' || itemSet.noun === 'pair' || itemSet.noun === 'number' || itemSet.noun === 'problem') &&
    (itemSet.choices === null || itemSet.choices === 'add' || itemSet.choices === 'take_away') &&
    typeof itemSet.strategy_step === 'boolean' && isMathsStopRule(itemSet.stop_rule) &&
    Array.isArray(itemSet.items) && itemSet.items.every(isMathsCaptureItem);
}

export function MathsCardsQuestion(props: QuestionProps) {
  if (!isMathsCardsItemSet(props.itemSet)) return <MissingItemSet language={props.language} />;
  return <MathsCardsQuestionContent {...props} itemSet={props.itemSet} />;
}

function MathsCardsQuestionContent(props: QuestionProps & { itemSet: MathsCardsItemSet }) {
  const items = useMemo(() => props.itemSet.items.map(({ item_key, prompt, gloss, skill, band }) => ({
    item_key, prompt, gloss, metadata: { skill, band },
  })), [props.itemSet.items]);
  return <SequentialCapture {...props} items={items} testIDPrefix="maths" durationSec={undefined}
    body={{ kind: 'cards', testID: 'maths-cards' }} copy={flatCopy(props.itemSet.noun, items.length)}
    stopRule={props.itemSet.stop_rule}
    choices={props.itemSet.choices === 'add' ? ADD_CHOICES : props.itemSet.choices === 'take_away' ? TAKE_AWAY_CHOICES : undefined}
    observation={props.itemSet.strategy_step ? { options: OBSERVATION_OPTIONS } : undefined} />;
}
