/**
 * WriteSentencesFromDictationQuestion — WelaPLUS Pattern D (Q10).
 *
 * EA dictates each sentence aloud; child writes from memory on paper; EA
 * marks each written word independently. Words are grouped by sentence.
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
import type {
  WriteSentencesFromDictationItemSet,
  WriteSentencesFromDictationSentence,
  WriteSentencesFromDictationWord,
} from './types';
import { WELA_PLUS_WRITE_SENTENCES_DICTATION_EN } from '../../itemsets/wela_plus_write_sentences_dictation.en';
import { WELA_PLUS_WRITE_SENTENCES_DICTATION_XH } from '../../itemsets/wela_plus_write_sentences_dictation.xh';
type FullItemSet = WriteSentencesFromDictationItemSet & ItemSetMeta;

function isValidWord(value: unknown): value is WriteSentencesFromDictationWord {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return typeof o.item_key === 'string' && typeof o.word === 'string';
}

function isValidSentence(
  value: unknown,
): value is WriteSentencesFromDictationSentence {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.item_key === 'string' &&
    Array.isArray(o.words) &&
    o.words.length > 0 &&
    o.words.every(isValidWord)
  );
}

function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.item_set_id !== 'string') return false;
  if (typeof o.question_version !== 'string') return false;
  if (typeof o.question_code !== 'string') return false;
  if (typeof o.language !== 'string') return false;
  if (!Array.isArray(o.sentences) || o.sentences.length === 0) return false;
  return o.sentences.every(isValidSentence);
}

export function WriteSentencesFromDictationQuestion(props: QuestionProps) {
  const itemSet = resolveItemSet(
    props.language,
    props.itemSet,
    { en: WELA_PLUS_WRITE_SENTENCES_DICTATION_EN, xh: WELA_PLUS_WRITE_SENTENCES_DICTATION_XH },
    isFullItemSet,
  );
  if (!itemSet) return <MissingItemSet language={props.language} />;
  return <WriteSentencesFromDictationQuestionContent {...props} itemSet={itemSet} />;
}

function WriteSentencesFromDictationQuestionContent(props: QuestionProps & { itemSet: FullItemSet }) {
  const { sentences } = props.itemSet;
  const { items, positionsBySentence } = useMemo(() => {
    const items: CaptureItem[] = [];
    const positionsBySentence = sentences.map((sentence, sentence_index) => sentence.words.map((word, word_index) => {
      const position = items.length;
      items.push({ item_key: word.item_key, prompt: word.word, metadata: { sentence_index, word_index } });
      return position;
    }));
    return { items, positionsBySentence };
  }, [sentences]);
  const finalizeResult = useCallback((base: Result): Result => ({
    ...base,
    derived: { ...base.derived, per_sentence: base.stopped_reason.startsWith('skipped_') ? []
      : positionsBySentence.map(positions => ({
        correct: positions.filter(position => base.items[position].metadata?.reached && base.items[position].is_correct).length,
        total: positions.filter(position => base.items[position].metadata?.reached).length,
      })) },
  }), [positionsBySentence]);

  return <SequentialCapture {...props} items={items} testIDPrefix="dictation"
    body={{ kind: 'groups', testID: 'prompt-scroll', card: true, variant: 'pill',
      groups: sentences.map((_, i) => ({ key: String(i), heading: `${i + 1}.`, positions: positionsBySentence[i] })) }}
    copy={nestedCopy('Sentence', 'word', positionsBySentence)} stopRule={null} durationSec={undefined}
    finalizeResult={finalizeResult} />;
}
