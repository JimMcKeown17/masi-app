export interface ListenAndAnswerStoryComprehensionQuestion {
  item_key: string;
  prompt: string;
  acceptable_answers: string[];
}

export interface ListenAndAnswerStoryItemSet {
  story: string;
  questions: ListenAndAnswerStoryComprehensionQuestion[];
}
