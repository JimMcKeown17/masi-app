import type { ItemSetMeta } from '../../types/ItemSet';

export type ReadingComprehensionItemSet = ItemSetMeta & {
  passage: string;
  questions: Array<{ item_key: string; prompt: string; answer_guide: string }>;
};
