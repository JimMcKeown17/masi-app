import isixhosaInterim from './isixhosa-interim-letters-v1.json';
import englishInterim from './english-interim-letters-v1.json';
import afrikaansInterim from './afrikaans-interim-letters-v1.json';
import isixhosaPreview from './isixhosa-candidates-preview-v1.json';

export { lintMasiPack, PACK_LANGUAGE_CODES } from './lintMasiPack.js';

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// Internal construction seam; the app uses the single bundled registry below.
export function createPackRegistry(packs, currentIds) {
  const packsById = Object.create(null);
  const BUNDLED_PACKS = Object.freeze(packs.map(pack => {
    deepFreeze(pack);
    packsById[pack.id] = pack;
    return pack;
  }));
  const CURRENT_PACK_IDS = deepFreeze(currentIds);

  /**
   * Resolve the current pack for an exact Masi language code.
   * @param {unknown} languageCode
   * @param {{allowPreview?: boolean} | null} [options]
   * @returns {object | null}
   */
  function getPack(languageCode, options) {
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
  function getPackById(packId, options) {
    if (typeof packId !== 'string' || !has(packsById, packId)) return null;
    const pack = packsById[packId];
    return pack.channel === 'preview' && options?.allowPreview !== true ? null : pack;
  }

  return { BUNDLED_PACKS, CURRENT_PACK_IDS, getPack, getPackById };
}

// Current is an explicit id, never the highest version across pack families.
export const { BUNDLED_PACKS, CURRENT_PACK_IDS, getPack, getPackById } = createPackRegistry(
  [isixhosaInterim, englishInterim, afrikaansInterim, isixhosaPreview],
  {
    release: {
      xh: 'isixhosa-interim-letters-v1',
      en: 'english-interim-letters-v1',
      af: 'afrikaans-interim-letters-v1',
    },
    preview: { xh: 'isixhosa-candidates-preview-v1' },
  },
);
