export interface ReadPassageWord {
  item_key: string;
  word: string;
}

export interface ReadPassageItemSet {
  words: ReadPassageWord[];
  paragraph_starts?: number[];
}
