export interface WriteSentencesFromDictationWord {
  item_key: string;
  word: string;
}

export interface WriteSentencesFromDictationSentence {
  item_key: string;
  words: WriteSentencesFromDictationWord[];
}

export interface WriteSentencesFromDictationItemSet {
  sentences: WriteSentencesFromDictationSentence[];
}
