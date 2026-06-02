export type StoppedReason =
  | 'completed'
  | 'timer'
  | 'ea_ended'
  | 'stop_rule'
  | 'skipped_child_refused'
  | 'skipped_tired'
  | 'skipped_time'
  | 'skipped_age'
  | 'skipped_prerequisite_unmet'
  | 'skipped_other';

export interface ResultItem {
  position: number;
  item_key?: string;
  prompt: string;
  response?: string;
  is_correct: boolean;
  metadata?: Record<string, unknown>;
}

export interface ResultDerived {
  total_correct: number;
  total_attempted: number;
  percent: number;
  last_attempted_position: number | null;
  was_timed?: boolean;
  capture_mode?: 'grid' | 'sequential';
  correction_count?: number;
  [key: string]: unknown;
}

export interface Result {
  question_code: string;
  question_version: string;
  item_set_id: string;
  language: string;
  duration_ms: number;
  stopped_reason: StoppedReason;
  items: ResultItem[];
  derived: ResultDerived;
}
