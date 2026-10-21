import isixhosaInterim from './isixhosa-interim-letters-v1.json';
import englishInterim from './english-interim-letters-v1.json';
import afrikaansInterim from './afrikaans-interim-letters-v1.json';
import isixhosaPreview from './isixhosa-candidates-preview-v1.json';

export { lintMasiPack, PACK_LANGUAGE_CODES } from './lintMasiPack.js';

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const packsById = Object.create(null);

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export const BUNDLED_PACKS = Object.freeze([isixhosaInterim, englishInterim, afrikaansInterim, isixhosaPreview].map(pack => {
  deepFreeze(pack);
  packsById[pack.id] = pack;
  return pack;
}));

// Current is an explicit id, never the highest version across pack families.
export const CURRENT_PACK_IDS = deepFreeze({
  release: {
    xh: 'isixhosa-interim-letters-v1',
    en: 'english-interim-letters-v1',
    af: 'afrikaans-interim-letters-v1',
  },
  preview: { xh: 'isixhosa-candidates-preview-v1' },
});

/**
 * Resolve the current pack for an exact Masi language code.
 * @param {unknown} languageCode
 * @param {{allowPreview?: boolean} | null} [options]
 * @returns {object | null}
 */
export function getPack(languageCode, options) {
  if (typeof languageCode !== 'string') return null;
  const { release, preview } = CURRENT_PACK_IDS;
  const id = options?.allowPreview === true && has(preview, languageCode)
    ? preview[languageCode]
    : has(release, languageCode) ? release[languageCode] : null;
  return getPackById(id, options);
}

/**
 * Resolve any bundled version, including release versions retained for history.
 * @param {unknown} packId
 * @param {{allowPreview?: boolean} | null} [options]
 * @returns {object | null}
 */
export function getPackById(packId, options) {
  if (typeof packId !== 'string' || !has(packsById, packId)) return null;
  const pack = packsById[packId];
  return pack.channel === 'preview' && options?.allowPreview !== true ? null : pack;
}
