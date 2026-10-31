import type { ItemSetMeta } from '../../types/ItemSet';
import type { StopRule } from '../../progress/stepByStep';
import { MATHS_BANDS } from '../../egma/strategies';

export interface MathsCaptureItem {
  item_key: string;
  prompt: string;
  gloss?: string;
  skill: string;
  band: number;
}

export interface MathsGridItemSet extends ItemSetMeta {
  kind: 'maths_grid';
  layout: 'three_by_three' | 'five_by_four' | 'two_by_five';
  tile: 'number' | 'sum';
  noun: 'number' | 'item';
  items: MathsCaptureItem[];
  stop_rule: StopRule | null;
  strategy_step: boolean;
}

export function isMathsCaptureItem(value: unknown): value is MathsCaptureItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.item_key === 'string' && typeof item.prompt === 'string' &&
    (item.gloss === undefined || typeof item.gloss === 'string') &&
    typeof item.skill === 'string' && MATHS_BANDS.includes(item.band as never);
}

export function isMathsStopRule(value: unknown): value is StopRule | null {
  if (value === null) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const rule = value as Record<string, unknown>;
  const length = rule.kind === 'consecutive_wrong' ? rule.stop_at
    : rule.kind === 'first_row_all_wrong' ? rule.first_row_length : undefined;
  return typeof length === 'number' && Number.isInteger(length) && length > 0;
}
