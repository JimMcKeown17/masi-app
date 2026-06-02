export interface ListenPhonemeBlendPrompt {
  item_key: string;
  segmented: string;
  word: string;
}

export interface ListenPhonemeBlendItemSet {
  prompts: ListenPhonemeBlendPrompt[];
}
