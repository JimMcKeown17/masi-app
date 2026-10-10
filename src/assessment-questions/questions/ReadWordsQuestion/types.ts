export interface ReadWordsPrompt {
  item_key: string;
  word: string;
}

export interface ReadWordsItemSet {
  words: ReadWordsPrompt[];
}
