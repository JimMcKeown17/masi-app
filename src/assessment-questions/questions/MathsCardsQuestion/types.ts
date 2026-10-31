import type { ItemSetMeta } from '../../types/ItemSet';
import type { StopRule } from '../../progress/stepByStep';
import type { MathsCaptureItem } from '../MathsGridQuestion/types';
export type { MathsCaptureItem } from '../MathsGridQuestion/types';

export interface MathsCardsItemSet extends ItemSetMeta {
  kind: 'maths_cards';
  noun: 'item' | 'pair' | 'number' | 'problem';
  items: MathsCaptureItem[];
  stop_rule: StopRule | null;
  choices: 'add' | 'take_away' | null;
  strategy_step: boolean;
}
