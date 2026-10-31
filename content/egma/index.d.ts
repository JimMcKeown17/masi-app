export type EgmaBand = 5 | 10 | 20 | 50 | 100 | 1000;
export type EgmaSource = 'rti-2014-printed' | 'masi-2026';

interface EgmaItemBase {
  readonly id: string;
  readonly answer: number;
  readonly skill: string;
  readonly band: EgmaBand;
  readonly source: EgmaSource;
  readonly label?: string;
}

export type EgmaItem = EgmaItemBase & (
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'pair'; readonly left: number; readonly right: number }
  | { readonly kind: 'sequence'; readonly slots: readonly (number | null)[] }
  | { readonly kind: 'equation'; readonly a: number; readonly op: '+' | '-'; readonly b: number }
  | { readonly kind: 'counters'; readonly a: number; readonly op: '+' | '-'; readonly b: number }
  | { readonly kind: 'checkpoint'; readonly upTo: number }
  | { readonly kind: 'fingers'; readonly mode: 'flash' | 'make'; readonly shown: number; readonly total?: 5 | 10 }
  | { readonly kind: 'count_out'; readonly target: number }
  | { readonly kind: 'neighbour'; readonly relation: 'before' | 'after'; readonly n: number }
  | { readonly kind: 'word_problem'; readonly problemType: string; readonly phrases: readonly string[] }
);

export interface EgmaQuestion {
  readonly questionCode: string;
  readonly title: string;
  readonly instructions: string;
  readonly items: readonly EgmaItem[];
  readonly practiceItems: readonly string[];
  readonly timeLimitSeconds: number | null;
  readonly numberCardPage: number | null;
}
export interface EgmaForm {
  readonly id: string;
  readonly title: string;
  readonly languageCode: 'en';
  readonly languageName: string;
  readonly questions: readonly EgmaQuestion[];
  readonly sourceNotes: readonly string[];
}
export interface EgmaCatalog {
  readonly formatVersion: 1;
  readonly contentVersion: string;
  readonly title: string;
  readonly description: string;
  readonly sources: readonly {
    readonly id: string;
    readonly title: string;
    readonly fileName: string;
    readonly sha256: string;
  }[];
  readonly assessments: readonly EgmaForm[];
}
export const egmaCatalog: EgmaCatalog;
export function listEgmaAssessments(filters?: { languageCode?: string }): readonly EgmaForm[];
export function getEgmaAssessment(id: string): EgmaForm | null;
