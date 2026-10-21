import { getPack, BUNDLED_PACKS, PACK_LANGUAGE_CODES } from './index';
import { isPreviewContentEnabled } from './previewContent';
import { analyzeToken, normalizeToken } from '../../utils/decodability/index.js';
import vectors from '../../constants/contracts/decodability-v1.json';

export function getContentDiagnostics(options = {}) {
  try {
    const { allowPreview = isPreviewContentEnabled() } = options;
    const failed = [];
    let passed = 0;
    for (const { raw, token } of vectors.normalize_cases) {
      if (normalizeToken(raw) === token) passed += 1;
      else failed.push(`normalize:${raw}`);
    }
    for (const { token, sounds, step } of vectors.token_cases) {
      const result = analyzeToken(token, vectors.sequence);
      if (result.step === step && JSON.stringify(result.sounds) === JSON.stringify(sounds)) passed += 1;
      else failed.push(`token:${token}`);
    }
    return {
      previewContentAllowed: allowPreview === true,
      currentPacks: Object.fromEntries(Object.values(PACK_LANGUAGE_CODES)
        .map(code => [code, getPack(code, { allowPreview })?.id ?? null])),
      bundledPackIds: BUNDLED_PACKS.map(pack => pack.id),
      decodabilitySelfCheck: { vectorVersion: vectors.version, passed, failed },
    };
  } catch (error) {
    return { error: String(error) };
  }
}
