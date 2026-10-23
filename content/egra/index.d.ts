export interface EgraSourceReference {
  readonly sourceId: string;
  /** One-based PDF pages, not necessarily printed page numbers. */
  readonly pdfPages: readonly number[];
  readonly role?: string;
}

export interface EgraItem {
  /** One-based position within the section, distinct from prompt text. */
  readonly id: string;
  readonly text: string;
}

export interface EgraGrid {
  readonly items: readonly EgraItem[];
  readonly columns: number;
  readonly practiceItems: readonly string[];
  readonly timeLimitSeconds: number;
  readonly sourceReportedItemCount: number | null;
  readonly source: EgraSourceReference;
}

export interface EgraQuestion extends EgraItem {
  /** Assessor rubric, not an exact-match scoring string. */
  readonly answerText: string;
  readonly maxScore: number;
}

export interface EgraAssessment {
  readonly id: string;
  readonly title: string;
  readonly languageCode: 'xh' | 'en' | 'af' | 'zu';
  readonly languageName: string;
  readonly variant: 'hl' | 'fal' | 'smrs';
  readonly assessmentNumber: number;
  readonly letters: EgraGrid;
  readonly words: EgraGrid;
  readonly passage: {
    readonly text: string;
    readonly timeLimitSeconds: number;
    readonly sourceReportedWordCount: number;
    /** Diagnostic only; not a validated scoring denominator. */
    readonly whitespaceTokenCount: number;
    readonly source: EgraSourceReference;
  };
  readonly comprehension: {
    readonly scoringMethod: 'assessor';
    readonly questions: readonly EgraQuestion[];
    readonly source: EgraSourceReference;
    readonly questionSource?: EgraSourceReference;
  };
  readonly sourceNotes: readonly string[];
}

export interface EgraCatalog {
  readonly formatVersion: number;
  readonly contentVersion: string;
  readonly title: string;
  readonly description: string;
  readonly conventions: Readonly<Record<string, string>>;
  readonly sources: readonly {
    readonly id: string;
    readonly title: string;
    readonly url: string | null;
    readonly fileName: string;
    readonly sha256: string;
    readonly pageNumbering: string;
  }[];
  readonly assessments: readonly EgraAssessment[];
}

export const egraCatalog: EgraCatalog;
export function listEgraAssessments(filters?: {
  languageCode?: string;
  variant?: string;
}): readonly EgraAssessment[];
export function getEgraAssessment(id: string): EgraAssessment | null;
