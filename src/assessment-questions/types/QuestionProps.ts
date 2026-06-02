import type { Result, ResultItem, StoppedReason } from './Result';

export interface QuestionProps {
  language: string;
  itemSet?: unknown;
  instructions?: string;
  durationSec?: number;
  onItemMarked?: (item: ResultItem) => void;
  onComplete: (result: Result) => void;
  onAbandon?: (reason: Extract<StoppedReason, `skipped_${string}` | 'ea_ended'>) => void;
}
