/** Q7: sentence-grouped reading, marked word by word. */
import React, { useCallback, useMemo } from 'react';
import { SequentialCapture } from '../../progress/SequentialCapture';
import { nestedCopy } from '../../progress/captureCopy';
import type { CaptureItem } from '../../progress/captureTypes';
import type { QuestionProps } from '../../types/QuestionProps';
import type { ItemSetMeta } from '../../types/ItemSet';
import type { Result } from '../../types/Result';
import { resolveItemSet } from '../../itemsets/resolveItemSet';
import { MissingItemSet } from '../../progress/MissingItemSet';
import type { ReadSentencesItemSet, ReadSentencesSentence, ReadSentencesWord } from './types';
import { WELA_PLUS_READ_SENTENCES_EN } from '../../itemsets/wela_plus_read_sentences.en';
import { WELA_PLUS_READ_SENTENCES_XH } from '../../itemsets/wela_plus_read_sentences.xh';

type FullItemSet = ReadSentencesItemSet & ItemSetMeta;

function isValidWord(w: unknown): w is ReadSentencesWord {
  if (!w || typeof w !== 'object') return false;
  const o = w as Record<string, unknown>;
  return typeof o.item_key === 'string' && typeof o.word === 'string';
}

function isValidSentence(s: unknown): s is ReadSentencesSentence {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.item_key === 'string' &&
    Array.isArray(o.words) &&
    o.words.every(isValidWord)
  );
}

// Single-language overrides per codebase convention.
function isFullItemSet(value: unknown): value is FullItemSet {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.item_set_id !== 'string') return false;
  if (typeof o.question_version !== 'string') return false;
  if (typeof o.question_code !== 'string') return false;
  if (typeof o.language !== 'string') return false;
  if (!Array.isArray(o.sentences)) return false;
  return o.sentences.every(isValidSentence);
}

export function ReadSentencesQuestion(props: QuestionProps) {
  const itemSet = resolveItemSet(props.language, props.itemSet,
    { en: WELA_PLUS_READ_SENTENCES_EN, xh: WELA_PLUS_READ_SENTENCES_XH }, isFullItemSet);
  if (!itemSet) return <MissingItemSet language={props.language} />;
  return <ReadSentencesQuestionContent {...props} itemSet={itemSet} />;
}

function ReadSentencesQuestionContent(props: QuestionProps & { itemSet: FullItemSet }) {
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
    derived: { ...base.derived, per_sentence_percent: base.stopped_reason.startsWith('skipped_') ? []
      : positionsBySentence.map(positions => {
        const reached = positions.filter(position => base.items[position].metadata?.reached);
        const correct = reached.filter(position => base.items[position].is_correct).length;
        return reached.length > 0 ? Math.round(correct / reached.length * 100) : null;
      }) },
  }), [positionsBySentence]);

  return <SequentialCapture {...props} items={items} testIDPrefix="sentences"
    body={{ kind: 'groups', testID: 'sentence-scroll', card: true, variant: 'pill',
      groups: sentences.map((sentence, i) => ({ key: String(i), testID: `sentence-row-${sentence.item_key}`, positions: positionsBySentence[i] })) }}
    copy={nestedCopy('Sentence', 'word', positionsBySentence)} stopRule={null} durationSec={undefined}
    finalizeResult={finalizeResult} />;
}
