import { lintSequence, analyzeToken, normalizeToken } from '../../utils/decodability/index.js';

export const PACK_LANGUAGE_CODES = Object.freeze({ isixhosa: 'xh', english: 'en', afrikaans: 'af' });
export const PACK_CHANNELS = Object.freeze(['release', 'preview']);
export const MASI_LINT_OPTIONS = Object.freeze({
  trackerLetters: Object.freeze([...'abcdefghijklmnopqrstuvwxyz']),
  vowels: Object.freeze(['a', 'e', 'i', 'o', 'u']),
});

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonemptyString = value => typeof value === 'string' && value.length > 0;
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isStringArray = value => Array.isArray(value) && value.every(item => typeof item === 'string');
const isPageLines = value => Array.isArray(value) && value.every(page => Array.isArray(page)
  && page.every(line => isRecord(line) && typeof line.speaker === 'string' && typeof line.text === 'string'));

// The decoder assumes validated units. The shared lint still sees the raw pack
// and reports malformed fields; this view is only for word-bank analysis.
function sanitizedSequence(pack) {
  const steps = (value, units) => (Array.isArray(value) ? value : [])
    .filter(entry => isRecord(entry) && Number.isInteger(entry.step) && isStringArray(entry[units]))
    .map(entry => ({ step: entry.step, [units]: entry[units] }));
  return {
    sound_inventory: Array.isArray(pack.sound_inventory)
      ? pack.sound_inventory.filter(item => typeof item === 'string') : [],
    letter_steps: steps(pack.letter_steps, 'new_letters'),
    sound_steps: steps(pack.sound_steps, 'new_sounds'),
  };
}

/**
 * Lint the shared catalogue, then Masi's additional content contract.
 * @param {unknown} pack
 * @param {string[]} errors Retained if reading a later field throws.
 * @returns {{ok: boolean, errors: string[]}}
 */
