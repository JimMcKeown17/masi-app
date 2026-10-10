export interface WriteSentencesFromDictationPrompt {
  item_key: string;
  /** The sentence the EA dictates aloud; child writes it from memory. */
  sentence: string;
}

export interface WriteSentencesFromDictationItemSet {
  prompts: WriteSentencesFromDictationPrompt[];
}
