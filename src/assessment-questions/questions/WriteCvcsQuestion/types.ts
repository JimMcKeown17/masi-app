export interface WriteCvcsPrompt {
  item_key: string;
  /** The CVC word the EA dictates aloud; child writes it from memory. */
  word: string;
}

export interface WriteCvcsItemSet {
  prompts: WriteCvcsPrompt[];
}
