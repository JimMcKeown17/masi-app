import type { StopRule } from '../../progress/stepByStep';

export interface ReadWordsPrompt {
  item_key: string;
  word: string;
}

export interface ReadWordsItemSet {
  words: ReadWordsPrompt[];
  row_lengths?: number[];
  stop_rule?: StopRule | null;
}
