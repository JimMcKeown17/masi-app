export interface ReadSentencesWord {
  item_key: string;
  word: string;
}

export interface ReadSentencesSentence {
  item_key: string;
  words: ReadSentencesWord[];
}

export interface ReadSentencesItemSet {
  sentences: ReadSentencesSentence[];
}
