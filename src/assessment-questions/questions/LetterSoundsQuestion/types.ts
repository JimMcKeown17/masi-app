import type { ItemSetMeta } from '../../types/ItemSet';
import type { StopRule } from '../../progress/stepByStep';

export type LetterSoundsItemSet = ItemSetMeta & {
  rows: string[][];
  stop_rule: StopRule | null;
};
