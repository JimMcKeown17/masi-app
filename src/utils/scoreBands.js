/**
 * Assessment score bands — raw-score colour interpretation (ADR-0003).
 *
 * `getScoreBand` maps a Question's raw score to a semantic band, keyed by
 * (tool_code, grade, language). It returns the *band* only — never a colour.
 * `getBandColor` (below, a separate export) maps band → swatch colour for the UI.
 *
 * For go-live the data source is this bundled constant table. The lookup
 * interface is stable so the table can later become a synced reference table
 * without touching callers (ADR-0003).
 */

import { colors } from '../constants/colors';

// EGRA Letter Sounds raw score is letters-correct-per-minute (LCPM), 60s window.
// The benchmark is language-independent, so every row uses the '*' wildcard.
// Cuts are pedagogy-set (config: documentation/assessment-score-bands-config.md):
// Grades 1–3 share one ladder; Grade R and ECD share a lower one.
const LETTER_SOUNDS_R = { great_min: 20, good_min: 15, okay_min: 10 };
const LETTER_SOUNDS_FOUNDATION = { great_min: 40, good_min: 30, okay_min: 20 };

const letterSoundsRow = (grade, cuts) => ({
  tool_code: 'letter_sounds', grade, language: '*', ...cuts,
});

const BANDS = [
  letterSoundsRow('R', LETTER_SOUNDS_R),
  letterSoundsRow('ECD', LETTER_SOUNDS_R),
  letterSoundsRow('1', LETTER_SOUNDS_FOUNDATION),
  letterSoundsRow('2', LETTER_SOUNDS_FOUNDATION),
  letterSoundsRow('3', LETTER_SOUNDS_FOUNDATION),
];

/**
 * Normalise a grade to a canonical key. Accepts the stored class label
 * ('Grade 1', 'Grade R', 'ECD'), a bare key ('1', 'R'), or a number (1).
 */
function normalizeGrade(grade) {
  if (grade == null) return null;
  return String(grade).trim().replace(/^grade\s*/i, '').toUpperCase();
}

function normalizeLanguage(language) {
  if (language == null) return null;
  return String(language).trim().toLowerCase();
}

/**
 * Resolve the band row for a (tool_code, grade, language) key. An explicit
 * language row takes precedence; otherwise the '*' wildcard row applies. Returns
 * null when nothing matches (caller degrades to 'unknown').
 */
function findBandRow(bands, toolCode, grade, language) {
  const forKey = bands.filter((b) => b.tool_code === toolCode && b.grade === grade);
  return (
    forKey.find((b) => b.language === language)
    || forKey.find((b) => b.language === '*')
    || null
  );
}

/**
 * Evaluate a raw score against one band row. Each threshold is null-guarded so
 * a partly-configured row asserts only the bands its cuts can back: if okay_min
 * is undefined we cannot tell "okay" from "needs_work", so a below-good score
 * degrades to 'unknown' rather than inventing a misleading red. (The guard also
 * avoids JS coercion bugs like `5 >= null` === `5 >= 0`.)
 */
function bandForRow(row, rawScore) {
  if (row.great_min != null && rawScore >= row.great_min) return 'great';
  if (row.good_min != null && rawScore >= row.good_min) return 'good';
  if (row.okay_min != null && rawScore >= row.okay_min) return 'okay';
  if (row.okay_min != null) return 'needs_work';
  return 'unknown';
}

export function getScoreBand({ toolCode, grade, language, rawScore } = {}, { bands = BANDS } = {}) {
  const row = findBandRow(bands, toolCode, normalizeGrade(grade), normalizeLanguage(language));
  if (!row || typeof rawScore !== 'number' || Number.isNaN(rawScore)) return 'unknown';
  return bandForRow(row, rawScore);
}

// Presentational map: semantic band → swatch colour. This is a RAG-style heat
// scale (a deliberate exception to the "no rainbow UI" chrome rule); the ranking
// screen's legend labels each band. 'great' gets its own darker green, distinct
// from the standard success green used for 'good'.
const GREAT_GREEN = '#1E7A34'; // darker than colors.success (#3FA535)
const OKAY_YELLOW = '#FFBB00'; // warm yellow, matching the existing ranked-bar palette

const BAND_COLORS = {
  great: GREAT_GREEN,
  good: colors.success,
  okay: OKAY_YELLOW,
  needs_work: colors.emphasis,
  unknown: colors.disabled,
};

export function getBandColor(band) {
  return BAND_COLORS[band] || colors.disabled;
}
