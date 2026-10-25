/** Blending sounds: segmented prompts with a word gloss, marked in order. */
import React, { useMemo } from 'react';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ItemSetMeta } from '../../types/ItemSet';
import { resolveItemSet } from '../../itemsets/resolveItemSet';
import { MissingItemSet } from '../../progress/MissingItemSet';
import { SequentialCapture } from '../../progress/SequentialCapture';
import { flatCopy } from '../../progress/captureCopy';
import type { ListenPhonemeBlendItemSet } from './types';
import { WELA_PLUS_PHONEME_BLEND_EN } from '../../itemsets/wela_plus_phoneme_blend.en';
import { WELA_PLUS_PHONEME_BLEND_XH } from '../../itemsets/wela_plus_phoneme_blend.xh';

type FullItemSet = ListenPhonemeBlendItemSet & ItemSetMeta;

function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (!Array.isArray(o.prompts)) return false;
  if (typeof o.item_set_id !== 'string') return false;
  if (typeof o.question_version !== 'string') return false;
  if (typeof o.question_code !== 'string') return false;
  if (typeof o.language !== 'string') return false;
  // Defend against accidentally receiving a Q3-shaped itemset whose `prompts` lack
  // segmented/word fields; the runtime guard prevents silent shape mixups.
  return o.prompts.every(
    (p) =>
      p !== null &&
      typeof p === 'object' &&
      typeof (p as Record<string, unknown>).segmented === 'string',
  );
}

export function ListenPhonemeBlendQuestion(props: QuestionProps) {
  const itemSet = resolveItemSet(
    props.language,
    props.itemSet,
    { en: WELA_PLUS_PHONEME_BLEND_EN, xh: WELA_PLUS_PHONEME_BLEND_XH },
    isFullItemSet,
  );
  if (!itemSet) return <MissingItemSet language={props.language} />;
  return <ListenPhonemeBlendQuestionContent {...props} itemSet={itemSet} />;
}

function ListenPhonemeBlendQuestionContent(props: QuestionProps & { itemSet: FullItemSet }) {
  const items = useMemo(() => props.itemSet.prompts.map(({ item_key, segmented, word }) => ({
    item_key, prompt: segmented, gloss: `(${word})`, metadata: { word },
  })), [props.itemSet.prompts]);
  return <SequentialCapture {...props} items={items} testIDPrefix="blend"
    body={{ kind: 'cards', testID: 'prompt-scroll' }} copy={flatCopy('word', items.length)}
    stopRule={null} durationSec={undefined} />;
}
