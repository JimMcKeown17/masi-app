import type { StoppedReason } from '../types/Result';

export type ManualSkipReason = Extract<
  StoppedReason,
  'skipped_child_refused' | 'skipped_tired' | 'skipped_time' | 'skipped_age' | 'skipped_other'
>;

/** EA-selectable skip reasons. skipped_prerequisite_unmet is host-only (battery gates). */
export const MANUAL_SKIP_REASONS: ReadonlyArray<{ reason: ManualSkipReason; label: string }> = [
  { reason: 'skipped_child_refused', label: 'Child refused' },
  { reason: 'skipped_tired', label: 'Child tired' },
  { reason: 'skipped_time', label: 'Out of time' },
  { reason: 'skipped_age', label: 'Age inappropriate' },
  { reason: 'skipped_other', label: 'Other' },
];
