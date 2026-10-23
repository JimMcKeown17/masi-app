import { normalizeToken, tokenizeText } from '../../utils/decodability';
import { BLEND_TIERS } from './constants';
import { tierForLetterCount } from './blends';
import { letterCount, soundsOf } from './sounds';

const blendItems = (pack) => {
  const tiers = BLEND_TIERS.map(() => []);
  const seen = new Set();
  const add = (text, display, isSyllable) => {
    if (typeof text !== 'string') return;
    const count = letterCount(text);
    if (isSyllable ? count !== 2 : count < 3) return;
    const normalized = normalizeToken(text);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    const tier = tierForLetterCount(count);
    tiers[BLEND_TIERS.indexOf(tier)].push({ text, display: display || text, tier, normalized, sounds: soundsOf(text, pack) });
  };
  const steps = Array.isArray(pack?.letter_steps) ? pack?.letter_steps : [];
  [...steps].sort((a, b) => (a?.step ?? 0) - (b?.step ?? 0)).forEach((step) => {
    (Array.isArray(step?.blends) ? step.blends : []).forEach((text) => add(text, text, true));
  });
  (Array.isArray(pack?.word_bank) ? pack?.word_bank : []).forEach((entry) => {
    add(entry?.text, entry?.syllables, false);
  });
  return tiers;
};

export const indexPack = (pack) => {
  const blendTiers = blendItems(pack);
  const blendByNormalized = new Map(blendTiers.flat().map(item => [item.normalized, item]));
  // A null-prototype map, so a reader id such as "constructor" never resolves to a built-in.
  const readers = Object.assign(Object.create(null), Object.fromEntries(Object.entries(pack?.readers ?? {})
    .filter(([, reader]) => reader)
    .map(([id, reader]) => [id, {
      tricky: new Set((Array.isArray(reader.tricky_words) ? reader.tricky_words : [])
        .filter(text => typeof text === 'string').map(normalizeToken)),
      tokens: (Array.isArray(reader.pages) ? reader.pages : []).flatMap(page => (
        tokenizeText(page).map(token => ({ token, sounds: soundsOf(token, pack) }))
      )),
    }])));
  return { pack, blendTiers, blendByNormalized, readers };
};
