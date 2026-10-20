import type { Result, ResultItem } from './Result';

export interface QuestionProps {
  language: string;
  itemSet?: unknown;
  instructions?: string;
  durationSec?: number;
  childName?: string;
  allowSkip?: boolean;
  onItemMarked?: (item: ResultItem) => void;
  /** Called exactly once when the Question leaves its intro phase and capture starts. */
  onStart?: () => void;
  /** Called exactly once per presentation: on completion, timer, End, or a manual skip. */
  onComplete: (result: Result) => void;
}
