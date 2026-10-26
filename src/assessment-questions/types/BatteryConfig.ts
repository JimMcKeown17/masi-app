export type MaterialItem = 'reading_card' | 'picture_cards' | 'writing_sheet';
export interface Materials { item: MaterialItem; side?: 'A' | 'B' | 'C' }
export interface BatteryQuestion {
  title: string;
  question_code: string;
  question_version: string;
  durationSec?: number;
  instructions?: Record<string, string>;
  materials: Materials | null;
  paper_marked?: boolean;
}
export interface PrerequisiteRule { depends_on: string; minScore: number; on_unmet_reason: 'skipped_prerequisite_unmet' }
export interface FirstRowTrigger { question_code: string; first_row_length: number }
export interface SkipRule { triggers: FirstRowTrigger[]; skips: string[] }
export interface BatteryConfig {
  title: string;
  aboutMinutes: number;
  battery_code: string;
  battery_version: string;
  languages: string[];
  fixedLanguage?: string;
  questions: BatteryQuestion[];
  prerequisites: Record<string, PrerequisiteRule>;
  skipRule?: SkipRule;
}
export interface DecidedItem { position: number; is_correct: boolean; metadata?: Record<string, unknown> }
export interface DecidedResult { question_code: string; stopped_reason: string; score: number | null; items?: DecidedItem[] }
export interface BatteryState {
  nextQuestion: BatteryQuestion | null;
  decided: string[];
  undecided: string[];
  autoSkips: Array<{ question_code: string; reason: 'skipped_prerequisite_unmet'; trigger: string | null }>;
  firedTrigger: string | null;
  eligibleToFinalize: boolean;
}
