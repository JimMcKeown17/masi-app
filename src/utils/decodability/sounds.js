import { normalizeToken } from './normalize.js';

/**
 * @typedef {Object} Sequence
 * @property {string[]} sound_inventory
 * @property {{step:number,new_letters:string[],size_exception?:string,blends?:string[],words?:string[],readers?:string[]}[]} letter_steps
 * @property {{step:number,new_sounds:string[],blends?:string[],words?:string[],readers?:string[]}[]} sound_steps
 * @property {Record<string,{title:string,step:number,pages:string[],tricky_words:string[]}>} [readers]
 */

/**
 * @typedef {Object} TokenAnalysis
 * @property {string} token
 * @property {string[] | null} sounds
 * @property {number | null} step
 * @property {string[]} unknownChars
 * @property {string[]} untaughtSounds
 */

/**
 * Inventory sorted longest first, so the first match at a position is the longest.
 * Empty entries cannot consume input and must never count as matches.
 * @param {string[]} inventory
 * @returns {string[]}
 */
function sortedInventory(inventory) {
  return inventory.filter(sound => sound.length > 0).sort((a, b) => b.length - a.length);
}

/**
 * Scan greedily, continuing past unknown characters to collect diagnostics.
 * @param {string} token Already normalized.
 * @param {string[]} inventory
 * @returns {{sounds: string[], unknownChars: string[]}}
 */
function scanSounds(token, inventory) {
  const sorted = sortedInventory(inventory);
  /** @type {string[]} */
  const sounds = [];
  /** @type {Set<string>} */
  const unknownChars = new Set();

  for (let offset = 0; offset < token.length;) {
    const sound = sorted.find(item => token.startsWith(item, offset));
    if (sound !== undefined) {
      sounds.push(sound);
      offset += sound.length;
    } else {
      // Take one whole Unicode code point, so surrogate pairs are never split.
      const character = String.fromCodePoint(/** @type {number} */ (token.codePointAt(offset)));
      unknownChars.add(character);
      offset += character.length;
    }
  }

  return { sounds, unknownChars: [...unknownChars] };
}

/**
 * Split an already-normalized token by longest match, without backtracking.
 * @param {string} token
 * @param {string[]} inventory
 * @returns {string[] | null}
 */
export function splitSounds(token, inventory) {
  const { sounds, unknownChars } = scanSounds(token, inventory);
  return unknownChars.length > 0 ? null : sounds;
}

/**
 * Map each taught sound to its earliest introduction step.
 * @param {Sequence} seq
 * @returns {Map<string, number>}
 */
export function buildSoundStepIndex(seq) {
  /** @type {Map<string, number>} */
  const index = new Map();
  for (const { step, new_letters } of seq.letter_steps) {
    for (const sound of new_letters) {
      index.set(sound, Math.min(index.get(sound) ?? step, step));
    }
  }
  for (const { step, new_sounds } of seq.sound_steps) {
    for (const sound of new_sounds) {
      index.set(sound, Math.min(index.get(sound) ?? step, step));
    }
  }
  return index;
}

/**
 * Normalize and analyze a token against the inventory and teaching sequence.
 * @param {string} raw
 * @param {Sequence} seq
 * @returns {TokenAnalysis}
 */
export function analyzeToken(raw, seq) {
  const token = normalizeToken(raw);
  const { sounds, unknownChars } = scanSounds(token, seq.sound_inventory);
  const index = buildSoundStepIndex(seq);
  /** @type {Set<string>} */
  const untaughtSounds = new Set();
  let step = 0;

  for (const sound of sounds) {
    const taughtAt = index.get(sound);
    if (taughtAt === undefined) {
      untaughtSounds.add(sound);
    } else {
      step = Math.max(step, taughtAt);
    }
  }

  return {
    token,
    sounds: unknownChars.length > 0 ? null : sounds,
    step: sounds.length === 0 || unknownChars.length > 0 || untaughtSounds.size > 0 ? null : step,
    unknownChars,
    untaughtSounds: [...untaughtSounds],
  };
}

/**
 * Whether every sound in a nonempty token has been taught by step k.
 * @param {string} raw
 * @param {number} k
 * @param {Sequence} seq
 * @returns {boolean}
 */
export function isDecodableAt(raw, k, seq) {
  const { step } = analyzeToken(raw, seq);
  return step !== null && step <= k;
}