function lintReadablePack(pack, errors) {
  errors.push(...lintSequence(pack, MASI_LINT_OPTIONS).errors
    .map(issue => `${issue.code}: ${issue.message}`));
  const source = isRecord(pack) ? pack : {};
  if (!nonemptyString(source.id)) errors.push('pack_id: id must be a non-empty string.');
  if (typeof source.language !== 'string' || !hasOwn(PACK_LANGUAGE_CODES, source.language)) {
    errors.push('pack_language: language must be isixhosa, english or afrikaans.');
  }
  if (!PACK_CHANNELS.includes(source.channel)) {
    errors.push('pack_channel: channel must be release or preview.');
  }
  const stepPaths = new Map();
  let maxLetterStep = 0;
  for (const field of ['letter_steps', 'sound_steps']) {
    for (const [index, entry] of (Array.isArray(source[field]) ? source[field] : []).entries()) {
      if (!isRecord(entry)) continue;
      if (!Number.isSafeInteger(entry.step) || entry.step < 1) {
        errors.push(`step_id: ${field}[${index}].step must be a positive safe integer.`);
        continue;
      }
      const path = `${field}[${index}].step`;
      if (stepPaths.has(entry.step)) {
        errors.push(`step_id_duplicate: ${path} repeats step ${entry.step} from ${stepPaths.get(entry.step)}.`);
      } else stepPaths.set(entry.step, path);
      if (field === 'letter_steps') maxLetterStep = Math.max(maxLetterStep, entry.step);
      else if (entry.step <= maxLetterStep) {
        errors.push(`sound_step_order: ${path} must be greater than every letter_steps[].step (maximum ${maxLetterStep}).`);
      }
    }
  }
  if (!Array.isArray(source.word_bank)) {
    errors.push('word_bank_shape: word_bank must be an array.');
  } else {
    const seen = new Set();
    const sequence = sanitizedSequence(source);
    for (const [index, entry] of source.word_bank.entries()) {
      if (!isRecord(entry) || typeof entry.text !== 'string'
        || !Number.isInteger(entry.step) || entry.step < 1
        || (entry.syllables !== undefined && entry.syllables !== null
          && typeof entry.syllables !== 'string')) {
        errors.push(`word_bank_shape: word_bank[${index}] must have string text, an integer step >= 1 and optional string or null syllables.`);
        continue;
      }
      if (normalizeToken(entry.text) !== entry.text) {
        errors.push(`word_bank_not_normalized: word_bank[${index}] text "${entry.text}" must already be normalized.`);
      }
      if (seen.has(entry.text)) {
        errors.push(`word_bank_duplicate: word_bank[${index}] repeats "${entry.text}".`);
      }
      seen.add(entry.text);
      const step = analyzeToken(entry.text, sequence).step;
      if (step !== entry.step) {
        errors.push(`word_bank_step: word_bank[${index}] "${entry.text}" has first decodable step ${step}; expected ${entry.step}.`);
      }
      if (typeof entry.syllables === 'string' && normalizeToken(entry.syllables) !== entry.text) {
        errors.push(`word_bank_syllables: word_bank[${index}] syllables must normalize to "${entry.text}".`);
      }
    }
  }
  const details = isRecord(source.reader_details) ? source.reader_details : {};
  const readers = isRecord(source.readers) ? source.readers : {};
  if (!isRecord(source.reader_details)) {
    errors.push('reader_details_shape: reader_details must be an object.');
  }
  for (const readerId of Object.keys(readers)) {
    if (!hasOwn(details, readerId)) {
      errors.push(`reader_details_missing: reader "${readerId}" requires reader_details.`);
    }
  }
  for (const [readerId, detail] of Object.entries(details)) {
    if (!hasOwn(readers, readerId)) {
      errors.push(`reader_details_unknown_reader: reader_details["${readerId}"] has no matching reader.`);
    }
    if (!isRecord(detail)) {
      errors.push(`reader_details_shape: reader_details["${readerId}"] must be an object.`);
      continue;
    }
    if (typeof detail.retired !== 'boolean' || !isRecord(detail.speakers)
      || !Object.values(detail.speakers).every(speaker => isRecord(speaker)
        && nonemptyString(speaker.name) && nonemptyString(speaker.colour))
      || !isPageLines(detail.page_lines)) {
      errors.push(`reader_details_shape: reader_details["${readerId}"] requires boolean retired, speakers with non-empty name and colour, and pages of speaker/text lines.`);
    }
    const reader = hasOwn(readers, readerId) ? readers[readerId] : null;
    if (isPageLines(detail.page_lines) && isRecord(reader) && isStringArray(reader.pages)
      && (detail.page_lines.length !== reader.pages.length
        || detail.page_lines.some((page, index) => page.map(line => line.text).join('\n') !== reader.pages[index]))) {
      errors.push(`reader_details_text: reader_details["${readerId}"] page texts must exactly match the reader pages.`);
    }
    if (isPageLines(detail.page_lines) && isRecord(detail.speakers)) {
      for (const page of detail.page_lines) {
        for (const line of page) {
          if (!hasOwn(detail.speakers, line.speaker)) {
            errors.push(`reader_details_speaker: reader "${readerId}" uses undeclared speaker "${line.speaker}".`);
          }
        }
      }
    }
  }
  for (const entry of Array.isArray(source.letter_steps) ? source.letter_steps : []) {
    if (!isRecord(entry) || !Number.isInteger(entry.step) || !Array.isArray(entry.blends)) continue;
    for (const item of entry.blends) {
      if (typeof item !== 'string') continue;
      const length = [...normalizeToken(item)].length;
      if (length !== 2) {
        errors.push(`step_blend_length: Step ${entry.step} blend "${item}" has ${length} letters; letter-step blends must have exactly 2.`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Report unreadable inputs as malformed data, including throwing getters or proxies.
 * @param {unknown} pack
 * @returns {{ok: boolean, errors: string[]}}
 */
export function lintMasiPack(pack) {
  const errors = [];
  try {
    return lintReadablePack(pack, errors);
  } catch {
    errors.push('malformed: Content pack could not be read.');
    return { ok: false, errors };
  }
}
