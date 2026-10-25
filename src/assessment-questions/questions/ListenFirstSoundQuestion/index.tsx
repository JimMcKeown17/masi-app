/** First sounds: oral prompts marked in order, without a timer. */
import React, { useMemo } from 'react';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ItemSetMeta } from '../../types/ItemSet';
import { resolveItemSet } from '../../itemsets/resolveItemSet';
import { MissingItemSet } from '../../progress/MissingItemSet';
import { SequentialCapture } from '../../progress/SequentialCapture';
import { flatCopy } from '../../progress/captureCopy';
import type { ListenFirstSoundItemSet } from './types';
import { WELA_PLUS_FIRST_SOUND_EN } from '../../itemsets/wela_plus_first_sound.en';
import { WELA_PLUS_FIRST_SOUND_XH } from '../../itemsets/wela_plus_first_sound.xh';

type FullItemSet = ListenFirstSoundItemSet & ItemSetMeta;

function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    Array.isArray(o.prompts) &&
    typeof o.item_set_id === 'string' &&
    typeof o.question_version === 'string' &&
    typeof o.question_code === 'string' &&
    typeof o.language === 'string'
  );
}

export function ListenFirstSoundQuestion(props: QuestionProps) {
  const itemSet = resolveItemSet(
    props.language,
    props.itemSet,
    { en: WELA_PLUS_FIRST_SOUND_EN, xh: WELA_PLUS_FIRST_SOUND_XH },
    isFullItemSet,
  );
  if (!itemSet) return <MissingItemSet language={props.language} />;
  return <ListenFirstSoundQuestionContent {...props} itemSet={itemSet} />;
}

function ListenFirstSoundQuestionContent(props: QuestionProps & { itemSet: FullItemSet }) {
  const items = useMemo(() => props.itemSet.prompts.map(({ item_key, prompt }) => ({ item_key, prompt })), [props.itemSet.prompts]);
  return <SequentialCapture {...props} items={items} testIDPrefix="first-sound"
    body={{ kind: 'cards', testID: 'prompt-scroll' }} copy={flatCopy('word', items.length)}
    stopRule={null} durationSec={undefined} />;
}
