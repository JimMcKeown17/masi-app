import type { StoppedReason } from './Result';

export interface BatteryQuestion {
  question_code: string;
  question_version: string;
  durationSec?: number;
  instructions?: string;
  paper_marked?: boolean;
}

export interface PrerequisiteRule {
  depends_on: string;
  minScore: number;
  on_unmet_reason: Extract<StoppedReason, `skipped_${string}`>;
}

export interface BatteryConfig {
  battery_code: string;
  battery_version: string;
  questions: BatteryQuestion[];
  prerequisites?: Record<string, PrerequisiteRule>;
}
