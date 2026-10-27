import isixhosaInterim from './isixhosa-interim-letters-v1.json';
import englishInterim from './english-interim-letters-v1.json';
import afrikaansInterim from './afrikaans-interim-letters-v1.json';
import isixhosaPreview from './isixhosa-candidates-preview-v1.json';
import isixhosaInterimV2 from './isixhosa-interim-letters-v2.json';
import englishInterimV2 from './english-interim-letters-v2.json';
import afrikaansInterimV2 from './afrikaans-interim-letters-v2.json';
import isixhosaPreviewV2 from './isixhosa-candidates-preview-v2.json';
import englishPreview from './english-candidates-preview-v1.json';
import afrikaansPreview from './afrikaans-candidates-preview-v1.json';
import { packLetterOrderId } from './packLetterOrder';

export { lintMasiPack, PACK_LANGUAGE_CODES } from './lintMasiPack.js';
export { packLetterOrderId };

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
  for (const ids of Object.values(CURRENT_PACK_IDS)) {
    for (const [orderId, packId] of Object.entries(ids)) {
      if (packLetterOrderId(packsById[packId]) !== orderId) {
        throw new Error(`Current pack ${packId} does not match letter order ${orderId}.`);
      }
    }
  }

  /**
   * @param {unknown} orderId
   * @param {{allowPreview?: boolean} | null} [options]
   * @returns {object | null}
   */
  function getPackForOrder(orderId, options) {
    if (typeof orderId !== 'string') return null;
    const { release, preview } = CURRENT_PACK_IDS;
    const id = options?.allowPreview === true && has(preview, orderId)
      ? preview[orderId]
      : has(release, orderId) ? release[orderId] : null;
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

  return { BUNDLED_PACKS, CURRENT_PACK_IDS, getPackForOrder, getPackById };
}

// Current is an explicit id, never the highest version across pack families.
export const { BUNDLED_PACKS, CURRENT_PACK_IDS, getPackForOrder, getPackById } = createPackRegistry(
  [isixhosaInterim, englishInterim, afrikaansInterim, isixhosaPreview,
    isixhosaInterimV2, englishInterimV2, afrikaansInterimV2,
    isixhosaPreviewV2, englishPreview, afrikaansPreview],
  {
    release: {
      'isixhosa-order-2026-10-23': 'isixhosa-interim-letters-v2',
      'english-order-2026-10-23': 'english-interim-letters-v2',
      'afrikaans-order-2026-10-23': 'afrikaans-interim-letters-v2',
    },
    preview: {
      'isixhosa-order-2026-10-23': 'isixhosa-candidates-preview-v2',
      'english-order-2026-10-23': 'english-candidates-preview-v1',
      'afrikaans-order-2026-10-23': 'afrikaans-candidates-preview-v1',
    },
  },
);
