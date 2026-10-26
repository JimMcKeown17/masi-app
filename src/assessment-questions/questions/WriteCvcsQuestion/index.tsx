/**
 * WriteCvcsQuestion — WelaPLUS Pattern D (Q9, dictation of CVC words).
 *
 * EA dictates a word; child writes from memory on paper; EA marks each
 * scoring letter independently. Scoring letters come from content and may
 * omit a prefix that is not assessed.
 * Privacy of the prompt is the EA's physical responsibility (PRD §"Prompt
 * privacy"); no tap-to-reveal, no auto-hide.
 */
import React, { useCallback, useMemo } from 'react';
import { SequentialCapture } from '../../progress/SequentialCapture';
import { nestedCopy } from '../../progress/captureCopy';
import type { CaptureItem } from '../../progress/captureTypes';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ItemSetMeta } from '../../types/ItemSet';
import { resolveItemSet } from '../../itemsets/resolveItemSet';
import { MissingItemSet } from '../../progress/MissingItemSet';
import type { Result } from '../../types/Result';
import type { WriteCvcsItemSet, WriteCvcsWord } from './types';
import { WELA_PLUS_WRITE_CVCS_EN } from '../../itemsets/wela_plus_write_cvcs.en';
import { WELA_PLUS_WRITE_CVCS_XH } from '../../itemsets/wela_plus_write_cvcs.xh';

type FullItemSet = WriteCvcsItemSet & ItemSetMeta;

function isValidWord(value: unknown): value is WriteCvcsWord {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.item_key === 'string' &&
    typeof o.word === 'string' &&
    Array.isArray(o.letters) &&
    o.letters.length > 0 &&
    o.letters.every((letter) => typeof letter === 'string')
  );
}

function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.item_set_id !== 'string') return false;
  if (typeof o.question_version !== 'string') return false;
  if (typeof o.question_code !== 'string') return false;
  if (typeof o.language !== 'string') return false;
  if (!Array.isArray(o.words)) return false;
  return o.words.every(isValidWord);
}

export function WriteCvcsQuestion(props: QuestionProps) {
  const itemSet = resolveItemSet(
    props.language,
    props.itemSet,
    { en: WELA_PLUS_WRITE_CVCS_EN, xh: WELA_PLUS_WRITE_CVCS_XH },
    isFullItemSet,
  );
  if (!itemSet) return <MissingItemSet language={props.language} />;
  return <WriteCvcsQuestionContent {...props} itemSet={itemSet} />;
}

function WriteCvcsQuestionContent(props: QuestionProps & { itemSet: FullItemSet }) {
  const { words } = props.itemSet;
  const { items, positionsByWord } = useMemo(() => {
    const items: CaptureItem[] = [];
    const positionsByWord = words.map((word, word_index) => word.letters.map((letter, letter_index) => {
      const position = items.length;
      items.push({ item_key: `${word.item_key}.l${letter_index + 1}`, prompt: letter,
        label: `${word.word} letter ${letter_index + 1} ${letter}`,
        metadata: { word: word.word, word_index, letter_index } });
      return position;
    }));
    return { items, positionsByWord };
  }, [words]);
  const finalizeResult = useCallback((base: Result): Result => ({
    ...base,
    derived: { ...base.derived, per_word: base.stopped_reason.startsWith('skipped_') ? []
      : positionsByWord.map((positions, index) => ({ word: words[index].word,
        correct: positions.filter(position => base.items[position].metadata?.reached && base.items[position].is_correct).length,
        total: positions.filter(position => base.items[position].metadata?.reached).length,
      })) },
  }), [words, positionsByWord]);

  return <SequentialCapture {...props} items={items} testIDPrefix="cvc"
    body={{ kind: 'groups', testID: 'prompt-scroll', card: true, variant: 'letter', tileWidth: 52,
      groups: words.map((word, i) => ({ key: String(i), heading: `${i + 1}. ${word.word}`, positions: positionsByWord[i] })) }}
    copy={nestedCopy('Word', 'letter', positionsByWord)} stopRule={null} durationSec={undefined}
    finalizeResult={finalizeResult} />;
}
