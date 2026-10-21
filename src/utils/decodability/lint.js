import { normalizeToken, tokenizeText } from './normalize.js';
import { isDecodableAt } from './sounds.js';

/**
 * @typedef {Object} LintIssue
 * @property {string} code
 * @property {string} message
 * @property {number} [step]
 * @property {string} [item]
 * @property {string} [readerId]
 */

/**
 * @typedef {Object} LintOptions
 * @property {string[]} trackerLetters
 * @property {string[]} vowels
 * @property {{id:string, words:string[]}[]} [outcomeForms]
 */

/** @typedef {{step:number, item:string, readerId?:string}} TokenLocation */
/** @typedef {{step?:number, new_letters?:string[], new_sounds?:string[], size_exception?:string, words:string[], blends:string[], readers:string[]}} LintStep */
/** @typedef {{step?:number, pages:string[], tricky_words:string[]}} LintReader */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is string[]} */
function isStringArray(value) {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

/**
 * Code-unit ordering is stable across runtimes and locale settings.
 * @param {string} a
 * @param {string} b
 */
function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Sequence-wide issues without a step follow step-specific issues.
 * @param {LintIssue} a
 * @param {LintIssue} b
 */
function compareIssues(a, b) {
  return (a.step ?? Infinity) - (b.step ?? Infinity)
    || compareText(a.item ?? '', b.item ?? '')
    || compareText(a.readerId ?? '', b.readerId ?? '')
    || compareText(a.code, b.code)
    || compareText(a.message, b.message);
}

/**
 * Keep occurrences, including repetitions within the same step.
 * @param {Map<string, number[]>} occurrences
 * @param {string} item
 * @param {number} step
 */
function recordOccurrence(occurrences, item, step) {
  const steps = occurrences.get(item) ?? [];
  steps.push(step);
  occurrences.set(item, steps);
}

/**
 * Validate a sequence against the app's decodability and reference rules.
 * Inputs are not mutated. Words/blends are single-token items; pages are text.
 * @param {unknown} input Parsed JSON; malformed parts are reported and skipped.
 * @param {LintOptions} opts
 * @returns {{errors:LintIssue[], warnings:LintIssue[]}}
 */
export function lintSequence(input, opts) {
  for (const field of /** @type {const} */ (['trackerLetters', 'vowels'])) {
    if (!isStringArray(opts?.[field])) {
      throw new TypeError(`lintSequence: opts.${field} must be an array of strings`);
    }
  }
  /** @type {LintIssue[]} */
  const errors = [];
  /** @type {LintIssue[]} */
  const warnings = [];

  /** @param {string} item @param {string} message */
  function malformed(item, message) {
    errors.push({ code: 'malformed', item, message });
  }

  /**
   * Keep valid elements of a mixed list, so one bad element cannot hide others.
   * @param {unknown} value
   * @param {string} path
   * @param {boolean} [optional]
   * @param {string} [missingMessage]
   * @returns {string[] | undefined}
   */
  function stringList(value, path, optional = false, missingMessage) {
    if (value === undefined && optional) return [];
    if (!isStringArray(value)) {
      malformed(path, value === undefined && missingMessage
        ? missingMessage : `${path} must be a list of strings; use [] if it has none.`);
      return Array.isArray(value) ? value.filter(item => typeof item === 'string') : undefined;
    }
    return value;
  }

  /** @param {unknown} value @param {string} path @returns {number | undefined} */
  function integer(value, path) {
    if (typeof value === 'number' && Number.isInteger(value)) return value;
    malformed(path, `${path} must be an integer step number.`);
    return undefined;
  }

  if (!isRecord(input)) {
    malformed('sequence', 'The sequence must be a JSON object.');
    return { errors, warnings };
  }
  const source = input;

  /** @param {'letter_steps' | 'sound_steps'} field @returns {LintStep[]} */
  function readSteps(field) {
    const value = source[field];
    if (!Array.isArray(value)) {
      malformed(field, `${field} must be a list of teaching steps.`);
      return [];
    }
    const unitsField = field === 'letter_steps' ? 'new_letters' : 'new_sounds';
    return value.flatMap((entry, index) => {
      const path = `${field}[${index}]`;
      if (!isRecord(entry)) {
        malformed(path, `${path} must be a teaching-step object.`);
        return [];
      }
      const step = integer(entry.step, `${path}.step`);
      const units = stringList(entry[unitsField], `${path}.${unitsField}`);
      let size_exception;
      if (entry.size_exception !== undefined) {
        if (typeof entry.size_exception === 'string') size_exception = entry.size_exception;
        else malformed(`${path}.size_exception`, `${path}.size_exception must be a string reason.`);
      }
      return [{ step, [unitsField]: units, size_exception,
        words: stringList(entry.words, `${path}.words`, true) ?? [],
        blends: stringList(entry.blends, `${path}.blends`, true) ?? [],
        readers: stringList(entry.readers, `${path}.readers`, true) ?? [],
      }];
    });
  }

  const soundInventory = stringList(input.sound_inventory, 'sound_inventory') ?? [];
  const letterSteps = readSteps('letter_steps');
  const soundSteps = readSteps('sound_steps');
  /** @type {Map<string, LintReader>} */
  const readers = new Map();
  if (input.readers !== undefined && !isRecord(input.readers)) {
    malformed('readers', 'readers must be an object mapping reader ids to readers.');
  } else {
    for (const [readerId, reader] of Object.entries(input.readers ?? {})) {
      const path = `readers.${readerId}`;
      if (!isRecord(reader)) {
        malformed(path, `Reader ${readerId} must be an object with title, step, pages and tricky_words.`);
        readers.set(readerId, { pages: [], tricky_words: [] });
        continue;
      }
      if (typeof reader.title !== 'string') malformed(`${path}.title`, `Reader ${readerId} must have a string title.`);
      readers.set(readerId, {
        step: integer(reader.step, `${path}.step`),
        pages: stringList(reader.pages, `${path}.pages`) ?? [],
        tricky_words: stringList(reader.tricky_words, `${path}.tricky_words`, false,
          `Reader ${readerId} has no tricky_words list; use [] if it has none.`) ?? [],
      });
    }
  }

  // The decoder receives only validated teaching data; content/reference checks
  // below retain partially valid records instead of dropping an entire reader.
  /** @type {import('./sounds.js').Sequence} */
  const seq = {
    sound_inventory: soundInventory,
    letter_steps: letterSteps.flatMap(entry => entry.step === undefined ? []
      : [{ step: entry.step, new_letters: entry.new_letters ?? [] }]),
    sound_steps: soundSteps.flatMap(entry => entry.step === undefined ? []
      : [{ step: entry.step, new_sounds: entry.new_sounds ?? [] }]),
  };
  /** @type {Map<string, number[]>} */
  const letters = new Map();
  /** @type {Map<string, number[]>} */
  const taught = new Map();
  /** @type {Map<string, (number | undefined)[]>} */
  const references = new Map();
  /** @type {Map<string, TokenLocation>} */
  const content = new Map();

  /**
   * Retain the earliest location for a deduplicated overlap warning.
   * Prefer step items, then reader id, when the teaching step is tied.
   * @param {TokenLocation} location
   */
  function recordToken(location) {
    const previous = content.get(location.item);
    if (previous === undefined || location.step < previous.step
      || (location.step === previous.step
        && compareText(location.readerId ?? '', previous.readerId ?? '') < 0)) {
      content.set(location.item, location);
    }
  }

  const firstStep = letterSteps.find(entry => entry.step === 1);
  // A missing step still violates the original step-1 rules. A present step
  // with a malformed new_letters list is already diagnosed at that field.
  const firstLetters = firstStep === undefined ? [] : firstStep.new_letters;
  if (firstLetters !== undefined && firstLetters.length < 4) {
    errors.push({ code: 'step1_size', step: 1,
      message: `Step 1 must teach at least 4 letters; it teaches ${firstLetters.length}.` });
  }
  if (firstLetters !== undefined && !firstLetters.some(letter => opts.vowels.includes(letter))) {
    errors.push({ code: 'step1_vowel', step: 1,
      message: 'Step 1 must teach at least one of the supplied vowels.' });
  }

  for (const entry of letterSteps) {
    if (entry.step === undefined || entry.new_letters === undefined) continue;
    for (const letter of entry.new_letters) recordOccurrence(letters, letter, entry.step);
    if (entry.step !== 1 && entry.new_letters.length !== 2 && !entry.size_exception?.trim()) {
      errors.push({ code: 'step_size', step: entry.step,
        message: `Step ${entry.step} must teach 2 letters or give a size exception reason; it teaches ${entry.new_letters.length}.` });
    }
  }

  /** @type {Map<string, number>} */
  const expectedLetters = new Map();
  for (const letter of opts.trackerLetters) {
    expectedLetters.set(letter, (expectedLetters.get(letter) ?? 0) + 1);
  }
  for (const item of new Set([...expectedLetters.keys(), ...letters.keys()])) {
    const steps = letters.get(item) ?? [];
    const expected = expectedLetters.get(item) ?? 0;
    if (steps.length !== expected) {
      const step = steps.length > 0 ? steps.reduce((earliest, next) => Math.min(earliest, next)) : undefined;
      errors.push({ code: 'permutation', item, ...(step === undefined ? {} : { step }),
        message: `Letter "${item}"${step === undefined ? '' : ` (first taught at step ${step})`} must occur ${expected} time(s) in the letter steps; it occurs ${steps.length}.` });
    }
  }

  for (const entry of [...letterSteps, ...soundSteps]) {
    const units = entry.new_letters ?? entry.new_sounds ?? [];
    if (entry.step !== undefined) {
      for (const unit of units) recordOccurrence(taught, unit, entry.step);
    }
    for (const id of entry.readers) {
      const steps = references.get(id) ?? [];
      steps.push(entry.step);
      references.set(id, steps);
    }

    const seen = new Set();
    for (const raw of [...entry.words, ...entry.blends]) {
      const item = normalizeToken(raw);
      const tokens = tokenizeText(raw);
      if (item === '' || tokens.length > 1) {
        errors.push({ code: 'bad_item', step: entry.step, item: raw,
          message: `Step ${entry.step ?? '(unknown)'} item "${raw}" must normalise to one nonempty token.` });
        continue;
      }
      if (seen.has(item)) {
        errors.push({ code: 'duplicate_item', step: entry.step, item,
          message: `Step ${entry.step ?? '(unknown)'} repeats the normalised item "${item}" in its words and blends.` });
      }
      seen.add(item);
      if (entry.step === undefined) continue;
      for (const token of tokens) {
        recordToken({ step: entry.step, item: token });
        if (!isDecodableAt(token, entry.step, seq)) {
          errors.push({ code: 'not_decodable', step: entry.step, item: token,
            message: `Step ${entry.step} item "${token}" uses a sound that is unknown or not yet taught.` });
        }
      }
    }
  }

  const inventory = new Set();
  for (const item of soundInventory) {
    if (inventory.has(item)) {
      errors.push({ code: 'sound_inventory', item,
        message: `Sound "${item}" is a duplicate entry in sound_inventory.` });
    }
    inventory.add(item);
  }
  for (const item of new Set([...inventory, ...taught.keys()])) {
    const steps = [...(taught.get(item) ?? [])].sort((a, b) => a - b);
    if (!inventory.has(item) || steps.length !== 1) {
      const step = steps[0];
      const locations = steps.map(number => `step ${number}`).join(', ');
      const problem = inventory.has(item)
        ? `must be taught exactly once; it is taught ${steps.length} time(s)${locations ? ` (${locations})` : ''}`
        : `is taught at ${locations} but is absent from the sound inventory`;
      errors.push({ code: 'sound_inventory', item, ...(step === undefined ? {} : { step }),
        message: `Sound "${item}" ${problem}.` });
    }
  }

  for (const [readerId, listedSteps] of references) {
    const steps = [...listedSteps].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
    if (steps.length > 1) {
      errors.push({ code: 'reader_listed_twice', step: steps[0], item: readerId, readerId,
        message: `Reader "${readerId}" is listed more than once (${steps.map(step => `step ${step ?? '(unknown)'}`).join(', ')}).` });
    }
    const reader = readers.get(readerId);
    for (const step of new Set(steps)) {
      if (reader === undefined) {
        errors.push({ code: 'reader_undefined', step, item: readerId, readerId,
          message: `Step ${step ?? '(unknown)'} lists reader "${readerId}", but that reader is not defined.` });
      } else if (reader.step !== undefined && step !== undefined && reader.step !== step) {
        errors.push({ code: 'reader_step_mismatch', step, item: readerId, readerId,
          message: `Step ${step} lists reader "${readerId}", which declares step ${reader.step}.` });
      }
    }
  }

  for (const [readerId, reader] of readers) {
    const { step } = reader;
    if (!references.has(readerId)) {
      errors.push({ code: 'reader_unlisted', step, item: readerId, readerId,
        message: `Reader "${readerId}"${step === undefined ? '' : ` declares step ${step}, but`} is not listed in any step.` });
    }
    if (step === undefined) continue;
    const trickyWords = new Set(reader.tricky_words.map(normalizeToken));
    for (const page of reader.pages) {
      for (const item of tokenizeText(page)) {
        recordToken({ step, item, readerId });
        if (!trickyWords.has(item) && !isDecodableAt(item, step, seq)) {
          errors.push({ code: 'not_decodable', step, item, readerId,
            message: `Reader "${readerId}" at step ${step} contains "${item}", which is not decodable and is not a tricky word for this reader.` });
        }
      }
    }
  }

  /** @type {Map<string, Set<string>>} */
  const overlaps = new Map();
  for (const form of opts.outcomeForms ?? []) {
    const seen = overlaps.get(form.id) ?? new Set();
    overlaps.set(form.id, seen);
    for (const raw of form.words) {
      const item = normalizeToken(raw);
      const location = content.get(item);
      if (location !== undefined && !seen.has(item)) {
        seen.add(item);
        const source = location.readerId === undefined ? '' : ` in reader "${location.readerId}"`;
        warnings.push({ code: 'outcome_overlap', ...location,
          message: `Step ${location.step} item "${item}"${source} also appears in outcome test "${form.id}".` });
      }
    }
  }

  return { errors: errors.sort(compareIssues), warnings: warnings.sort(compareIssues) };
}
