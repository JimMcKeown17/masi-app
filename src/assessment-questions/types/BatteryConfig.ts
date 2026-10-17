export type MaterialItem = 'reading_card' | 'picture_cards' | 'writing_sheet';
export interface Materials { item: MaterialItem; side?: 'A' | 'B' | 'C' }
export interface BatteryQuestion {
  question_code: string;
  question_version: string;
  durationSec?: number;
  instructions?: Record<string, string>;
  materials: Materials | null;
  paper_marked?: boolean;
}
export interface PrerequisiteRule { depends_on: string; minScore: number; on_unmet_reason: 'skipped_prerequisite_unmet' }
export interface BatteryConfig {
  battery_code: string;
  battery_version: string;
  languages: string[];
  questions: BatteryQuestion[];
  prerequisites: Record<string, PrerequisiteRule>;
}
export interface DecidedResult { question_code: string; stopped_reason: string; score: number | null }
export interface BatteryState {
  nextQuestion: BatteryQuestion | null;
  decided: string[];
  undecided: string[];
  autoSkips: Array<{ question_code: string; reason: 'skipped_prerequisite_unmet' }>;
  eligibleToFinalize: boolean;
}
