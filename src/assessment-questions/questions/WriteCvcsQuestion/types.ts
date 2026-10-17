export interface WriteCvcsWord {
  item_key: string;
  word: string;
  /** Scoring units; may exclude a prefix that is not assessed. */
  letters: string[];
}

export interface WriteCvcsItemSet {
  words: WriteCvcsWord[];
}
